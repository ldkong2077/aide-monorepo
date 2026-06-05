/**
 * Unit tests for RedisTenantCostTracker.
 *
 * Uses a lightweight mock Redis object to avoid ioredis connection
 * side effects.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RedisTenantCostTracker } from './redis-tenant-circuit.js';

function mockRedis() {
  const store = new Map<string, string>();
  return {
    async eval(script: string, _numKeys: number, ...args: string[]) {
      if (script.includes('INCRBYFLOAT')) {
        // RECORD_SCRIPT: KEYS[1]=spendKey, KEYS[2]=openKey, ARGV[1]=inc, ARGV[2]=threshold, ARGV[3]=ttl
        const spendKey = args[0], openKey = args[1];
        const inc = Number(args[2]), threshold = Number(args[3]), _ttl = Number(args[4]);
        const cur = Number(store.get(spendKey) || '0');
        const newVal = cur + inc;
        store.set(spendKey, String(newVal));
        const open = newVal >= threshold;
        if (open) store.set(openKey, '1');
        return JSON.stringify({ dailyUsd: newVal, circuitOpen: open });
      }
      if (script.includes('cjson.encode')) {
        // SNAPSHOT_SCRIPT: KEYS[1]=spendKey, KEYS[2]=openKey
        const spendKey = args[0], openKey = args[1];
        const dailyUsd = Number(store.get(spendKey) || '0');
        const openRaw = store.get(openKey);
        return JSON.stringify({ dailyUsd, circuitOpen: openRaw !== undefined });
      }
      // RESET_SCRIPT: KEYS[1]=spendKey, KEYS[2]=openKey
      if (store.has(args[0])) store.delete(args[0]);
      if (store.has(args[1])) store.delete(args[1]);
      return 'OK';
    },
    async get(k: string) { return store.get(k) ?? null; },
    async set(k: string, v: string) { store.set(k, v); return 'OK'; },
    async exists(k: string) { return store.has(k) ? 1 : 0; },
    async keys(pattern: string) { const p = pattern.replace('*', ''); return [...store.keys()].filter(k => k.startsWith(p)); },
    async del(...ks: string[]) { for (const k of ks) store.delete(k); return ks.length; },
    async connect() {},
  };
}

describe('RedisTenantCostTracker', () => {
  let tracker: RedisTenantCostTracker;
  beforeEach(() => { tracker = new RedisTenantCostTracker(mockRedis() as any, { budgetDaily: 10, alertThreshold: 0.8 }); });

  it('records spend under threshold', async () => {
    await tracker.record('ta', 5, 1000);
    expect(await tracker.isCircuitOpen('ta')).toBe(false);
  });

  it('opens circuit over threshold', async () => {
    await tracker.record('tb', 9, 1000);
    expect(await tracker.isCircuitOpen('tb')).toBe(true);
  });

  it('snapshot returns data', async () => {
    await tracker.record('tc', 3.5, 1000);
    const s = await tracker.snapshot('tc', 1000);
    expect(s).not.toBeNull();
    expect(s!.dailyUsd).toBeCloseTo(3.5);
    expect(s!.thresholdUsd).toBe(8);
  });

  it('snapshot null for unknown', async () => {
    expect(await tracker.snapshot('unk', 1000)).toBeNull();
  });

  it('ignores non-positive cost', async () => {
    await tracker.record('td', -5, 1000);
    await tracker.record('td', 0, 1000);
    expect(await tracker.snapshot('td', 1000)).toBeNull();
  });

  it('snapshot shows open circuit', async () => {
    await tracker.record('te', 9, 1000);
    expect((await tracker.snapshot('te', 1000))!.circuitOpen).toBe(true);
  });

  it('getConfig works', () => { const c = tracker.getConfig(); expect(c.budgetDaily).toBe(10); expect(c.alertThreshold).toBe(0.8); });
  it('size works', async () => { await tracker.record('s1', 1, 1000); await tracker.record('s2', 1, 1000); expect(await tracker.size()).toBe(2); });
  it('reset works', async () => { await tracker.record('r', 5, 1000); await tracker.reset('r'); expect(await tracker.isCircuitOpen('r')).toBe(false); });
  it('resetAll works', async () => { await tracker.record('a', 1, 1000); await tracker.record('b', 1, 1000); await tracker.resetAll(); expect(await tracker.size()).toBe(0); });

  it('snapshotAll returns all', async () => {
    await tracker.record('s1', 2, 1000); await tracker.record('s2', 8, 1000);
    const all = await tracker.snapshotAll(1000);
    expect(all).toHaveLength(2);
    expect(all.find(t => t.tenant === 's1')!.dailyUsd).toBe(2);
    expect(all.find(t => t.tenant === 's2')!.circuitOpen).toBe(true);
  });

  it('throws on invalid config', () => {
    expect(() => new RedisTenantCostTracker(mockRedis() as any, { budgetDaily: 0 })).toThrow('> 0');
    expect(() => new RedisTenantCostTracker(mockRedis() as any, { alertThreshold: 0 })).toThrow('must be in');
  });
});
