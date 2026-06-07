/**
 * @aide-dev/core — Safe path resolution utilities.
 *
 * Centralized path safety validation for all AIDE packages.
 * Prevents path traversal attacks and symlink escapes.
 */
import { realpath } from "node:fs/promises";
import { statSync, realpathSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AideError } from "./errors.js";

/** Default project root — current working directory at module load time. */
const DEFAULT_PROJECT_ROOT = process.cwd();

/**
 * Sensitive system directories that should never be used as project roots.
 * Checked on all platforms; non-applicable paths are harmlessly skipped.
 */
const SENSITIVE_PATHS = new Set([
  "/",
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/tmp",
  "/dev",
  "/proc",
  "/sys",
  "/root",
  "/boot",
  "/lib",
  "/lib64",
  "/opt",
  "C:\\",
  "C:\\Windows",
  "C:\\Windows\\System32",
]);

/** Options controlling safe-path resolution. */
export interface SafePathOptions {
  /** Project root. Defaults to the current working directory. */
  projectRoot?: string;
  /**
   * If true, the path must exist on disk. If false (default), the path is
   * allowed to be non-existent (useful for write/output operations).
   */
  mustExist?: boolean;
  /**
   * Optional allow-list of glob-style patterns (matched via picomatch).
   * If provided, the resolved relative path must match at least one pattern.
   */
  allowPatterns?: string[];
}

/**
 * Resolve a user-supplied path to a canonical absolute path, ensuring it
 * lies within the project root.
 *
 * @throws {AideError} `PATH_INVALID` if the path is empty or otherwise unusable.
 * @throws {AideError} `PATH_NOT_FOUND` if `mustExist` is true and the path is missing.
 * @throws {AideError} `PATH_TRAVERSAL` if the resolved path escapes the project root.
 * @throws {AideError} `PATH_NOT_ALLOWED` if `allowPatterns` is set and none match.
 *
 * @param inputPath  The user-supplied path (absolute, relative, or with `..`).
 * @param options    Optional controls.
 * @returns          A canonical absolute path guaranteed to be inside the root.
 */
export async function resolveSafePath(
  inputPath: string,
  options: SafePathOptions = {},
): Promise<string> {
  const rawProjectRoot = options.projectRoot
    ? path.resolve(options.projectRoot)
    : DEFAULT_PROJECT_ROOT;
  let projectRoot: string;
  try {
    projectRoot = await realpath(rawProjectRoot);
  } catch {
    projectRoot = rawProjectRoot;
  }

  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new AideError({
      code: "PATH_INVALID",
      message: "Path must be a non-empty string",
      recoverable: true,
      suggestion: "Provide a non-empty file or directory path",
      context: { received: typeof inputPath },
    });
  }

  const absolute = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(projectRoot, inputPath);

  let canonical: string;
  try {
    canonical = await realpath(absolute);
  } catch (err) {
    if (options.mustExist) {
      throw new AideError({
        code: "PATH_NOT_FOUND",
        message: `Path does not exist: ${inputPath}`,
        recoverable: true,
        suggestion: "Check that the path exists and is accessible",
        context: { path: inputPath, resolved: absolute, projectRoot },
        cause: err instanceof Error ? err : undefined,
      });
    }
    canonical = absolute;
  }

  const rel = path.relative(projectRoot, canonical);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new AideError({
      code: "PATH_TRAVERSAL",
      message: `Path traversal blocked: "${inputPath}" resolves outside project root`,
      recoverable: false,
      severity: "error",
      suggestion: "Use paths that are within the project root directory",
      context: {
        requestedPath: inputPath,
        resolvedPath: canonical,
        projectRoot,
      },
    });
  }

  if (options.allowPatterns && options.allowPatterns.length > 0) {
    const { default: picomatch } = await import("picomatch");
    const isMatch = picomatch(options.allowPatterns, { dot: true });
    if (!isMatch(rel) && !isMatch(canonical)) {
      throw new AideError({
        code: "PATH_NOT_ALLOWED",
        message: `Path "${rel}" does not match any allowed pattern: ${options.allowPatterns.join(", ")}`,
        recoverable: true,
        suggestion: `Restrict the path to one of: ${options.allowPatterns.join(", ")}`,
        context: { relativePath: rel, patterns: options.allowPatterns },
      });
    }
  }

  return canonical;
}

