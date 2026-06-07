/**
 * @aide-dev/guard — Redis-backed per-tenant cost tracker and circuit breaker.
 *
 * Drop-in replacement for {@link TenantCostTracker} that stores daily
 * spend in Redis instead of a process-local Map. Use this for
 * multi-replica deployments so the cost circuit is shared across all
 * instances.
 *
 * ## Redis key layout
 *
 *   aide:circuit:{tenantId}:{YYYY-MM-DD} → number (daily spend in USD)
 *   aide:circuit:{tenantId}:open           → '1' | nil (circuit state cache)
 *
 * The circuit-open flag has a TTL equal to the remaining time in the
 * current UTC day so it auto-resets at midnight without a cron job.
 *
 * ## Atomicity
 *
 * `record()` uses an INCRBY + EXPIRE Lua script so concurrent calls
 * from different replicas don't lose spend data. The circuit-open
 * check is a separate read that may lag by at most one INCR round-trip.
 */
import { type Redis } from "ioredis";
import type {
  TenantCircuitConfig,
  TenantSpendSnapshot,
  TenantSnapshotWithId,
} from "./tenant-circuit.js";
import { DEFAULT_TENANT_CIRCUIT } from "./tenant-circuit.js";

const SPEND_PREFIX = "aide:circuit:spend:";
const OPEN_FLAG_SUFFIX = ":open";

/**
 * Lua script: atomically increment daily spend, set the circuit-open
 * flag if the threshold is exceeded, and return the new total.
 *
 * KEYS[1] = spend key  (aide:circuit:spend:{tenant}:{date})
 * KEYS[2] = open key   (aide:circuit:spend:{tenant}:open)
 * ARGV[1] = cost increment (float, as string via Redis)
 * ARGV[2] = threshold in USD (float)
 * ARGV[3] = TTL in seconds for the spend key (seconds until midnight UTC)
 *
 * Returns JSON: { dailyUsd: number, circuitOpen: bool }
 */
const RECORD_SCRIPT = `
  local increment = tonumber(ARGV[1])
  local threshold = tonumber(ARGV[2])
  local ttl = tonumber(ARGV[3])

  local dailyUsd = redis.call('INCRBYFLOAT', KEYS[1], increment)
  -- Set TTL on the spend key so it auto-expires at day end
  redis.call('EXPIRE', KEYS[1], ttl)

  local circuitOpen = dailyUsd >= threshold
  if circuitOpen then
    redis.call('SETEX', KEYS[2], ttl, '1')
  end

  return cjson.encode({ dailyUsd = dailyUsd, circuitOpen = circuitOpen })
`;

/**
 * Lua script: read current spend and circuit state for a tenant.
 * KEYS[1] = spend key
 * KEYS[2] = open key
 * Returns JSON: { dailyUsd: number, circuitOpen: bool }
 */
const SNAPSHOT_SCRIPT = `
  local dailyUsd = tonumber(redis.call('GET', KEYS[1]) or '0')
  local openRaw = redis.call('GET', KEYS[2])
  return cjson.encode({ dailyUsd = dailyUsd, circuitOpen = (openRaw ~= nil and openRaw ~= false) })
`;

const RESET_SCRIPT = `
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[2])
`;

/** Format today's date key component: YYYY-MM-DD */
function dateKey(now: number): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Seconds until the next UTC midnight, clamped to [60, 86400]. */
function ttlUntilMidnight(now: number): number {
  const d = new Date(now);
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((nextMidnight - now) / 1000));
}

export class RedisTenantCostTracker {
  private readonly redis: Redis;
  private readonly config: TenantCircuitConfig;

