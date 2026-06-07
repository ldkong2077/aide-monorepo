/**
 * Unit tests for path-alias resolution.
 *
 * Exercises the JSONC-tolerant tsconfig parser and the wildcard-aware
 * apply-aliases rewrite. These run in-memory against a temp tsconfig —
 * no need to spin up the full graph pipeline.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectAliases, applyAliases } from "./path-aliases.js";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "aide-path-aliases-"));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function writeTsconfig(content: string, filename = "tsconfig.json"): void {
  writeFileSync(join(projectRoot, filename), content, "utf-8");
}

describe("loadProjectAliases", () => {
  it("returns null when no tsconfig or jsconfig is present", () => {
    expect(loadProjectAliases(projectRoot)).toBeNull();
  });

  it("returns null for a tsconfig with no paths entry", () => {
    writeTsconfig(JSON.stringify({ compilerOptions: { strict: true } }));
    expect(loadProjectAliases(projectRoot)).toBeNull();
  });

  it("returns null for a tsconfig with empty paths object", () => {
    writeTsconfig(JSON.stringify({ compilerOptions: { paths: {} } }));
    expect(loadProjectAliases(projectRoot)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    writeTsconfig("{ this is not json");
    expect(loadProjectAliases(projectRoot)).toBeNull();
  });

  it("loads a single non-wildcard alias", () => {
    writeTsconfig(
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "~config": ["./src/config.ts"] },
        },
      }),
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases).not.toBeNull();
    expect(aliases!.patterns).toHaveLength(1);
    expect(aliases!.patterns[0]).toMatchObject({
      prefix: "~config",
      suffix: "",
      hasWildcard: false,
      replacements: ["./src/config.ts"],
    });
  });

  it("loads wildcard alias and records prefix/suffix", () => {
    writeTsconfig(
      JSON.stringify({
        compilerOptions: {
          baseUrl: "./src",
          paths: { "@/*": ["./*"] },
        },
      }),
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases).not.toBeNull();
    expect(aliases!.patterns).toHaveLength(1);
    expect(aliases!.patterns[0]).toMatchObject({
      prefix: "@/",
      suffix: "",
      hasWildcard: true,
    });
  });

  it('splits suffix from wildcard patterns (e.g. "*.css")', () => {
    writeTsconfig(
      JSON.stringify({
        compilerOptions: {
          paths: { "*.css": ["./styles/*"] },
        },
      }),
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases!.patterns[0]).toMatchObject({
      prefix: "",
      suffix: ".css",
      hasWildcard: true,
    });
  });

  it("sorts patterns by specificity: longer prefix first", () => {
    writeTsconfig(
      JSON.stringify({
        compilerOptions: {
          paths: {
            "@/*": ["./src/*"],
            "@components/*": ["./src/components/*"],
          },
        },
      }),
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases!.patterns[0].prefix).toBe("@components/");
    expect(aliases!.patterns[1].prefix).toBe("@/");
  });

  it("sorts literal patterns before wildcard patterns of equal prefix length", () => {
    writeTsconfig(
      JSON.stringify({
        compilerOptions: {
          paths: {
            "@ui/*": ["./wildcard/*"],
            "@ui/Button": ["./literal/Button.ts"],
          },
        },
      }),
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases!.patterns[0].hasWildcard).toBe(false);
    expect(aliases!.patterns[1].hasWildcard).toBe(true);
  });

  it("honors baseUrl when resolving replacements", () => {
    mkdirSync(join(projectRoot, "src"));
    writeTsconfig(
      JSON.stringify({
        compilerOptions: {
          baseUrl: "./src",
          paths: { "~lib/*": ["./lib/*"] },
        },
      }),
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases!.baseUrl).toBe(join(projectRoot, "src"));
  });

  it("defaults baseUrl to project root when omitted", () => {
    writeTsconfig(
      JSON.stringify({ compilerOptions: { paths: { "~x": ["./x"] } } }),
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases!.baseUrl).toBe(projectRoot);
  });

  it("strips JSONC line comments before parsing", () => {
    writeTsconfig(
      `{
        // this is a comment
        "compilerOptions": {
          "baseUrl": ".",
          "paths": { "~x": ["./x"] } // another comment
        }
      }`,
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases).not.toBeNull();
    expect(aliases!.patterns[0].prefix).toBe("~x");
  });

  it("strips JSONC block comments before parsing", () => {
    writeTsconfig(
      `{
        /* block comment */
        "compilerOptions": { "paths": { "~y": ["./y"] } }
      }`,
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases).not.toBeNull();
  });

  it("strips trailing commas before } and ]", () => {
    writeTsconfig(`{ "compilerOptions": { "paths": { "~z": ["./z",] }, } }`);
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases).not.toBeNull();
    expect(aliases!.patterns[0].replacements).toEqual(["./z"]);
  });

  it("preserves // inside string values (URL with scheme)", () => {
    // The `//` inside the URL string must not be treated as the start of a
    // JSONC line comment — otherwise every value that looks like a URL
    // (`https://...`, `file://...`, protocol-relative `//cdn...`) would be
    // silently truncated. The regex-only comment stripper we replaced did
    // exactly this. We assert by writing a URL and checking the function
    // still parses the file (it returns null if the URL got truncated into
    // invalid JSON); the alternative is a path that includes `//` followed
    // by a comment-like fragment.
    writeTsconfig(
      `{
        "compilerOptions": {
          "baseUrl": "https://example.com/x",
          "paths": { "@/*": ["./*"] }
        }
      }`,
    );
    const aliases = loadProjectAliases(projectRoot);
    // loadProjectAliases succeeds (URL wasn't corrupted into bad JSON) and
    // returned a real map. The exact baseUrl value is OS-dependent because
    // path.resolve() is applied to it, so we only assert non-null.
    expect(aliases).not.toBeNull();
    expect(aliases!.patterns).toHaveLength(1);
    expect(aliases!.patterns[0].prefix).toBe("@/");
  });

  it("falls back to jsconfig.json when no tsconfig.json is present", () => {
    writeTsconfig(
      JSON.stringify({ compilerOptions: { paths: { "~j": ["./j"] } } }),
      "jsconfig.json",
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases).not.toBeNull();
    expect(aliases!.patterns[0].prefix).toBe("~j");
  });

  it("prefers tsconfig.json over jsconfig.json when both exist", () => {
    writeTsconfig(
      JSON.stringify({ compilerOptions: { paths: { "~t": ["./t"] } } }),
    );
    writeTsconfig(
      JSON.stringify({ compilerOptions: { paths: { "~j": ["./j"] } } }),
      "jsconfig.json",
    );
    const aliases = loadProjectAliases(projectRoot);
    expect(aliases!.patterns[0].prefix).toBe("~t");
  });

  it("skips pattern entries whose replacement array is not all strings", () => {
    writeTsconfig(
      JSON.stringify({
        compilerOptions: {
          paths: {
            "~ok": ["./a"],
            "~mixed": ["./a", 42, "./b"],
          },
        },
      }),
    );
    const aliases = loadProjectAliases(projectRoot);
    // ~ok is loaded; ~mixed is filtered to just the string entries
    expect(aliases!.patterns.find((p) => p.prefix === "~ok")).toBeDefined();
    const mixed = aliases!.patterns.find((p) => p.prefix === "~mixed");
    expect(mixed).toBeDefined();
    expect(mixed!.replacements).toEqual(["./a", "./b"]);
  });
});

