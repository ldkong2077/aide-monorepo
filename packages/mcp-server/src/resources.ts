/**
 * MCP resources exposed by the AIDE server.
 *
 * Resources are read-only data the MCP client can attach to a
 * conversation as context. Unlike tools, they do not perform actions
 * — they answer "what does the server know about the current project?"
 *
 * Format reference:
 *   https://modelcontextprotocol.io/specification/draft/server/resources
 *
 * NOTE: This module deliberately does NOT import from `@aide-dev/graph`.
 * The graph package does not expose `directory.ts` (sync or async) as
 * a public subpath, and pulling in the whole graph build to read a
 * config file would bloat the MCP server's cold-start. The 30 lines
 * of filesystem helpers below cover exactly what the three resources
 * need; if `directory.ts` ever gains a public surface, swap these for
 * the canonical helpers.
 */
import type {
  Resource,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { findConfigPath, loadConfig } from "@aide-dev/core";
import { PACKAGE_VERSION } from "./version.js";
import {
  existsSync,
  realpathSync,
  promises as fsp,
  type Dirent as FsDirent,
} from "node:fs";
import { join } from "node:path";

const CODEGRAPH_DIR = ".codegraph";
const CODEGRAPH_DB = "codegraph.db";

/**
 * Resource catalogue. The URI scheme `aide://` is non-standard but the
 * MCP spec allows custom schemes; clients should surface it as a
 * hierarchical browse of project metadata.
 */
export const RESOURCES: Resource[] = [
  {
    uri: "aide://config",
    name: "AIDE Configuration",
    description:
      "The effective AIDE config (resolved from aide.config.yaml with env-var interpolation).",
    mimeType: "application/yaml",
  },
  {
    uri: "aide://graph/stats",
    name: "CodeGraph Statistics",
    description:
      "Index statistics: file count, on-disk size, initialization state. Empty if the project is not indexed.",
    mimeType: "application/json",
  },
  {
    uri: "aide://health",
    name: "Server Health",
    description:
      "Lightweight health check — version, uptime, and the status of optional subsystems.",
    mimeType: "application/json",
  },
];

/**
 * Resolve a `resources/read` request. Returns null when the URI is
 * unknown so the caller can produce an MCP error.
 */
export async function readResource(
  uri: string,
): Promise<ReadResourceResult | null> {
  switch (uri) {
    case "aide://config":
      return readConfig();
    case "aide://graph/stats":
      return readGraphStats();
    case "aide://health":
      return readHealth();
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual resource implementations
// ─────────────────────────────────────────────────────────────────────────────

async function readConfig(): Promise<ReadResourceResult> {
  // findConfigPath + loadConfig already handle missing files (returns
  // the built-in default), so this resource is always renderable.
  const configPath = findConfigPath();
  const config = await loadConfig(configPath ?? undefined);
  const header =
    configPath && existsSync(configPath)
      ? `# Resolved from: ${configPath}\n`
      : `# No aide.config.yaml found; using built-in defaults\n`;
  return {
    contents: [
      {
        uri: "aide://config",
        mimeType: "application/yaml",
        text: header + JSON.stringify(config, null, 2),
      },
    ],
  };
}

async function readGraphStats(): Promise<ReadResourceResult> {
  const projectRoot = realpathSync(process.cwd());
  const codegraphDir = join(projectRoot, CODEGRAPH_DIR);
  const dbPath = join(codegraphDir, CODEGRAPH_DB);

  let initialized = false;
  try {
    const dirStat = await fsp.stat(codegraphDir);
    if (dirStat.isDirectory()) {
      await fsp.access(dbPath);
      initialized = true;
    }
  } catch {
    /* not initialized — fall through */
  }

  if (!initialized) {
    return {
      contents: [
        {
          uri: "aide://graph/stats",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              initialized: false,
              projectRoot,
              message: "Run codegraph_index to populate the graph.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const fileCount = await countFiles(codegraphDir);
  const bytes = await sumSizes(codegraphDir);
  return {
    contents: [
      {
        uri: "aide://graph/stats",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            initialized: true,
            projectRoot,
            codegraphDir,
            fileCount,
            onDiskBytes: bytes,
            // Detailed node/edge counts would require opening the SQLite
            // database; the surface stays JSON-only here so this resource
            // remains cheap to read on every conversation turn.
          },
          null,
          2,
        ),
      },
    ],
  };
}

function readHealth(): ReadResourceResult {
  const started = markStarted();
  return {
    contents: [
      {
        uri: "aide://health",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            status: "ok",
            version: PACKAGE_VERSION,
            uptimeMs: Date.now() - started,
            pid: process.pid,
            node: process.version,
          },
          null,
          2,
        ),
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Local filesystem helpers (intentionally NOT from @aide-dev/graph — see header)
// ─────────────────────────────────────────────────────────────────────────────

async function countFiles(root: string): Promise<number> {
  let count = 0;
  async function walk(dir: string): Promise<void> {
    let entries: FsDirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // never follow
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name));
      } else {
        count++;
      }
    }
  }
  await walk(root);
  return count;
}

async function sumSizes(root: string): Promise<number> {
  let total = 0;
  async function walk(dir: string): Promise<void> {
    let entries: FsDirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name));
      } else {
        try {
          const stats = await fsp.stat(join(dir, entry.name));
          total += stats.size;
        } catch {
          /* file vanished mid-walk — ignore */
        }
      }
    }
  }
  await walk(root);
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server start timestamp for the `aide://health` resource
// ─────────────────────────────────────────────────────────────────────────────

let startedAt: number | null = null;
function markStarted(): number {
  if (startedAt === null) startedAt = Date.now();
  return startedAt;
}
