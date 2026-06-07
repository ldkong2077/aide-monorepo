/**
 * Tests for the readiness flag singleton.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readiness } from "./readiness.js";

describe("readiness", () => {
  beforeEach(() => {
    readiness.__resetForTests();
  });

  it("starts in not-ready state", () => {
    expect(readiness.isReady()).toBe(false);
    expect(readiness.hasStarted()).toBe(false);
    expect(readiness.isShuttingDown()).toBe(false);
  });

  it("hasStarted() becomes true after markStarted()", () => {
    readiness.markStarted();
    expect(readiness.hasStarted()).toBe(true);
    expect(readiness.isReady()).toBe(true);
  });

  it("isShuttingDown() becomes true after markShuttingDown()", () => {
    readiness.markShuttingDown();
    expect(readiness.isShuttingDown()).toBe(true);
    expect(readiness.isReady()).toBe(false);
  });

  it("isReady() requires both started and !shuttingDown", () => {
    readiness.markStarted();
    readiness.markShuttingDown();
    expect(readiness.isReady()).toBe(false);
    readiness.__resetForTests();
    readiness.markShuttingDown();
    expect(readiness.isReady()).toBe(false);
  });

  it("__resetForTests() returns to the initial state", () => {
    readiness.markStarted();
    readiness.markShuttingDown();
    readiness.__resetForTests();
    expect(readiness.isReady()).toBe(false);
    expect(readiness.hasStarted()).toBe(false);
    expect(readiness.isShuttingDown()).toBe(false);
  });
});
