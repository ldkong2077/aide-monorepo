/**
 * OpenAI Codex CLI target.
 *
 *   - MCP server entry to `~/.codex/config.toml` as the dotted-key
 *     table `[mcp_servers.codegraph]`. TOML — not JSON — handled by
 *     the narrow serializer in `./toml.ts`.
 *   - Instructions to `~/.codex/AGENTS.md`.
 *
 * Codex CLI as of 2026-05 has no project-local config concept —
 * everything lives under `~/.codex/`. `supportsLocation('local')`
 * returns false; the orchestrator skips Codex when the user picks
 * the local install location.
 *
 * No permissions concept.
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
import {
  atomicWriteFileSync,
  getMcpServerConfig,
  removeMarkedSection,
  replaceOrAppendMarkedSection,
} from "./shared.js";
import {
  CODEGRAPH_SECTION_END,
  CODEGRAPH_SECTION_START,
  INSTRUCTIONS_TEMPLATE,
} from "../instructions-template.js";
import { buildTomlTable, removeTomlTable, upsertTomlTable } from "./toml.js";

const TOML_HEADER = "mcp_servers.aide";

function configDir(): string {
  return path.join(os.homedir(), ".codex");
}
function tomlConfigPath(): string {
  return path.join(configDir(), "config.toml");
}
function instructionsPath(): string {
  return path.join(configDir(), "AGENTS.md");
}

class CodexTarget implements AgentTarget {
  readonly id = "codex" as const;
  readonly displayName = "Codex CLI";
  readonly docsUrl = "https://github.com/openai/codex";

  supportsLocation(loc: Location): boolean {
    return loc === "global";
  }

  detect(loc: Location): DetectionResult {
    if (loc !== "global") {
      return { installed: false, alreadyConfigured: false };
    }
    const tomlPath = tomlConfigPath();
    let alreadyConfigured = false;
    if (fs.existsSync(tomlPath)) {
      try {
        const content = fs.readFileSync(tomlPath, "utf-8");
        // Match either the new `mcp_servers.aide` table or a legacy
        // `mcp_servers.codegraph` one — keeps detection honest across
        // the rename.
        alreadyConfigured =
          content.includes(`[${TOML_HEADER}]`) ||
          content.includes("[mcp_servers.codegraph]");
      } catch {
        /* ignore */
      }
    }
    const installed = fs.existsSync(configDir());
    return { installed, alreadyConfigured, configPath: tomlPath };
  }

  install(loc: Location, _opts: InstallOptions): WriteResult {
    if (loc !== "global") {
      return {
        files: [],
        notes: [
          "Codex CLI has no project-local config — re-run with --location=global to install.",
        ],
      };
    }
    const files: WriteResult["files"] = [];

    files.push(writeMcpEntry());
    files.push(writeInstructionsEntry());

    return { files };
  }

  uninstall(loc: Location): WriteResult {
    if (loc !== "global") return { files: [] };
    const files: WriteResult["files"] = [];

    const tomlPath = tomlConfigPath();
    if (fs.existsSync(tomlPath)) {
      let content = fs.readFileSync(tomlPath, "utf-8");
      // Strip the new `[mcp_servers.aide]` table.
      const removed = removeTomlTable(content, TOML_HEADER);
      // If only the legacy `[mcp_servers.codegraph]` table is present,
      // strip that too — completes the rename uninstall.
      const legacyRemoved = removeTomlTable(
        removed.content,
        "mcp_servers.codegraph",
      );
      content = legacyRemoved.content;
      const wasRemoved =
        removed.action === "removed" || legacyRemoved.action === "removed";
      if (wasRemoved) {
        if (content.trim() === "") {
          try {
            fs.unlinkSync(tomlPath);
          } catch {
            /* ignore */
          }
        } else {
          atomicWriteFileSync(tomlPath, content.trimEnd() + "\n");
        }
        files.push({ path: tomlPath, action: "removed" });
      } else {
        files.push({ path: tomlPath, action: "not-found" });
      }
    } else {
      files.push({ path: tomlPath, action: "not-found" });
    }

    const instr = instructionsPath();
    const instrAction = removeMarkedSection(
      instr,
      CODEGRAPH_SECTION_START,
      CODEGRAPH_SECTION_END,
    );
    files.push({ path: instr, action: instrAction });

    return { files };
  }

  printConfig(loc: Location): string {
    if (loc !== "global") {
      return "# Codex CLI has no project-local config — use --location=global.\n";
    }
    const block = buildCodegraphBlock();
    return `# Add to ${tomlConfigPath()}\n\n${block}\n`;
  }

  describePaths(loc: Location): string[] {
    if (loc !== "global") return [];
    return [tomlConfigPath(), instructionsPath()];
  }
}

function buildCodegraphBlock(): string {
  const mcp = getMcpServerConfig();
  return buildTomlTable(TOML_HEADER, {
    command: mcp.command,
    args: mcp.args,
  });
}

function writeMcpEntry(): WriteResult["files"][number] {
  const file = tomlConfigPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const block = buildCodegraphBlock();
  // Single read — `existing === ''` derives both "is the file empty
  // or absent" and "what was its content," avoiding a TOCTOU window
  // between two `fs.existsSync` calls.
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  const created = existing.length === 0;
  const { content: nextContent, action } = upsertTomlTable(
    existing,
    TOML_HEADER,
    block,
  );

  if (action === "unchanged") {
    return { path: file, action: "unchanged" };
  }
  atomicWriteFileSync(file, nextContent);
  return { path: file, action: created ? "created" : "updated" };
}

function writeInstructionsEntry(): WriteResult["files"][number] {
  const file = instructionsPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const action = replaceOrAppendMarkedSection(
    file,
    INSTRUCTIONS_TEMPLATE,
    CODEGRAPH_SECTION_START,
    CODEGRAPH_SECTION_END,
  );
  const mapped: "created" | "updated" | "unchanged" =
    action === "created"
      ? "created"
      : action === "unchanged"
        ? "unchanged"
        : "updated";
  return { path: file, action: mapped };
}

export const codexTarget: AgentTarget = new CodexTarget();