  constructor(redis: Redis, config: Partial<TenantCircuitConfig> = {}) {
    this.redis = redis;
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

  /**
   * Number of tracked tenants. Uses `KEYS` — expensive on large Redis
   * instances; call sparingly (admin endpoints, tests).
   */
  async size(): Promise<number> {
    const keys = await this.redis.keys(`${SPEND_PREFIX}*`);
    const tenants = new Set(keys.map((k) => k.split(":").slice(-2, -1)[0]));
    return tenants.size;
  }

  /**
   * Record `costUsd` of spend for `tenantId`. Idempotent on a
   * negative number. Atomic via Lua on the Redis server.
   */
  async record(
    tenantId: string,
    costUsd: number,
    now: number = Date.now(),
  ): Promise<void> {
    if (costUsd <= 0) return;
    const day = dateKey(now);
    const spendKey = `${SPEND_PREFIX}${tenantId}:${day}`;
    const openKey = `${SPEND_PREFIX}${tenantId}${OPEN_FLAG_SUFFIX}`;
    const ttl = ttlUntilMidnight(now);
    const threshold = this.threshold();

    await this.redis.eval(
      RECORD_SCRIPT,
      2,
      spendKey,
      openKey,
      String(costUsd),
      String(threshold),
      String(ttl),
    );
  }

  /**
   * Is the cost circuit open for `tenantId`?
   */
  async isCircuitOpen(tenantId: string): Promise<boolean> {
    const openKey = `${SPEND_PREFIX}${tenantId}${OPEN_FLAG_SUFFIX}`;
    const val = await this.redis.get(openKey);
    return val !== null;
  }

  /**
   * Read-only snapshot of a tenant's current spend and circuit state.
   * Returns `null` if the tenant is unknown (no spend recorded today).
   */
  async snapshot(
    tenantId: string,
    now: number = Date.now(),
  ): Promise<TenantSpendSnapshot | null> {
    const day = dateKey(now);
    const spendKey = `${SPEND_PREFIX}${tenantId}:${day}`;
    const openKey = `${SPEND_PREFIX}${tenantId}${OPEN_FLAG_SUFFIX}`;

    const resultStr = await this.redis.eval(
      SNAPSHOT_SCRIPT,
      2,
      spendKey,
      openKey,
    );
    const result = JSON.parse(resultStr as string) as {
      dailyUsd: number;
      circuitOpen: boolean;
    };

    if (result.dailyUsd === 0 && !result.circuitOpen) {
      // Check if any key actually exists to distinguish "no data" from "zero spend"
      const exists = await this.redis.exists(spendKey);
      if (!exists) return null;
    }

    return {
      dailyUsd: result.dailyUsd,
      thresholdUsd: this.threshold(),
      circuitOpen: result.circuitOpen,
    };
  }

  /**
   * Snapshot every tracked tenant. Uses `KEYS` — expensive on large
   * Redis instances; call sparingly.
   */
  async snapshotAll(now: number = Date.now()): Promise<TenantSnapshotWithId[]> {
    const pattern = `${SPEND_PREFIX}*`;
    const keys = await this.redis.keys(pattern);

    // Deduplicate by tenant id
    const tenantIds = new Set<string>();
    for (const key of keys) {
      // Key format: aide:circuit:spend:{tenantId}:{YYYY-MM-DD}
      const parts = key.split(":");
      if (parts.length >= 4) {
        tenantIds.add(parts[3]);
      }
    }

    const results: TenantSnapshotWithId[] = [];
    for (const tenantId of tenantIds) {
      const snap = await this.snapshot(tenantId, now);
      if (snap) {
        results.push({ tenant: tenantId, ...snap });
      }
    }
    return results;
  }

  /** Reset a single tenant's circuit and spend counter. */
  async reset(tenantId: string): Promise<void> {
    const day = dateKey(Date.now());
    const spendKey = `${SPEND_PREFIX}${tenantId}:${day}`;
    const openKey = `${SPEND_PREFIX}${tenantId}${OPEN_FLAG_SUFFIX}`;
    await this.redis.eval(RESET_SCRIPT, 2, spendKey, openKey);
  }

  /**
   * Forget all tenant data. Uses `KEYS` — expensive; tests only.
   */
  async resetAll(): Promise<void> {
    const keys = await this.redis.keys(`${SPEND_PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private threshold(): number {
    return this.config.budgetDaily * this.config.alertThreshold;
  }
}
