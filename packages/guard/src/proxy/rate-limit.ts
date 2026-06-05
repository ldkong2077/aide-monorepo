/**
 * @aide/guard — In-process token-bucket rate limiter.
 *
 * Used by the proxy to cap per-token request volume. The algorithm is
 * the classic continuous-token-bucket: each key has a bucket of size
 * `limit`, which refills linearly at `limit / windowMs` tokens per
 * millisecond. A request consumes one token; if the bucket is empty,
 * the request is rejected and the caller is told how long to wait.
 *
 * State is process-local. For multi-replica deployments, swap this
 * for a Redis-backed implementation; the public API of `check()` is
 * the same and the call sites in `proxy/index.ts` won't change.
 *
 * No clock injection: `check(key, now?)` lets tests pass a fixed
 * timestamp. Production code uses `Date.now()` by default.
 */
export interface RateLimitConfig {
  /** Maximum tokens in a full bucket. Default: 60. */
  limit: number;
  /** Time (ms) to fully refill an empty bucket. Default: 60 000 (1 min). */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Tokens left in the bucket after this call (floor). */
  remaining: number;
  /** Time (ms) until the bucket is fully refilled. */
  resetMs: number;
  /** Time (ms) the caller should wait before retrying.
   *  Equal to `resetMs` when the request was rejected, else 0. */
  retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  limit: 60,
  windowMs: 60_000,
};

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
    if (this.config.limit <= 0) {
      throw new Error(`RateLimitConfig.limit must be > 0, got ${this.config.limit}`);
    }
    if (this.config.windowMs <= 0) {
      throw new Error(`RateLimitConfig.windowMs must be > 0, got ${this.config.windowMs}`);
    }
  }

  /** Read-only view of the current configuration. */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /** Number of tracked buckets. Useful for tests and metric scrapes. */
  size(): number {
    return this.buckets.size;
  }

  /**
   * Consume one token from `key`'s bucket. Refills linearly first so
   * a long-idle key gets a full bucket again.
   */
  check(key: string, now: number = Date.now()): RateLimitResult {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.limit, lastRefill: now };
    } else {
      const elapsed = now - bucket.lastRefill;
      if (elapsed > 0) {
        const refill = (elapsed / this.config.windowMs) * this.config.limit;
        bucket.tokens = Math.min(this.config.limit, bucket.tokens + refill);
        bucket.lastRefill = now;
      }
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      const remaining = Math.floor(bucket.tokens);
      return {
        allowed: true,
        remaining,
        resetMs: this.timeToFull(bucket, now),
        retryAfterMs: 0,
      };
    }

    // Bucket is empty. Caller must wait until at least one token
    // has refilled.
    const tokensNeeded = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / this.config.limit) * this.config.windowMs);
    this.buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      resetMs: this.timeToFull(bucket, now),
      retryAfterMs,
    };
  }

  /** Forget a single bucket. Used by tests; not exposed in production. */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Forget all buckets. Used by tests; not exposed in production. */
  resetAll(): void {
    this.buckets.clear();
  }

  /** How long (ms) until this bucket is back to `limit` tokens. */
  private timeToFull(bucket: Bucket, _now: number): number {
    if (bucket.tokens >= this.config.limit) return 0;
    const tokensNeeded = this.config.limit - bucket.tokens;
    return Math.ceil((tokensNeeded / this.config.limit) * this.config.windowMs);
  }
}
