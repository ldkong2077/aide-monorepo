/**
 * @aide-dev/guard — Redis-backed token-bucket rate limiter.
 *
 * Drop-in replacement for {@link TokenBucketRateLimiter} that stores
 * bucket state in Redis instead of a process-local Map. Use this
 * when running multiple replicas behind a load balancer so the rate
 * limit is shared across all instances.
 *
 * ## Redis key layout
 *
 *   aide:rate-limit:{key} → HASH { tokens, lastRefill }
 *
 * Lua scripts ensure atomic read-modify-write so concurrent requests
 * from different replicas don't race on the same bucket.
 *
 * ## Clock
 *
 * Like the in-process version, `check(key, now?)` accepts an optional
 * timestamp for deterministic testing. Production code uses
 * `Date.now()`.
 */
import { type Redis } from "ioredis";
import type { RateLimitConfig, RateLimitResult } from "./rate-limit.js";
import { DEFAULT_RATE_LIMIT } from "./rate-limit.js";

const KEY_PREFIX = "aide:rate-limit:";

/**
 * Safely iterate over keys matching a pattern using SCAN instead of KEYS.
 * SCAN is non-blocking and better suited for large datasets.
 */
async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";

  do {
    const result = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== "0");

  return keys;
}

/**
 * Lua script: atomically refill and consume one token.
 * KEYS[1] = bucket key
 * ARGV[1] = limit (max tokens)
 * ARGV[2] = windowMs (refill window)
 * ARGV[3] = now (epoch ms)
 *
 * Returns a JSON string: { allowed: bool, remaining: number, resetMs: number, retryAfterMs: number }
 */
const CHECK_SCRIPT = `
  local limit = tonumber(ARGV[1])
  local windowMs = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local state = redis.call('HGETALL', KEYS[1])
  local tokens, lastRefill

  if #state == 0 then
    tokens = limit
    lastRefill = now
  else
    tokens = tonumber(state[2])
    lastRefill = tonumber(state[4])
  end

  -- Refill
  local elapsed = now - lastRefill
  if elapsed > 0 then
    local refill = (elapsed / windowMs) * limit
    tokens = math.min(limit, tokens + refill)
    lastRefill = now
  end

  local allowed = tokens >= 1
  local remaining, resetMs, retryAfterMs

  if allowed then
    tokens = tokens - 1
    remaining = math.floor(tokens)
    local tokensNeeded = limit - tokens
    resetMs = math.ceil((tokensNeeded / limit) * windowMs)
    retryAfterMs = 0
  else
    remaining = 0
    local tokensFull = limit - tokens
    resetMs = math.ceil((tokensFull / limit) * windowMs)
    local needForOne = 1 - tokens
    retryAfterMs = math.ceil((needForOne / limit) * windowMs)
  end

  -- Persist updated bucket
  redis.call('HSET', KEYS[1], 'tokens', tokens, 'lastRefill', lastRefill)
  -- Set TTL: at most 2x the window (prevents stale keys accumulating)
  redis.call('PEXPIRE', KEYS[1], windowMs * 2)

  return cjson.encode({ allowed = allowed, remaining = remaining, resetMs = resetMs, retryAfterMs = retryAfterMs })
`;

/**
 * Lua script: delete a bucket. Used by test helpers.
 */
const RESET_SCRIPT = `
  redis.call('DEL', KEYS[1])
`;

export class RedisTokenBucketRateLimiter {
  private readonly redis: Redis;
  private readonly config: RateLimitConfig;
  private readonly checkSha: string | null = null;
  private readonly resetSha: string | null = null;

  constructor(redis: Redis, config: Partial<RateLimitConfig> = {}) {
    this.redis = redis;
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
    if (this.config.limit <= 0) {
      throw new Error(
        `RateLimitConfig.limit must be > 0, got ${this.config.limit}`,
      );
    }
    if (this.config.windowMs <= 0) {
      throw new Error(
        `RateLimitConfig.windowMs must be > 0, got ${this.config.windowMs}`,
      );
    }
  }

  /** Read-only view of the current configuration. */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Number of tracked buckets. Uses SCAN for non-blocking iteration.
   */
  async size(): Promise<number> {
    const keys = await scanKeys(this.redis, `${KEY_PREFIX}*`);
    return keys.length;
  }

  /**
   * Consume one token from `key`'s bucket. Executed atomically via
   * Lua on the Redis server.
   */
  async check(key: string, now: number = Date.now()): Promise<RateLimitResult> {
    const resultStr = await this.redis.eval(
      CHECK_SCRIPT,
      1,
      `${KEY_PREFIX}${key}`,
      String(this.config.limit),
      String(this.config.windowMs),
      String(now),
    );
    return JSON.parse(resultStr as string);
  }

  /** Forget a single bucket. Used by tests. */
  async reset(key: string): Promise<void> {
    await this.redis.eval(RESET_SCRIPT, 1, `${KEY_PREFIX}${key}`);
  }

  /** Forget all rate-limit buckets. Used by tests. */
  async resetAll(): Promise<void> {
    const keys = await scanKeys(this.redis, `${KEY_PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
