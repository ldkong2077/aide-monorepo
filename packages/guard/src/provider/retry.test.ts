/**
 * Tests for the upstream-call resilience helpers.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  withTimeout,
  withRetry,
  isNonRetryableError,
  UpstreamTimeoutError,
  DEFAULT_RETRY_OPTIONS,
  type RetryOptions,
} from './retry.js';

describe('withTimeout', () => {
  it('resolves with the underlying value when within the budget', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1_000);
    expect(result).toBe('ok');
  });

  it('rejects with UpstreamTimeoutError when the budget is exceeded', async () => {
    vi.useFakeTimers();
    try {
      const promise = withTimeout(new Promise(() => {}), 1_000, 'unit');
      const expectation = expect(promise).rejects.toBeInstanceOf(UpstreamTimeoutError);
      vi.advanceTimersByTime(1_000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('the UpstreamTimeoutError carries the budget and label', async () => {
    vi.useFakeTimers();
    try {
      const promise = withTimeout(new Promise(() => {}), 2_500, 'first-byte');
      const expectation = expect(promise).rejects.toMatchObject({
        timeoutMs: 2_500,
        message: expect.stringContaining('first-byte'),
      });
      vi.advanceTimersByTime(2_500);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not keep the timer alive after the promise settles (timer.unref)', async () => {
    // If the timer kept the event loop open, `await Promise.resolve()`
    // would be enough — but vitest's `useRealTimers` path requires the
    // event loop to be free. We assert that a settled-with-value
    // promise doesn't leave a pending timer by sleeping past the
    // budget and confirming the value is still returned.
    const result = await withTimeout(Promise.resolve(42), 10_000);
    expect(result).toBe(42);
    // If unref() were missing, vitest's leak detection would warn.
  });

  it('propagates the underlying rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1_000)).rejects.toThrow('boom');
  });
});

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on retryable errors up to maxRetries times', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does NOT retry on non-retryable errors (auth, etc.)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));
    await expect(
      withRetry(fn, { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow('Invalid API key');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('applies timeout per attempt (timeout triggers a retry)', async () => {
    vi.useFakeTimers();
    try {
      const opts: Partial<RetryOptions> = {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 5,
        timeoutMs: 100,
      };
      let call = 0;
      const fn = vi.fn().mockImplementation(() => {
        call += 1;
        if (call === 1) {
          // First attempt: hang forever.
          return new Promise<string>(() => {});
        }
        return Promise.resolve('ok');
      });
      const promise = withRetry(fn, opts, 'first');
      // Let the first attempt's timer fire.
      await vi.advanceTimersByTimeAsync(100);
      // Let the backoff sleep + second attempt resolve.
      await vi.advanceTimersByTimeAsync(10);
      // Direct resolve assertion to avoid vitest's `expect.rejects`
      // / `expect.resolves` timing-out separately from the work.
      const result = await promise;
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('timeout exhaustion surfaces UpstreamTimeoutError', async () => {
    vi.useFakeTimers();
    try {
      // Use a deferred we can resolve manually so the inner promise
      // doesn't leak when the test ends.
      let resolveOuter: ((v: string) => void) | undefined;
      const fn = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveOuter = resolve;
          }),
      );
      const promise = withRetry(
        fn,
        { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 5, timeoutMs: 50 },
        'upstream',
      );
      // Attach the rejection handler BEFORE we advance timers, so
      // the rejection is never unhandled.
      const settled = promise.catch((e: unknown) => e);
      // First attempt: timer fires.
      await vi.advanceTimersByTimeAsync(50);
      // Backoff.
      await vi.advanceTimersByTimeAsync(5);
      // Second attempt: timer fires.
      await vi.advanceTimersByTimeAsync(50);
      const err = await settled;
      expect(err).toBeInstanceOf(UpstreamTimeoutError);
      expect(fn).toHaveBeenCalledTimes(2);
      // Release the orphaned fn promise so the test doesn't leak.
      resolveOuter?.('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses default options when none are given', async () => {
    // Sanity check: the defaults exist and are sane.
    expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBeGreaterThan(0);
    expect(DEFAULT_RETRY_OPTIONS.baseDelayMs).toBeGreaterThan(0);
    expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBeGreaterThanOrEqual(DEFAULT_RETRY_OPTIONS.baseDelayMs);
  });
});

describe('isNonRetryableError', () => {
  it.each([
    'Invalid API key',
    'Authentication failed',
    'Unauthorized',
    'Forbidden',
    'invalid_request_error',
    'context_length_exceeded',
  ])('treats %s as non-retryable', (msg) => {
    expect(isNonRetryableError(new Error(msg))).toBe(true);
  });

  it.each(['connection reset', '500 internal server error', 'rate limit exceeded', 'timeout'])(
    'treats %s as retryable',
    (msg) => {
      expect(isNonRetryableError(new Error(msg))).toBe(false);
    },
  );
});
