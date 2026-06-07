/**
 * CodeShield - LLM Response Cache
 *
 * Persistent, content-addressed cache for LLM chat-completion responses.
 * Designed to be dropped in front of any provider call: callers `lookup()`
 * a normalised request key, and on miss call the upstream then `store()`
 * the response.
 *
 * Why content-addressed?
 * ──────────────────────
 * Identical (model + messages + sampling params) → byte-identical output
 * from every well-behaved LLM (modulo `seed` and provider-side jitter,
 * which are NOT part of the cache key). The cache never sees or stores
 * the request body in plaintext — only a SHA-256 of the canonical
 * representation — so a compromised cache file cannot leak user prompts.
 *
 * Storage layout
 * ──────────────
 * A separate SQLite database (`llm-cache.db` by default) is used so the
 * cache lifecycle is independent of the main `codeshield.db` storage.
 * A consumer who wants to wipe the cache can simply delete the file.
 *
 * Schema
 * ──────
 *   cache_entries
 *     key              TEXT PRIMARY KEY  (hex SHA-256)
 *     model            TEXT NOT NULL
 *     request_hash     TEXT NOT NULL     (currently == key, kept for future
 *                                          multi-hash strategies)
 *     response_json    TEXT NOT NULL     (serialised ChatCompletionResponse)
 *     prompt_tokens    INTEGER
 *     completion_tokens INTEGER
 *     hit_count        INTEGER NOT NULL DEFAULT 0
 *     created_at       INTEGER NOT NULL
 *     last_accessed_at INTEGER NOT NULL
 *     expires_at       INTEGER NOT NULL
 *
 * Indexes
 * ───────
 *   idx_cache_expires  — bulk eviction by `expires_at < now`
 *   idx_cache_model    — per-model invalidation (`DELETE WHERE model = ?`)
 *   idx_cache_lru      — LRU eviction by `last_accessed_at`
 *
 * Concurrency
 * ───────────
 * better-sqlite3 is synchronous and process-local. There is no
 * inter-process locking — two AIDE processes pointing at the same cache
 * file will race; the WAL mode reduces but does not eliminate the risk.
 * For multi-process deployments, point each process at its own file
 * (override `dbPath` in `LLMCacheConfig`).
 */
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../types.js";

// ==================== Public types ====================

/** Configuration for {@link LLMCache}. */
export interface LLMCacheConfig {
  /**
   * Path to the cache database file. The parent directory is created
   * if it does not exist. Defaults to `${CODESHIELD_HOME || ~/.codeshield}/data/llm-cache.db`.
   */
  dbPath?: string;
  /** Default TTL for cache entries in ms. Set to 0 to disable expiry. Default: 3 600 000 (1 hour). */
  defaultTtlMs?: number;
  /** Maximum number of entries. When exceeded, the least-recently-accessed are evicted. Default: 10 000. */
  maxEntries?: number;
  /**
   * When true, a hit increments the row's `hit_count` and `last_accessed_at`
   * (single SQLite write per hit). Disable for read-mostly workloads to
   * halve write amplification.
   */
  trackHits?: boolean;
}

/** Statistics returned by {@link LLMCache.stats}. */
export interface LLMCacheStats {
  hits: number;
  misses: number;
  expirations: number;
  evictions: number;
  invalidations: number;
  errors: number;
  size: number;
  bytesOnDisk: number;
}

