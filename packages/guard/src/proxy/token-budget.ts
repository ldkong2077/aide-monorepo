/**
 * CodeShield - Per-tenant Token Budget Enforcer
 *
 * Pre-flight check on incoming chat-completion requests:
 *   1. Count the estimated prompt tokens of the request.
 *   2. If a single request exceeds `maxPromptTokensPerRequest`, reject
 *      with a 413 (Payload Too Large) without ever calling upstream.
 *   3. If the tenant's daily token usage would exceed
 *      `maxTokensPerTenantPerDay` after admitting this request,
 *      reject with a 429 (Too Many Requests) and trip the breaker
 *      until the daily window rolls over.
 *
 * Completion-side limits are NOT enforced pre-flight (we don't know
 * the completion length until after the call) — they are advisory
 * and used for the per-tenant daily cap.
 *
 * In-memory only: state is lost on process restart. For multi-process
 * deployments the breaker state should be hoisted to a shared store;
 * the design here is intentionally cheap and lock-free.
 */
import {
  countMessageTokens,
  estimateRequestTokens,
  type ChatMessage,
} from '@aide/core';

/** Configuration for {@link TokenBudgetEnforcer}. */
export interface TokenBudgetConfig {
  /** Maximum prompt tokens allowed in a single request. 0 disables. */
  maxPromptTokensPerRequest?: number;
  /** Daily token budget per tenant (prompt + completion). 0 disables. */
  maxTokensPerTenantPerDay?: number;
  /**
   * When the daily budget is exceeded, refuse new requests for this
   * many milliseconds. Defaults to 60 000 ms (1 minute). The next
   * admit attempt after the window expires will re-check the budget.
   */
  circuitResetMs?: number;
  /** Override the clock for tests. */
  now?: () => number;
}

/** Reasons a request can be rejected. Mirrors the metric label. */
export type TokenBudgetRejectionReason = 'per_request' | 'per_tenant_daily';

/** Result of a {@link TokenBudgetEnforcer.check} call. */
export type TokenBudgetDecision =
  | { allowed: true; estimatedPromptTokens: number; tenantDailyBefore: number }
  | {
      allowed: false;
      reason: TokenBudgetRejectionReason;
      estimatedPromptTokens: number;
      tenantDailyBefore: number;
      retryAfterMs: number;
    };

/** Per-tenant mutable state. */
interface TenantState {
  dailyTokens: number;
  dailyResetAt: number;
  circuitOpenUntil: number;
}

/** Library default: 128k prompt tokens per request. */
export const DEFAULT_MAX_PROMPT_TOKENS = 128_000;
/** Library default: 10M tokens per tenant per day. */
export const DEFAULT_MAX_TENANT_DAILY_TOKENS = 10_000_000;
/** Library default: 1 minute circuit-open window after daily overflow. */
export const DEFAULT_CIRCUIT_RESET_MS = 60_000;

/** Compute the next UTC-midnight epoch in ms. */
function nextUtcMidnightMs(now: number): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

export class TokenBudgetEnforcer {
  private readonly maxPromptTokensPerRequest: number;
  private readonly maxTokensPerTenantPerDay: number;
  private readonly circuitResetMs: number;
  private readonly now: () => number;

  /** Per-tenant state, lazily created on first touch. */
  private readonly tenants = new Map<string, TenantState>();

  /** Aggregate counters — useful for tests and operational metrics. */
  private _rejections = 0;
  private _admits = 0;
  private _estimatedPromptTokens = 0;
  private _actualPromptTokens = 0;
  private _actualCompletionTokens = 0;

  constructor(config: TokenBudgetConfig = {}) {
    this.maxPromptTokensPerRequest =
      config.maxPromptTokensPerRequest ?? DEFAULT_MAX_PROMPT_TOKENS;
    this.maxTokensPerTenantPerDay =
      config.maxTokensPerTenantPerDay ?? DEFAULT_MAX_TENANT_DAILY_TOKENS;
    this.circuitResetMs = config.circuitResetMs ?? DEFAULT_CIRCUIT_RESET_MS;
    this.now = config.now ?? Date.now;
  }

  /** Get the effective configuration (with defaults filled in). */
  getConfig(): Required<Omit<TokenBudgetConfig, 'now'>> {
    return {
      maxPromptTokensPerRequest: this.maxPromptTokensPerRequest,
      maxTokensPerTenantPerDay: this.maxTokensPerTenantPerDay,
      circuitResetMs: this.circuitResetMs,
    };
  }

  /** Lazy-init + lazy-rollover. Returns a mutable handle. */
  private touch(tenantId: string): TenantState {
    let s = this.tenants.get(tenantId);
    const t = this.now();
    if (!s) {
      s = {
        dailyTokens: 0,
        dailyResetAt: nextUtcMidnightMs(t),
        circuitOpenUntil: 0,
      };
      this.tenants.set(tenantId, s);
    } else if (t >= s.dailyResetAt) {
      s.dailyTokens = 0;
      s.dailyResetAt = nextUtcMidnightMs(t);
      s.circuitOpenUntil = 0;
    }
    return s;
  }

