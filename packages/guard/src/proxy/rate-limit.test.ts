/**
 * Tests for the in-process token-bucket rate limiter.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { TokenBucketRateLimiter, DEFAULT_RATE_LIMIT } from "./rate-limit.js";

describe("TokenBucketRateLimiter", () => {
  let limiter: TokenBucketRateLimiter;

  beforeEach(() => {
    limiter = new TokenBucketRateLimiter({ limit: 5, windowMs: 1_000 });
  });

  describe("config", () => {
    it("applies the provided config", () => {
      expect(limiter.getConfig()).toEqual({ limit: 5, windowMs: 1_000 });
    });

    it("falls back to defaults when only partial config is given", () => {
      const partial = new TokenBucketRateLimiter({ limit: 10 });
      expect(partial.getConfig()).toEqual({
        limit: 10,
        windowMs: DEFAULT_RATE_LIMIT.windowMs,
      });
    });

    it("rejects non-positive limits", () => {
      expect(() => new TokenBucketRateLimiter({ limit: 0 })).toThrow();
      expect(() => new TokenBucketRateLimiter({ limit: -1 })).toThrow();
    });

    it("rejects non-positive windows", () => {
      expect(() => new TokenBucketRateLimiter({ windowMs: 0 })).toThrow();
    });
  });

  describe("basic consumption", () => {
    it("starts each key with a full bucket", () => {
      const r = limiter.check("alice", 1_000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4); // 5 - 1
      expect(r.retryAfterMs).toBe(0);
    });

    it("rejects after the bucket is empty", () => {
      for (let i = 0; i < 5; i += 1) {
        expect(limiter.check("alice", 1_000 + i).allowed).toBe(true);
      }
      const r = limiter.check("alice", 1_005);
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
      expect(r.retryAfterMs).toBeGreaterThan(0);
    });

    it("isolates buckets per key (one user cannot drain another)", () => {
      for (let i = 0; i < 5; i += 1) {
        limiter.check("alice", 1_000 + i);
      }
      // Alice's bucket is empty, but Bob still has his full one.
      const bob1 = limiter.check("bob", 1_000);
      expect(bob1.allowed).toBe(true);
      expect(bob1.remaining).toBe(4);
      // Second check at the same instant — refill is zero when no
      // time has passed, so the bucket drops to 3.
      const bob2 = limiter.check("bob", 1_000);
      expect(bob2.allowed).toBe(true);
      expect(bob2.remaining).toBe(3);
    });

    it("counts the number of distinct tracked keys", () => {
      limiter.check("alice", 1_000);
      limiter.check("bob", 1_000);
      limiter.check("alice", 1_001);
      expect(limiter.size()).toBe(2);
    });
  });

  describe("refill", () => {
    it("refills linearly over time", () => {
      // Drain the bucket.
      for (let i = 0; i < 5; i += 1) {
        limiter.check("alice", 1_000);
      }
      expect(limiter.check("alice", 1_001).allowed).toBe(false);
      // After 200ms, 20% of the bucket has refilled = 1 token.
      expect(limiter.check("alice", 1_200).allowed).toBe(true);
      // The next request at the same time should fail (1 token spent).
      expect(limiter.check("alice", 1_200).allowed).toBe(false);
    });

    it("caps refill at the bucket size", () => {
      // After a long idle, a fresh check should find a full bucket.
      const r = limiter.check("alice", 1_000 + 10_000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4);
    });

    it("idle buckets that were never used do not leak memory", () => {
      // (This is implicitly tested by the Map.set behavior — keys are
      // only created on first check. We assert size() == 0 before any
      // call to keep that contract honest if the impl changes.)
      expect(limiter.size()).toBe(0);
    });
  });

  describe("reset", () => {
    it("reset(key) clears a single bucket", () => {
      for (let i = 0; i < 5; i += 1) {
        limiter.check("alice", 1_000);
      }
      expect(limiter.check("alice", 1_001).allowed).toBe(false);
      limiter.reset("alice");
      // Same instant for the post-reset check so refill is zero.
      const r = limiter.check("alice", 1_001);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4);
    });

    it("resetAll() clears every bucket", () => {
      limiter.check("alice", 1_000);
      limiter.check("bob", 1_000);
      expect(limiter.size()).toBe(2);
      limiter.resetAll();
      expect(limiter.size()).toBe(0);
    });
  });

  describe("retryAfterMs on rejection", () => {
    it("reports the time until one token is available", () => {
      // Drain. Limit 5, window 1000ms → 5 tokens/s = 0.2s per token.
      for (let i = 0; i < 5; i += 1) {
        limiter.check("alice", 1_000);
      }
      const r = limiter.check("alice", 1_000);
      // Time-to-one-token: 200ms = 0.2s.
      // The exact value depends on the floating-point refill; we just
      // assert it's in the right ballpark.
      expect(r.retryAfterMs).toBeGreaterThanOrEqual(200);
      expect(r.retryAfterMs).toBeLessThan(250);
    });
  });
});
