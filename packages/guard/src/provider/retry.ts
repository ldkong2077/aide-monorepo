/**
 * @aide-dev/guard — Upstream-call resilience helpers.
 *
 * `withRetry` adds exponential backoff with jitter. `withTimeout` adds a
 * hard wall-clock cap on a single attempt, so a hung TCP connection
 * cannot wedge the proxy forever. The two compose: each retry attempt
 * is independently timed, so a 60 s timeout with 3 retries caps the
 * total wait at roughly 60 + 60 + 60 + backoff = 4 minutes worst case.
 *
 * Extracted from `provider/index.ts` so it can be unit-tested without
 * spinning up the OpenAI / Anthropic SDK clients.
 */

/** Thrown by `withTimeout` when an attempt exceeds its budget. */
export class UpstreamTimeoutError extends Error {
  override readonly name = "UpstreamTimeoutError";
  readonly timeoutMs: number;
  constructor(timeoutMs: number, label: string) {
    super(`Upstream ${label} timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

/** Promise that rejects after `ms` milliseconds. Cleared on settle. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "request",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new UpstreamTimeoutError(ms, label)),
      ms,
    );
    // Unref so a pending timer never holds the event loop open after
    // the parent promise has already settled.
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /**
   * If set, each individual attempt is wrapped with `withTimeout` and
   * rejected with `UpstreamTimeoutError` if it exceeds the budget.
   */
  timeoutMs?: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
};

/**
 * Errors that mean "retrying won't help" — auth failures, malformed
 * requests, context length exceeded. Substring match against
 * lower-cased error message; the SDK messages are stable enough for
 * this to be reliable in practice.
 */
export function isNonRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("invalid api key") ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("invalid_request") ||
    msg.includes("context_length_exceeded")
  );
}

/** Sleep helper. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` with exponential backoff + jitter. Each attempt is
 * independently timed if `timeoutMs` is set. Re-throws the last error
 * after exhausting all retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  label = "request",
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const p = fn();
      return opts.timeoutMs
        ? await withTimeout(p, opts.timeoutMs, label)
        : await p;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isNonRetryableError(lastError)) {
        throw lastError;
      }

      if (attempt < opts.maxRetries) {
        // Exponential backoff with up-to-1s jitter. Jitter prevents
        // thundering-herd retries when many clients all hit the same
        // transient 500 at the same instant.
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1_000,
          opts.maxDelayMs,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
