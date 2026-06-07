/**
 * Unit tests for the MCP resource catalogue and readers.
 *
 * The MCP server hosts three resources:
 *   - aide://config        — the effective AIDE config
 *   - aide://graph/stats   — code-graph index statistics
 *   - aide://health        — server uptime + version
 *
 * Tests cover catalogue shape, JSON validity of each resource, and
 * graceful handling of uninitialised state (no project graph).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { RESOURCES, readResource } from "./resources.js";
import type { TextResourceContents } from "@modelcontextprotocol/sdk/types.js";

let originalCwd: string;
let projectRoot: string;
let canonicalProjectRoot: string;

beforeEach(() => {
  originalCwd = process.cwd();
  projectRoot = mkdtempSync(join(tmpdir(), "aide-mcp-resources-"));
  canonicalProjectRoot = realpathSync(projectRoot);
  // chdir so the resources read the temp project
  process.chdir(projectRoot);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(projectRoot, { recursive: true, force: true });
});

/** Narrow a resource content entry to the text variant. The MCP SDK
 *  represents content as a discriminated union (text vs blob), and
 *  every resource we expose is text-only — so this guard is sound. */
function asText(content: {
  uri: string;
  mimeType?: string;
}): TextResourceContents {
  if (!("text" in content)) {
    throw new Error(`Expected text content for ${content.uri}, got blob`);
  }
  return content as TextResourceContents;
}

describe("RESOURCES catalogue", () => {
  it("exposes exactly three resources", () => {
    expect(RESOURCES).toHaveLength(3);
  });

  it("every resource has a unique URI and a non-empty name", () => {
    const uris = RESOURCES.map((r) => r.uri);
    expect(new Set(uris).size).toBe(uris.length);
    for (const r of RESOURCES) {
      expect(r.name).toBeTruthy();
      expect(r.description).toBeTruthy();
    }
  });

  it("every URI uses the aide:// scheme", () => {
    for (const r of RESOURCES) {
      expect(r.uri.startsWith("aide://")).toBe(true);
    }
  });
});

describe("readResource routing", () => {
  it("returns null for an unknown URI", async () => {
    expect(await readResource("aide://does-not-exist")).toBeNull();
  });

  it("returns null for a URI with a foreign scheme", async () => {
    expect(await readResource("file:///etc/passwd")).toBeNull();
  });
});

describe("aide://health", () => {
  it("returns a JSON document with status/version/uptime", async () => {
    const result = await readResource("aide://health");
    expect(result).not.toBeNull();
    expect(result!.contents).toHaveLength(1);
    const content = asText(result!.contents[0]);
    expect(content.uri).toBe("aide://health");
    expect(content.mimeType).toBe("application/json");

    const body = JSON.parse(content.text) as {
      status: string;
      version: string;
      uptimeMs: number;
      pid: number;
      node: string;
    };
    expect(body.status).toBe("ok");
    expect(body.version).toBeTruthy();
    expect(typeof body.uptimeMs).toBe("number");
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(body.pid).toBe(process.pid);
    expect(body.node).toMatch(/^v\d+\./);
  });
});

describe("aide://config", () => {
  it("returns the built-in default when no config file exists", async () => {
    const result = await readResource("aide://config");
    expect(result).not.toBeNull();
    const content = asText(result!.contents[0]);
    expect(content.uri).toBe("aide://config");
    // Either the header mentions the path (if a global config exists)
    // or the "using built-in defaults" fallback.
    expect(
      content.text.includes("built-in defaults") ||
        content.text.includes("Resolved from:"),
    ).toBe(true);
    // The text must be parseable JSON after the header comment.
    const body = content.text.split("\n").slice(1).join("\n");
    expect(() => JSON.parse(body)).not.toThrow();
  });
});

describe("aide://graph/stats", () => {
  it("reports initialized=false when no .codegraph directory exists", async () => {
    const result = await readResource("aide://graph/stats");
    expect(result).not.toBeNull();
    const body = JSON.parse(asText(result!.contents[0]).text) as {
      initialized: boolean;
      projectRoot: string;
      message?: string;
    };
    expect(body.initialized).toBe(false);
    expect(body.projectRoot).toBe(canonicalProjectRoot);
    expect(body.message).toBeTruthy();
  });

  it("reports initialized=false when .codegraph exists but codegraph.db is missing", async () => {
    mkdirSync(join(projectRoot, ".codegraph"));
    const result = await readResource("aide://graph/stats");
    const body = JSON.parse(asText(result!.contents[0]).text) as {
      initialized: boolean;
    };
    expect(body.initialized).toBe(false);
  });

  it("reports initialized=true with file count + size when fully initialised", async () => {
    const codegraphDir = join(projectRoot, ".codegraph");
    mkdirSync(codegraphDir);
    writeFileSync(join(codegraphDir, "codegraph.db"), "");
    writeFileSync(join(codegraphDir, "extra.bin"), "x".repeat(100));
    mkdirSync(join(codegraphDir, "cache"));
    writeFileSync(join(codegraphDir, "cache", "a.log"), "log");

    const result = await readResource("aide://graph/stats");
    const body = JSON.parse(asText(result!.contents[0]).text) as {
      initialized: boolean;
      projectRoot: string;
      codegraphDir: string;
      fileCount: number;
      onDiskBytes: number;
    };
    expect(body.initialized).toBe(true);
    expect(body.projectRoot).toBe(canonicalProjectRoot);
    // Path separators on Windows: JSON keeps whatever Node returns.
    expect(body.codegraphDir).toBe(
      join(canonicalProjectRoot, ".codegraph").split(sep).join(sep),
    );
    expect(body.fileCount).toBeGreaterThanOrEqual(2); // .gitignore + extra.bin + cache/a.log
    expect(body.onDiskBytes).toBeGreaterThanOrEqual(100); // at least the extra.bin size
  });
});
