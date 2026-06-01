/**
 * AIDE Core - Unified Logger
 * Wraps pino for structured logging across all packages.
 */

import pino from 'pino';

/** Log levels */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

/** Logger options */
export interface LoggerOptions {
  /** Log level (default: 'info') */
  level?: LogLevel;
  /** Module name for log prefix */
  module?: string;
  /** Output to file path (optional) */
  file?: string;
  /** Pretty print for development (default: auto-detect) */
  pretty?: boolean;
}

/** Logger interface used across all packages */
export interface Logger {
  fatal(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  trace(msg: string, data?: Record<string, unknown>): void;
  child(opts: { module?: string }): Logger;
}

/** Global log level - can be changed at runtime */
let globalLevel: LogLevel = 'info';

/** Detect if running in development mode */
function isDev(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AIDE_DEV !== '0';
}

/**
 * Create a logger instance
 */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level || globalLevel;
  const pretty = opts.pretty ?? isDev();

  const transports: pino.TransportTargetOptions[] = [];

  if (pretty) {
    transports.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
        ...(opts.module ? { messageKey: 'msg' } : {}),
      },
    });
  }

  if (opts.file) {
    transports.push({
      target: 'pino/file',
      options: { destination: opts.file },
    });
  }

  const pinoOpts: pino.LoggerOptions = {
    level,
    ...(transports.length > 0
      ? { transport: { targets: transports } }
      : pretty
        ? {}
        : {}),
  };

  const base = pino(pinoOpts);
  const child = opts.module ? base.child({ module: opts.module }) : base;

  return wrapPino(child);
}

/** Wrap a pino logger instance into our Logger interface */
function wrapPino(p: pino.Logger): Logger {
  return {
    fatal: (msg, data) => p.fatal(data || {}, msg),
    error: (msg, data) => p.error(data || {}, msg),
    warn: (msg, data) => p.warn(data || {}, msg),
    info: (msg, data) => p.info(data || {}, msg),
    debug: (msg, data) => p.debug(data || {}, msg),
    trace: (msg, data) => p.trace(data || {}, msg),
    child: (opts) => wrapPino(p.child(opts)),
  };
}

/**
 * Set global log level
 */
export function setGlobalLevel(level: LogLevel): void {
  globalLevel = level;
}

/**
 * Get global log level
 */
export function getGlobalLevel(): LogLevel {
  return globalLevel;
}

/** Default logger instance (lazy-initialized) */
let defaultLoggerInstance: Logger | null = null;

export function getDefaultLogger(): Logger {
  if (!defaultLoggerInstance) {
    defaultLoggerInstance = createLogger({ module: 'aide' });
  }
  return defaultLoggerInstance;
}

/** Silent logger - discards all output (useful for tests) */
export const silentLogger: Logger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => silentLogger,
};