  /**
   * Pre-flight check. Does NOT mutate state. Call {@link record} after
   * the upstream call returns with the actual usage numbers so the
   * daily counter reflects what was actually billed.
   */
  check(tenantId: string, messages: readonly ChatMessage[], model: string): TokenBudgetDecision {
    const t = this.now();
    const s = this.touch(tenantId);
    const estimated = estimateRequestTokens(messages, model);

    // Per-request cap
    if (
      this.maxPromptTokensPerRequest > 0 &&
      estimated > this.maxPromptTokensPerRequest
    ) {
      this._rejections++;
      return {
        allowed: false,
        reason: 'per_request',
        estimatedPromptTokens: estimated,
        tenantDailyBefore: s.dailyTokens,
        retryAfterMs: 0,
      };
    }

    // Daily cap
    if (this.maxTokensPerTenantPerDay > 0) {
      const projected = s.dailyTokens + estimated;
      if (projected > this.maxTokensPerTenantPerDay) {
        this._rejections++;
        // Open the circuit for the configured window.
        s.circuitOpenUntil = t + this.circuitResetMs;
        return {
          allowed: false,
          reason: 'per_tenant_daily',
          estimatedPromptTokens: estimated,
          tenantDailyBefore: s.dailyTokens,
          retryAfterMs: Math.max(this.circuitResetMs, s.dailyResetAt - t),
        };
      }
    }

    return {
      allowed: true,
      estimatedPromptTokens: estimated,
      tenantDailyBefore: s.dailyTokens,
    };
  }

  /**
   * Bookkeeping for an admitted call. Updates the tenant's daily
   * counter with the actual token usage (or the estimated value when
   * the upstream did not report `usage`).
   *
   * `promptTokens` and `completionTokens` default to the estimated
   * values; pass the upstream-reported numbers for accuracy.
   */
  record(
    tenantId: string,
    model: string,
    usage: { promptTokens?: number; completionTokens?: number },
    estimate: { promptTokens: number },
  ): void {
    const s = this.touch(tenantId);
    const prompt = usage.promptTokens ?? estimate.promptTokens;
    const completion = usage.completionTokens ?? 0;
    s.dailyTokens += prompt + completion;
    this._admits++;
    this._actualPromptTokens += prompt;
    this._actualCompletionTokens += completion;
    this._estimatedPromptTokens += estimate.promptTokens;
  }

  /**
   * Snapshot of one tenant's current budget state. Returns
   * `null` for unknown tenants (callers can decide whether to treat
   * that as "fresh tenant" or 404).
   */
  snapshot(tenantId: string): {
    dailyTokens: number;
    dailyResetAt: number;
    circuitOpenUntil: number;
    percentOfDailyBudget: number;
  } | null {
    const s = this.tenants.get(tenantId);
    if (!s) return null;
    // Touch to roll over if needed.
    this.touch(tenantId);
    const cap = this.maxTokensPerTenantPerDay;
    return {
      dailyTokens: s.dailyTokens,
      dailyResetAt: s.dailyResetAt,
      circuitOpenUntil: s.circuitOpenUntil,
      percentOfDailyBudget: cap > 0 ? s.dailyTokens / cap : 0,
    };
  }

  /** Snapshot every known tenant. Mirrors the cost-tracker's API. */
  snapshotAll(): Array<{ tenant: string } & ReturnType<TokenBudgetEnforcer['snapshot']>> {
    const out: Array<{ tenant: string } & ReturnType<TokenBudgetEnforcer['snapshot']>> = [];
    for (const tenant of this.tenants.keys()) {
      const snap = this.snapshot(tenant);
      if (snap) out.push({ tenant, ...snap });
    }
    return out;
  }

  /** Reset a single tenant. Test-only / on-call escape hatch. */
  reset(tenantId: string): void {
    this.tenants.delete(tenantId);
  }

  /** Aggregate counters — exposed for metrics wiring. */
  stats(): {
    rejections: number;
    admits: number;
    estimatedPromptTokens: number;
    actualPromptTokens: number;
    actualCompletionTokens: number;
    tenantCount: number;
  } {
    return {
      rejections: this._rejections,
      admits: this._admits,
      estimatedPromptTokens: this._estimatedPromptTokens,
      actualPromptTokens: this._actualPromptTokens,
      actualCompletionTokens: this._actualCompletionTokens,
      tenantCount: this.tenants.size,
    };
  }

  /**
   * Helper to re-estimate a request's prompt token count without
   * performing a full check. Exposed so the proxy can record the
   * pre-flight number alongside the upstream-reported `usage`.
   */
  estimate(messages: readonly ChatMessage[], model: string): number {
    return countMessageTokens(messages, model);
  }
}
