/**
 * Unit tests for RedisTokenBucketRateLimiter.
 *
 * Uses a lightweight mock Redis object to avoid ioredis connection
 * side effects.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RedisTokenBucketRateLimiter } from './redis-rate-limit.js';

function mockRedis() {
  const store = new Map<string, string>();
  return {
    async eval(script: string, _numKeys: number, ...args: string[]) {
      // Detect script by argument count: CHECK_SCRIPT has 4 ARGV, RESET_SCRIPT has 0
      if (args.length >= 3) {
        // CHECK_SCRIPT: rate-limit check
        const key = args[0], limit = Number(args[1]), windowMs = Number(args[2]), now = Number(args[3]);
        const raw = store.get(key);
        const state = raw ? JSON.parse(raw) : null;
        let tokens = state?.tokens ?? limit;
        let lastRefill = state?.lastRefill ?? now;
        const elapsed = now - lastRefill;
        if (elapsed > 0) {
          tokens = Math.min(limit, tokens + (elapsed / windowMs) * limit);
          lastRefill = now;
        }
        const allowed = tokens >= 1;
        let remaining, resetMs, retryAfterMs;
        if (allowed) {
          tokens -= 1;
          remaining = Math.floor(tokens);
          resetMs = Math.ceil(((limit - tokens) / limit) * windowMs);
          retryAfterMs = 0;
        } else {
          remaining = 0;
          resetMs = Math.ceil(((limit - tokens) / limit) * windowMs);
          retryAfterMs = Math.ceil(((1 - tokens) / limit) * windowMs);
        }
        store.set(key, JSON.stringify({ tokens, lastRefill }));
        return JSON.stringify({ allowed, remaining, resetMs, retryAfterMs });
      }
      // RESET_SCRIPT: just DEL
      if (store.has(args[0])) store.delete(args[0]);
      return 'OK';
    },
    async keys(pattern: string) {
      const p = pattern.replace('*', '');
      return [...store.keys()].filter(k => k.startsWith(p));
    },
    async del(...ks: string[]) { for (const k of ks) store.delete(k); return ks.length; },
    async connect() {},
  };
}

describe('RedisTokenBucketRateLimiter', () => {
  let limiter: RedisTokenBucketRateLimiter;
  beforeEach(() => { limiter = new RedisTokenBucketRateLimiter(mockRedis() as any, { limit: 5, windowMs: 10000 }); });

  it('allows within limit', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await limiter.check('a', 1000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
  });

  it('rejects beyond limit', async () => {
    for (let i = 0; i < 5; i++) await limiter.check('b', 1000);
    expect((await limiter.check('b', 1000)).allowed).toBe(false);
  });

  it('refills over time', async () => {
    await limiter.check('c', 1000); await limiter.check('c', 1000);
    expect((await limiter.check('c', 6000)).allowed).toBe(true);
  });

  it('isolates keys', async () => {
    await limiter.check('x', 1000); await limiter.check('x', 1000);
    expect((await limiter.check('y', 1000)).remaining).toBe(4);
  });

  it('getConfig works', () => { const c = limiter.getConfig(); expect(c.limit).toBe(5); expect(c.windowMs).toBe(10000); });
  it('size works', async () => { await limiter.check('s1', 1000); await limiter.check('s2', 1000); expect(await limiter.size()).toBe(2); });
  it('reset works', async () => { await limiter.check('r', 1000); await limiter.reset('r'); expect(await limiter.size()).toBe(0); });
  it('resetAll works', async () => { await limiter.check('a', 1000); await limiter.check('b', 1000); await limiter.resetAll(); expect(await limiter.size()).toBe(0); });
  it('throws on invalid config', () => {
    expect(() => new RedisTokenBucketRateLimiter(mockRedis() as any, { limit: 0 })).toThrow('> 0');
    expect(() => new RedisTokenBucketRateLimiter(mockRedis() as any, { windowMs: 0 })).toThrow('> 0');
  });
});
