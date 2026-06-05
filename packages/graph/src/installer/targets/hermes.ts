/**
 * Hermes Agent target.
 *
 * Hermes reads MCP servers from `$HERMES_HOME/config.yaml` under the
 * top-level `mcp_servers` key, and exposes discovered MCP tools through
 * dynamic toolsets named `mcp-<server>`. We add:
 *
 *   mcp_servers.aide -> `aide mcp serve`
 *   platform_toolsets.cli -> `mcp-aide`
 *
 * The second entry matters because Hermes CLI profiles often enable an
 * explicit `platform_toolsets.cli` list. Without `mcp-aide` in that
 * list, the MCP server can be configured and connected but its tools
 * may still be filtered out of normal CLI sessions.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  type AgentTarget,
  type DetectionResult,
  type InstallOptions,
  type Location,
  type WriteResult,
} from "./types.js";
import { atomicWriteFileSync } from "./shared.js";

interface LineRange {
  start: number;
  end: number;
}

class HermesTarget implements AgentTarget {
  readonly id = "hermes" as const;
  readonly displayName = "Hermes Agent";
  readonly docsUrl = "https://hermes-agent.nousresearch.com";

  supportsLocation(loc: Location): boolean {
    return loc === "global";
  }

  detect(loc: Location): DetectionResult {
    if (loc !== "global") {
      return { installed: false, alreadyConfigured: false };
    }
    const file = configPath();
    const content = readText(file);
    const installed = fs.existsSync(hermesHome()) || fs.existsSync(file);
    return {
      installed,
      // Match either the new `mcp_servers.aide` block or a legacy
      // `mcp_servers.codegraph` one — keeps detection honest across
      // the rename.
      alreadyConfigured:
        hasAideMcpServer(content) || hasLegacyCodeGraphMcpServer(content),
      configPath: file,
    };
  }

  install(loc: Location, _opts: InstallOptions): WriteResult {
    if (loc !== "global") {
      return {
        files: [],
        notes: [
          "Hermes Agent uses $HERMES_HOME/config.yaml; re-run with --location=global.",
        ],
      };
    }
    return {
      files: [writeHermesConfig()],
      notes: ["Start a new Hermes session for MCP changes to take effect."],
    };
  }

  uninstall(loc: Location): WriteResult {
    if (loc !== "global") return { files: [] };
    const file = configPath();
    if (!fs.existsSync(file)) {
      return { files: [{ path: file, action: "not-found" }] };
    }

    // Strip the new AIDE blocks first, then any legacy codegraph
    // blocks, so uninstall fully reverses a pre-rename install.
    const before = readText(file);
    const after = removeAideToolset(
      removeAideMcpServer(
        removeLegacyCodeGraphToolset(removeLegacyCodeGraphMcpServer(before)),
      ),
    );
    if (after === before) {
      return { files: [{ path: file, action: "not-found" }] };
    }
    atomicWriteFileSync(file, ensureTrailingNewline(after));
    return { files: [{ path: file, action: "removed" }] };
  }

  printConfig(loc: Location): string {
    if (loc !== "global") {
      return "# Hermes Agent uses $HERMES_HOME/config.yaml; use --location=global.\n";
    }
    return [
      `# Add to ${configPath()}`,
      "",
      renderAideMcpBlock().join("\n"),
      "",
      "platform_toolsets:",
      "  cli:",
      "    - hermes-cli",
      "    - mcp-aide",
      "",
    ].join("\n");
  }

  describePaths(loc: Location): string[] {
    return loc === "global" ? [configPath()] : [];
  }
}

function hermesHome(): string {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), ".hermes");
}

function configPath(): string {
  return path.join(hermesHome(), "config.yaml");
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return "";
  }
}

function writeHermesConfig(): WriteResult["files"][number] {
  const file = configPath();
  const existed = fs.existsSync(file);
  const before = readText(file);
  // On upgrade from a pre-rename install, also strip the legacy
  // `mcp_servers.codegraph` and `mcp-codegraph` entries — they would
  // be orphaned and confuse Hermes' toolset resolution.
  const stripped = removeLegacyCodeGraphToolset(
    removeLegacyCodeGraphMcpServer(before),
  );
  const afterMcp = upsertAideMcpServer(stripped);
  const after = upsertAideToolset(afterMcp);

  if (after === before) {
    return { path: file, action: "unchanged" };
  }
  atomicWriteFileSync(file, ensureTrailingNewline(after));
  return { path: file, action: existed ? "updated" : "created" };
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : text + "\n";
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function joinLines(lines: string[]): string {
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function topLevelRange(lines: string[], key: string): LineRange | null {
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*(?:#.*)?$/.test(line)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function childRange(
  lines: string[],
  parent: LineRange,
  child: string,
): LineRange | null {
  const startPattern = new RegExp(`^  ${escapeRegExp(child)}:\\s*(?:#.*)?$`);
  let start = -1;
  for (let i = parent.start + 1; i < parent.end; i++) {
    if (startPattern.test(lines[i] ?? "")) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let end = parent.end;
  for (let i = start + 1; i < parent.end; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    if (/^ {2}\S/.test(line)) {
      end = i;
      break;
    }
  }
  while (end > start + 1 && (lines[end - 1] ?? "").trim() === "") {
    end--;
  }
  return { start, end };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderAideMcpChild(): string[] {
  return [
    "  aide:",
    "    command: aide",
    "    args:",
    "      - mcp",
    "      - serve",
    "    timeout: 120",
    "    connect_timeout: 60",
    "    enabled: true",
  ];
}

function renderAideMcpBlock(): string[] {
  return ["mcp_servers:", ...renderAideMcpChild()];
}

function hasAideMcpServer(content: string): boolean {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "mcp_servers");
  return !!parent && !!childRange(lines, parent, "aide");
}

function hasLegacyCodeGraphMcpServer(content: string): boolean {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "mcp_servers");
  return !!parent && !!childRange(lines, parent, "codegraph");
}

function upsertAideMcpServer(content: string): string {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "mcp_servers");
  const child = parent ? childRange(lines, parent, "aide") : null;
  const replacement = renderAideMcpChild();

  if (!parent) {
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (lines.length > 0) lines.push("");
    lines.push(...renderAideMcpBlock());
    return joinLines(lines);
  }

  if (child) {
    const existing = lines.slice(child.start, child.end);
    if (arrayEqual(existing, replacement)) return joinLines(lines);
    lines.splice(child.start, child.end - child.start, ...replacement);
    return joinLines(lines);
  }

  lines.splice(parent.end, 0, ...replacement);
  return joinLines(lines);
}

function removeAideMcpServer(content: string): string {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "mcp_servers");
  const child = parent ? childRange(lines, parent, "aide") : null;
  if (!child) return content;
  lines.splice(child.start, child.end - child.start);
  return joinLines(lines);
}

function upsertAideToolset(content: string): string {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "platform_toolsets");
  const cli = parent ? childRange(lines, parent, "cli") : null;

  if (!parent) {
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (lines.length > 0) lines.push("");
    lines.push(
      "platform_toolsets:",
      "  cli:",
      "    - hermes-cli",
      "    - mcp-aide",
    );
    return joinLines(lines);
  }

  if (!cli) {
    lines.splice(parent.end, 0, "  cli:", "    - hermes-cli", "    - mcp-aide");
    return joinLines(lines);
  }

  const hasEntry = lines
    .slice(cli.start + 1, cli.end)
    .some((line) => line.trim() === "- mcp-aide");
  if (hasEntry) return joinLines(lines);

  lines.splice(cli.end, 0, "    - mcp-aide");
  return joinLines(lines);
}

function removeAideToolset(content: string): string {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "platform_toolsets");
  const cli = parent ? childRange(lines, parent, "cli") : null;
  if (!cli) return content;

  const hasEntry = lines
    .slice(cli.start + 1, cli.end)
    .some((line) => line.trim() === "- mcp-aide");
  if (!hasEntry) return content;

  const next = lines.filter((line, idx) => {
    if (idx <= cli.start || idx >= cli.end) return true;
    return line.trim() !== "- mcp-aide";
  });
  return joinLines(next);
}

// Legacy `mcp_servers.codegraph` / `mcp-codegraph` helpers — kept
// for one release cycle so an upgrade from a pre-rename install
// self-heals (the new installer strips the legacy entries instead of
// leaving them orphaned alongside the new ones).
function removeLegacyCodeGraphMcpServer(content: string): string {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "mcp_servers");
  const child = parent ? childRange(lines, parent, "codegraph") : null;
  if (!child) return content;
  lines.splice(child.start, child.end - child.start);
  return joinLines(lines);
}

function removeLegacyCodeGraphToolset(content: string): string {
  const lines = splitLines(content);
  const parent = topLevelRange(lines, "platform_toolsets");
  const cli = parent ? childRange(lines, parent, "cli") : null;
  if (!cli) return content;

  const hasEntry = lines
    .slice(cli.start + 1, cli.end)
    .some((line) => line.trim() === "- mcp-codegraph");
  if (!hasEntry) return content;

  const next = lines.filter((line, idx) => {
    if (idx <= cli.start || idx >= cli.end) return true;
    return line.trim() !== "- mcp-codegraph";
  });
  return joinLines(next);
}

function arrayEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, idx) => value === b[idx]);
}

export const hermesTarget: AgentTarget = new HermesTarget();
