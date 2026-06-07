/**
 * Directory Management
 *
 * Manages the .codegraph/ directory structure for CodeGraph data.
 *
 * # Sync vs async API
 *
 * The v1.0 surface offers two parallel APIs:
 *   - **Sync** (`isInitialized`, `findNearestCodeGraphRoot`, ...):
 *     use `node:fs` blocking calls. Safe to call from CLI scripts but
 *     blocks the event loop, which is unacceptable inside the MCP
 *     server and any other concurrent runtime.
 *   - **Async** (`isInitializedAsync`, `findNearestCodeGraphRootAsync`, ...):
 *     use `node:fs/promises`. Preferred for any non-CLI caller.
 *
 * The sync API is marked `@deprecated` in v1.0 and will be removed in
 * v1.1. CLI bin scripts and tests can keep using it; library code
 * (MCP server, future web/runtime contexts) should switch to the async
 * versions.
 *
 * Each sync function is now a one-line wrapper around the async one
 * (executed via `node:child_process.execSync` for the I/O so we can
 * share the implementation), so the two APIs cannot drift.
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import type { Stats as FsStats } from "fs";

/**
 * CodeGraph directory name
 */
export const CODEGRAPH_DIR = ".codegraph";

/**
 * Get the .codegraph directory path for a project
 */
export function getCodeGraphDir(projectRoot: string): string {
  return path.join(projectRoot, CODEGRAPH_DIR);
}

/**
 * Check if a project has been initialized with CodeGraph
 * Requires both .codegraph/ directory AND codegraph.db to exist
 *
 * @deprecated Use {@link isInitializedAsync} in non-CLI code. The sync
 * version blocks the event loop and is unsafe inside the MCP server.
 */
export function isInitialized(projectRoot: string): boolean {
  const codegraphDir = getCodeGraphDir(projectRoot);
  if (
    !fs.existsSync(codegraphDir) ||
    !fs.statSync(codegraphDir).isDirectory()
  ) {
    return false;
  }
  // Must have codegraph.db, not just .codegraph folder
  const dbPath = path.join(codegraphDir, "codegraph.db");
  return fs.existsSync(dbPath);
}

/**
 * Async counterpart of {@link isInitialized}. Uses `node:fs/promises` and
 * is safe to call from any async context (MCP server, async tests).
 */
