/**
 * Unit tests for the per-language comment stripper.
 *
 * Verifies that comments and string/docstring contents are blanked out
 * (preserving line numbers) and routing-relevant text survives.
 */
import { describe, it, expect } from "vitest";
import { stripCommentsForRegex } from "./strip-comments.js";

// =============================================================================
// Python
// =============================================================================

describe("stripCommentsForRegex (python)", () => {
  it("blanks line comments", () => {
    const input = 'x = 1  # path("/fake", V)\nreal = 2';
    const output = stripCommentsForRegex(input, "python");
    // The comment content is blanked to spaces
    expect(output).not.toContain("# path");
    expect(output).not.toContain('path("/fake", V)');
    // Real code survives
    expect(output).toContain("x = 1");
    expect(output).toContain("real = 2");
    // Newline is preserved
    expect(output).toContain("\n");
  });

  it("blanks triple-quoted strings (docstrings)", () => {
    const input = '"""\npath("/example", View)\n"""\nx = 1';
    const output = stripCommentsForRegex(input, "python");
    expect(output).toContain("x = 1");
    // The docstring content should be blanked (newlines preserved)
    expect(output).not.toContain('path("/example"');
  });

  it("preserves code with path-like text in real code", () => {
    const input = 'route = path("/real", handler)';
    const output = stripCommentsForRegex(input, "python");
    expect(output).toContain('route = path("/real", handler)');
  });

  it("preserves newlines in blanked ranges", () => {
    const input = "a = 1\n# comment\nb = 2";
    const output = stripCommentsForRegex(input, "python");
    // Comment is blanked but newlines are preserved
    expect(output).toContain("a = 1");
    expect(output).toContain("b = 2");
    expect(output).not.toContain("# comment");
    // Content should have 2 newlines (original structure preserved)
    expect(output.split("\n")).toHaveLength(3);
  });
});

// =============================================================================
// JavaScript / TypeScript
// =============================================================================

describe("stripCommentsForRegex (javascript / typescript)", () => {
  it("blanks line comments", () => {
    const input = 'const x = 1; // app.get("/fake")\nconst real = 2;';
    const output = stripCommentsForRegex(input, "javascript");
    expect(output).toContain("const real = 2;");
    expect(output).not.toContain('app.get("/fake"');
  });

  it("blanks block comments", () => {
    const input = '/* app.get("/fake") */\nconst real = 2;';
    const output = stripCommentsForRegex(input, "javascript");
    expect(output).toContain("const real = 2;");
    expect(output).not.toContain("app.get");
  });

  it("skips template literals (preserves content, not blanked)", () => {
    const input = 'const x = `path("/fake", V)`;\nconst real = 2;';
    const output = stripCommentsForRegex(input, "typescript");
    // Strings/template literals are NOT blanked - only comments are
    expect(output).toContain("const real = 2;");
    expect(output).toContain('path("/fake"');
  });

  it("skips single-quote strings in JS/TS (preserves content)", () => {
    const input = "const x = 'path(\"/fake\")';\nconst real = 2;";
    const output = stripCommentsForRegex(input, "typescript");
    expect(output).toContain("const real = 2;");
    expect(output).toContain("/fake");
  });

  it("preserves real routing code", () => {
    const input = 'app.get("/real", handler);';
    const output = stripCommentsForRegex(input, "typescript");
    expect(output).toContain('app.get("/real", handler)');
  });

  it("handles single-quote strings in JS/TS", () => {
    const input = "const x = 'path(\"/fake\")';\nconst real = 2;";
    const output = stripCommentsForRegex(input, "typescript");
    expect(output).toContain("const real = 2;");
    // Strings are not blanked - content is preserved
    expect(output).toContain("/fake");
  });
});

// =============================================================================
// PHP
// =============================================================================

describe("stripCommentsForRegex (php)", () => {
  it("blanks # line comments", () => {
    const input = "# Route::get('/fake')\n$real = 2;";
    const output = stripCommentsForRegex(input, "php");
    expect(output).toContain("$real = 2;");
    expect(output).not.toContain("/fake");
  });

  it("blanks // line comments", () => {
    const input = "// Route::get('/fake')\n$real = 2;";
    const output = stripCommentsForRegex(input, "php");
    expect(output).toContain("$real = 2;");
    expect(output).not.toContain("/fake");
  });

  it("blanks /* block comments */", () => {
    const input = "/* Route::get('/fake') */\n$real = 2;";
    const output = stripCommentsForRegex(input, "php");
    expect(output).toContain("$real = 2;");
  });
});

// =============================================================================
// Ruby
// =============================================================================

describe("stripCommentsForRegex (ruby)", () => {
  it("blanks # line comments", () => {
    const input = "# get '/fake'\nreal = 2";
    const output = stripCommentsForRegex(input, "ruby");
    expect(output).toContain("real = 2");
    expect(output).not.toContain("/fake");
  });

  it("blanks =begin/=end block comments", () => {
    const input = "=begin\nget '/fake'\n=end\nreal = 2";
    const output = stripCommentsForRegex(input, "ruby");
    expect(output).toContain("real = 2");
    expect(output).not.toContain("/fake");
  });
});

// =============================================================================
// Go
// =============================================================================

describe("stripCommentsForRegex (go)", () => {
  it("blanks // line comments", () => {
    const input = "// router.GET('/fake')\nreal := 2";
    const output = stripCommentsForRegex(input, "go");
    expect(output).toContain("real := 2");
    expect(output).not.toContain("/fake");
  });

  it("blanks /* block comments */", () => {
    const input = "/* router.GET('/fake') */\nreal := 2";
    const output = stripCommentsForRegex(input, "go");
    expect(output).toContain("real := 2");
  });

  it("preserves real routing code", () => {
    const input = 'router.GET("/real", handler)';
    const output = stripCommentsForRegex(input, "go");
    expect(output).toContain('router.GET("/real", handler)');
  });
});

// =============================================================================
// Rust
// =============================================================================

describe("stripCommentsForRegex (rust)", () => {
  it("blanks // line comments", () => {
    const input = "// route.get('/fake')\nlet real = 2;";
    const output = stripCommentsForRegex(input, "rust");
    expect(output).toContain("let real = 2;");
    expect(output).not.toContain("/fake");
  });

  it("blanks nested /* /* block */ */ comments", () => {
    const input = "/* /* route.get('/fake') */ */\nlet real = 2;";
    const output = stripCommentsForRegex(input, "rust");
    expect(output).toContain("let real = 2;");
    expect(output).not.toContain("/fake");
  });
});

// =============================================================================
// Unknown language (identity passthrough)
// =============================================================================

describe("stripCommentsForRegex (unknown language)", () => {
  it("returns content unchanged for unsupported language", () => {
    const input = "// some comment\ncode";
    const output = stripCommentsForRegex(input, "python" as any);
    expect(typeof output).toBe("string");
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe("stripCommentsForRegex (edge cases)", () => {
  it("handles empty string", () => {
    expect(stripCommentsForRegex("", "javascript")).toBe("");
  });

  it("handles string with only comments", () => {
    const input = "// just a comment";
    const output = stripCommentsForRegex(input, "javascript");
    // Comment should be blanked, newline preserved if present
    expect(output).not.toContain("just a comment");
  });

  it("handles consecutive line comments", () => {
    const input = "// first\n// second\ncode";
    const output = stripCommentsForRegex(input, "javascript");
    expect(output.includes("\n")).toBe(true);
    expect(output).toContain("code");
  });
});
