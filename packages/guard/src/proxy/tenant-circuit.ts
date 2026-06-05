/**
 * @aide/guard — Tenant cost tracker and circuit breaker.
 *
 * Tracks per-tenant daily spend in process-local memory and trips a
 * "cost circuit" when a tenant exceeds
 * `alertThreshold * budgetDaily`. While the circuit is open, every
 * request from that tenant is rejected with 429 + a dedicated
 * error type, preventing runaway cost.
 *
 * ## Multi-replica deployments
 *
 * Like `TokenBucketRateLimiter`, this tracker is process-local. For
 * multi-replica deployments, replace it with a Redis-backed
 * counter (the public API of `TenantCostTracker` — `record()`,
 * `isCircuitOpen()`, `snapshot()` — is small and adapter-friendly).
 *
 * ## Time source
 *
 * `record()` and `isCircuitOpen()` both accept an optional `now`
 * parameter (epoch ms) so unit tests can advance the clock
 * deterministically. Production code uses `Date.now()`.
 *
 * ## Why per-day, not per-month?
 *
 * The whole point of the circuit breaker is to stop a runaway
 * agent *before* the bill arrives. Per-day limits catch the case
 * "a script accidentally looped all night"; per-month limits
 * discover the damage only at the end of the month. A
 * per-month cap can layer on top in a follow-up.
 */
export interface TenantCircuitConfig {
  /** Per-tenant daily budget in USD. Default: 10. */
  budgetDaily: number;
  /**
   * Fraction of `budgetDaily` at which the circuit trips.
   * Must be in (0, 1]. Default: 0.8 (open at 80% of the
   * daily budget).
   */
  alertThreshold: number;
}

export interface TenantSpendSnapshot {
  /** Per-day spend in USD for the tenant. */
  dailyUsd: number;
  /** Threshold in USD at which the circuit trips
   *  (= `budgetDaily * alertThreshold`). */
  thresholdUsd: number;
  /** True if the tenant is currently over the threshold. */
  circuitOpen: boolean;
}

/** A `TenantSpendSnapshot` tagged with its tenant id. Returned
 *  by `snapshotAll()` so admin endpoints can serialise every
 *  tracked tenant in a single response. */
export type TenantSnapshotWithId = TenantSpendSnapshot & { tenant: string };

export const DEFAULT_TENANT_CIRCUIT: TenantCircuitConfig = {
  budgetDaily: 10,
  alertThreshold: 0.8,
};

interface TenantState {
  /** Total spend in the current UTC day, USD. */
  dailyUsd: number;
  /** UTC midnight (epoch ms) of the day this state is bucketed into. */
  currentDayStart: number;
  /** Cached "is the circuit open" flag — recomputed on every read
   *  when the day boundary has crossed. */
  circuitOpen: boolean;
}

/**
 * Pure data structure. No I/O, no clock side effects. Safe to
 * instantiate in tests without a Jest fake-timer harness.
 */
export class TenantCostTracker {
  private readonly config: TenantCircuitConfig;
  private readonly tenants = new Map<string, TenantState>();

  constructor(config: Partial<TenantCircuitConfig> = {}) {
    this.config = { ...DEFAULT_TENANT_CIRCUIT, ...config };
    if (this.config.budgetDaily <= 0) {
      throw new Error(
        `TenantCircuitConfig.budgetDaily must be > 0, got ${this.config.budgetDaily}`,
      );
    }
    if (this.config.alertThreshold <= 0 || this.config.alertThreshold > 1) {
      throw new Error(
        `TenantCircuitConfig.alertThreshold must be in (0, 1], got ${this.config.alertThreshold}`,
      );
    }
  }

  /** Read-only view of the current configuration. */
  getConfig(): TenantCircuitConfig {
    return { ...this.config };
  }

  /** Number of tracked tenants. Useful for tests and metric scrapes. */
  size(): number {
    return this.tenants.size;
  }