/**
 * Resolve and validate multiple paths in a single call.
 * All paths must pass; the first failure throws.
 */
export async function resolveSafePaths(
  inputPaths: readonly string[],
  options: SafePathOptions = {},
): Promise<string[]> {
  const results: string[] = [];
  for (const p of inputPaths) {
    results.push(await resolveSafePath(p, options));
  }
  return results;
}

/**
 * Validate that a resolved file path stays within the project root.
 * Prevents path traversal attacks (e.g. node.filePath = "../../etc/passwd").
 *
 * @param projectRoot - The project root directory
 * @param filePath - The relative file path to validate
 * @returns The resolved absolute path, or null if it escapes the root
 */
export function validatePathWithinRoot(
  projectRoot: string,
  filePath: string,
): string | null {
  const resolved = path.resolve(projectRoot, filePath);
  const normalizedRoot = path.resolve(projectRoot);

  if (
    !resolved.startsWith(normalizedRoot + path.sep) &&
    resolved !== normalizedRoot
  ) {
    return null;
  }
  return resolved;
}

/**
 * Validate that a path is a safe project root directory.
 *
 * Rejects sensitive system directories and ensures the path is
 * a real, existing directory. Used at MCP and API entry points
 * to prevent arbitrary directory access.
 *
 * @param dirPath - The path to validate
 * @returns An error message if invalid, or null if valid
 */
export function validateProjectPath(dirPath: string): string | null {
  const resolved = path.resolve(dirPath);

  if (
    SENSITIVE_PATHS.has(resolved) ||
    SENSITIVE_PATHS.has(resolved.toLowerCase())
  ) {
    return `Refusing to operate on sensitive system directory: ${resolved}`;
  }

  const homeDir = os.homedir();
  const sensitiveHomeDirs = [".ssh", ".gnupg", ".aws", ".config"];
  for (const dir of sensitiveHomeDirs) {
    const sensitivePath = path.join(homeDir, dir);
    if (
      resolved === sensitivePath ||
      resolved.startsWith(sensitivePath + path.sep)
    ) {
      return `Refusing to operate on sensitive directory: ${resolved}`;
    }
  }

  try {
    const stats = statSync(resolved);
    if (!stats.isDirectory()) {
      return `Path is not a directory: ${resolved}`;
    }
  } catch {
    return `Path does not exist or is not accessible: ${resolved}`;
  }

  return null;
}

/**
 * Check if a file path resolves to a location within the given root directory.
 *
 * Prevents path traversal attacks by ensuring the resolved absolute path
 * starts with the resolved root path. Handles '..' sequences, symlink-like
 * relative paths, and platform-specific separators.
 *
 * @param filePath - The path to check (can be relative or absolute)
 * @param rootDir - The root directory that filePath must stay within
 * @returns true if filePath resolves to a location within rootDir
 */
export function isPathWithinRoot(filePath: string, rootDir: string): boolean {
  const resolvedPath = path.resolve(rootDir, filePath);
  const resolvedRoot = path.resolve(rootDir);
  return (
    resolvedPath.startsWith(resolvedRoot + path.sep) ||
    resolvedPath === resolvedRoot
  );
}

/**
 * Like isPathWithinRoot but also resolves symlinks via fs.realpathSync.
 *
 * This catches symlink escapes where the logical path appears to be within
 * root but the real path on disk points elsewhere. Returns false if any
 * realpath resolution fails (broken symlinks, permission denied, etc.),
 * avoiding a weaker fallback that could be exploited.
 */
export function isPathWithinRootReal(
  filePath: string,
  rootDir: string,
): boolean {
  if (!isPathWithinRoot(filePath, rootDir)) {
    return false;
  }

  try {
    const realPath = realpathSync(path.resolve(rootDir, filePath));
    const realRoot = realpathSync(rootDir);
    return realPath.startsWith(realRoot + path.sep) || realPath === realRoot;
  } catch {
    return false;
  }
}
