/**
 * Unit tests for CodeGraph utilities.
 *
 * Covers the pure functions and classes exported from utils.ts:
 * path validation, JSON parsing, clamping, debounce/throttle,
 * FileLock, Mutex, MemoryMonitor, processInBatches, etc.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validatePathWithinRoot,
  validateProjectPath,
  isPathWithinRoot,
  safeJsonParse,
  clamp,
  normalizePath,
  FileLock,
  processInBatches,
  Mutex,
  readFileInChunks,
  debounce,
  throttle,
  estimateSize,
  MemoryMonitor,
} from './utils.js';

// =============================================================================
// Path validation
// =============================================================================

describe('validatePathWithinRoot', () => {
  it('resolves a normal path within root', () => {
    const result = validatePathWithinRoot('/project', 'src/index.ts');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result!.endsWith(`${sep}src${sep}index.ts`)).toBe(true);
  });

  it('returns null for path traversal with ..', () => {
    const result = validatePathWithinRoot('/project', '../../etc/passwd');
    expect(result).toBeNull();
  });

  it('returns root itself as valid', () => {
    const result = validatePathWithinRoot('/project', '.');
    expect(result).not.toBeNull();
  });
});

describe('isPathWithinRoot', () => {
  it('returns true for a path inside root', () => {
    expect(isPathWithinRoot('src/index.ts', '/project')).toBe(true);
  });

  it('returns false for a path outside root', () => {
    expect(isPathWithinRoot('../../etc/passwd', '/project')).toBe(false);
  });

  it('returns true for root itself', () => {
    expect(isPathWithinRoot('.', '/project')).toBe(true);
  });
});

describe('validateProjectPath', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aide-utils-path-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns null for a valid directory', () => {
    expect(validateProjectPath(tmp)).toBeNull();
  });

  it('returns error for a non-existent path', () => {
    const result = validateProjectPath(join(tmp, 'nonexistent'));
    expect(result).toContain('not exist');
  });

  it('returns error for a file (not directory)', () => {
    const filePath = join(tmp, 'file.txt');
    writeFileSync(filePath, 'hello');
    const result = validateProjectPath(filePath);
    expect(result).toContain('not a directory');
  });
});

// =============================================================================
// safeJsonParse
// =============================================================================

describe('safeJsonParse', () => {
  it('returns parsed value for valid JSON', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not-json', [])).toEqual([]);
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', {})).toEqual({});
  });
});

// =============================================================================
// clamp
// =============================================================================

describe('clamp', () => {
  it('returns value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps below minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps above maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles equal bounds', () => {
    expect(clamp(5, 5, 5)).toBe(5);
  });
});

// =============================================================================
// normalizePath
// =============================================================================

describe('normalizePath', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(normalizePath('a\\b\\c.ts')).toBe('a/b/c.ts');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizePath('a/b/c.ts')).toBe('a/b/c.ts');
  });
});

// =============================================================================
// estimateSize
// =============================================================================

describe('estimateSize', () => {
  it('returns 0 for null', () => {
    expect(estimateSize(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(estimateSize(undefined)).toBe(0);
  });

  it('estimates string length correctly', () => {
    expect(estimateSize('hello')).toBe(10); // 2 * 5 chars
  });

  it('handles nested objects without circular reference crash', () => {
    const obj = { a: { b: { c: 'deep' } } };
    expect(estimateSize(obj)).toBeGreaterThan(0);
  });

  it('handles arrays', () => {
    expect(estimateSize([1, 2, 3])).toBe(24); // 3 * 8 bytes
  });
});

// =============================================================================
// processInBatches
// =============================================================================

describe('processInBatches', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await processInBatches(items, 2, async (n) => n * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('calls onBatchComplete with correct progress', async () => {
    const items = [1, 2, 3, 4, 5];
    const progress: number[] = [];
    await processInBatches(items, 3, async (n) => n, (_done, _total) => {
      progress.push(_done);
    });
    expect(progress).toEqual([3, 5]);
  });

  it('handles empty array', async () => {
    const results = await processInBatches([], 10, async (n: number) => n);
    expect(results).toEqual([]);
  });
});

// =============================================================================
// Mutex
// =============================================================================

describe('Mutex', () => {
  it('executes a function exclusively', async () => {
    const mutex = new Mutex();
    const results: number[] = [];

    await Promise.all([
      mutex.withLock(async () => {
        results.push(1);
      }),
      mutex.withLock(async () => {
        results.push(2);
      }),
    ]);

    expect(results).toContain(1);
    expect(results).toContain(2);
  });

  it('reports locked state', async () => {
    const mutex = new Mutex();
    expect(mutex.isLocked()).toBe(false);

    const release = await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);
    release();
    expect(mutex.isLocked()).toBe(false);
  });

  it('acquire returns a release function', async () => {
    const mutex = new Mutex();
    const release = await mutex.acquire();
    expect(typeof release).toBe('function');
    release();
    expect(mutex.isLocked()).toBe(false);
  });
});

// =============================================================================
// FileLock
// =============================================================================

describe('FileLock', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aide-utils-flock-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('acquire and release work', () => {
    const lockPath = join(tmp, 'test.lock');
    const lock = new FileLock(lockPath);
    lock.acquire();
    expect(existsSync(lockPath)).toBe(true);
    lock.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('withLock executes the function', () => {
    const lockPath = join(tmp, 'test2.lock');
    const lock = new FileLock(lockPath);
    let ran = false;
    lock.withLock(() => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('withLockAsync executes the async function', async () => {
    const lockPath = join(tmp, 'test3.lock');
    const lock = new FileLock(lockPath);
    let ran = false;
    await lock.withLockAsync(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('throws if lock is already held', () => {
    const lockPath = join(tmp, 'test4.lock');
    const lock1 = new FileLock(lockPath);
    lock1.acquire();

    const lock2 = new FileLock(lockPath);
    expect(() => lock2.acquire()).toThrow('locked by another process');

    lock1.release();
  });

  it('release on non-held lock is a no-op', () => {
    const lock = new FileLock(join(tmp, 'noop.lock'));
    expect(() => lock.release()).not.toThrow();
  });
});

// =============================================================================
// readFileInChunks
// =============================================================================

describe('readFileInChunks', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aide-utils-chunks-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads a small file in one chunk', async () => {
    const filePath = join(tmp, 'small.txt');
    writeFileSync(filePath, 'hello world');
    const chunks: string[] = [];
    for await (const chunk of readFileInChunks(filePath)) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('hello world');
  });
});

// =============================================================================
// debounce
// =============================================================================

describe('debounce', () => {
  it('delays execution', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('cancels previous pending call', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

// =============================================================================
// throttle
// =============================================================================

describe('throttle', () => {
  it('calls immediately first time', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('rate-limits subsequent calls within the window', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled(); // within window, should be queued

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

// =============================================================================
// MemoryMonitor
// =============================================================================

describe('MemoryMonitor', () => {
  it('starts and stops without throwing', () => {
    // Use a very high threshold so we don't actually trigger during tests
    const monitor = new MemoryMonitor(999999);
    expect(() => monitor.start()).not.toThrow();
    monitor.stop();
  });

  it('reports peak usage', () => {
    const monitor = new MemoryMonitor(999999);
    monitor.start(100);
    expect(monitor.getPeakUsage()).toBeGreaterThanOrEqual(0);
    monitor.stop();
  });
});