  /**
   * Record `costUsd` of spend for `tenantId`. Idempotent on a
   * negative number (callers can pass an estimated delta and we
   * won't punish them for over-estimating).
   *
   * Auto-rolls the per-day counter when the UTC date has changed.
   */
  record(tenantId: string, costUsd: number, now: number = Date.now()): void {
    if (costUsd <= 0) return;
    const dayStart = utcDayStart(now);
    let state = this.tenants.get(tenantId);
    if (!state) {
      state = { dailyUsd: 0, currentDayStart: dayStart, circuitOpen: false };
      this.tenants.set(tenantId, state);
    } else if (state.currentDayStart !== dayStart) {
      // New UTC day — reset the per-day counter but keep the
      // tenant in the map so the breaker remembers it across
      // the date line.
      state.dailyUsd = 0;
      state.currentDayStart = dayStart;
      state.circuitOpen = false;
    }
    state.dailyUsd += costUsd;
    state.circuitOpen = state.dailyUsd >= this.threshold();
  }

  /**
   * Is the cost circuit open for `tenantId`?
   *
   * Crosses the date line lazily — a tenant that tripped
   * yesterday's circuit will be "closed" today the first time
   * we look at them.
   */
  isCircuitOpen(tenantId: string, now: number = Date.now()): boolean {
    const state = this.tenants.get(tenantId);
    if (!state) return false;
    const dayStart = utcDayStart(now);
    if (state.currentDayStart !== dayStart) {
      // The day has rolled over. Lazily reset the per-day
      // counter and the breaker state.
      state.dailyUsd = 0;
      state.currentDayStart = dayStart;
      state.circuitOpen = false;
    }
    return state.circuitOpen;
  }

  /**
   * Read-only snapshot of a tenant's current spend and circuit
   * state. Returns `null` if the tenant is unknown — the proxy
   * can use this to distinguish "we have data" from "we don't".
   */
  snapshot(tenantId: string, now: number = Date.now()): TenantSpendSnapshot | null {
    const state = this.tenants.get(tenantId);
    if (!state) return null;
    const dayStart = utcDayStart(now);
    if (state.currentDayStart !== dayStart) {
      state.dailyUsd = 0;
      state.currentDayStart = dayStart;
      state.circuitOpen = false;
    }
    return {
      dailyUsd: state.dailyUsd,
      thresholdUsd: this.threshold(),
      circuitOpen: state.circuitOpen,
    };
  }

  /**
   * Reset a single tenant's circuit (and the per-day counter).
   * Used by the `POST /v1/tenants/:id/reset-circuit` admin
   * endpoint, and by tests.
   */
  reset(tenantId: string): void {
    this.tenants.delete(tenantId);
  }

  /**
   * Forget all tenants. Tests only.
   */
  resetAll(): void {
    this.tenants.clear();
  }

  /**
   * Snapshot every tracked tenant. Useful for the
   * `GET /v1/tenants/cost?tenant=all` admin endpoint and
   * for periodic metric scrapes. Lazily rolls over the day
   * boundary for each entry, so the returned data is always
   * self-consistent with `Date.now()`.
   */
  snapshotAll(now: number = Date.now()): TenantSnapshotWithId[] {
    const dayStart = utcDayStart(now);
    const threshold = this.threshold();
    const out: TenantSnapshotWithId[] = [];
    for (const [tenantId, state] of this.tenants) {
      if (state.currentDayStart !== dayStart) {
        state.dailyUsd = 0;
        state.currentDayStart = dayStart;
        state.circuitOpen = false;
      }
      out.push({
        tenant: tenantId,
        dailyUsd: state.dailyUsd,
        thresholdUsd: threshold,
        circuitOpen: state.circuitOpen,
      });
    }
    return out;
  }

  /** Threshold in USD = budget * alertThreshold. */
  private threshold(): number {
    return this.config.budgetDaily * this.config.alertThreshold;
  }
}

/** Epoch ms of the most recent UTC midnight at or before `now`. */
function utcDayStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
