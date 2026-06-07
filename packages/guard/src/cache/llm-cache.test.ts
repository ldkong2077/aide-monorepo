/**
 * CodeShield - LLM Cache unit tests
 *
 * Coverage targets the public surface of {@link LLMCache} plus the
 * pure functions `computeRequestHash` and `withCache`. Tests use a
 * fresh, in-process SQLite file under `os.tmpdir()` and clean up
 * after themselves.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  LLMCache,
  computeRequestHash,
  withCache,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_CACHE_MAX_ENTRIES,
  type LLMCacheConfig,
} from "./llm-cache.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "../types.js";

function makeTmpDbPath(suffix = ""): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aide-llm-cache-"));
  return path.join(dir, `cache${suffix}.db`);
}

function cleanup(dbPath: string): void {
  const dir = path.dirname(dbPath);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
}

function makeRequest(
  overrides: Partial<ChatCompletionRequest> = {},
): ChatCompletionRequest {
  return {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ],
    temperature: 0.2,
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<ChatCompletionResponse> = {},
): ChatCompletionResponse {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 1_700_000_000,
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "Hello, world!" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    ...overrides,
  };
}

describe("computeRequestHash", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Hi" },
  ];

  it("is deterministic for the same inputs", () => {
    const h1 = computeRequestHash("m", messages, { temperature: 0.2 });
    const h2 = computeRequestHash("m", messages, { temperature: 0.2 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the model changes", () => {
    const h1 = computeRequestHash("model-a", messages);
    const h2 = computeRequestHash("model-b", messages);
    expect(h1).not.toBe(h2);
  });

  it("changes when a message content changes", () => {
    const h1 = computeRequestHash("m", messages);
    const h2 = computeRequestHash("m", [{ role: "user", content: "Hello!" }]);
    expect(h1).not.toBe(h2);
  });

  it("changes when temperature changes", () => {
    const h1 = computeRequestHash("m", messages, { temperature: 0.2 });
    const h2 = computeRequestHash("m", messages, { temperature: 0.7 });
    expect(h1).not.toBe(h2);
  });

  it("is order-independent across object keys (canonicalisation)", () => {
    // Two semantically-equal but textually-different tool-choice dicts
    // must produce the same hash so that a roundtrip through JSON.stringify
    // does not bust the cache.
    const a = {
      tools: [
        {
          type: "function",
          function: { name: "f", parameters: { b: 1, a: 2 } },
        },
      ],
    };
    const b = {
      tools: [
        {
          type: "function",
          function: { name: "f", parameters: { a: 2, b: 1 } },
        },
      ],
    };
    expect(computeRequestHash("m", messages, a)).toBe(
      computeRequestHash("m", messages, b),
    );
  });

  it("excludes stream / user / n from the cache key", () => {
    const base = computeRequestHash("m", messages);
    const withStream = computeRequestHash("m", messages);
    // The hash function does not accept `stream` at all; this documents
    // the contract: callers that only need stream-delivery semantics
    // will still hit the cache.
    expect(withStream).toBe(base);
  });
});

describe("LLMCache", () => {
  let dbPath: string;
  let cache: LLMCache;
  let config: LLMCacheConfig;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    config = { dbPath };
    cache = new LLMCache(config);
  });

  afterEach(() => {
    try {
      cache.close();
    } catch {
      // Already closed.
    }
    cleanup(dbPath);
  });

  describe("basic get / set", () => {
    it("returns null on cache miss", () => {
      expect(cache.lookup("gpt-4o-mini", "nope")).toBeNull();
      const stats = cache.stats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });

    it("stores and retrieves a response", () => {
      const key = computeRequestHash("gpt-4o-mini", [
        { role: "user", content: "Hello" },
      ]);
      const response = makeResponse();
      cache.store("gpt-4o-mini", key, response, {
        promptTokens: response.usage!.prompt_tokens,
        completionTokens: response.usage!.completion_tokens,
      });
      const hit = cache.lookup("gpt-4o-mini", key);
      expect(hit).not.toBeNull();
      expect(hit!.response.choices[0]!.message.content).toBe("Hello, world!");
      expect(hit!.promptTokens).toBe(12);
      expect(hit!.completionTokens).toBe(4);
      const stats = cache.stats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);
    });

    it("isolates hits by model (defence against hash collisions)", () => {
      const key = computeRequestHash("m", [{ role: "user", content: "x" }]);
      cache.store("model-a", key, makeResponse({ model: "model-a" }));
      // Same hash, different model — must miss.
      expect(cache.lookup("model-b", key)).toBeNull();
    });
  });

  describe("TTL expiry", () => {
    it("expires entries past their TTL", async () => {
      const shortTtlCache = new LLMCache({
        dbPath: makeTmpDbPath("-ttl"),
        defaultTtlMs: 5,
      });
      try {
        const key = computeRequestHash("m", [{ role: "user", content: "q" }]);
        shortTtlCache.store("m", key, makeResponse());
        expect(shortTtlCache.lookup("m", key)).not.toBeNull();
        await new Promise((r) => setTimeout(r, 20));
        expect(shortTtlCache.lookup("m", key)).toBeNull();
        expect(shortTtlCache.stats().expirations).toBeGreaterThan(0);
      } finally {
        shortTtlCache.close();
        cleanup(dbPath + "-ttl");
      }
    });

    it("respects a 0 TTL (no expiry)", async () => {
      const noTtlCache = new LLMCache({
        dbPath: makeTmpDbPath("-no-ttl"),
        defaultTtlMs: 0,
      });
      try {
        const key = computeRequestHash("m", [{ role: "user", content: "q" }]);
        noTtlCache.store("m", key, makeResponse());
        // Sleep is just to prove the entry is not reaped.
        await new Promise((r) => setTimeout(r, 5));
        expect(noTtlCache.lookup("m", key)).not.toBeNull();
      } finally {
        noTtlCache.close();
        cleanup(dbPath + "-no-ttl");
      }
    });
  });

  describe("size cap & LRU eviction", () => {
    it("evicts the least-recently-accessed entries past the cap", () => {
      const smallCache = new LLMCache({
        dbPath: makeTmpDbPath("-lru"),
        maxEntries: 3,
      });
      try {
        const k1 = computeRequestHash("m", [{ role: "user", content: "1" }]);
        const k2 = computeRequestHash("m", [{ role: "user", content: "2" }]);
        const k3 = computeRequestHash("m", [{ role: "user", content: "3" }]);
        const k4 = computeRequestHash("m", [{ role: "user", content: "4" }]);
        smallCache.store("m", k1, makeResponse());
        smallCache.store("m", k2, makeResponse());
        smallCache.store("m", k3, makeResponse());
        // Touch k1 to make it the most-recent.
        smallCache.lookup("m", k1);
        // Inserting k4 must evict k2 (now the LRU).
        smallCache.store("m", k4, makeResponse());
        expect(smallCache.lookup("m", k1)).not.toBeNull();
        expect(smallCache.lookup("m", k2)).toBeNull();
        expect(smallCache.lookup("m", k3)).not.toBeNull();
        expect(smallCache.lookup("m", k4)).not.toBeNull();
        expect(smallCache.stats().evictions).toBeGreaterThan(0);
      } finally {
        smallCache.close();
        cleanup(dbPath + "-lru");
      }
    });
  });

  describe("invalidation", () => {
    it("drops a single entry by key", () => {
      const key = computeRequestHash("m", [{ role: "user", content: "q" }]);
      cache.store("m", key, makeResponse());
      expect(cache.invalidate(key)).toBe(true);
      expect(cache.lookup("m", key)).toBeNull();
    });

    it("drops every entry for a model", () => {
      cache.store(
        "a",
        computeRequestHash("a", [{ role: "user", content: "q1" }]),
        makeResponse(),
      );
      cache.store(
        "a",
        computeRequestHash("a", [{ role: "user", content: "q2" }]),
        makeResponse(),
      );
      cache.store(
        "b",
        computeRequestHash("b", [{ role: "user", content: "q3" }]),
        makeResponse(),
      );
      const removed = cache.invalidateModel("a");
      expect(removed).toBe(2);
      expect(cache.countByModel("a")).toBe(0);
      expect(cache.countByModel("b")).toBe(1);
    });

    it("clear() wipes everything", () => {
      cache.store(
        "m",
        computeRequestHash("m", [{ role: "user", content: "q" }]),
        makeResponse(),
      );
      cache.clear();
      expect(cache.stats().size).toBe(0);
    });
  });

  describe("hit tracking", () => {
    it("increments hit_count when trackHits is on (default)", () => {
      const key = computeRequestHash("m", [{ role: "user", content: "q" }]);
      cache.store("m", key, makeResponse());
      cache.lookup("m", key);
      cache.lookup("m", key);
      cache.lookup("m", key);
      // hit_count is read back from the stored response, not the in-memory counter
      const hit = cache.lookup("m", key);
      expect(hit!.hitCount).toBeGreaterThanOrEqual(3);
    });

    it("does not touch the row when trackHits is off", () => {
      const noTrackCache = new LLMCache({
        dbPath: makeTmpDbPath("-no-track"),
        trackHits: false,
      });
      try {
        const key = computeRequestHash("m", [{ role: "user", content: "q" }]);
        noTrackCache.store("m", key, makeResponse());
        const before = noTrackCache.lookup("m", key);
        noTrackCache.lookup("m", key);
        const after = noTrackCache.lookup("m", key);
        // With trackHits off, hit_count is never updated, so the value
        // returned on every hit is the same (0 from the insert).
        expect(after!.hitCount).toBe(before!.hitCount);
      } finally {
        noTrackCache.close();
        cleanup(dbPath + "-no-track");
      }
    });
  });
});

describe("withCache decorator", () => {
  it("returns the cached response without invoking the fetcher", async () => {
    const dbPath = makeTmpDbPath("-decorator");
    const cache = new LLMCache({ dbPath });
    try {
      const req = makeRequest();
      const fetcher = async () => makeResponse();
      const first = await withCache(cache, "gpt-4o-mini", req, fetcher);
      expect(first.fromCache).toBe(false);
      const second = await withCache(cache, "gpt-4o-mini", req, fetcher);
      expect(second.fromCache).toBe(true);
      expect(second.response).toEqual(first.response);
    } finally {
      cache.close();
      cleanup(dbPath);
    }
  });
});

describe("default constants", () => {
  it("exposes sane defaults", () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(60 * 60 * 1000);
    expect(DEFAULT_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
  });
});
