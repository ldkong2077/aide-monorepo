/**
 * @aide-dev/mcp-server — Version info
 *
 * Reads the package version from package.json at module load time
 * so the server info and health check always report the actual
 * installed version, not a hardcoded string.
 */
import pkg from "../package.json" with { type: "json" };

export const PACKAGE_NAME: string = (() => {
  const match = pkg.name.match(/^@([^/]+)\/(.+)$/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return pkg.name;
})();
export const PACKAGE_VERSION: string = pkg.version;
