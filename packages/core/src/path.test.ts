import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  symlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveSafePath,
  validatePathWithinRoot,
  validateProjectPath,
  isPathWithinRoot,
  isPathWithinRootReal,
} from "./path.js";

describe("path utilities", () => {
  let testDir: string;
  let realTestDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "aide-core-path-test-"));
    realTestDir = realpathSync(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("validatePathWithinRoot", () => {
    it("returns resolved path for valid relative path", () => {
      const result = validatePathWithinRoot(testDir, "subdir/file.txt");
      expect(result).toBe(join(testDir, "subdir/file.txt"));
    });

    it("returns resolved path for absolute path within root", () => {
      const absPath = join(testDir, "valid/file.txt");
      const result = validatePathWithinRoot(testDir, absPath);
      expect(result).toBe(absPath);
    });

    it("returns null for path traversal attempt", () => {
      const result = validatePathWithinRoot(testDir, "../etc/passwd");
      expect(result).toBeNull();
    });

    it("returns null for deep path traversal", () => {
      const result = validatePathWithinRoot(
        testDir,
        "../../../../../etc/passwd",
      );
      expect(result).toBeNull();
    });

    it("returns the root itself when path equals root", () => {
      const result = validatePathWithinRoot(testDir, testDir);
      expect(result).toBe(testDir);
    });
  });

  describe("validateProjectPath", () => {
    it("returns null for valid directory", () => {
      const result = validateProjectPath(testDir);
      expect(result).toBeNull();
    });

    it("returns error for non-existent path", () => {
      const result = validateProjectPath(join(testDir, "nonexistent"));
      expect(result).toContain("does not exist");
    });

    it("returns error for file instead of directory", () => {
      const filePath = join(testDir, "test.txt");
      mkdirSync(join(testDir, "parent"), { recursive: true });
      writeFileSync(filePath, "test");
      const result = validateProjectPath(filePath);
      expect(result).toContain("not a directory");
    });

    it("returns error for sensitive system directory", () => {
      const result = validateProjectPath("/etc");
      expect(result).toContain("sensitive system directory");
    });

    it("returns error for root directory", () => {
      const result = validateProjectPath("/");
      expect(result).toContain("sensitive system directory");
    });
  });

  describe("isPathWithinRoot", () => {
    it("returns true for path within root", () => {
      expect(isPathWithinRoot("subdir/file.txt", testDir)).toBe(true);
    });

    it("returns true for root itself", () => {
      expect(isPathWithinRoot(testDir, testDir)).toBe(true);
    });

    it("returns false for path traversal", () => {
      expect(isPathWithinRoot("../etc/passwd", testDir)).toBe(false);
    });

    it("returns false for absolute path outside root", () => {
      expect(isPathWithinRoot("/etc/passwd", testDir)).toBe(false);
    });
  });

  describe("isPathWithinRootReal", () => {
    it("returns true for normal path within root", () => {
      mkdirSync(join(testDir, "subdir"), { recursive: true });
      expect(isPathWithinRootReal("subdir", realTestDir)).toBe(true);
    });

    it("returns false for symlink pointing outside root", () => {
      mkdirSync(join(testDir, "inside"), { recursive: true });
      symlinkSync("/etc", join(testDir, "inside/bad-link"));
      expect(isPathWithinRootReal("inside/bad-link", realTestDir)).toBe(false);
    });

    it("returns true for symlink pointing inside root", () => {
      mkdirSync(join(testDir, "target"), { recursive: true });
      symlinkSync(join(testDir, "target"), join(testDir, "link"));
      expect(isPathWithinRootReal("link", realTestDir)).toBe(true);
    });

    it("returns false for broken symlink", () => {
      symlinkSync("/nonexistent/path", join(testDir, "broken-link"));
      expect(isPathWithinRootReal("broken-link", realTestDir)).toBe(false);
    });
  });

  describe("resolveSafePath", () => {
    it("resolves relative path within root", async () => {
      const result = await resolveSafePath("subdir/file.txt", {
        projectRoot: realTestDir,
      });
      expect(result).toBe(join(realTestDir, "subdir/file.txt"));
    });

    it("resolves absolute path within root", async () => {
      const absPath = join(realTestDir, "valid/file.txt");
      const result = await resolveSafePath(absPath, {
        projectRoot: realTestDir,
      });
      expect(result).toBe(absPath);
    });

    it("throws PATH_TRAVERSAL for path outside root", async () => {
      await expect(
        resolveSafePath("../etc/passwd", { projectRoot: realTestDir }),
      ).rejects.toMatchObject({ code: "PATH_TRAVERSAL" });
    });

    it("throws PATH_INVALID for empty string", async () => {
      await expect(
        resolveSafePath("", { projectRoot: realTestDir }),
      ).rejects.toMatchObject({
        code: "PATH_INVALID",
      });
    });

    it("throws PATH_NOT_FOUND when mustExist is true and path doesn't exist", async () => {
      await expect(
        resolveSafePath("nonexistent.txt", {
          projectRoot: realTestDir,
          mustExist: true,
        }),
      ).rejects.toMatchObject({ code: "PATH_NOT_FOUND" });
    });

    it("allows non-existent path when mustExist is false", async () => {
      const result = await resolveSafePath("nonexistent.txt", {
        projectRoot: realTestDir,
        mustExist: false,
      });
      expect(result).toBe(join(realTestDir, "nonexistent.txt"));
    });
  });
});
