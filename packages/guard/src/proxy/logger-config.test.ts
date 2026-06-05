/**
 * Tests for the JSON-vs-pretty logger selection helper.
 *
 * The helper reads the configured format, falls back to
 * `process.env.LOG_FORMAT`, and finally defaults to `'pretty'`
 * (the original behaviour). These tests cover the selection
 * logic without spinning up a real Fastify server.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { resolveLoggerConfig } from './index.js';

describe('resolveLoggerConfig', () => {
  const originalEnv = process.env.LOG_FORMAT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LOG_FORMAT;
    } else {
      process.env.LOG_FORMAT = originalEnv;
    }
  });

  it('returns a pretty config when called with no argument and no env', () => {
    delete process.env.LOG_FORMAT;
    const cfg = resolveLoggerConfig();
    // pretty config has a `transport` field pointing at pino-pretty.
    expect(cfg).toHaveProperty('transport');
    expect((cfg as { transport: { target: string } }).transport.target).toBe('pino-pretty');
  });

  it('returns a JSON config when explicitly asked', () => {
    const cfg = resolveLoggerConfig('json');
    expect(cfg).not.toHaveProperty('transport');
    expect(cfg).toEqual({ level: 'info' });
  });

  it('honours LOG_FORMAT=json environment variable when no argument is given', () => {
    process.env.LOG_FORMAT = 'json';
    const cfg = resolveLoggerConfig();
    expect(cfg).not.toHaveProperty('transport');
  });

  it('the explicit argument takes precedence over the env var', () => {
    process.env.LOG_FORMAT = 'json';
    const cfg = resolveLoggerConfig('pretty');
    expect(cfg).toHaveProperty('transport');
  });

  it('respects LOG_LEVEL when set', () => {
    process.env.LOG_LEVEL = 'debug';
    const cfg = resolveLoggerConfig('json');
    expect(cfg).toEqual({ level: 'debug' });
  });

  it('defaults to info level', () => {
    delete process.env.LOG_FORMAT;
    delete process.env.LOG_LEVEL;
    expect(resolveLoggerConfig('json').level).toBe('info');
  });
});