/** A cache hit, with metadata for accounting. */
export interface LLMCacheHit {
  response: ChatCompletionResponse;
  createdAt: number;
  lastAccessedAt: number;
  hitCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

// ==================== Internal row types ====================

/** Row shape returned from `cache_entries`. */
interface CacheRow {
  key: string;
  model: string;
  request_hash: string;
  response_json: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  hit_count: number;
  created_at: number;
  last_accessed_at: number;
  expires_at: number;
}

/** Param shape for `INSERT INTO cache_entries`. Named bindings. */
interface CacheInsertParams {
  key: string;
  model: string;
  request_hash: string;
  response_json: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: number;
  expires_at: number;
}

/** Row shape from `SELECT COUNT(*)` queries. */
interface CountRow {
  c: number;
}

/** Row shape from `SELECT key AS id ...` queries. */
interface IdRow {
  id: string;
}

// ==================== Defaults ====================

/** Library default TTL: 1 hour. */
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
/** Library default maximum entries before LRU eviction kicks in. */
export const DEFAULT_CACHE_MAX_ENTRIES = 10_000;
/** Library default — record hit_count + last_accessed_at on every hit. */
export const DEFAULT_CACHE_TRACK_HITS = true;

// ==================== Hashing ====================

/**
 * Canonicalise a request into a deterministic string for hashing.
 *
 * - Messages are serialised in order.
 * - Only fields that affect the model's output are included.
 * - Keys inside objects are sorted recursively so `{a:1,b:2}` and
 *   `{b:2,a:1}` hash identically.
 *
 * Excluded from the hash (do not affect output):
 *   - `stream`     — caller-side delivery mode
 *   - `user`       — opaque per-user id, may rotate
 *   - `n`          — number of choices; we cache a single response and
 *                     clone it if a caller asks for more
 */
const CACHE_AFFECTING_KEYS = [
  "model",
  "messages",
  "temperature",
  "top_p",
  "max_tokens",
  "frequency_penalty",
  "presence_penalty",
  "stop",
  "tools",
  "tool_choice",
  "response_format",
] as const;

function canonicalise(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalise);
  // Object: sort keys for determinism
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalise((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute a stable hex SHA-256 of the parts of a request that affect the
 * model's output. Two requests with the same model + messages + sampling
 * parameters will hash identically even if they came from different
 * sessions, users, or stream settings.
 */
export function computeRequestHash(
  model: string,
  messages: ChatMessage[],
  options?: Pick<
    ChatCompletionRequest,
    | "temperature"
    | "top_p"
    | "max_tokens"
    | "frequency_penalty"
    | "presence_penalty"
    | "stop"
    | "tools"
    | "tool_choice"
    | "response_format"
  >,
): string {
  const payload: Record<string, unknown> = { model, messages };
  if (options) {
    for (const key of CACHE_AFFECTING_KEYS) {
      if (key === "model" || key === "messages") continue;
      const v = options[key as keyof typeof options];
      if (v !== undefined) payload[key] = v;
    }
  }
  const json = JSON.stringify(canonicalise(payload));
  return createHash("sha256").update(json).digest("hex");
}

// ==================== Implementation ====================

/**
 * LLM response cache backed by SQLite.
 *
 * Thread/process safety: not safe across processes writing to the same
 * file. The constructor opens the database in WAL mode which mitigates
 * but does not eliminate the risk. Single-process is the supported
 * deployment.
 */
export class LLMCache {
  private readonly db: DatabaseType;
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly trackHits: boolean;

  // In-memory counters. SQLite writes are too expensive for hot-path
  // counters; we accept the (small) loss on process crash and reconcile
  // by reading the DB at startup if necessary.
  private _hits = 0;
  private _misses = 0;
  private _expirations = 0;
  private _evictions = 0;
  private _invalidations = 0;
  private _errors = 0;

  // Monotonic timestamp: guarantees strictly increasing values even when
  // multiple operations happen within the same Date.now() millisecond tick.
  // This is essential for correct LRU ordering — without it, entries created
  // or accessed in the same ms are indistinguishable and eviction becomes
  // non-deterministic (flaky test).
  private _lastTimestampMs = 0;

  // Prepared statements (re-compiled on every call otherwise)
  // `!` definite-assignment assertions are needed because we compile them
  // in `initialiseStatements()` after the `Database` is opened, which the
  // TypeScript strict-init checker cannot follow through.
  private stmtGet!: Database.Statement<[string], CacheRow>;
  private stmtInsert!: Database.Statement<[CacheInsertParams]>;
  private stmtTouch!: Database.Statement<[number, string]>;
  private stmtDeleteByKey!: Database.Statement<[string]>;
  private stmtDeleteByModel!: Database.Statement<[string]>;
  private stmtCount!: Database.Statement<[], CountRow>;
  private stmtCountByModel!: Database.Statement<[string], CountRow>;
  private stmtLruIds!: Database.Statement<[number], IdRow>;
  private stmtExpiredIds!: Database.Statement<[number, number], IdRow>;

  constructor(config: LLMCacheConfig = {}) {
    this.defaultTtlMs = config.defaultTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxEntries = config.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
    this.trackHits = config.trackHits ?? DEFAULT_CACHE_TRACK_HITS;

    // Resolve the database path. Same precedence as the main storage:
    // explicit > CODESHIELD_HOME > ~/.codeshield > ./data
    let dbPath: string;
    if (config.dbPath) {
      dbPath = config.dbPath;
    } else if (process.env.CODESHIELD_HOME) {
      dbPath = path.resolve(
        process.env.CODESHIELD_HOME,
        "data",
        "llm-cache.db",
      );
    } else {
      const homeDir = os.homedir();
      const homeDataDir = path.join(homeDir, ".codeshield", "data");
      try {
        if (!fs.existsSync(homeDataDir))
          fs.mkdirSync(homeDataDir, { recursive: true });
        const probe = path.join(homeDataDir, ".write-test");
        fs.writeFileSync(probe, "test");
        fs.unlinkSync(probe);
        dbPath = path.join(homeDataDir, "llm-cache.db");
      } catch {
        dbPath = path.resolve(process.cwd(), "data", "llm-cache.db");
      }
    }

    // Ensure parent directory exists.
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    this.initialiseSchema();
    this.initialiseStatements();
  }

  /** Create the schema if absent. Idempotent. */
  private initialiseSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        hit_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_model ON cache_entries(model);
      CREATE INDEX IF NOT EXISTS idx_cache_lru ON cache_entries(last_accessed_at);
    `);
  }

  /** Compile prepared statements once. */
  private initialiseStatements(): void {
    this.stmtGet = this.db.prepare<[string], CacheRow>(`
      SELECT key, model, request_hash, response_json, prompt_tokens, completion_tokens,
             hit_count, created_at, last_accessed_at, expires_at
      FROM cache_entries
      WHERE key = ?
    `);
    this.stmtInsert = this.db.prepare<[CacheInsertParams]>(`
      INSERT INTO cache_entries
        (key, model, request_hash, response_json, prompt_tokens, completion_tokens,
         hit_count, created_at, last_accessed_at, expires_at)
      VALUES
        (@key, @model, @request_hash, @response_json, @prompt_tokens, @completion_tokens,
         0, @created_at, @created_at, @expires_at)
      ON CONFLICT(key) DO UPDATE SET
        response_json = excluded.response_json,
        prompt_tokens = excluded.prompt_tokens,
        completion_tokens = excluded.completion_tokens,
        expires_at = excluded.expires_at
    `);
    this.stmtTouch = this.db.prepare<[number, string]>(`
      UPDATE cache_entries
      SET hit_count = hit_count + 1, last_accessed_at = ?
      WHERE key = ?
    `);
    this.stmtDeleteByKey = this.db.prepare<[string]>(
      `DELETE FROM cache_entries WHERE key = ?`,
    );
    this.stmtDeleteByModel = this.db.prepare<[string]>(
      `DELETE FROM cache_entries WHERE model = ?`,
    );
    this.stmtCount = this.db.prepare<[], CountRow>(
      `SELECT COUNT(*) AS c FROM cache_entries`,
    );
    this.stmtCountByModel = this.db.prepare<[string], CountRow>(
      `SELECT COUNT(*) AS c FROM cache_entries WHERE model = ?`,
    );
    this.stmtLruIds = this.db.prepare<[number], IdRow>(`
      SELECT key AS id FROM cache_entries ORDER BY last_accessed_at ASC, created_at ASC, rowid ASC LIMIT ?
    `);
    this.stmtExpiredIds = this.db.prepare<[number, number], IdRow>(`
      SELECT key AS id FROM cache_entries
      WHERE expires_at > 0 AND expires_at <= ?
      LIMIT ?
    `);
  }

  /**
   * Return a strictly-increasing timestamp, even when called multiple
   * times within the same Date.now() tick. This guarantees deterministic
   * LRU ordering regardless of operation speed.
   */
  private monotonicNow(): number {
    const now = Date.now();
    if (now <= this._lastTimestampMs) {
      this._lastTimestampMs++;
    } else {
      this._lastTimestampMs = now;
    }
    return this._lastTimestampMs;
  }

  /**
   * Look up a cached response.
   *
   * Returns `null` on miss, expiry, or any internal error (errors are
   * counted via `stats().errors` and never thrown — a cache failure
   * must not break the upstream path).
   *
   * Semantics:
   *  - `expires_at = 0` → no expiry (entry lives forever).
   *  - `expires_at > 0` and `<= now` → expired; the row is lazily
   *    deleted and `expirations` is incremented.
   */
  lookup(model: string, requestHash: string): LLMCacheHit | null {
    try {
      const now = this.monotonicNow();
      const row = this.stmtGet.get(requestHash);
      if (!row) {
        this._misses++;
        return null;
      }
      if (row.model !== model) {
        // Defensive: a hash collision would manifest as a model mismatch
        // because we'd never insert a row under a different model. Count
        // as a miss and return null so the caller re-fetches.
        this._misses++;
        return null;
      }
      if (row.expires_at > 0 && row.expires_at <= now) {
        // Expired — lazy delete so the row doesn't sit around as
        // dead weight between bulk `evictExpired()` sweeps.
        this.stmtDeleteByKey.run(requestHash);
        this._expirations++;
        this._misses++;
        return null;
      }
      if (this.trackHits) this.stmtTouch.run(now, requestHash);
      this._hits++;
      return {
        response: JSON.parse(row.response_json) as ChatCompletionResponse,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
        hitCount: row.hit_count + (this.trackHits ? 1 : 0),
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
      };
    } catch {
      this._errors++;
      return null;
    }
  }

  /**
   * Store a response in the cache. The write is synchronous; the caller
   * is expected to be inside an async path. On a full cache, the LRU
   * entry is evicted first.
   *
   * The response object is JSON-cloned (via `JSON.parse(JSON.stringify(...))`)
   * to detach it from the caller's reference and protect against later
   * mutations of the live response.
   */
  store(
    model: string,
    requestHash: string,
    response: ChatCompletionResponse,
    options: {
      ttlMs?: number;
      promptTokens?: number;
      completionTokens?: number;
    } = {},
  ): void {
    try {
      // Enforce size cap before insert to keep the cache bounded.
      // We check the *post-insert* size: only evict when the new
      // entry would push us over the cap. Checking against
      // `currentSize` directly would over-evict on every insert at
      // the boundary.
      const currentSize = this.stmtCount.get()?.c ?? 0;
      const willOverflow = currentSize + 1 > this.maxEntries;
      if (willOverflow) {
        const toEvictCount = currentSize + 1 - this.maxEntries;
        this.evictLru(toEvictCount);
      }
      const now = this.monotonicNow();
      const ttl = options.ttlMs ?? this.defaultTtlMs;
      const expiresAt = ttl > 0 ? now + ttl : 0;
      this.stmtInsert.run({
        key: requestHash,
        model,
        request_hash: requestHash,
        response_json: JSON.stringify(response),
        prompt_tokens: options.promptTokens ?? null,
        completion_tokens: options.completionTokens ?? null,
        created_at: now,
        expires_at: expiresAt,
      });
    } catch {
      this._errors++;
    }
  }

  /**
   * Drop a single entry. Returns true if a row was deleted.
   */
  invalidate(requestHash: string): boolean {
    try {
      const info = this.stmtDeleteByKey.run(requestHash);
      this._invalidations += info.changes;
      return info.changes > 0;
    } catch {
      this._errors++;
      return false;
    }
  }

  /**
   * Drop every entry for a model. Useful when a model is upgraded or
   * the user rotates the API key and the cached responses must be
   * re-fetched under the new credentials.
   */
  invalidateModel(model: string): number {
    try {
      const info = this.stmtDeleteByModel.run(model);
      this._invalidations += info.changes;
      return info.changes;
    } catch {
      this._errors++;
      return 0;
    }
  }

  /**
   * Wipe the entire cache. Destructive.
   */
  clear(): void {
    try {
      this.db.exec(`DELETE FROM cache_entries`);
      // After a clear, the in-memory LRU is also gone. No additional
      // bookkeeping required — next insert will start from zero.
    } catch {
      this._errors++;
    }
  }

  /**
   * Drop all entries whose `expires_at` is in the past. Returns the
   * number of rows removed. Called lazily by {@link evictExpired} and
   * on every insert (opportunistic).
   */
  evictExpired(): number {
    try {
      // We can't DELETE...RETURNING in older SQLite; instead, walk in
      // small chunks to bound the transaction.
      let removed = 0;
      const now = Date.now();
      // Cap the chunk size to avoid blocking on a huge backlog.
      const chunk = 1000;
      // Loop until fewer than `chunk` rows are returned.
      // We use a tight bound to guarantee forward progress.
      for (let i = 0; i < 1000; i++) {
        const expired = this.stmtExpiredIds.all(now, chunk);
        if (expired.length === 0) break;
        for (const row of expired) {
          this.stmtDeleteByKey.run(row.id);
        }
        removed += expired.length;
        this._expirations += expired.length;
        if (expired.length < chunk) break;
      }
      return removed;
    } catch {
      this._errors++;
      return 0;
    }
  }

  /** Drop the N least-recently-accessed entries. */
  private evictLru(count: number): void {
    if (count <= 0) return;
    try {
      const lruRows = this.stmtLruIds.all(count);
      for (const row of lruRows) {
        this.stmtDeleteByKey.run(row.id);
        this._evictions++;
      }
    } catch {
      this._errors++;
    }
  }

  /**
   * Snapshot of the cache statistics. `bytesOnDisk` is best-effort —
   * it reads the file size from disk; if the file was deleted between
   * stats calls it falls back to 0.
   */
  stats(): LLMCacheStats {
    let size = 0;
    try {
      size = this.stmtCount.get()?.c ?? 0;
    } catch {
      this._errors++;
    }
    let bytesOnDisk = 0;
    try {
      // Use the connection's own filename so stats reflect the path
      // the consumer actually opened (not the default).
      const name = this.db.name;
      if (name && name !== ":memory:" && fs.existsSync(name)) {
        bytesOnDisk = fs.statSync(name).size;
      }
    } catch {
      // Ignore — best effort.
    }
    return {
      hits: this._hits,
      misses: this._misses,
      expirations: this._expirations,
      evictions: this._evictions,
      invalidations: this._invalidations,
      errors: this._errors,
      size,
      bytesOnDisk,
    };
  }

  /** Look up how many entries exist for a given model. */
  countByModel(model: string): number {
    try {
      return (this.stmtCountByModel.get(model) as { c: number }).c;
    } catch {
      this._errors++;
      return 0;
    }
  }

  /** Close the underlying database. After this, all methods will throw. */
  close(): void {
    this.db.close();
  }
}

// ==================== Factory ====================

/**
 * Construct a {@link LLMCache} with a stable on-disk default for the
 * given config. The factory exists so consumers can be passed a
 * `createCache(config)` function in DI setups without having to import
 * the class directly.
 */
export function createCache(config?: LLMCacheConfig): LLMCache {
  return new LLMCache(config);
}

/**
 * Decorator-style helper that turns a slow LLM call into a cached one.
 * Useful in scripts and tests; the proxy uses {@link LLMCache} directly
 * for finer control.
 *
 *   const result = await withCache(cache, model, req, () => provider.call(req));
 */
export async function withCache(
  cache: LLMCache,
  model: string,
  request: ChatCompletionRequest,
  fetcher: () => Promise<ChatCompletionResponse>,
): Promise<{
  response: ChatCompletionResponse;
  fromCache: boolean;
  requestHash: string;
}> {
  const hash = computeRequestHash(model, request.messages, request);
  const hit = cache.lookup(model, hash);
  if (hit) {
    return { response: hit.response, fromCache: true, requestHash: hash };
  }
  const response = await fetcher();
  cache.store(model, hash, response, {
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  });
  return { response, fromCache: false, requestHash: hash };
}

// ==================== Build-time config fingerprint ====================

/**
 * Generate a unique id for tagging cache entries with diagnostic
 * metadata. Exposed so consumers building tools around the cache can
 * correlate entries to traces.
 */
export function newCacheTraceId(): string {
  return randomUUID();
}
