/**
 * Tests for installGracefulShutdown. Every test cleans up its own
 * listeners via the returned function to avoid cross-test pollution.
 */
import { describe, it, expect, vi } from "vitest";
import { installGracefulShutdown } from "./shutdown.js";
import type { FastifyInstance } from "fastify";

function makeFakeServer(closeImpl: () => Promise<void>): FastifyInstance {
  return {
    close: vi.fn(closeImpl),
  } as unknown as FastifyInstance;
}

describe("installGracefulShutdown", () => {
  it("registers SIGINT and SIGTERM by default", () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const server = makeFakeServer(async () => {});
    const cleanup = installGracefulShutdown(server);
    try {
      expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore + 1);
    } finally {
      cleanup();
    }
  });

  it("cleanup removes every installed listener", () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const server = makeFakeServer(async () => {});
    installGracefulShutdown(server)();
    expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });

  it("on signal: close, log, exit(0)", async () => {
    const server = makeFakeServer(async () => {});
    const log = vi.fn();
    const onExit = vi.fn();
    const cleanup = installGracefulShutdown(server, { logger: log, onExit });
    try {
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM");
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(server.close).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("SIGTERM"));
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("closed cleanly"),
      );
      expect(onExit).toHaveBeenCalledWith(0);
    } finally {
      cleanup();
    }
  });

  it("second signal during shutdown force-exits with code 1", async () => {
    // Hang close() forever so the first signal stays in "shutting down".
    const server = makeFakeServer(() => new Promise(() => {}));
    const log = vi.fn();
    const onExit = vi.fn();
    const cleanup = installGracefulShutdown(server, {
      logger: log,
      onExit,
      forceTimeoutMs: 60_000, // long, so watchdog doesn't fire first
    });
    try {
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM"); // first → start shutdown
      handler("SIGTERM"); // second → force-exit(1)
      expect(onExit).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("forcing exit"));
    } finally {
      cleanup();
    }
  });

  it("force-exits when close() hangs longer than forceTimeoutMs", async () => {
    vi.useFakeTimers();
    try {
      const server = makeFakeServer(() => new Promise(() => {}));
      const log = vi.fn();
      const onExit = vi.fn();
      const cleanup = installGracefulShutdown(server, {
        logger: log,
        onExit,
        forceTimeoutMs: 1000,
      });
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM");
      expect(onExit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("timed out"));
      expect(onExit).toHaveBeenCalledWith(1);
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits with code 1 if close() rejects, but logs the error", async () => {
    const server = makeFakeServer(async () => {
      throw new Error("boom");
    });
    const log = vi.fn();
    const onExit = vi.fn();
    const cleanup = installGracefulShutdown(server, { logger: log, onExit });
    try {
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM");
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(log).toHaveBeenCalledWith(expect.stringContaining("boom"));
      expect(onExit).toHaveBeenCalledWith(1);
    } finally {
      cleanup();
    }
  });

  it("only listens to the signals it was given", () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const server = makeFakeServer(async () => {});
    const cleanup = installGracefulShutdown(server, { signals: ["SIGINT"] });
    try {
      expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
    } finally {
      cleanup();
    }
  });
});
