/**
 * @aide/mcp-server — Graceful shutdown helper.
 *
 * Installs OS-signal handlers that call `server.close()` and exit cleanly.
 * The MCP transport runs over stdio, so we intentionally use `console.error`
 * (stderr) for the log sink — anything written to stdout would corrupt the
 * protocol. Tests can inject a custom `logger` and `onExit` to avoid
 * touching the real process exit / signal listeners.
 *
 * Behaviour:
 *  - Idempotent: a second signal during shutdown is a no-op.
 *  - Bounded: a `forceTimeoutMs` watchdog ensures we exit even if
 *    `server.close()` hangs (e.g. a stuck stdio connection).
 *  - Reentrant: the returned cleanup function removes every listener
 *    that was added, so tests don't leak handlers between cases.
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export interface ShutdownOptions {
  /** Signals to handle. Default: SIGINT and SIGTERM. */
  signals?: readonly NodeJS.Signals[];
  /** Stderr-style log sink. Default: console.error. */
  logger?: (message: string) => void;
  /** Final exit hook. Default: process.exit(0). */
  onExit?: () => void;
  /** Hard timeout (ms) before forcing exit. Default: 5000. */
  forceTimeoutMs?: number;
}

export type ShutdownCleanup = () => void;

export function installShutdownHandlers(
  server: Server,
  opts: ShutdownOptions = {},
): ShutdownCleanup {
  const signals = opts.signals ?? (['SIGINT', 'SIGTERM'] as const);
  const logger =
    opts.logger ??
    ((msg: string) => {
      // The MCP transport owns stdout. Never write there.
      console.error(msg);
    });
  const onExit = opts.onExit ?? (() => process.exit(0));
  const forceTimeoutMs = opts.forceTimeoutMs ?? 5000;

  let shuttingDown = false;

  const shutdown = (sig: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger(`AIDE MCP server received ${sig}, shutting down...`);

    // Watchdog: if server.close() hangs we still exit.
    const watchdog = setTimeout(() => {
      logger(`Shutdown timed out after ${forceTimeoutMs}ms, forcing exit`);
      onExit();
    }, forceTimeoutMs);
    watchdog.unref();

    void server
      .close()
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        logger(`Error during shutdown: ${msg}`);
      })
      .finally(() => {
        clearTimeout(watchdog);
        onExit();
      });
  };

  for (const sig of signals) {
    process.on(sig, shutdown);
  }

  return () => {
    for (const sig of signals) {
      process.removeListener(sig, shutdown);
    }
  };
}