describe("applyAliases", () => {
  it("returns [] when no pattern matches", () => {
    const aliases = {
      baseUrl: projectRoot,
      patterns: [
        { prefix: "@/", suffix: "", hasWildcard: true, replacements: ["./*"] },
      ],
    };
    expect(applyAliases("lodash", aliases, projectRoot)).toEqual([]);
  });

  it("rewrites a wildcard alias to the captured suffix", () => {
    const aliases = {
      baseUrl: projectRoot,
      patterns: [
        {
          prefix: "@/",
          suffix: "",
          hasWildcard: true,
          replacements: ["./src/*"],
        },
      ],
    };
    const out = applyAliases("@/foo/bar", aliases, projectRoot);
    expect(out).toEqual(["src/foo/bar"]);
  });

  it("returns the literal replacement for non-wildcard patterns", () => {
    const aliases = {
      baseUrl: projectRoot,
      patterns: [
        {
          prefix: "~config",
          suffix: "",
          hasWildcard: false,
          replacements: ["./cfg.ts"],
        },
      ],
    };
    const out = applyAliases("~config", aliases, projectRoot);
    expect(out).toEqual(["cfg.ts"]);
  });

  it("returns [] when literal pattern does not match exactly", () => {
    const aliases = {
      baseUrl: projectRoot,
      patterns: [
        {
          prefix: "~config",
          suffix: "",
          hasWildcard: false,
          replacements: ["./cfg.ts"],
        },
      ],
    };
    expect(applyAliases("~config/extra", aliases, projectRoot)).toEqual([]);
  });

  it("returns all replacements in order when a pattern has multiple targets", () => {
    const aliases = {
      baseUrl: projectRoot,
      patterns: [
        {
          prefix: "@/",
          suffix: "",
          hasWildcard: true,
          replacements: ["./src/*", "./legacy/*"],
        },
      ],
    };
    const out = applyAliases("@/foo", aliases, projectRoot);
    expect(out).toEqual(["src/foo", "legacy/foo"]);
  });

  it('matches suffix-bound patterns (e.g. "*.css")', () => {
    // *.css splits to prefix="" suffix=".css" — both ends of the input are
    // matched literally, and the captured wildcard portion is what's between
    // them. For input "main.css" that means captured = "main", so the
    // replacement "./styles/*" becomes "./styles/main" (NOT .css).
    const aliases = {
      baseUrl: projectRoot,
      patterns: [
        {
          prefix: "",
          suffix: ".css",
          hasWildcard: true,
          replacements: ["./styles/*"],
        },
      ],
    };
    expect(applyAliases("main.css", aliases, projectRoot)).toEqual([
      "styles/main",
    ]);
    expect(applyAliases("main.scss", aliases, projectRoot)).toEqual([]);
  });

  it("skips replacements that escape the project root", () => {
    const aliases = {
      baseUrl: projectRoot,
      patterns: [
        {
          prefix: "@/",
          suffix: "",
          hasWildcard: true,
          replacements: ["./safe/*", "../../../etc/*"],
        },
      ],
    };
    const out = applyAliases("@/secret", aliases, projectRoot);
    expect(out).toEqual(["safe/secret"]);
  });
});