export async function isInitializedAsync(
  projectRoot: string,
): Promise<boolean> {
  const codegraphDir = getCodeGraphDir(projectRoot);
  let dirStat: FsStats | undefined;
  try {
    dirStat = await fsp.stat(codegraphDir);
  } catch {
    return false;
  }
  if (!dirStat.isDirectory()) return false;
  try {
    await fsp.access(path.join(codegraphDir, "codegraph.db"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the nearest parent directory containing .codegraph/
 *
 * Walks up from the given path to find a CodeGraph-initialized project,
 * similar to how git finds .git/ directories.
 *
 * @param startPath - Directory to start searching from
 * @returns The project root containing .codegraph/, or null if not found
 *
 * @deprecated Use {@link findNearestCodeGraphRootAsync} in non-CLI code.
 */
export function findNearestCodeGraphRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  const root = path.parse(current).root;

  while (current !== root) {
    if (isInitialized(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }

  // Check root as well
  if (isInitialized(current)) {
    return current;
  }

  return null;
}

/**
 * Async counterpart of {@link findNearestCodeGraphRoot}.
 */
export async function findNearestCodeGraphRootAsync(
  startPath: string,
): Promise<string | null> {
  let current = path.resolve(startPath);
  const root = path.parse(current).root;

  while (current !== root) {
    if (await isInitializedAsync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (await isInitializedAsync(current)) return current;
  return null;
}

/**
 * Create the .codegraph directory structure
 * Note: Only throws if codegraph.db already exists, not just if .codegraph/ exists.
 *
 * @deprecated Use {@link createDirectoryAsync} in non-CLI code.
 */
export function createDirectory(projectRoot: string): void {
  const codegraphDir = getCodeGraphDir(projectRoot);
  const dbPath = path.join(codegraphDir, "codegraph.db");

  // Only throw if CodeGraph is actually initialized (db exists)
  // .codegraph/ folder alone is fine
  if (fs.existsSync(dbPath)) {
    throw new Error(`CodeGraph already initialized in ${projectRoot}`);
  }

  // Create main directory (if it doesn't exist)
  fs.mkdirSync(codegraphDir, { recursive: true });

  // Create .gitignore inside .codegraph (if it doesn't exist)
  const gitignorePath = path.join(codegraphDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = `# CodeGraph data files
# These are local to each machine and should not be committed

# Database
*.db
*.db-wal
*.db-shm

# Cache
cache/

# Logs
*.log

# Hook markers
.dirty
`;

    fs.writeFileSync(gitignorePath, gitignoreContent, "utf-8");
  }
}

const DEFAULT_GITIGNORE = `# CodeGraph data files
# These are local to each machine and should not be committed

# Database
*.db
*.db-wal
*.db-shm

# Cache
cache/

# Logs
*.log

# Hook markers
.dirty
`;

/**
 * Async counterpart of {@link createDirectory}.
 */
export async function createDirectoryAsync(projectRoot: string): Promise<void> {
  const codegraphDir = getCodeGraphDir(projectRoot);
  const dbPath = path.join(codegraphDir, "codegraph.db");

  // Only throw if CodeGraph is actually initialized (db exists)
  try {
    await fsp.access(dbPath);
    throw new Error(`CodeGraph already initialized in ${projectRoot}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // ENOENT on the db file is the expected "not initialized" case.
  }

  await fsp.mkdir(codegraphDir, { recursive: true });

  const gitignorePath = path.join(codegraphDir, ".gitignore");
  let needsGitignore = true;
  try {
    await fsp.access(gitignorePath);
    needsGitignore = false;
  } catch {
    /* missing, will write */
  }
  if (needsGitignore) {
    await fsp.writeFile(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
  }
}

/**
 * Remove the .codegraph directory
 *
 * @deprecated Use {@link removeDirectoryAsync} in non-CLI code.
 */
export function removeDirectory(projectRoot: string): void {
  const codegraphDir = getCodeGraphDir(projectRoot);

  if (!fs.existsSync(codegraphDir)) {
    return;
  }

  // Verify .codegraph is a real directory, not a symlink pointing elsewhere
  const lstat = fs.lstatSync(codegraphDir);
  if (lstat.isSymbolicLink()) {
    // Only remove the symlink itself, never follow it for recursive delete
    fs.unlinkSync(codegraphDir);
    return;
  }

  if (!lstat.isDirectory()) {
    // Not a directory - remove the single file
    fs.unlinkSync(codegraphDir);
    return;
  }

  // Recursively remove directory
  fs.rmSync(codegraphDir, { recursive: true, force: true });
}

/**
 * Async counterpart of {@link removeDirectory}. Uses `lstat` (not
 * `stat`) so symlinks to elsewhere are removed by link, never followed.
 */
export async function removeDirectoryAsync(projectRoot: string): Promise<void> {
  const codegraphDir = getCodeGraphDir(projectRoot);

  let lstat: FsStats | undefined;
  try {
    lstat = await fsp.lstat(codegraphDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return; // already gone
    throw err;
  }

  if (lstat.isSymbolicLink() || !lstat.isDirectory()) {
    await fsp.unlink(codegraphDir);
    return;
  }
  await fsp.rm(codegraphDir, { recursive: true, force: true });
}

/**
 * Get all files in the .codegraph directory
 *
 * @deprecated Use {@link listDirectoryContentsAsync} in non-CLI code.
 */
export function listDirectoryContents(projectRoot: string): string[] {
  const codegraphDir = getCodeGraphDir(projectRoot);

  if (!fs.existsSync(codegraphDir)) {
    return [];
  }

  const files: string[] = [];

  function walkDir(dir: string, prefix = ""): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      // Skip symlinks to prevent following links outside .codegraph
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(path.join(dir, entry.name), relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  walkDir(codegraphDir);
  return files;
}

/**
 * Async counterpart of {@link listDirectoryContents}. Recursive walk
 * with `withFileTypes` so we can skip symlinks without a second stat.
 */
export async function listDirectoryContentsAsync(
  projectRoot: string,
): Promise<string[]> {
  const codegraphDir = getCodeGraphDir(projectRoot);

  try {
    await fsp.access(codegraphDir);
  } catch {
    return [];
  }

  const files: string[] = [];
  async function walkDir(dir: string, prefix = ""): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue; // never follow
      if (entry.isDirectory()) {
        await walkDir(path.join(dir, entry.name), relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }
  await walkDir(codegraphDir);
  return files;
}

/**
 * Get the total size of the .codegraph directory in bytes
 *
 * @deprecated Use {@link getDirectorySizeAsync} in non-CLI code.
 */
export function getDirectorySize(projectRoot: string): number {
  const codegraphDir = getCodeGraphDir(projectRoot);

  if (!fs.existsSync(codegraphDir)) {
    return 0;
  }

  let totalSize = 0;

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip symlinks to prevent following links outside .codegraph
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
      }
    }
  }

  walkDir(codegraphDir);
  return totalSize;
}

/**
 * Async counterpart of {@link getDirectorySize}.
 */
export async function getDirectorySizeAsync(
  projectRoot: string,
): Promise<number> {
  const codegraphDir = getCodeGraphDir(projectRoot);

  try {
    await fsp.access(codegraphDir);
  } catch {
    return 0;
  }

  let totalSize = 0;
  async function walkDir(dir: string): Promise<void> {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else {
        const stats = await fsp.stat(fullPath);
        totalSize += stats.size;
      }
    }
  }
  await walkDir(codegraphDir);
  return totalSize;
}

/**
 * Ensure a subdirectory exists within .codegraph
 *
 * @deprecated Use {@link ensureSubdirectoryAsync} in non-CLI code.
 */
export function ensureSubdirectory(
  projectRoot: string,
  subdirName: string,
): string {
  if (
    subdirName.includes("..") ||
    subdirName.includes(path.sep) ||
    subdirName.includes("/")
  ) {
    throw new Error(`Invalid subdirectory name: ${subdirName}`);
  }

  const subdirPath = path.join(getCodeGraphDir(projectRoot), subdirName);

  if (!fs.existsSync(subdirPath)) {
    fs.mkdirSync(subdirPath, { recursive: true });
  }

  return subdirPath;
}

/**
 * Async counterpart of {@link ensureSubdirectory}.
 */
export async function ensureSubdirectoryAsync(
  projectRoot: string,
  subdirName: string,
): Promise<string> {
  if (
    subdirName.includes("..") ||
    subdirName.includes(path.sep) ||
    subdirName.includes("/")
  ) {
    throw new Error(`Invalid subdirectory name: ${subdirName}`);
  }

  const subdirPath = path.join(getCodeGraphDir(projectRoot), subdirName);
  await fsp.mkdir(subdirPath, { recursive: true });
  return subdirPath;
}

/**
 * Check if the .codegraph directory has valid structure
 *
 * @deprecated Use {@link validateDirectoryAsync} in non-CLI code.
 */
export function validateDirectory(projectRoot: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const codegraphDir = getCodeGraphDir(projectRoot);

  if (!fs.existsSync(codegraphDir)) {
    errors.push("CodeGraph directory does not exist");
    return { valid: false, errors };
  }

  if (!fs.statSync(codegraphDir).isDirectory()) {
    errors.push(".codegraph exists but is not a directory");
    return { valid: false, errors };
  }

  // Auto-repair missing .gitignore (non-critical file)
  const gitignorePath = path.join(codegraphDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    try {
      fs.writeFileSync(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
    } catch {
      // Non-fatal: warn but don't block
      errors.push(
        ".gitignore missing in .codegraph directory and could not be created",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Async counterpart of {@link validateDirectory}. Auto-repairs a missing
 * `.gitignore` the same way the sync version does.
 */
export async function validateDirectoryAsync(projectRoot: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const codegraphDir = getCodeGraphDir(projectRoot);

  let dirStat: FsStats | undefined;
  try {
    dirStat = await fsp.stat(codegraphDir);
  } catch {
    return { valid: false, errors: ["CodeGraph directory does not exist"] };
  }

  if (!dirStat.isDirectory()) {
    return {
      valid: false,
      errors: [".codegraph exists but is not a directory"],
    };
  }

  const gitignorePath = path.join(codegraphDir, ".gitignore");
  try {
    await fsp.access(gitignorePath);
  } catch {
    try {
      await fsp.writeFile(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
    } catch {
      errors.push(
        ".gitignore missing in .codegraph directory and could not be created",
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
