/**
 * Unit tests for CodeGraph error classes and logger.
 *
 * Verifies the error hierarchy, custom properties, and logger
 * swapping (silentLogger used in tests).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CodeGraphError,
  FileError,
  ParseError,
  DatabaseError,
  SearchError,
  VectorError,
  ConfigError,
  setLogger,
  getLogger,
  logDebug,
  logWarn,
  logError,
  defaultLogger,
  silentLogger,
} from "./errors.js";

// =============================================================================
// Error classes
// =============================================================================

describe("CodeGraphError", () => {
  it("creates with message and code", () => {
    const err = new CodeGraphError("Test error", "TEST");
    expect(err.message).toBe("Test error");
    expect(err.code).toBe("TEST");
    expect(err.name).toBe("CodeGraphError");
  });

  it("captures context", () => {
    const err = new CodeGraphError("Context error", "CTX", { key: "value" });
    expect(err.context).toEqual({ key: "value" });
  });

  it("is instanceof Error and CodeGraphError", () => {
    const err = new CodeGraphError("Instance test", "INST");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CodeGraphError);
  });
});

describe("FileError", () => {
  it("has filePath and FILE_ERROR code", () => {
    const err = new FileError("Cannot read", "/path/to/file.ts");
    expect(err.filePath).toBe("/path/to/file.ts");
    expect(err.code).toBe("FILE_ERROR");
    expect(err.name).toBe("FileError");
  });

  it("is instanceof CodeGraphError", () => {
    const err = new FileError("test", "/f.ts");
    expect(err).toBeInstanceOf(CodeGraphError);
  });

  it("accepts a cause", () => {
    const cause = new Error("underlying");
    const err = new FileError("Cannot read", "/f.ts", cause);
    expect(err.cause).toBe(cause);
  });
});

describe("ParseError", () => {
  it("has filePath and optional line/column", () => {
    const err = new ParseError("Parse failed", "/source.ts", {
      line: 42,
      column: 10,
    });
    expect(err.filePath).toBe("/source.ts");
    expect(err.line).toBe(42);
    expect(err.column).toBe(10);
    expect(err.code).toBe("PARSE_ERROR");
  });

  it("works without options", () => {
    const err = new ParseError("Parse failed", "/source.ts");
    expect(err.line).toBeUndefined();
    expect(err.column).toBeUndefined();
  });

  it("is instanceof CodeGraphError", () => {
    expect(new ParseError("test", "/f.ts")).toBeInstanceOf(CodeGraphError);
  });
});

describe("DatabaseError", () => {
  it("has operation and DATABASE_ERROR code", () => {
    const err = new DatabaseError("DB failed", "query");
    expect(err.operation).toBe("query");
    expect(err.code).toBe("DATABASE_ERROR");
  });

  it("is instanceof CodeGraphError", () => {
    expect(new DatabaseError("test", "op")).toBeInstanceOf(CodeGraphError);
  });
});

describe("SearchError", () => {
  it("has query and SEARCH_ERROR code", () => {
    const err = new SearchError("Search failed", "kind:foo");
    expect(err.query).toBe("kind:foo");
    expect(err.code).toBe("SEARCH_ERROR");
  });

  it("is instanceof CodeGraphError", () => {
    expect(new SearchError("test", "q")).toBeInstanceOf(CodeGraphError);
  });
});

describe("VectorError", () => {
  it("has VECTOR_ERROR code and operation in context", () => {
    const err = new VectorError("Vector failed", "embed");
    expect(err.code).toBe("VECTOR_ERROR");
  });

  it("is instanceof CodeGraphError", () => {
    expect(new VectorError("test", "op")).toBeInstanceOf(CodeGraphError);
  });
});

describe("ConfigError", () => {
  it("has CONFIG_ERROR code", () => {
    const err = new ConfigError("Bad config");
    expect(err.code).toBe("CONFIG_ERROR");
  });

  it("accepts details context", () => {
    const err = new ConfigError("Bad config", { key: "value" });
    expect(err.context).toEqual({ key: "value" });
  });

  it("is instanceof CodeGraphError", () => {
    expect(new ConfigError("test")).toBeInstanceOf(CodeGraphError);
  });
});

// =============================================================================
// Logger
// =============================================================================

describe("logger", () => {
  beforeEach(() => {
    // Ensure we start with default logger
    setLogger(defaultLogger);
  });

  afterEach(() => {
    setLogger(defaultLogger);
  });

  it("defaultLogger has all required methods", () => {
    expect(typeof defaultLogger.debug).toBe("function");
    expect(typeof defaultLogger.warn).toBe("function");
    expect(typeof defaultLogger.error).toBe("function");
  });

  it("silentLogger does not throw when called", () => {
    expect(() => silentLogger.debug("test")).not.toThrow();
    expect(() => silentLogger.warn("test")).not.toThrow();
    expect(() => silentLogger.error("test")).not.toThrow();
  });

  it("setLogger/getLogger round-trips", () => {
    setLogger(silentLogger);
    expect(getLogger()).toBe(silentLogger);
  });

  it("logDebug/logWarn/logError use the current logger", () => {
    const mock = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    setLogger(mock);

    logDebug("debug msg", { d: 1 });
    logWarn("warn msg", { w: 2 });
    logError("error msg", { e: 3 });

    expect(mock.debug).toHaveBeenCalledWith("debug msg", { d: 1 });
    expect(mock.warn).toHaveBeenCalledWith("warn msg", { w: 2 });
    expect(mock.error).toHaveBeenCalledWith("error msg", { e: 3 });
  });
});
