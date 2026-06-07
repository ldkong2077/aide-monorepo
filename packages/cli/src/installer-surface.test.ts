/**
 * Smoke tests for the `aide install` subcommand and the AIDE
 * installer public surface.
 *
 * The subcommand is a thin wrapper around `@aide-dev/graph`'s installer
 * module, so the most valuable coverage is at the seam: does the
 * installer produce the right AIDE config / permission set, does
 * `aide install --print-config` resolve target ids correctly, and
 * does the agent-instructions template tell agents to use AIDE
 * automatically (not just as a "consider" footnote). These tests
 * pin down the public surface that downstream AI tools will see
 * when they read the JSON / markdown the installer writes.
 */
import { describe, it, expect } from "vitest";
import {
  getAidePermissions,
  getMcpServerConfig,
  getTarget,
  listTargetIds,
  INSTRUCTIONS_TEMPLATE,
  type AgentTarget,
} from "@aide-dev/graph/installer";

describe("aide installer public surface", () => {
  it("getMcpServerConfig points at the `aide` binary with `mcp serve` args", () => {
    const cfg = getMcpServerConfig();
    expect(cfg).toEqual({
      type: "stdio",
      command: "aide",
      args: ["mcp", "serve"],
    });
  });

  it("getAidePermissions matches the tools `@aide-dev/mcp-server` actually exposes", () => {
    // The permission list MUST stay in sync with the TOOLS constant in
    // packages/mcp-server/src/index.ts. Any new tool added there
    // without updating this list will silently fail permission-gated
    // invocation from Claude Code. The duplicate list below is the
    // canonical set as of this commit; if it diverges, update both.
    expect(getAidePermissions()).toEqual([
      "mcp__aide__codegraph_index",
      "mcp__aide__codegraph_query",
      "mcp__aide__guard_verify",
      "mcp__aide__guard_check",
    ]);
  });

  it("lists every supported target id", () => {
    // The README's `aide install --print-config <id>` help expects
    // these ids. Adding a new target without updating this list
    // breaks the help text. Keep in sync with registry.ts.
    expect(listTargetIds().sort()).toEqual([
      "claude",
      "codex",
      "cursor",
      "hermes",
      "opencode",
    ]);
  });

  describe("opencode target printConfig", () => {
    // opencode is the one we explicitly wired for the user's
    // opencode install in this session, so it gets the most rigorous
    // pin-down.
    const opencode: AgentTarget | undefined = getTarget("opencode");
    if (!opencode) throw new Error("opencode target must be registered");

    it("uses the opencode `mcp.<name>` wrapper shape", () => {
      const snippet = opencode.printConfig("global");
      // The snippet must be valid JSON with the opencode wrapper.
      // opencode uses `mcp.<name>` (not `mcpServers.<name>`) and
      // accepts a string-array `command`.
      const parsed = JSON.parse(snippet.split("\n\n")[1] ?? "");
      expect(parsed).toEqual({
        $schema: "https://opencode.ai/config.json",
        mcp: {
          aide: {
            type: "local",
            command: ["aide", "mcp", "serve"],
            enabled: true,
          },
        },
      });
    });

    it("writes the global config under `~/.config/opencode/` on all platforms", () => {
      // opencode's own docs (https://opencode.ai/docs/config) state
      // the global config lives at `~/.config/opencode/opencode.json`
      // on every platform — there is no Windows `%APPDATA%` variant.
      // A previous version of the installer used `%APPDATA%/opencode`
      // on Windows, which silently wrote to a path the user's
      // opencode never reads. Pin the correct path here so any
      // regression that reverts to `%APPDATA%` fails loudly.
      const paths = opencode.describePaths("global");
      // The first path is the config file (opencode.json / .jsonc),
      // the second is the AGENTS.md instructions file. Both must
      // sit under `.config/opencode/`.
      for (const p of paths) {
        // Normalize separators before checking — Windows uses `\`.
        const normalized = p.replace(/\\/g, "/");
        expect(normalized).toContain(".config/opencode/");
        expect(normalized).not.toMatch(/\/AppData\//);
      }
    });
  });

  describe("claude target printConfig", () => {
    const claude: AgentTarget | undefined = getTarget("claude");
    if (!claude) throw new Error("claude target must be registered");

    it("uses the Claude `mcpServers.<name>` shape with stdio transport", () => {
      const snippet = claude.printConfig("global");
      const parsed = JSON.parse(snippet.split("\n\n")[1] ?? "");
      expect(parsed).toEqual({
        mcpServers: {
          aide: {
            type: "stdio",
            command: "aide",
            args: ["mcp", "serve"],
          },
        },
      });
    });
  });

  describe("cursor target printConfig", () => {
    const cursor: AgentTarget | undefined = getTarget("cursor");
    if (!cursor) throw new Error("cursor target must be registered");

    it("uses the Cursor `mcpServers.<name>` shape and injects --path", () => {
      // Cursor launches MCP servers in a cwd that isn't the workspace
      // root, so the installer must inject --path explicitly. This
      // was the bug the file header at cursor.ts was written about.
      const snippet = cursor.printConfig("global");
      const parsed = JSON.parse(snippet.split("\n\n")[1] ?? {});
      expect(parsed.mcpServers.aide.args).toEqual([
        "mcp",
        "serve",
        "--path",
        "${workspaceFolder}",
      ]);
    });
  });

  describe("agent instructions template", () => {
    // The template is the "superpower" load-bearing piece — it tells
    // connected AI agents to call guard_verify after every edit and
    // query the code graph instead of grepping. Tone matters: passive
    // phrasing ("consider using") is consistently ignored by agents,
    // so we pin the MUST / ALWAYS / NEVER imperatives here.
    it("starts and ends with the marker block so it can be re-installed", () => {
      expect(INSTRUCTIONS_TEMPLATE).toMatch(/^<!-- AIDE_START -->/);
      expect(
        INSTRUCTIONS_TEMPLATE.trimEnd().endsWith("<!-- AIDE_END -->"),
      ).toBe(true);
    });

    it("tells the agent to call guard_verify after every code edit (imperative)", () => {
      // The MANDATORY section. If anyone softens this to "consider"
      // or "you may want to", the agent stops auto-verifying and
      // the whole superpower experience collapses.
      expect(INSTRUCTIONS_TEMPLATE).toMatch(/MUST call `?guard_verify`?/i);
      expect(INSTRUCTIONS_TEMPLATE).toMatch(/before reporting the change/i);
    });

    it("tells the agent to query the code graph before claiming a symbol exists", () => {
      expect(INSTRUCTIONS_TEMPLATE).toMatch(/MUST call `?codegraph_query`?/i);
      expect(INSTRUCTIONS_TEMPLATE).toMatch(/kind[\s\S]{0,30}definition/i);
    });

    it("uses imperative language (MUST / ALWAYS / NEVER), not passive guidance", () => {
      // These are the load-bearing words. Soft guidance was the
      // failure mode of the previous template.
      expect(INSTRUCTIONS_TEMPLATE).toContain("MUST");
      // `NEVER` should appear at least once in the anti-patterns.
      expect(INSTRUCTIONS_TEMPLATE.toUpperCase()).toContain("NEVER");
    });

    it("documents all five AIDE MCP tools the server actually exposes", () => {
      // The previous template listed tools that didn't exist on the
      // server, driving agents to call nonexistent tools. Pin the
      // exact five here so the template and the server can't drift.
      for (const tool of [
        "codegraph_index",
        "codegraph_query",
        "guard_verify",
        "guard_check",
        "mind_process",
      ]) {
        expect(INSTRUCTIONS_TEMPLATE).toContain(tool);
      }
    });

    it("points the user at `aide init` when the index is missing", () => {
      // The previous template suggested `aide graph init && aide
      // graph index` (two commands). Now that `aide init` exists, the
      // template should reference the one-shot form.
      expect(INSTRUCTIONS_TEMPLATE).toContain("aide init");
    });
  });
});
