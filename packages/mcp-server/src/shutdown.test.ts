/**
 * Tests for installShutdownHandlers. Every test cleans up its own
 * listeners via the returned function to avoid cross-test pollution.
 */
import { describe, it, expect, vi } from "vitest";
import { installShutdownHandlers } from "./shutdown.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/** Build a minimal stand-in for the MCP SDK Server. */
function makeFakeServer(): Server & { close: ReturnType<typeof vi.fn> } {
  return {
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Server & { close: ReturnType<typeof vi.fn> };
}

describe("installShutdownHandlers", () => {
  it("registers one listener per default signal", () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const server = makeFakeServer();
    const cleanup = installShutdownHandlers(server);
    try {
      expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore + 1);
    } finally {
      cleanup();
    }
  });

  it("only registers signals that were requested", () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const server = makeFakeServer();
    const cleanup = installShutdownHandlers(server, { signals: ["SIGINT"] });
    try {
      expect(process.listenerCount("SIGINT")).toBe(sigintBefore + 1);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
    } finally {
      cleanup();
    }
  });

  it("cleanup function removes every installed listener", () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");
    const server = makeFakeServer();
    const cleanup = installShutdownHandlers(server);
    cleanup();
    expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });

  it("calls server.close(), logs, and exits on signal", async () => {
    const server = makeFakeServer();
    const log = vi.fn();
    const onExit = vi.fn();
    const cleanup = installShutdownHandlers(server, { logger: log, onExit });
    try {
      // Capture the listener we just installed and invoke it directly,
      // so we don't fire other SIGTERM listeners in the test process.
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM");
      // Wait for server.close() promise to settle.
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(server.close).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("SIGTERM"));
      expect(onExit).toHaveBeenCalledOnce();
    } finally {
      cleanup();
    }
  });

  it("is idempotent: a second signal is a no-op", async () => {
    const server = makeFakeServer();
    const onExit = vi.fn();
    const cleanup = installShutdownHandlers(server, {
      logger: () => {},
      onExit,
    });
    try {
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM");
      handler("SIGTERM"); // second call must not double-fire
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(server.close).toHaveBeenCalledOnce();
      expect(onExit).toHaveBeenCalledOnce();
    } finally {
      cleanup();
    }
  });

  it("forges a force-exit when close() hangs", async () => {
    vi.useFakeTimers();
    try {
      // close() never resolves — simulate a stuck connection.
      const server = {
        close: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as Server & { close: ReturnType<typeof vi.fn> };
      const log = vi.fn();
      const onExit = vi.fn();
      const cleanup = installShutdownHandlers(server, {
        logger: log,
        onExit,
        forceTimeoutMs: 1000,
      });
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM");

      // Close is in-flight but hasn't resolved.
      expect(onExit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("timed out"));
      expect(onExit).toHaveBeenCalledOnce();
      cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs the close() error and still exits", async () => {
    const server = {
      close: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as Server & { close: ReturnType<typeof vi.fn> };
    const log = vi.fn();
    const onExit = vi.fn();
    const cleanup = installShutdownHandlers(server, { logger: log, onExit });
    try {
      const listeners = process.listeners("SIGTERM");
      const handler = listeners[listeners.length - 1] as (
        sig: NodeJS.Signals,
      ) => void;
      handler("SIGTERM");
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(log).toHaveBeenCalledWith(expect.stringContaining("boom"));
      expect(onExit).toHaveBeenCalledOnce();
    } finally {
      cleanup();
    }
  });
});
