import { describe, it, expect, beforeEach } from 'vitest';
import { TenantCostTracker, DEFAULT_TENANT_CIRCUIT } from './tenant-circuit.js';

describe('TenantCostTracker', () => {
  let tracker: TenantCostTracker;

  beforeEach(() => {
    tracker = new TenantCostTracker();
  });

  describe('config validation', () => {
    it('rejects non-positive budgetDaily', () => {
      expect(() => new TenantCostTracker({ budgetDaily: 0 })).toThrow(/budgetDaily/);
      expect(() => new TenantCostTracker({ budgetDaily: -1 })).toThrow(/budgetDaily/);
    });

    it('rejects alertThreshold out of (0, 1]', () => {
      expect(() => new TenantCostTracker({ alertThreshold: 0 })).toThrow(/alertThreshold/);
      expect(() => new TenantCostTracker({ alertThreshold: 1.5 })).toThrow(/alertThreshold/);
      // Boundary: 1 is allowed
      expect(() => new TenantCostTracker({ alertThreshold: 1 })).not.toThrow();
    });

    it('exposes a defensive copy of the config', () => {
      const t = new TenantCostTracker({ budgetDaily: 5 });
      const cfg = t.getConfig();
      cfg.budgetDaily = 999;
      expect(t.getConfig().budgetDaily).toBe(5);
    });
  });

  describe('record + circuit open', () => {
    it('starts unknown tenants with no spend and a closed circuit', () => {
      expect(tracker.isCircuitOpen('acme')).toBe(false);
      expect(tracker.snapshot('acme')).toBeNull();
    });

    it('opens the circuit once dailyUsd >= budgetDaily * alertThreshold', () => {
      // DEFAULT_TENANT_CIRCUIT: budgetDaily=10, alertThreshold=0.8 → 8.0
      tracker.record('acme', 7.99);
      expect(tracker.isCircuitOpen('acme')).toBe(false);
      tracker.record('acme', 0.01);
      expect(tracker.isCircuitOpen('acme')).toBe(true);
    });

    it('ignores non-positive deltas (no punishment for over-estimates)', () => {
      tracker.record('acme', 8); // opens the circuit
      tracker.record('acme', -100);
      // Spend is still 8; circuit is still open
      expect(tracker.isCircuitOpen('acme')).toBe(true);
      expect(tracker.snapshot('acme')?.dailyUsd).toBe(8);
    });

    it('isolates tenants — one tenant tripping does not affect another', () => {
      tracker.record('acme', 100);
      expect(tracker.isCircuitOpen('acme')).toBe(true);
      expect(tracker.isCircuitOpen('beta')).toBe(false);
    });
  });

  describe('day rollover', () => {
    it('closes the circuit and resets dailyUsd when the UTC day rolls over', () => {
      const day1 = Date.UTC(2026, 5, 1, 12, 0, 0); // 2026-06-01T12:00:00Z
      tracker.record('acme', 8, day1);
      expect(tracker.isCircuitOpen('acme', day1)).toBe(true);

      const day2 = Date.UTC(2026, 5, 2, 0, 0, 1); // 2026-06-02T00:00:01Z
      expect(tracker.isCircuitOpen('acme', day2)).toBe(false);
      const snap = tracker.snapshot('acme', day2);
      expect(snap?.dailyUsd).toBe(0);
      expect(snap?.circuitOpen).toBe(false);
    });

    it('record() in the new day starts a fresh counter', () => {
      const day1 = Date.UTC(2026, 5, 1, 12, 0, 0);
      const day2 = Date.UTC(2026, 5, 2, 8, 0, 0);
      tracker.record('acme', 8, day1);
      expect(tracker.isCircuitOpen('acme', day1)).toBe(true);

      tracker.record('acme', 1, day2);
      expect(tracker.snapshot('acme', day2)?.dailyUsd).toBe(1);
      expect(tracker.isCircuitOpen('acme', day2)).toBe(false);
    });
  });

  describe('snapshot', () => {
    it('returns null for unknown tenants', () => {
      expect(tracker.snapshot('unknown')).toBeNull();
    });

    it('returns the current threshold derived from the config', () => {
      const t = new TenantCostTracker({ budgetDaily: 20, alertThreshold: 0.5 });
      t.record('acme', 0.01); // ensure state exists
      const snap = t.snapshot('acme');
      expect(snap?.thresholdUsd).toBe(10);
    });

    it('reflects the current dailyUsd after a record()', () => {
      tracker.record('acme', 3);
      tracker.record('acme', 2);
      const snap = tracker.snapshot('acme');
      expect(snap?.dailyUsd).toBe(5);
      expect(snap?.circuitOpen).toBe(false);
    });

    it('lazily rolls the day boundary for a known tenant', () => {
      const day1 = Date.UTC(2026, 5, 1, 12, 0, 0);
      const day2 = Date.UTC(2026, 5, 2, 0, 0, 1);
      tracker.record('acme', 8, day1);
      expect(tracker.snapshot('acme', day1)?.circuitOpen).toBe(true);
      // After the date line, snapshot() itself rolls the
      // counter over so callers do not need to call
      // `record()` first to reset state.
      const fresh = tracker.snapshot('acme', day2);
      expect(fresh?.dailyUsd).toBe(0);
      expect(fresh?.circuitOpen).toBe(false);
    });
  });

  describe('snapshotAll', () => {
    it('returns an empty array when no tenants are tracked', () => {
      expect(tracker.snapshotAll()).toEqual([]);
    });

    it('returns one entry per tracked tenant, tagged with the tenant id', () => {
      tracker.record('acme', 2);
      tracker.record('beta', 5);
      const all = tracker.snapshotAll();
      const byTenant = Object.fromEntries(all.map((s) => [s.tenant, s]));
      expect(byTenant.acme?.dailyUsd).toBe(2);
      expect(byTenant.acme?.circuitOpen).toBe(false);
      expect(byTenant.beta?.dailyUsd).toBe(5);
      // beta is at 5/8 = 62.5% — still under the 80% default
      expect(byTenant.beta?.circuitOpen).toBe(false);
    });

    it('reflects the circuit-open state for tenants over the threshold', () => {
      tracker.record('acme', 8); // 100% of the 8-USD default threshold
      const all = tracker.snapshotAll();
      const acme = all.find((s) => s.tenant === 'acme');
      expect(acme?.circuitOpen).toBe(true);
    });

    it('lazily rolls the day boundary for every entry in the snapshot', () => {
      const day1 = Date.UTC(2026, 5, 1, 12, 0, 0);
      const day2 = Date.UTC(2026, 5, 2, 0, 0, 1);
      tracker.record('acme', 8, day1);
      tracker.record('beta', 8, day1);
      const all = tracker.snapshotAll(day2);
      // Both tenants should have rolled over to day 2.
      for (const snap of all) {
        expect(snap.dailyUsd).toBe(0);
        expect(snap.circuitOpen).toBe(false);
      }
    });
  });

  describe('reset', () => {
    it('removes a single tenant', () => {
      tracker.record('acme', 100);
      expect(tracker.isCircuitOpen('acme')).toBe(true);
      tracker.reset('acme');
      expect(tracker.snapshot('acme')).toBeNull();
      expect(tracker.isCircuitOpen('acme')).toBe(false);
    });

    it('removes all tenants with resetAll()', () => {
      tracker.record('acme', 5);
      tracker.record('beta', 5);
      expect(tracker.size()).toBe(2);
      tracker.resetAll();
      expect(tracker.size()).toBe(0);
    });
  });

  describe('defaults', () => {
    it('exposes a sensible DEFAULT_TENANT_CIRCUIT', () => {
      expect(DEFAULT_TENANT_CIRCUIT.budgetDaily).toBeGreaterThan(0);
      expect(DEFAULT_TENANT_CIRCUIT.alertThreshold).toBeGreaterThan(0);
      expect(DEFAULT_TENANT_CIRCUIT.alertThreshold).toBeLessThanOrEqual(1);
    });
  });
});
