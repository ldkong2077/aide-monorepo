/**
 * Sync Module
 *
 * Provides synchronization functionality for keeping the code graph
 * up-to-date with file system changes.
 *
 * Components:
 * - FileWatcher: Debounced fs.watch that auto-triggers sync on file changes
 * - Watch policy: decides when the watcher must be disabled (e.g. WSL2 /mnt)
 * - Git sync hooks: opt-in commit/merge/checkout hooks when watching is off
 * - Content hashing for change detection (in extraction module)
 * - Incremental reindexing (in extraction module)
 */

export { FileWatcher, WatchOptions } from './watcher.js';
export { watchDisabledReason, detectWsl } from './watch-policy.js';
export {
  installGitSyncHook,
  removeGitSyncHook,
  isSyncHookInstalled,
  isGitRepo,
  DEFAULT_SYNC_HOOKS,
  type GitHookName,
  type GitHookResult,
} from './git-hooks.js';
