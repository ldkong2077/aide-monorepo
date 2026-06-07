/**
 * @aide-dev/mcp-server — Safe path resolution utility.
 *
 * This module re-exports path safety utilities from @aide-dev/core for
 * consistency across the monorepo.
 */
export {
  resolveSafePath,
  resolveSafePaths,
  validatePathWithinRoot,
  validateProjectPath,
  isPathWithinRoot,
  isPathWithinRootReal,
  type SafePathOptions,
} from "@aide-dev/core";
