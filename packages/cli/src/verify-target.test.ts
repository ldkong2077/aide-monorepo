/**
 * Unit tests for `verify-target.ts`. These pin down the mutual-exclusion
 * rules and glob expansion behavior of `aide guard verify` so that future
 * refactors of bin.ts don't accidentally regress the public CLI surface.
 */
import { describe, it, expect } from "vitest";
import { resolveVerifyTarget, countEnabledModes } from "./verify-target.js";
import { resolve as pathResolve } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("countEnabledModes", () => {
  it("returns empty set when no modes are active", () => {
    expect(countEnabledModes({}).size).toBe(0);
  });

  it("counts file", () => {
    expect(countEnabledModes({ file: "a.ts" })).toEqual(new Set(["file"]));
  });

  it("counts files (plural)", () => {
    expect(countEnabledModes({ files: "a.ts,b.ts" })).toEqual(
      new Set(["files"]),
    );
  });

  it("counts pattern", () => {
    expect(countEnabledModes({ pattern: "*.ts" })).toEqual(
      new Set(["pattern"]),
    );
  });

  it("counts path", () => {
    expect(countEnabledModes({ path: "src" })).toEqual(new Set(["path"]));
  });

  it("counts staged", () => {
    expect(countEnabledModes({ staged: true })).toEqual(new Set(["staged"]));
  });

  it("counts base when only base is given", () => {
    expect(countEnabledModes({}, "HEAD~1")).toEqual(new Set(["base"]));
  });

  it("counts base when only head is given", () => {
    expect(countEnabledModes({}, undefined, "HEAD")).toEqual(new Set(["base"]));
  });
});

describe("resolveVerifyTarget - mutual exclusion", () => {
  it("rejects --file + --files", async () => {
    await expect(
      resolveVerifyTarget({ file: "a.ts", files: "b.ts" }),
    ).rejects.toThrow(/Conflicting verify targets/);
  });

  it("rejects --file + --pattern", async () => {
    await expect(
      resolveVerifyTarget({ file: "a.ts", pattern: "*.ts" }),
    ).rejects.toThrow(/Conflicting verify targets/);
  });

  it("rejects --file + --path", async () => {
    await expect(
      resolveVerifyTarget({ file: "a.ts", path: "." }),
    ).rejects.toThrow(/Conflicting verify targets/);
  });

  it("rejects --file + --staged", async () => {
    await expect(
      resolveVerifyTarget({ file: "a.ts", staged: true }),
    ).rejects.toThrow(/Conflicting verify targets/);
  });

  it("rejects --path + --staged", async () => {
    await expect(
      resolveVerifyTarget({ path: ".", staged: true }),
    ).rejects.toThrow(/Conflicting verify targets/);
  });

  it("rejects --base + --staged", async () => {
    await expect(
      resolveVerifyTarget({ staged: true }, "HEAD~1"),
    ).rejects.toThrow(/Conflicting verify targets/);
  });
});

describe("resolveVerifyTarget - file mode", () => {
  it("returns kind=file with absolute path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aide-verify-"));
    const f = join(dir, "a.ts");
    writeFileSync(f, "// test");
    try {
      const r = await resolveVerifyTarget({ file: f });
      expect(r.kind).toBe("file");
      if (r.kind === "file") {
        expect(r.file).toBe(pathResolve(f));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-existent --file", async () => {
    await expect(
      resolveVerifyTarget({ file: "/nonexistent/zzz.ts" }),
    ).rejects.toThrow(/--file does not point to a file/);
  });

  it("rejects --file pointing at a directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aide-verify-"));
    try {
      await expect(resolveVerifyTarget({ file: dir })).rejects.toThrow(
        /--file does not point to a file/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveVerifyTarget - files (plural) mode", () => {
  it("splits comma-separated list and resolves each path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aide-verify-"));
    const a = join(dir, "a.ts");
    const b = join(dir, "b.ts");
    writeFileSync(a, "// a");
    writeFileSync(b, "// b");
    try {
      const r = await resolveVerifyTarget({ files: `${a}, ${b}` });
      expect(r.kind).toBe("files");
      if (r.kind === "files") {
        expect(r.files).toEqual([pathResolve(a), pathResolve(b)]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects empty --files", async () => {
    await expect(resolveVerifyTarget({ files: "" })).rejects.toThrow(
      /--files must contain at least one path/,
    );
  });

  it("rejects --files with non-existent entry", async () => {
    await expect(
      resolveVerifyTarget({ files: "/nonexistent/x.ts" }),
    ).rejects.toThrow(/--files contains non-file entry|--files/);
  });
});

describe("resolveVerifyTarget - pattern mode", () => {
  it("expands a glob into a files list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aide-verify-"));
    const a = join(dir, "a.ts");
    const b = join(dir, "b.ts");
    writeFileSync(a, "// a");
    writeFileSync(b, "// b");
    const origCwd = process.cwd();
    try {
      process.chdir(dir);
      const r = await resolveVerifyTarget({ pattern: "*.ts" });
      expect(r.kind).toBe("files");
      if (r.kind === "files") {
        expect(r.files).toHaveLength(2);
        expect(r.files.every((f) => f.endsWith(".ts"))).toBe(true);
      }
    } finally {
      process.chdir(origCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects --pattern that matches no files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aide-verify-"));
    const origCwd = process.cwd();
    try {
      process.chdir(dir);
      await expect(
        resolveVerifyTarget({ pattern: "*.nomatch" }),
      ).rejects.toThrow(/--pattern matched no files/);
    } finally {
      process.chdir(origCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveVerifyTarget - path mode", () => {
  it("accepts an existing directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aide-verify-"));
    try {
      const r = await resolveVerifyTarget({ path: dir });
      expect(r.kind).toBe("path");
      if (r.kind === "path") expect(r.path).toBe(pathResolve(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects --path pointing at a file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aide-verify-"));
    const f = join(dir, "a.ts");
    writeFileSync(f, "//");
    try {
      await expect(resolveVerifyTarget({ path: f })).rejects.toThrow(
        /--path does not point to a directory/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveVerifyTarget - staged and diff modes", () => {
  it("returns kind=staged when --staged is set", async () => {
    const r = await resolveVerifyTarget({ staged: true });
    expect(r.kind).toBe("staged");
  });

  it("returns kind=diff with base default HEAD~1", async () => {
    const r = await resolveVerifyTarget({}, "HEAD~1");
    expect(r.kind).toBe("diff");
    if (r.kind === "diff") {
      expect(r.base).toBe("HEAD~1");
      expect(r.head).toBe("HEAD");
    }
  });

  it("returns kind=diff with explicit head", async () => {
    const r = await resolveVerifyTarget({}, "main", "feature/x");
    expect(r.kind).toBe("diff");
    if (r.kind === "diff") {
      expect(r.base).toBe("main");
      expect(r.head).toBe("feature/x");
    }
  });
});

describe("resolveVerifyTarget - default behavior", () => {
  it("defaults to verifying process.cwd() when no mode is selected", async () => {
    const r = await resolveVerifyTarget({});
    expect(r.kind).toBe("path");
    if (r.kind === "path") {
      expect(r.path).toBe(process.cwd());
    }
  });
});
