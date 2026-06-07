/**
 * Unit tests for the field-qualified search query parser.
 *
 * Covers parseQuery (tokenisation, field extraction, fallback to plain
 * text on unknown fields/invalid values) and boundedEditDistance
 * (exact match, insertion, deletion, substitution, early exit).
 */
import { describe, it, expect } from "vitest";
import { parseQuery, boundedEditDistance } from "./query-parser.js";

// =============================================================================
// parseQuery
// =============================================================================

describe("parseQuery", () => {
  it("returns free-text only when no fields are specified", () => {
    const result = parseQuery("authenticate");
    expect(result.text).toBe("authenticate");
    expect(result.kinds).toEqual([]);
    expect(result.languages).toEqual([]);
    expect(result.pathFilters).toEqual([]);
    expect(result.nameFilters).toEqual([]);
  });

  it("extracts a kind: filter", () => {
    const result = parseQuery("kind:function authenticate");
    expect(result.kinds).toEqual(["function"]);
    expect(result.text).toBe("authenticate");
  });

  it("extracts a lang: filter", () => {
    const result = parseQuery("lang:typescript authenticate");
    expect(result.languages).toEqual(["typescript"]);
    expect(result.text).toBe("authenticate");
  });

  it("accepts language: as alias for lang:", () => {
    const result = parseQuery("language:python hello");
    expect(result.languages).toEqual(["python"]);
    expect(result.text).toBe("hello");
  });

  it("extracts a path: filter", () => {
    const result = parseQuery("path:src/api authenticate");
    expect(result.pathFilters).toEqual(["src/api"]);
    expect(result.text).toBe("authenticate");
  });

  it("extracts a name: filter", () => {
    const result = parseQuery("name:authHandler authenticate");
    expect(result.nameFilters).toEqual(["authHandler"]);
    expect(result.text).toBe("authenticate");
  });

  it("combines multiple field filters", () => {
    const result = parseQuery(
      "kind:method lang:typescript path:src/api getUsers",
    );
    expect(result.kinds).toEqual(["method"]);
    expect(result.languages).toEqual(["typescript"]);
    expect(result.pathFilters).toEqual(["src/api"]);
    expect(result.text).toBe("getUsers");
  });

  it("handles quoted path value with spaces", () => {
    const result = parseQuery('path:"src/some dir/file.ts" authenticate');
    expect(result.pathFilters).toEqual(["src/some dir/file.ts"]);
    expect(result.text).toBe("authenticate");
  });

  it("passes through unknown field prefixes as plain text", () => {
    const result = parseQuery("unknown:value authenticate");
    expect(result.text).toBe("unknown:value authenticate");
    expect(result.kinds).toEqual([]);
  });

  it("passes through invalid kind values as plain text", () => {
    const result = parseQuery("kind:invalidKind authenticate");
    expect(result.text).toBe("kind:invalidKind authenticate");
    expect(result.kinds).toEqual([]);
  });

  it("passes through unknown language values as plain text", () => {
    const result = parseQuery("lang:brainfuck authenticate");
    expect(result.text).toBe("lang:brainfuck authenticate");
    expect(result.languages).toEqual([]);
  });

  it("passes through colon-only prefix as plain text", () => {
    const result = parseQuery(":value authenticate");
    expect(result.text).toBe(":value authenticate");
  });

  it("handles empty query", () => {
    const result = parseQuery("");
    expect(result.text).toBe("");
    expect(result.kinds).toEqual([]);
    expect(result.pathFilters).toEqual([]);
  });

  it("handles whitespace-only query", () => {
    const result = parseQuery("   ");
    expect(result.text).toBe("");
  });

  it("handles unterminated quote gracefully", () => {
    const result = parseQuery('kind:function path:"unterminated');
    expect(result.text).toBe("");
    expect(result.kinds).toEqual(["function"]);
    // unterminated quote: unquote() only strips if both start AND end with "
    // so the leading " is preserved in the value
    expect(result.pathFilters).toEqual(['"unterminated']);
  });

  it("does not crash on special characters", () => {
    const result = parseQuery("kind:method name:$$$");
    expect(result.kinds).toEqual(["method"]);
    expect(result.nameFilters).toEqual(["$$$"]);
    expect(result.text).toBe("");
  });
});

// =============================================================================
// boundedEditDistance
// =============================================================================

describe("boundedEditDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(boundedEditDistance("hello", "hello", 3)).toBe(0);
  });

  it("returns 1 for single substitution", () => {
    expect(boundedEditDistance("cat", "car", 2)).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    expect(boundedEditDistance("cat", "cats", 2)).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    expect(boundedEditDistance("cats", "cat", 2)).toBe(1);
  });

  it("returns maxDist+1 when distance exceeds threshold", () => {
    expect(boundedEditDistance("abcdef", "xyz", 2)).toBe(3);
  });

  it("handles empty first string", () => {
    expect(boundedEditDistance("", "hello", 5)).toBe(5);
  });

  it("handles empty second string", () => {
    expect(boundedEditDistance("hello", "", 5)).toBe(5);
  });

  it("handles both empty strings", () => {
    expect(boundedEditDistance("", "", 0)).toBe(0);
  });

  it("early-exits when length difference exceeds maxDist", () => {
    expect(boundedEditDistance("a", "zzzz", 1)).toBe(2);
  });
});
