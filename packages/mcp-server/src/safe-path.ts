/**
 * @aide/mcp-server — Safe path resolution utility.
 *
 * MCP tools accept user-controlled path arguments. Without validation,
 * a malicious or buggy client can:
 *   1. Read arbitrary files outside the project (path traversal: ../../etc/passwd)
 *   2. Exfiltrate files via symlink tricks
 *   3. Write to system directories
 *
 * This module centralizes path safety for all MCP tool handlers.
 *
 * The policy is: every path MUST resolve (after symlink following) to a location
 * within the configured project root. Anything else is rejected with an error.
 */
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { AideError } from '@aide/core';

/** Default project root — current working directory at module load time. */
const DEFAULT_PROJECT_ROOT = process.cwd();

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
  const projectRoot = options.projectRoot ? resolve(options.projectRoot) : DEFAULT_PROJECT_ROOT;

  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new AideError({
      code: 'PATH_INVALID',
      message: 'Path must be a non-empty string',
      recoverable: true,
      suggestion: 'Provide a non-empty file or directory path',
      context: { received: typeof inputPath },
    });
  }

  // Resolve to absolute (collapses '..' and relative segments).
  const absolute = resolve(projectRoot, inputPath);

  // Canonicalize via realpath to defeat symlink traversal.
  // If the path doesn't exist, fall back to the resolved path (write paths).
  let canonical: string;
  try {
    canonical = await realpath(absolute);
  } catch (err) {
    if (options.mustExist) {
      throw new AideError({
        code: 'PATH_NOT_FOUND',
        message: `Path does not exist: ${inputPath}`,
        recoverable: true,
        suggestion: 'Check that the path exists and is accessible',
        context: { path: inputPath, resolved: absolute, projectRoot },
        cause: err instanceof Error ? err : undefined,
      });
    }
    // Allow non-existent paths (write-side operations).
    canonical = absolute;
  }

  // Containment check: resolved path must live at or under the project root.
  // An empty `rel` means the input IS the project root (legitimate for
  // index/aggregate operations like `codegraph_index` with no `path` arg).
  const rel = relative(projectRoot, canonical);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new AideError({
      code: 'PATH_TRAVERSAL',
      message: `Path traversal blocked: "${inputPath}" resolves outside project root`,
      recoverable: false,
      severity: 'error',
      suggestion: 'Use paths that are within the project root directory',
      context: {
        requestedPath: inputPath,
        resolvedPath: canonical,
        projectRoot,
      },
    });
  }

  // Optional allow-list filtering.
  if (options.allowPatterns && options.allowPatterns.length > 0) {
    const { default: picomatch } = await import('picomatch');
    const isMatch = picomatch(options.allowPatterns, { dot: true });
    if (!isMatch(rel) && !isMatch(canonical)) {
      throw new AideError({
        code: 'PATH_NOT_ALLOWED',
        message: `Path "${rel}" does not match any allowed pattern: ${options.allowPatterns.join(', ')}`,
        recoverable: true,
        suggestion: `Restrict the path to one of: ${options.allowPatterns.join(', ')}`,
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
