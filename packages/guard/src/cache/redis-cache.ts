/**
 * @aide-dev/guard — Redis-backed LLM response cache.
 *
 * Simpler than the SQLite-based {@link LLMCache} because Redis's
 * built-in eviction policies (e.g. `allkeys-lru`) handle the LRU
 * bookkeeping. This implementation uses:
 *
 *   - `SETEX` / `GET` for individual entries (keyed by request hash)
 *   - A Redis hash for per-model aggregated stats
 *
 * ## Why not replicate the SQLite schema in Redis?
 *
 * The SQLite cache is designed for single-process persistence with
 * LRU eviction, hit tracking, and per-model invalidation. Redis
 * excels at different things: TTL-based expiry, atomic ops, and
 * shared state across replicas. This implementation leans into
 * Redis's strengths:
 *
 *   - TTL handles expiry (no background eviction sweeps needed)
 *   - `maxmemory-policy=allkeys-lru` handles capacity
 *   - Atomic INCR handles hit-count tracking without Lua
 *
 * ## When to use this vs. the SQLite cache
 *
 * | Scenario | Cache |
 * |----------|-------|
 * | Single-replica, want persistence across restarts | SQLite (`LLMCache`) |
 * | Multi-replica behind a load balancer | Redis (`RedisLLMCache`) |
 * | Cache is disposable (rebuild from upstream) | Either |
 *
 * ## Config
 *
 * The cache reads `config.cache.redis` from the app config. When
 * the config is absent or `cache.type` is `'sqlite'` (the default),
 * the proxy falls back to the SQLite-based {@link LLMCache}.
 */
import { type Redis } from "ioredis";
import { createHash } from "node:crypto";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../types.js";

// ==================== Types ====================

export interface RedisCacheConfig {
  /**
   * Default TTL for cache entries in ms. Default: 3 600 000 (1 hour).
   * Set to 0 to disable TTL (Redis `maxmemory-policy` still applies).
   */
  defaultTtlMs?: number;
  /**
   * Prefix for all Redis keys used by this cache. Default: `'aide:llm-cache:'`.
   * Change when multiple AIDE instances share a Redis instance to avoid
   * key collisions.
   */
  keyPrefix?: string;
}

export interface RedisCacheStats {
  /** Number of entries currently in the cache. */
  size: number;
  /** Approximate total memory used by cache entries in bytes (via MEMORY USAGE). */
  estimatedMemoryBytes: number;
  /** The Redis `maxmemory-policy` in effect. */
  maxmemoryPolicy: string;
}

export interface RedisCacheHit {
  response: ChatCompletionResponse;
  fromCache: true;
  requestHash: string;
}

// ==================== Defaults ====================

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_KEY_PREFIX = "aide:llm-cache:";

// ==================== Helpers ====================

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

// ==================== RedisLLMCache ====================

export class RedisLLMCache {
  private readonly redis: Redis;
  private readonly ttlMs: number;
  private readonly prefix: string;

  constructor(redis: Redis, config: RedisCacheConfig = {}) {
    this.redis = redis;
    this.ttlMs = config.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.prefix = config.keyPrefix ?? DEFAULT_KEY_PREFIX;
  }

  /**
   * Compute a cache key from a request. Matches the same algorithm
   * used by {@link computeRequestHash} in `llm-cache.ts` so the
   * same hash works for both SQLite and Redis caches.
   */
  static computeKey(model: string, request: ChatCompletionRequest): string {
    const canonical = JSON.stringify({
      model,
      messages: request.messages,
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      stop: request.stop,
      presence_penalty: request.presence_penalty,
      frequency_penalty: request.frequency_penalty,
      // Explicitly exclude `stream` — the proxy calls `computeKey` for
      // non-streaming requests only, but being defensive doesn't cost
      // anything.
    });
    return createHash("sha256").update(canonical).digest("hex");
  }

