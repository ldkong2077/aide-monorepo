/**
 * MCP prompt templates for the AIDE server.
 *
 * Prompts are reusable message templates the MCP client (e.g. Claude Code,
 * Cursor) can surface to the user. Each prompt composes the server's
 * tools into a guided workflow — the prompt text tells the model WHEN
 * to call which tool, so the user gets a coherent experience without
 * having to chain tool calls manually.
 *
 * Format reference:
 *   https://modelcontextprotocol.io/specification/draft/server/prompts
 */
import type {
  Prompt,
  PromptMessage,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * The prompt catalogue. Adding a prompt here is enough to make it
 * discoverable via `prompts/list`; the actual messages are produced
 * lazily inside {@link renderPrompt} so argument interpolation can
 * depend on user input.
 */
export const PROMPTS: Prompt[] = [
  {
    name: "code-review-with-aide",
    description:
      "Run a comprehensive AI-generated code review: verify hallucinations, " +
      "cross-check the code graph for missing references, and report findings.",
    arguments: [
      {
        name: "files",
        description: "Comma-separated list of files to review",
        required: true,
      },
      {
        name: "project",
        description: "Project root path (defaults to current directory)",
        required: false,
      },
    ],
  },
  {
    name: "find-symbol-with-graph",
    description:
      "Search the code graph for a symbol and summarise its callers, callees, " +
      "and definition. Useful before editing to understand blast radius.",
    arguments: [
      {
        name: "symbol",
        description: 'Symbol name to look up (e.g. "createProxyServer")',
        required: true,
      },
      {
        name: "project",
        description: "Project root path (defaults to current directory)",
        required: false,
      },
    ],
  },
  {
    name: "verify-and-fix",
    description:
      "Verify a file for hallucinations, then draft a fix for every reported issue. " +
      "Uses guard_verify, then writes a focused patch to the same file with an explanation.",
    arguments: [
      {
        name: "file",
        description: "File path to verify and fix",
        required: true,
      },
    ],
  },
  {
    name: "index-and-summarise",
    description:
      "Index the project with the code graph, then return a one-paragraph summary " +
      "of the codebase structure (entry points, key modules, language breakdown).",
    arguments: [
      {
        name: "project",
        description: "Project root path (defaults to current directory)",
        required: false,
      },
    ],
  },
];

/**
 * Render a prompt's messages for a `prompts/get` request. Returns null
 * when the prompt name is unknown (the caller will surface the error).
 *
 * The text intentionally references the EXACT tool names the server
 * exposes (`guard_verify`, `codegraph_query`, `codegraph_index`, …) so
 * a model reading the prompt text knows what to call.
 */
export function renderPrompt(
  name: string,
  args: Record<string, string> = {},
): GetPromptResult | null {
  switch (name) {
    case "code-review-with-aide":
      return buildCodeReviewPrompt(args);
    case "find-symbol-with-graph":
      return buildFindSymbolPrompt(args);
    case "verify-and-fix":
      return buildVerifyAndFixPrompt(args);
    case "index-and-summarise":
      return buildIndexAndSummarisePrompt(args);
    default:
      return null;
  }
}

function userMsg(text: string): PromptMessage {
  return { role: "user", content: { type: "text", text } };
}

function buildCodeReviewPrompt(args: Record<string, string>): GetPromptResult {
  const files = args.files ?? "";
  const project = args.project ?? ".";
  const filesList = files
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const text = [
    "You are reviewing AI-generated code in this AIDE project.",
    "",
    "Workflow:",
    `1. For each file in: ${filesList.join(", ") || "<no files supplied>"}:`,
    '   a. Call the `guard_verify` tool with { "file": "<path>" }. This detects',
    "      hallucinations, missing imports, and fabricated APIs.",
    "   b. If `guard_verify` reports missing references, call `codegraph_query`",
    '      with kind="definition" to check whether the symbol actually exists in the',
    '      codebase (under project="' + project + '").',
    "2. Summarise findings as:",
    "   - Critical issues (must fix)",
    "   - Warnings (should fix)",
    "   - Notes (informational)",
    "3. For each critical issue, propose a concrete patch — do NOT modify files",
    "   automatically; let the user confirm.",
    "",
    "Stay grounded in the actual tool output. Do not invent API names.",
  ].join("\n");
  return {
    description: "Comprehensive AI-generated code review using AIDE tools",
    messages: [userMsg(text)],
  };
}

function buildFindSymbolPrompt(args: Record<string, string>): GetPromptResult {
  const symbol = args.symbol ?? "";
  const project = args.project ?? ".";
  const text = [
    `Find every occurrence of \`${symbol}\` in the AIDE project at \`${project}\`.`,
    "",
    "Steps:",
    `1. Call \`codegraph_query\` with { "query": "${symbol}", "kind": "definition" } to find the canonical definition.`,
    `2. Call \`codegraph_query\` with { "query": "${symbol}", "kind": "reference" } to find all usages.`,
    "3. Present a short report:",
    "   - Where the symbol is defined (file + line)",
    "   - A bulleted list of call sites, grouped by file",
    "   - Any callers that look unused, suspicious, or out-of-pattern",
    "",
    "If the graph has not been indexed yet, suggest running `codegraph_index` first.",
  ].join("\n");
  return {
    description: `Find the definition and usages of \`${symbol}\``,
    messages: [userMsg(text)],
  };
}

function buildVerifyAndFixPrompt(
  args: Record<string, string>,
): GetPromptResult {
  const file = args.file ?? "";
  const text = [
    `Verify the file \`${file}\` for hallucinations and propose fixes.`,
    "",
    "Steps:",
    `1. Call \`guard_verify\` with { "file": "${file}" }.`,
    "2. If the report is clean, stop and tell the user so.",
    "3. For each reported issue:",
    "   a. State the issue in one sentence.",
    "   b. Propose a minimal patch (a unified-diff style block, not a rewrite).",
    "   c. Explain WHY the patch is correct — reference the guard message and",
    "      any local code context.",
    "4. After listing all fixes, ask the user to confirm before applying.",
    "",
    "Never apply changes without explicit user approval.",
  ].join("\n");
  return {
    description: `Verify ${file} and draft fixes`,
    messages: [userMsg(text)],
  };
}

function buildIndexAndSummarisePrompt(
  args: Record<string, string>,
): GetPromptResult {
  const project = args.project ?? ".";
  const text = [
    `Index the AIDE project at \`${project}\` and produce a short summary.`,
    "",
    "Steps:",
    `1. Call \`codegraph_index\` with { "path": "${project}" } if the graph may be stale.`,
    `2. Call \`codegraph_query\` with { "query": "*", "kind": "symbol" } to enumerate entry points.`,
    "3. Produce ONE paragraph (≤ 120 words) covering:",
    "   - The primary entry point(s) — typically a CLI bin or HTTP server",
    "   - The 2–3 most-imported modules",
    "   - The dominant language(s)",
    "   - One sentence on what the project does, in plain English",
    "",
    "Keep the summary tight. Users want a TL;DR, not a tour.",
  ].join("\n");
  return {
    description: "Index the project and produce a one-paragraph summary",
    messages: [userMsg(text)],
  };
}
