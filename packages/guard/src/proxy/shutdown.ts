/**
 * @aide/guard — Graceful shutdown helper for the Fastify proxy server.
 *
 * The previous CLI wiring listened to SIGINT only, which is the signal a
 * human presses Ctrl+C to send. Container orchestrators (k8s, systemd,
 * Docker stop) send SIGTERM. This helper handles both, is idempotent
 * (a second signal force-exits so the operator can still kill a hung
 * process), and includes a watchdog that force-exits if `server.close()`
 * hangs (e.g. a long-lived SSE connection that never finishes).
 *
 * Returns a cleanup function that removes the installed listeners, which
 * is what unit tests use to avoid leaking handlers between cases.
 */
import type { FastifyInstance } from 'fastify';
import { readiness } from './readiness.js';

export interface GracefulShutdownOptions {
  /** Signals to handle. Default: SIGINT and SIGTERM. */
  signals?: readonly NodeJS.Signals[];
  /** Log sink. Default: process.stderr. The proxy uses Fastify's own logger
   *  for request logs; this sink is for the one-line shutdown trace only. */
  logger?: (message: string) => void;
  /** Force-exit timeout (ms). Default: 10 000. */
  forceTimeoutMs?: number;
  /** Exit hooks used by tests; default: process.exit(code). */
  onExit?: (code: number) => void;
}

export type ShutdownCleanup = () => void;

export function installGracefulShutdown(
  server: FastifyInstance,
  opts: GracefulShutdownOptions = {},
): ShutdownCleanup {
  const signals = opts.signals ?? (['SIGINT', 'SIGTERM'] as const);
  const log =
    opts.logger ??
    ((msg: string) => {
      // stderr — never stdout, since we proxy plain HTTP bodies through
      // the parent process in some deployments.
      process.stderr.write(`${msg}\n`);
    });
  const onExit = opts.onExit ?? ((code) => process.exit(code));
  const forceTimeoutMs = opts.forceTimeoutMs ?? 10_000;

  let shuttingDown = false;

  const shutdown = (sig: NodeJS.Signals): void => {
    if (shuttingDown) {
      log(`Received ${sig} during shutdown, forcing exit.`);
      onExit(1);
      return;
    }
    shuttingDown = true;
    log(`Received ${sig}, shutting down gracefully...`);
    // Flip the readiness flag immediately so /readyz starts returning
    // 503 right now. The LB will drain us before server.close() finishes.
    readiness.markShuttingDown();

    const watchdog = setTimeout(() => {
      log(`Shutdown timed out after ${forceTimeoutMs}ms, forcing exit.`);
      onExit(1);
    }, forceTimeoutMs);
    watchdog.unref();

    void server
      .close()
      .then(() => {
        clearTimeout(watchdog);
        log('Server closed cleanly.');
        onExit(0);
      })
      .catch((e: unknown) => {
        clearTimeout(watchdog);
        const msg = e instanceof Error ? e.message : String(e);
        log(`Error during shutdown: ${msg}`);
        onExit(1);
      });
  };

  for (const sig of signals) {
    process.on(sig, () => shutdown(sig));
  }

  return () => {
    for (const sig of signals) {
      process.removeAllListeners(sig);
    }
  };
}
