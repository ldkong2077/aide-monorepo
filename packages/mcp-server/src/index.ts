/**
 * @aide-dev/mcp-server — Unified MCP server exposing tools from all aide packages.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { resolveSafePath, resolveSafePaths } from "./safe-path.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./version.js";
import { PROMPTS, renderPrompt } from "./prompts.js";
import { RESOURCES, readResource } from "./resources.js";
import { installShutdownHandlers } from "./shutdown.js";
import {
  codegraphIndexArgsSchema,
  codegraphQueryArgsSchema,
  guardVerifyArgsSchema,
  guardCheckArgsSchema,
  mindProcessArgsSchema,
  type CodegraphIndexArgs,
  type CodegraphQueryArgs,
  type GuardVerifyArgs,
  type GuardCheckArgs,
  type MindProcessArgs,
} from "./schemas.js";
import { z } from "zod";
import { promises as fsp } from "node:fs";
import { extname, resolve as pathResolve } from "node:path";
import type { Language } from "@aide-dev/guard";

export interface AideMCPConfig {
  enableGraph?: boolean;
  enableGuard?: boolean;
}

const TOOLS: Tool[] = [
  {
    name: "codegraph_index",
    description: "Build or update the code graph for the current project",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root path" },
      },
    },
  },
  {
    name: "codegraph_query",
    description: "Query the code graph for symbols, references, or definitions",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        kind: {
          type: "string",
          enum: ["symbol", "reference", "definition"],
          description: "Query type",
        },
        path: { type: "string", description: "Project root path" },
      },
      required: ["query"],
    },
  },
  {
    name: "guard_verify",
    description: "Verify AI-generated code for hallucinations and correctness",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Single file path to verify" },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Multiple file paths to verify",
        },
        noTest: { type: "boolean", description: "Skip test execution" },
      },
      anyOf: [{ required: ["file"] }, { required: ["files"] }],
    },
  },
  {
    name: "guard_check",
    description: "Run hallucination check on a single file",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "File path to check" },
      },
      required: ["file"],
    },
  },
  {
    name: "mind_process",
    description:
      "Scaffolding a new project from a description - transforms ideas into structured designs and implementation plans",
    inputSchema: {
      type: "object",
      properties: {
        idea: { type: "string", description: "Project idea or description" },
        outputDir: {
          type: "string",
          description: "Output directory for specs/plans (default: docs/aide)",
        },
        mode: {
          type: "string",
          enum: ["brainstorm", "plan", "full"],
          description:
            "Processing mode: brainstorm (Q&A only), plan (generate plan from design), full (complete flow)",
        },
        sessionId: {
          type: "string",
          description: "Continue an existing brainstorming session",
        },
      },
      required: ["idea"],
    },
  },
];

/**
 * Reusable error shape returned to the MCP client. ZodError is broken down
 * into a structured `code: 'ZOD_ERROR'` payload so the client knows it's a
 * validation failure rather than a runtime error.
 */
function formatToolError(err: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  if (err instanceof z.ZodError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { code: "ZOD_ERROR", issues: err.issues },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export async function startMCPServer(
  _config: AideMCPConfig = {},
): Promise<void> {
  const server = new Server(
    { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    // Declare every capability the server actually implements. Clients
    // inspect this map during `initialize` to decide which methods they
    // are allowed to call (e.g. `prompts/list` is only valid when the
    // server advertises `prompts: {}`).
    { capabilities: { tools: {}, prompts: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // ── Prompts ───────────────────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS,
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = renderPrompt(name, (args ?? {}) as Record<string, string>);
    if (!result) {
      throw new Error(`Unknown prompt: ${name}`);
    }
    return result;
  });

  // ── Resources ────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const result = await readResource(uri);
    if (!result) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    return result;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;

    try {
      switch (name) {
        case "codegraph_index":
          return await handleCodegraphIndex(rawArgs);
        case "codegraph_query":
          return await handleCodegraphQuery(rawArgs);
        case "guard_verify":
          return await handleGuardVerify(rawArgs);
        case "guard_check":
          return await handleGuardCheck(rawArgs);
        case "mind_process":
          return await handleMindProcess(rawArgs);
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      return formatToolError(err);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The MCP transport runs on stdio. Anything written to stdout (including
  // most loggers, which default to stdout) corrupts the protocol — so we
  // intentionally use console.error (stderr) here. Do not "fix" this to a
  // structured logger without verifying its transport target.

  console.error("AIDE MCP server started on stdio");

  // Install signal handlers for graceful shutdown. The MCP SDK's `Server`
  // exposes `close()` which drains in-flight requests before resolving;
  // a 5-second watchdog (configurable in `installShutdownHandlers`) ensures
  // we never block forever on a stuck connection.
  installShutdownHandlers(server);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleCodegraphIndex(rawArgs: unknown) {
  const args: CodegraphIndexArgs = codegraphIndexArgsSchema.parse(
    rawArgs ?? {},
  );
  const { CodeGraph } = await import("@aide-dev/graph");
  const requestedPath = args.path ?? ".";
  const safePath = await resolveSafePath(requestedPath, { mustExist: true });
  const cg = await CodeGraph.init(safePath);
  await cg.indexAll();
  return { content: [{ type: "text", text: "Indexing complete." }] };
}

async function handleCodegraphQuery(rawArgs: unknown) {
  const args: CodegraphQueryArgs = codegraphQueryArgsSchema.parse(
    rawArgs ?? {},
  );
  const { CodeGraph } = await import("@aide-dev/graph");
  const requestedPath = args.path ?? ".";
  const safePath = await resolveSafePath(requestedPath, { mustExist: true });
  const cg = await CodeGraph.open(safePath);
  switch (args.kind) {
    case "symbol":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(cg.searchNodes(args.query), null, 2),
          },
        ],
      };
    case "reference":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(cg.findUsages(args.query), null, 2),
          },
        ],
      };
    case "definition":
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(cg.getContext(args.query), null, 2),
          },
        ],
      };
  }
}

