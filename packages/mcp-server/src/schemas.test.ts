/**
 * Unit tests for the Zod schemas in `schemas.ts`. These exercise:
 *  - happy paths for every tool
 *  - validation failures (ZodError) for malformed inputs
 *  - normalization behaviors (defaults, transforms, mutual exclusion)
 */
import { describe, it, expect } from "vitest";
import {
  codegraphIndexArgsSchema,
  codegraphQueryArgsSchema,
  guardVerifyArgsSchema,
  guardCheckArgsSchema,
} from "./schemas.js";

describe("codegraphIndexArgsSchema", () => {
  it("accepts an empty object (path is optional)", () => {
    expect(() => codegraphIndexArgsSchema.parse({})).not.toThrow();
  });

  it("accepts a string path", () => {
    const r = codegraphIndexArgsSchema.parse({ path: "/tmp/proj" });
    expect(r.path).toBe("/tmp/proj");
  });

  it("rejects non-string path", () => {
    expect(() => codegraphIndexArgsSchema.parse({ path: 123 })).toThrow();
  });
});

describe("codegraphQueryArgsSchema", () => {
  it("requires a non-empty query", () => {
    expect(() => codegraphQueryArgsSchema.parse({})).toThrow();
    expect(() => codegraphQueryArgsSchema.parse({ query: "" })).toThrow();
  });

  it('defaults kind to "symbol"', () => {
    const r = codegraphQueryArgsSchema.parse({ query: "foo" });
    expect(r.kind).toBe("symbol");
  });

  it("rejects unknown kind", () => {
    expect(() =>
      codegraphQueryArgsSchema.parse({ query: "foo", kind: "bogus" }),
    ).toThrow();
  });

  it("accepts all valid kinds", () => {
    for (const k of ["symbol", "reference", "definition"] as const) {
      const r = codegraphQueryArgsSchema.parse({ query: "foo", kind: k });
      expect(r.kind).toBe(k);
    }
  });
});

describe("guardVerifyArgsSchema", () => {
  it("accepts { file } and normalizes to files: [file]", () => {
    const r = guardVerifyArgsSchema.parse({ file: "a.ts" });
    expect(r.files).toEqual(["a.ts"]);
    expect(r.noTest).toBe(false);
  });

  it("accepts { files: [...] }", () => {
    const r = guardVerifyArgsSchema.parse({ files: ["a.ts", "b.ts"] });
    expect(r.files).toEqual(["a.ts", "b.ts"]);
  });

  it("defaults noTest to false", () => {
    const r = guardVerifyArgsSchema.parse({ file: "a.ts" });
    expect(r.noTest).toBe(false);
  });

  it("honors noTest: true", () => {
    const r = guardVerifyArgsSchema.parse({ file: "a.ts", noTest: true });
    expect(r.noTest).toBe(true);
  });

  it("rejects empty files array", () => {
    expect(() => guardVerifyArgsSchema.parse({ files: [] })).toThrow();
  });

  it("rejects empty file string", () => {
    expect(() => guardVerifyArgsSchema.parse({ file: "" })).toThrow();
  });

  it("rejects providing both file and files (mutual exclusion)", () => {
    expect(() =>
      guardVerifyArgsSchema.parse({ file: "a.ts", files: ["b.ts"] }),
    ).toThrow();
  });

  it("rejects empty object (neither file nor files)", () => {
    expect(() => guardVerifyArgsSchema.parse({})).toThrow();
  });
});

describe("guardCheckArgsSchema", () => {
  it("requires a non-empty file", () => {
    expect(() => guardCheckArgsSchema.parse({})).toThrow();
    expect(() => guardCheckArgsSchema.parse({ file: "" })).toThrow();
  });

  it("accepts a file string", () => {
    const r = guardCheckArgsSchema.parse({ file: "src/index.ts" });
    expect(r.file).toBe("src/index.ts");
  });
});