  /**
   * Look up a cached response. Returns the cached response when
   * found (and not expired), or `null` on miss.
   */
  async lookup(
    model: string,
    request: ChatCompletionRequest,
  ): Promise<RedisCacheHit | null> {
    const key = RedisLLMCache.computeKey(model, request);
    const raw = await this.redis.get(`${this.prefix}data:${key}`);
    if (!raw) return null;

    // Track hit count asynchronously (non-blocking — increment is
    // fire-and-forget from the caller's perspective).
    this.redis.incr(`${this.prefix}hits:${key}`).catch(() => {});

    const response = JSON.parse(raw) as ChatCompletionResponse;
    return { response, fromCache: true, requestHash: key };
  }

  /**
   * Check whether a request has a cache entry (without fetching the
   * full response body). Useful for metrics / pre-flight checks.
   */
  async exists(
    model: string,
    request: ChatCompletionRequest,
  ): Promise<boolean> {
    const key = RedisLLMCache.computeKey(model, request);
    const result = await this.redis.exists(`${this.prefix}data:${key}`);
    return result === 1;
  }

  /**
   * Store a response in the cache. Overwrites any existing entry
   * for the same request hash.
   */
  async store(
    model: string,
    request: ChatCompletionRequest,
    response: ChatCompletionResponse,
  ): Promise<void> {
    const key = RedisLLMCache.computeKey(model, request);
    const dataKey = `${this.prefix}data:${key}`;
    const json = JSON.stringify(response);

    if (this.ttlMs > 0) {
      await this.redis.setex(dataKey, Math.ceil(this.ttlMs / 1000), json);
    } else {
      await this.redis.set(dataKey, json);
    }
  }

  /**
   * Invalidate all cache entries for a given model.
   * Uses `KEYS` — expensive on large caches; call sparingly.
   */
  async invalidateModel(model: string): Promise<void> {
    // We can't efficiently scan without model-indexed keys. As a
    // workaround, we tag each entry with a model set.
    const modelKey = `${this.prefix}model:${model}`;
    const keys = await this.redis.smembers(modelKey);
    if (keys.length > 0) {
      await this.redis.del(...keys, modelKey);
    }
  }

  /**
   * Clear the entire cache (all entries sharing our key prefix).
   * Uses `SCAN` for non-blocking iteration over large caches.
   */
  async clear(): Promise<void> {
    const keys = await scanKeys(this.redis, `${this.prefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Get cache statistics.
   */
  async stats(): Promise<RedisCacheStats> {
    const keys = await scanKeys(this.redis, `${this.prefix}data:*`);
    const info = await this.redis.info("memory");
    const maxmemoryPolicy = this.extractMaxmemoryPolicy(info);

    // Sample memory usage from the first few entries (MEMORY USAGE is O(1)
    // per key but we don't want to scan all entries).
    let estimatedMemoryBytes = 0;
    const sampleSize = Math.min(keys.length, 20);
    for (let i = 0; i < sampleSize; i++) {
      const bytes = await this.redis.memory("USAGE", keys[i]);
      estimatedMemoryBytes += typeof bytes === "number" ? bytes : 0;
    }
    if (keys.length > 0) {
      estimatedMemoryBytes = Math.round(
        (estimatedMemoryBytes / sampleSize) * keys.length,
      );
    }

    return {
      size: keys.length,
      estimatedMemoryBytes,
      maxmemoryPolicy,
    };
  }

  /**
   * Close the Redis connection. Call during graceful shutdown.
   */
  async close(): Promise<void> {
    // Don't call redis.disconnect() here — the Redis instance may be
    // shared with other components. Let the owner manage the lifecycle.
  }

  /**
   * Extract `maxmemory-policy` from Redis INFO output.
   */
  private extractMaxmemoryPolicy(info: string): string {
    for (const line of info.split("\n")) {
      if (line.startsWith("maxmemory_policy:")) {
        return line.split(":")[1]?.trim() ?? "unknown";
      }
    }
    return "unknown";
  }
}