async function handleGuardVerify(rawArgs: unknown) {
  // Zod transforms `{ file }` into `{ files: [file] }` after validation.
  const args: GuardVerifyArgs = guardVerifyArgsSchema.parse(rawArgs ?? {});
  const { Verifier } = await import("@aide-dev/guard");
  // Every file must resolve to a real path under the project root.
  // `args.files` is guaranteed non-empty by the schema.
  const safeFiles = await resolveSafePaths(args.files, { mustExist: true });
  const verifier = new Verifier();

  // Per-file verification: the upstream `Verifier.verify({ file })` is the
  // canonical entry point for a single file. The previous implementation
  // incorrectly joined file paths with commas and passed the result as a
  // directory `path`, which was both wrong and a security smell.
  const reports: { file: string; report: unknown; error?: string }[] = [];
  for (const safeFile of safeFiles) {
    try {
      const report = await verifier.verify({
        file: safeFile,
        noTest: args.noTest,
      });
      reports.push({ file: safeFile, report });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      reports.push({ file: safeFile, report: null, error: message });
    }
  }
  return {
    content: [{ type: "text", text: JSON.stringify(reports, null, 2) }],
  };
}

async function handleGuardCheck(rawArgs: unknown) {
  const args: GuardCheckArgs = guardCheckArgsSchema.parse(rawArgs ?? {});
  const { HallucinationDetector } = await import("@aide-dev/guard");
  // Validate path is within project root BEFORE reading (defense in depth).
  const safeFilePath = await resolveSafePath(args.file, { mustExist: true });
  // Async I/O — non-blocking.
  const content = await fsp.readFile(safeFilePath, "utf-8");
  const ext = extname(safeFilePath).toLowerCase();
  const langMap: Record<string, Language> = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".go": "go",
    ".java": "java",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".swift": "swift",
    ".cs": "csharp",
  };
  const language: Language = langMap[ext] ?? "unknown";
  const projectDir = pathResolve(safeFilePath, "..");
  const detector = new HallucinationDetector();
  const result = detector.detect(content, language, projectDir);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { file: safeFilePath, hallucinations: result },
          null,
          2,
        ),
      },
    ],
  };
}

async function handleMindProcess(rawArgs: unknown) {
  const args: MindProcessArgs = mindProcessArgsSchema.parse(rawArgs ?? {});
  const {
    createSession,
    processStep,
    generatePlan,
    generateDesign,
    exploreProjectContext,
    generateApproaches,
    writeDocuments,
  } = await import("@aide-dev/mind");

  // Create or resume session
  const session = args.sessionId
    ? {
        id: args.sessionId,
        idea: args.idea,
        currentStep: "ask_questions" as const,
        questions: [],
        answers: {},
        approaches: [],
        startedAt: new Date().toISOString(),
      }
    : createSession(args.idea);

  // Process based on mode
  switch (args.mode) {
    case "brainstorm": {
      const result = await processStep(session);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
    case "plan": {
      // Generate plan from idea
      const context = await exploreProjectContext(process.cwd());
      const approaches = generateApproaches(args.idea, context, {});
      const design = generateDesign(args.idea, context, {}, approaches[0]);
      const plan = generatePlan(design);
      return {
        content: [
          { type: "text", text: JSON.stringify({ plan, session }, null, 2) },
        ],
      };
    }
    case "full":
    default: {
      // Full flow: explore -> questions -> approaches -> design -> plan
      const context = await exploreProjectContext(process.cwd());
      const approaches = generateApproaches(args.idea, context, {});
      const design = generateDesign(args.idea, context, {}, approaches[0]);
      const plan = generatePlan(design);

      // Write documents
      const { resolveSafePath } = await import("./safe-path.js");
      const outputDir = await resolveSafePath(args.outputDir, {
        mustExist: false,
      });
      const { designPath, planPath } = await writeDocuments(
        design,
        plan,
        outputDir,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `项目设计完成！\n\n设计文档: ${designPath}\n实施计划: ${planPath}`,
                designPath,
                planPath,
                tasksCount: plan.tasks.length,
                estimatedTime: plan.metadata.totalEstimatedTime,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  }
}

export { PACKAGE_VERSION as MCP_VERSION };
