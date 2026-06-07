/**
 * Unit tests for the .codegraph/ directory manager.
 *
 * Covers the public surface of `directory.ts` against a real temp
 * directory — this is the module every CodeGraph entry point touches
 * first, so it needs at least a smoke test.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  CODEGRAPH_DIR,
  getCodeGraphDir,
  isInitialized,
  isInitializedAsync,
  findNearestCodeGraphRoot,
  findNearestCodeGraphRootAsync,
  createDirectory,
  createDirectoryAsync,
  removeDirectory,
  removeDirectoryAsync,
  listDirectoryContents,
  listDirectoryContentsAsync,
  getDirectorySize,
  getDirectorySizeAsync,
  ensureSubdirectory,
  ensureSubdirectoryAsync,
  validateDirectory,
  validateDirectoryAsync,
} from "./directory.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aide-graph-dir-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("getCodeGraphDir", () => {
  it("joins .codegraph to the project root (cross-platform)", () => {
    // Use path.join so the assertion holds on both Windows (`\`) and POSIX (`/`).
    expect(getCodeGraphDir("/tmp/foo")).toBe(join("/tmp/foo", ".codegraph"));
    expect(getCodeGraphDir(`a${sep}b`)).toBe(join(`a${sep}b`, ".codegraph"));
  });
});

describe("isInitialized", () => {
  it("returns false when .codegraph does not exist", () => {
    expect(isInitialized(root)).toBe(false);
  });

  it("returns false when .codegraph exists but codegraph.db is missing", () => {
    mkdirSync(getCodeGraphDir(root));
    expect(isInitialized(root)).toBe(false);
  });

  it("returns true when both .codegraph and codegraph.db exist", () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    expect(isInitialized(root)).toBe(true);
  });

  it("returns false when .codegraph is a file, not a directory", () => {
    writeFileSync(getCodeGraphDir(root), "not a directory");
    expect(isInitialized(root)).toBe(false);
  });
});

describe("findNearestCodeGraphRoot", () => {
  it("returns null when no ancestor contains .codegraph/codegraph.db", () => {
    expect(findNearestCodeGraphRoot(root)).toBeNull();
  });

  it("finds a CodeGraph root in the current directory", () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    expect(findNearestCodeGraphRoot(root)).toBe(root);
  });

  it("walks up parent directories to find the nearest root", () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    const child = join(root, "a", "b", "c");
    mkdirSync(child, { recursive: true });
    expect(findNearestCodeGraphRoot(child)).toBe(root);
  });

  it("returns the closest of multiple ancestor roots", () => {
    // root/.codegraph/codegraph.db (grandparent)
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");

    // root/a/.codegraph/codegraph.db (parent, closer)
    const aDir = join(root, "a");
    mkdirSync(aDir, { recursive: true }); // <-- a/ must exist before we can nest .codegraph in it
    mkdirSync(getCodeGraphDir(aDir));
    writeFileSync(join(getCodeGraphDir(aDir), "codegraph.db"), "");

    const child = join(aDir, "b", "c");
    mkdirSync(child, { recursive: true });
    expect(findNearestCodeGraphRoot(child)).toBe(aDir);
  });
});

describe("createDirectory", () => {
  it("creates the .codegraph directory and a .gitignore", () => {
    createDirectory(root);
    expect(existsSync(getCodeGraphDir(root))).toBe(true);
    expect(existsSync(join(getCodeGraphDir(root), ".gitignore"))).toBe(true);
  });

  it("refuses to reinitialize when codegraph.db already exists", () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    expect(() => createDirectory(root)).toThrow(/already initialized/);
  });

  it("does not throw when only the .codegraph folder exists (no db)", () => {
    mkdirSync(getCodeGraphDir(root));
    expect(() => createDirectory(root)).not.toThrow();
  });

  it("preserves an existing .gitignore (does not overwrite)", () => {
    createDirectory(root);
    const gitignore = join(getCodeGraphDir(root), ".gitignore");
    writeFileSync(gitignore, "CUSTOM\n");
    createDirectory(root);
    expect(readFileSync(gitignore, "utf-8")).toBe("CUSTOM\n");
  });
});

describe("removeDirectory", () => {
  it("is a no-op when .codegraph does not exist", () => {
    expect(() => removeDirectory(root)).not.toThrow();
  });

  it("removes the .codegraph directory and all its contents", () => {
    createDirectory(root);
    writeFileSync(join(getCodeGraphDir(root), "extra.txt"), "x");
    removeDirectory(root);
    expect(existsSync(getCodeGraphDir(root))).toBe(false);
  });

  it("removes the symlink itself, never the target", () => {
    // Create target directory and a symlink at .codegraph → target.
    const target = join(root, "real");
    mkdirSync(target);
    writeFileSync(join(target, "real.db"), "real data");
    const linkPath = getCodeGraphDir(root);
    // On Windows, symlinks need a real-ish target path; on *nix this is fine.
    try {
      symlinkSync(target, linkPath, "dir");
    } catch {
      // Skip on platforms where this can't run as non-elevated user.
      return;
    }
    expect(existsSync(linkPath)).toBe(true);
    removeDirectory(root);
    // The link is gone but the real data must still be there.
    expect(existsSync(linkPath)).toBe(false);
    expect(existsSync(join(target, "real.db"))).toBe(true);
  });
});

describe("listDirectoryContents", () => {
  it("returns [] when the directory does not exist", () => {
    expect(listDirectoryContents(root)).toEqual([]);
  });

  it("returns all files recursively, with forward-slash relative paths", () => {
    createDirectory(root);
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    mkdirSync(join(getCodeGraphDir(root), "cache"));
    writeFileSync(join(getCodeGraphDir(root), "cache", "a.log"), "log");
    writeFileSync(join(getCodeGraphDir(root), "cache", "b.log"), "log");
    const files = listDirectoryContents(root).sort();
    expect(files).toEqual([
      ".gitignore",
      "cache/a.log",
      "cache/b.log",
      "codegraph.db",
    ]);
  });

  it("skips symlinks to prevent escaping the directory", () => {
    createDirectory(root);
    const outside = join(root, "..", "outside.txt");
    try {
      writeFileSync(outside, "x");
      symlinkSync(outside, join(getCodeGraphDir(root), "escape.txt"));
    } catch {
      return; // platform limitation, skip
    }
    const files = listDirectoryContents(root);
    expect(files).not.toContain("escape.txt");
    rmSync(outside, { force: true });
  });
});

describe("getDirectorySize", () => {
  it("returns 0 when the directory does not exist", () => {
    expect(getDirectorySize(root)).toBe(0);
  });

  it("sums the size of every file recursively", () => {
    // Skip createDirectory (it auto-writes a ~173-byte .gitignore) — create
    // the dir by hand and assert against the exact bytes we wrote.
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "a.bin"), "x".repeat(100));
    writeFileSync(join(getCodeGraphDir(root), "b.bin"), "y".repeat(50));
    mkdirSync(join(getCodeGraphDir(root), "sub"));
    writeFileSync(join(getCodeGraphDir(root), "sub", "c.bin"), "z".repeat(25));
    expect(getDirectorySize(root)).toBe(175);

    // Sanity: statSync agrees with what we wrote, so the walker is summing the
    // same files we expect (defends against silent encoding/locale issues).
    expect(statSync(join(getCodeGraphDir(root), "a.bin")).size).toBe(100);
    expect(statSync(join(getCodeGraphDir(root), "b.bin")).size).toBe(50);
    expect(statSync(join(getCodeGraphDir(root), "sub", "c.bin")).size).toBe(25);
  });
});

describe("ensureSubdirectory", () => {
  it("creates and returns the requested subdirectory", () => {
    const sub = ensureSubdirectory(root, "cache");
    expect(existsSync(sub)).toBe(true);
    expect(sub).toBe(join(getCodeGraphDir(root), "cache"));
  });

  it("is idempotent when the subdirectory already exists", () => {
    ensureSubdirectory(root, "cache");
    expect(() => ensureSubdirectory(root, "cache")).not.toThrow();
  });

  it('rejects names containing ".."', () => {
    expect(() => ensureSubdirectory(root, "..")).toThrow(
      /Invalid subdirectory/,
    );
  });

  it("rejects names containing a path separator", () => {
    expect(() => ensureSubdirectory(root, "a/b")).toThrow(
      /Invalid subdirectory/,
    );
  });
});

describe("validateDirectory", () => {
  it("reports invalid when .codegraph is missing", () => {
    const result = validateDirectory(root);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("does not exist");
  });

  it("reports invalid when .codegraph is a file", () => {
    writeFileSync(getCodeGraphDir(root), "not a dir");
    const result = validateDirectory(root);
    expect(result.valid).toBe(false);
  });

  it("reports valid for a fully-formed directory and auto-creates a missing .gitignore", () => {
    createDirectory(root);
    // Remove the .gitignore to test auto-repair
    rmSync(join(getCodeGraphDir(root), ".gitignore"));
    const result = validateDirectory(root);
    expect(result.valid).toBe(true);
    expect(existsSync(join(getCodeGraphDir(root), ".gitignore"))).toBe(true);
  });
});

describe("CODEGRAPH_DIR constant", () => {
  it('is ".codegraph"', () => {
    expect(CODEGRAPH_DIR).toBe(".codegraph");
  });
});

// =============================================================================
// Async API (v1.0+). Mirrors the sync tests above but exercises the
// node:fs/promises path. The two APIs must stay in lockstep; if you change
// behavior in one, change it in the other too.
// =============================================================================

describe("isInitializedAsync", () => {
  it("returns false when .codegraph does not exist", async () => {
    expect(await isInitializedAsync(root)).toBe(false);
  });

  it("returns false when .codegraph exists but codegraph.db is missing", async () => {
    mkdirSync(getCodeGraphDir(root));
    expect(await isInitializedAsync(root)).toBe(false);
  });

  it("returns true when both .codegraph and codegraph.db exist", async () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    expect(await isInitializedAsync(root)).toBe(true);
  });
});

describe("findNearestCodeGraphRootAsync", () => {
  it("returns null when no ancestor is initialized", async () => {
    expect(await findNearestCodeGraphRootAsync(root)).toBeNull();
  });

  it("finds the nearest of multiple ancestor roots (closest wins)", async () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    const aDir = join(root, "a");
    mkdirSync(aDir, { recursive: true });
    mkdirSync(getCodeGraphDir(aDir));
    writeFileSync(join(getCodeGraphDir(aDir), "codegraph.db"), "");
    const child = join(aDir, "b", "c");
    mkdirSync(child, { recursive: true });
    expect(await findNearestCodeGraphRootAsync(child)).toBe(aDir);
  });
});

describe("createDirectoryAsync / removeDirectoryAsync", () => {
  it("creates the directory, .gitignore, then removes both", async () => {
    await createDirectoryAsync(root);
    expect(existsSync(getCodeGraphDir(root))).toBe(true);
    expect(existsSync(join(getCodeGraphDir(root), ".gitignore"))).toBe(true);
    await removeDirectoryAsync(root);
    expect(existsSync(getCodeGraphDir(root))).toBe(false);
  });

  it("refuses to reinitialize when codegraph.db already exists", async () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "codegraph.db"), "");
    await expect(createDirectoryAsync(root)).rejects.toThrow(
      /already initialized/,
    );
  });
});

describe("listDirectoryContentsAsync", () => {
  it("returns [] when the directory does not exist", async () => {
    expect(await listDirectoryContentsAsync(root)).toEqual([]);
  });

  it("returns all files recursively with forward-slash relative paths", async () => {
    await createDirectoryAsync(root);
    writeFileSync(join(getCodeGraphDir(root), "extra.log"), "x");
    mkdirSync(join(getCodeGraphDir(root), "cache"));
    writeFileSync(join(getCodeGraphDir(root), "cache", "a.log"), "log");
    const files = (await listDirectoryContentsAsync(root)).sort();
    expect(files).toEqual([".gitignore", "cache/a.log", "extra.log"]);
  });
});

describe("getDirectorySizeAsync", () => {
  it("returns 0 when the directory does not exist", async () => {
    expect(await getDirectorySizeAsync(root)).toBe(0);
  });

  it("sums the size of every file recursively", async () => {
    mkdirSync(getCodeGraphDir(root));
    writeFileSync(join(getCodeGraphDir(root), "a.bin"), "x".repeat(100));
    writeFileSync(join(getCodeGraphDir(root), "b.bin"), "y".repeat(50));
    mkdirSync(join(getCodeGraphDir(root), "sub"));
    writeFileSync(join(getCodeGraphDir(root), "sub", "c.bin"), "z".repeat(25));
    expect(await getDirectorySizeAsync(root)).toBe(175);
  });
});

describe("ensureSubdirectoryAsync", () => {
  it("creates and returns the requested subdirectory", async () => {
    const sub = await ensureSubdirectoryAsync(root, "cache");
    expect(existsSync(sub)).toBe(true);
    expect(sub).toBe(join(getCodeGraphDir(root), "cache"));
  });

  it('rejects names containing ".."', async () => {
    await expect(ensureSubdirectoryAsync(root, "..")).rejects.toThrow(
      /Invalid subdirectory/,
    );
  });
});

describe("validateDirectoryAsync", () => {
  it("reports invalid when .codegraph is missing", async () => {
    const result = await validateDirectoryAsync(root);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("does not exist");
  });

  it("auto-creates a missing .gitignore on a valid directory", async () => {
    await createDirectoryAsync(root);
    rmSync(join(getCodeGraphDir(root), ".gitignore"));
    const result = await validateDirectoryAsync(root);
    expect(result.valid).toBe(true);
    expect(existsSync(join(getCodeGraphDir(root), ".gitignore"))).toBe(true);
  });
});
