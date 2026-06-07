#!/usr/bin/env node
/**
 * aide — Unified CLI for AI Development Environment
 *
 * @aide-dev/cli exposes the public command surface. The actual business logic
 * lives in the @aide-dev/* packages. This file is intentionally thin: it parses
 * arguments, validates mutual-exclusion, and delegates.
 *
 * Console output here is INTENTIONAL user-facing CLI output (✅/❌ glyphs,
 * chalk-colored banners, error summaries). It is NOT a logger sink. Use
 * direct console calls; do not swap them for a structured logger — that
 * would break the styled terminal UX users see in their terminal.
 */

import { Command, Option } from "commander";
import { CLI_VERSION } from "./index.js";
import { resolveVerifyTarget, type VerifyOpts } from "./verify-target.js";
import { resolve as pathResolve, dirname } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { Language } from "@aide-dev/guard";

const program = new Command();

program
  .name("aide")
  .description("AIDE - AI Development Environment toolkit")
  .version(CLI_VERSION);

// ── graph commands ──────────────────────────────────────────
const graph = program.command("graph").description("Code graph operations");

graph
  .command("init")
  .description("Initialize code graph in current project")
  .option("-p, --path <dir>", "Project path", ".")
  .action(async (opts) => {
    const { CodeGraph } = await import("@aide-dev/graph");
    await CodeGraph.init(opts.path);
    console.log("Code graph initialized at", opts.path);
  });

graph
  .command("index")
  .description("Index the codebase")
  .option("-p, --path <dir>", "Project path", ".")
  .action(async (opts) => {
    const { CodeGraph } = await import("@aide-dev/graph");
    const cg = await CodeGraph.init(opts.path);
    await cg.indexAll();
    console.log("Indexing complete.");
  });

graph
  .command("status")
  .description("Show graph status")
  .action(async () => {
    const { CodeGraph } = await import("@aide-dev/graph");
    console.log("Initialized:", CodeGraph.isInitialized("."));
  });

// ── guard commands ──────────────────────────────────────────
const guard = program.command("guard").description("Code verification");

guard
  .command("verify")
  .description("Verify AI-generated code")
  .addOption(
    new Option(
      "-f, --file <path>",
      "Single file to verify (mutually exclusive with --files/--pattern/--path/--staged/--base)",
    ),
  )
  .addOption(
    new Option(
      "--files <list>",
      "Comma-separated list of files to verify (mutually exclusive with --file/--pattern/--path/--staged/--base)",
    ),
  )
  .addOption(
    new Option(
      "--pattern <glob>",
      "Glob pattern of files to verify (mutually exclusive with --file/--files/--path/--staged/--base)",
    ),
  )
  .addOption(
    new Option(
      "-p, --path <dir>",
      "Project directory to verify (mutually exclusive with --file/--files/--pattern/--staged/--base)",
    ),
  )
  .addOption(
    new Option(
      "--staged",
      "Verify git staged changes (mutually exclusive with --file/--files/--pattern/--path/--base)",
    ),
  )
  .addOption(
    new Option("--base <ref>", "Git base ref for diff (implies --diff mode)"),
  )
  .addOption(
    new Option("--head <ref>", "Git head ref for diff (defaults to HEAD)"),
  )
  .option("--no-test", "Skip test execution")
  .option("--format <fmt>", "Output format (console|json|markdown)", "console")
  .action(
    async (
      opts: VerifyOpts & {
        noTest?: boolean;
        format?: "console" | "json" | "markdown";
      },
    ) => {
      const baseOverride = opts.base;
      const headOverride = opts.head;

      try {
        const target = await resolveVerifyTarget(
          opts,
          baseOverride,
          headOverride,
        );
        const {
          Verifier,
          formatConsoleReport,
          formatJSONReport,
          formatMarkdownReport,
        } = await import("@aide-dev/guard");
        const verifier = new Verifier();
        const formatters: Record<string, (r: unknown) => string> = {
          console: formatConsoleReport as (r: unknown) => string,
          json: formatJSONReport as (r: unknown) => string,
          markdown: formatMarkdownReport as (r: unknown) => string,
        };

        let worstVerdict: "TRUST" | "REVIEW" | "REJECT" = "TRUST";

        if (target.kind === "file" || target.kind === "files") {
          // Per-file verification: consistent with the MCP guard_verify handler.
          const files = target.kind === "file" ? [target.file] : target.files;
          for (const file of files) {
            const report = await verifier.verify({
              file,
              noTest: opts.noTest,
              format: opts.format,
            });
            const out =
              formatters[opts.format ?? "console"]?.(report) ??
              formatConsoleReport(report);
            console.log(out);
            if (report.confidence.verdict === "REJECT") worstVerdict = "REJECT";
            else if (
              report.confidence.verdict === "REVIEW" &&
              worstVerdict === "TRUST"
            )
              worstVerdict = "REVIEW";
          }
        } else if (target.kind === "path") {
          const report = await verifier.verify({
            path: target.path,
            noTest: opts.noTest,
            format: opts.format,
          });
          const out =
            formatters[opts.format ?? "console"]?.(report) ??
            formatConsoleReport(report);
          console.log(out);
          worstVerdict = report.confidence.verdict;
        } else if (target.kind === "staged") {
          const report = await verifier.verify({
            staged: true,
            noTest: opts.noTest,
            format: opts.format,
          });
          const out =
            formatters[opts.format ?? "console"]?.(report) ??
            formatConsoleReport(report);
          console.log(out);
          worstVerdict = report.confidence.verdict;
        } else {
          // diff
          const report = await verifier.verify({
            diff: { base: target.base, head: target.head },
            noTest: opts.noTest,
            format: opts.format,
          });
          const out =
            formatters[opts.format ?? "console"]?.(report) ??
            formatConsoleReport(report);
          console.log(out);
          worstVerdict = report.confidence.verdict;
        }

        process.exit(worstVerdict === "REJECT" ? 1 : 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Verification failed: ${msg}`);
        process.exit(1);
      }
    },
  );

guard
  .command("check")
  .description("Run hallucination check on a single file")
  .requiredOption(
    "-f, --file <path>",
    "File to check (must exist and be a regular file)",
  )
  .action(async (opts: { file: string }) => {
    try {
      if (!existsSync(opts.file) || !statSync(opts.file).isFile()) {
        console.error(`❌ --file does not point to a file: ${opts.file}`);
        process.exit(1);
      }
      const { HallucinationDetector } = await import("@aide-dev/guard");
      const { readFile } = await import("node:fs/promises");
      const { extname } = await import("node:path");
      const absFile = pathResolve(opts.file);
      const content = await readFile(absFile, "utf-8");
      const ext = extname(absFile).toLowerCase();
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
      // projectDir is the directory of the file, not process.cwd(): the file
      // may live in a subproject whose test/config files aren't in cwd.
      const projectDir = dirname(absFile);
      const detector = new HallucinationDetector();
      const result = detector.detect(content, language, projectDir);
      if (result.length === 0) {
        console.log("✅ No hallucinations detected");
      } else {
        console.log(`❌ Found ${result.length} hallucination(s):`);
        for (const h of result) {
          console.log(`  [${h.severity}] L${h.line || "?"}: ${h.message}`);
          if (h.suggestion) console.log(`    💡 ${h.suggestion}`);
        }
        process.exit(1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Check failed: ${msg}`);
      process.exit(1);
    }
  });

// ── config commands ─────────────────────────────────────────
const config = program
  .command("config")
  .description("Configuration management");

config
  .command("init")
  .description("Generate default config file")
  .option("-o, --output <dir>", "Output directory", ".")
  .action(async (opts) => {
    const { generateDefaultConfigFile } = await import("@aide-dev/core");
    const p = generateDefaultConfigFile(opts.output);
    console.log("Config file generated at:", p);
  });

config
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    const { loadConfig } = await import("@aide-dev/core");
    const cfg = loadConfig();
    console.log(JSON.stringify(cfg, null, 2));
  });

// ── init command ───────────────────────────────────────
// One-shot bootstrap for a new project: writes the AIDE MCP config
// + AGENTS.md / CLAUDE.md for every detected AI tool, then creates
// `.aide/` and indexes the codebase. This is the "I just want AIDE
// set up here" command — `aide install` is the lower-level piece
// (use it when you want to wire agents globally but skip the graph
// init, or when you want a custom target list without the index
// step).
//
// Equivalent to `aide install --yes --location=local [--target=X]`,
// exposed as a top-level command so the README's quick-start is
// literally one line.
program
  .command("init")
  .description(
    "Initialize AIDE in the current project: configure connected AI tools, " +
      "build the code graph, and index the codebase. Equivalent to " +
      "`aide install --yes --location=local` for the impatient.",
  )
  .option(
    "-y, --yes",
    "Skip every confirm; auto-detect targets, use global permissions, and index in place",
  )
  .option(
    "-t, --target <list>",
    "Comma-separated targets to install for (claude, cursor, codex, opencode, hermes); defaults to auto-detect",
  )
  .action(async (opts: { yes?: boolean; target?: string }) => {
    try {
      const { runInstallerWithOptions } = await import("@aide-dev/graph/installer");
      // `aide init` always runs as a project-local install (writes
      // the per-project .aide/ + project-local AGENTS.md/CLAUDE.md
      // when applicable) and skips the clack prompts by default.
      // Callers can still override the target list explicitly.
      await runInstallerWithOptions({
        yes: true,
        location: "local",
        ...(opts.target !== undefined ? { target: opts.target } : {}),
        // Mirror the historical default: auto-allow the AIDE MCP
        // tools so the user doesn't have to click "allow" on every
        // invocation. Callers who want stricter behavior can use
        // `aide install --no-auto-allow --location=local` directly.
        autoAllow: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Init failed: ${msg}`);
      process.exit(1);
    }
  });

// ── install command ───────────────────────────────────────
// Auto-detects installed AI coding tools (Claude Code, Cursor, Codex
// CLI, opencode, Hermes Agent) and writes the MCP-server config +
// agent-instructions file for each. Without args it runs the
// interactive @clack/prompts UI; `--yes` skips every confirm and uses
// defaults (target=auto, location=global, autoAllow=true).
//
// Most users want `aide init` instead — this is the lower-level
// command, kept for the case where you want to wire agents globally
// (so they pick up AIDE in every project) without initializing a
// specific project.
program
  .command("install")
  .description(
    "Auto-detect and configure AI coding tools to use the AIDE MCP server",
  )
  .option(
    "-y, --yes",
    "Skip every confirm and use defaults (target=auto, location=global, autoAllow=true)",
  )
  .option(
    "-t, --target <list>",
    "Comma-separated targets: claude, cursor, codex, opencode, hermes; or auto / all / none",
  )
  .option(
    "-l, --location <scope>",
    "Config scope: global (user) or local (project)",
    "global",
  )
  .option(
    "--no-auto-allow",
    "Do not write the agent auto-allow / permissions entries (Claude Code only)",
  )
  .option(
    "--print-config <id>",
    "Print the MCP-server snippet for a target and exit (no writes)",
  )
  .action(
    async (opts: {
      yes?: boolean;
      target?: string;
      location?: "global" | "local";
      autoAllow?: boolean;
      printConfig?: string;
    }) => {
      try {
        const { runInstallerWithOptions, getTarget, listTargetIds } =
          await import("@aide-dev/graph/installer");
        if (opts.printConfig) {
          // Surface the manual-paste snippet without touching disk.
          const loc = opts.location ?? "global";
          const target = getTarget(opts.printConfig);
          if (!target) {
            console.error(
              `❌ Unknown target "${opts.printConfig}". Known: ${listTargetIds().join(", ")}`,
            );
            process.exit(1);
          }
          console.log(target.printConfig(loc));
          return;
        }
        await runInstallerWithOptions({
          ...(opts.yes !== undefined ? { yes: opts.yes } : {}),
          ...(opts.target !== undefined ? { target: opts.target } : {}),
          ...(opts.location !== undefined ? { location: opts.location } : {}),
          // `commander` exposes `--no-auto-allow` as `autoAllow: false`.
          // The installer's contract: `undefined` => ask; explicit bool
          // => honor it. So we forward only when the flag was used.
          ...(opts.autoAllow !== undefined
            ? { autoAllow: opts.autoAllow }
            : {}),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Install failed: ${msg}`);
        process.exit(1);
      }
    },
  );

// ── template command ────────────────────────────────────────
// AIDE Templates — pre-built project templates for quick start.
// Helps non-professional programmers quickly start new projects
// with best practices and proven patterns.
//
// Usage:
//   aide template list
//   aide template info todo-app
//   aide template create todo-app my-project
const template = program
  .command("template")
  .description("Project templates for quick start");

template
  .command("list")
  .description("List all available templates")
  .option(
    "-c, --category <category>",
    "Filter by category (web, api, cli, library, fullstack)",
  )
  .option(
    "-d, --difficulty <difficulty>",
    "Filter by difficulty (beginner, intermediate, advanced)",
  )
  .action(async (opts: { category?: string; difficulty?: string }) => {
    try {
      const { listTemplateIds, getTemplate } = await import("@aide-dev/templates");

      console.log("📋 AIDE Templates");
      console.log("─".repeat(50));

      let templateIds = listTemplateIds();

      // Apply filters
      if (opts.category) {
        const { getTemplatesByCategory } = await import("@aide-dev/templates");
        const filtered = getTemplatesByCategory(opts.category);
        templateIds = filtered.map((t) => t.id);
      }

      if (opts.difficulty) {
        const { getTemplatesByDifficulty } = await import("@aide-dev/templates");
        const filtered = getTemplatesByDifficulty(opts.difficulty);
        templateIds = filtered.map((t) => t.id);
      }

      if (templateIds.length === 0) {
        console.log("   No templates found matching the criteria.");
        return;
      }

      for (const id of templateIds) {
        const tmpl = getTemplate(id);
        if (tmpl) {
          console.log(`\n   ${id}`);
          console.log(`     ${tmpl.config.description}`);
          console.log(
            `     Category: ${tmpl.config.category} | Difficulty: ${tmpl.config.difficulty}`,
          );
          console.log(`     Tech Stack: ${tmpl.config.techStack.join(", ")}`);
          console.log(`     Estimated Time: ${tmpl.config.estimatedTime}`);
        }
      }

      console.log("\n─".repeat(50));
      console.log("💡 Use 'aide template info <id>' for more details");
      console.log(
        "   Use 'aide template create <id> <name>' to create a project",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to list templates: ${msg}`);
      process.exit(1);
    }
  });

template
  .command("info")
  .description("Show detailed information about a template")
  .argument(
    "<template-id>",
    "Template ID (e.g., todo-app, api-server, cli-tool)",
  )
  .action(async (templateId: string) => {
    try {
      const { getTemplate } = await import("@aide-dev/templates");

      const tmpl = getTemplate(templateId);
      if (!tmpl) {
        console.error(`❌ Template "${templateId}" not found.`);
        console.log("   Use 'aide template list' to see available templates.");
        process.exit(1);
      }

      console.log(`📋 Template: ${tmpl.config.name}`);
      console.log("═".repeat(60));
      console.log(`\n📝 Description: ${tmpl.config.description}`);
      console.log(`\n🏷️  Category: ${tmpl.config.category}`);
      console.log(`📊 Difficulty: ${tmpl.config.difficulty}`);
      console.log(`⏱️  Estimated Time: ${tmpl.config.estimatedTime}`);
      console.log(`👨‍💻 Author: ${tmpl.config.author}`);
      console.log(`📦 Version: ${tmpl.config.version}`);

      console.log(`\n🛠️  Tech Stack:`);
      for (const tech of tmpl.config.techStack) {
        console.log(`   - ${tech}`);
      }

      console.log(`\n✨ Features:`);
      for (const feature of tmpl.config.features) {
        console.log(`   - ${feature}`);
      }

      console.log(`\n📁 Files (${tmpl.files.length}):`);
      for (const file of tmpl.files) {
        console.log(`   - ${file.path}: ${file.description}`);
      }

      console.log(`\n🚀 Setup Instructions:`);
      for (let i = 0; i < tmpl.setupInstructions.length; i++) {
        console.log(`   ${i + 1}. ${tmpl.setupInstructions[i]}`);
      }

      console.log(`\n✅ Verification Steps:`);
      for (const step of tmpl.verificationSteps) {
        console.log(`   - ${step}`);
      }

      console.log("\n" + "═".repeat(60));
      console.log(
        "💡 Use 'aide template create <id> <name>' to create a project",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to show template info: ${msg}`);
      process.exit(1);
    }
  });

template
  .command("create")
  .description("Create a new project from a template")
  .argument(
    "<template-id>",
    "Template ID (e.g., todo-app, api-server, cli-tool)",
  )
  .argument("<project-name>", "Project name")
  .option("-o, --output <dir>", "Output directory", ".")
  .action(
    async (
      templateId: string,
      projectName: string,
      opts: { output: string },
    ) => {
      try {
        const { getTemplate, generateFromTemplate } =
          await import("@aide-dev/templates");
        const path = await import("node:path");

        console.log("🚀 AIDE Templates - Create Project");
        console.log("═".repeat(60));

        // Check template exists
        const tmpl = getTemplate(templateId);
        if (!tmpl) {
          console.error(`❌ Template "${templateId}" not found.`);
          console.log(
            "   Use 'aide template list' to see available templates.",
          );
          process.exit(1);
        }

        console.log(`\n📦 Template: ${tmpl.config.name}`);
        console.log(`📝 Description: ${tmpl.config.description}`);
        console.log(`📁 Project: ${projectName}`);
        console.log(`📂 Output: ${opts.output}`);

        // Generate project
        console.log("\n⏳ Generating project...");
        const outputDir = path.join(opts.output, projectName);
        const result = await generateFromTemplate(
          templateId,
          projectName,
          outputDir,
        );

        if (!result.success) {
          console.error(`\n❌ Failed to generate project: ${result.error}`);
          process.exit(1);
        }

        console.log(`\n✅ Project generated successfully!`);
        console.log(`   Created ${result.filesCreated.length} files`);

        console.log("\n" + "═".repeat(60));
        console.log("🚀 Next steps:");
        console.log(`   1. cd ${projectName}`);
        console.log("   2. npm install");
        console.log("   3. Follow the setup instructions in README.md");
        console.log(
          "\n💡 Or use 'aide mind full \"<your idea>\"' for custom projects",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Failed to create project: ${msg}`);
        process.exit(1);
      }
    },
  );

// ── dashboard command ──────────────────────────────────────
// AIDE Dashboard — visual workflow progress tracking.
// Shows flow progress, task status, verification results, and cost tracking.
//
// Usage:
//   aide dashboard
//   aide dashboard --format json
//   aide dashboard --format markdown
//   aide dashboard --view flows
program
  .command("dashboard")
  .description("Visual workflow progress tracking")
  .option(
    "-f, --format <fmt>",
    "Output format (console|json|markdown)",
    "console",
  )
  .option(
    "-v, --view <view>",
    "Dashboard view (overview|flows|tasks|verification|costs)",
    "overview",
  )
  .option("-o, --output <dir>", "Output directory", ".")
  .action(async (opts: { format: string; view: string; output: string }) => {
    try {
      const { createDashboardAPI } = await import("@aide-dev/dashboard");

      console.log("📊 AIDE Dashboard");
      console.log("─".repeat(50));

      const api = createDashboardAPI(opts.output);
      const data = await api.getData();

      let output: string;
      switch (opts.format) {
        case "json":
          output = api.formatJsonOutput(data);
          break;
        case "markdown":
          output = api.formatMarkdownOutput(data);
          break;
        default:
          output = api.formatConsoleOutput(data);
      }

      console.log(output);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Dashboard failed: ${msg}`);
      process.exit(1);
    }
  });

// ── flow command ──────────────────────────────────────────
// AIDE Flow — complete development workflow orchestration.
// Transforms ideas into working code with automated task execution,
// progress tracking, and verification.
//
// Usage:
//   aide flow start "I want to build a blog"
//   aide flow status <flow-id>
//   aide flow list
//   aide flow resume <flow-id>
const flow = program
  .command("flow")
  .description("Complete development workflow orchestration");

flow
  .command("start")
  .description("Start a new development flow from an idea")
  .argument("<idea>", "Your project idea or description")
  .option("-n, --name <name>", "Project name")
  .option("-o, --output <dir>", "Output directory", ".")
  .option("--no-verify", "Skip automatic verification")
  .option("--continue-on-error", "Continue even if a task fails")
  .action(
    async (
      idea: string,
      opts: {
        name?: string;
        output: string;
        verify: boolean;
        continueOnError: boolean;
      },
    ) => {
      try {
        const {
          createFlow,
          executeTask,
          createProgressTracker,
          saveFlowState,
          generateReport,
        } = await import("@aide-dev/flow");
        const {
          exploreProjectContext,
          generateApproaches,
          generateDesign,
          generatePlan,
        } = await import("@aide-dev/mind");

        console.log("🚀 AIDE Flow - Development Workflow");
        console.log("═".repeat(60));
        console.log(`\n💡 Idea: ${idea}\n`);

        // Step 1: Design phase
        console.log("📐 Step 1/3: Generating design...");
        const context = await exploreProjectContext(process.cwd());
        const approaches = generateApproaches(idea, context, {});
        const design = generateDesign(idea, context, {}, approaches[0]);
        console.log(
          `   ✅ Design generated with ${design.sections.length} sections`,
        );

        // Step 2: Plan phase
        console.log("\n📋 Step 2/3: Generating implementation plan...");
        const plan = generatePlan(design);
        console.log(`   ✅ Plan generated with ${plan.tasks.length} tasks`);
        console.log(
          `   ⏱️  Estimated time: ${plan.metadata.totalEstimatedTime}`,
        );

        // Step 3: Execute phase
        console.log("\n⚡ Step 3/3: Starting execution...");

        const projectName =
          opts.name || design.projectName.toLowerCase().replace(/\s+/g, "-");
        const outputDir = opts.output;

        // Create flow state
        const flowState = createFlow({
          idea,
          projectName,
          outputDir,
          autoVerify: opts.verify,
          continueOnError: opts.continueOnError,
          maxRetries: 3,
        });

        // Save initial state
        await saveFlowState(flowState);

        // Create progress tracker
        const tracker = createProgressTracker(flowState);
        tracker.onProgress((_progress) => {
          tracker.printProgress();
        });

        // Execute tasks
        console.log("\n" + "─".repeat(60));
        console.log("📝 Executing tasks...");
        console.log("─".repeat(60) + "\n");

        let hasFailedTask = false;
        for (let i = 0; i < plan.tasks.length; i++) {
          const task = plan.tasks[i];
          console.log(`\n🔄 Task ${i + 1}/${plan.tasks.length}: ${task.title}`);
          console.log(`   ${task.description}`);

          const result = await executeTask(task, outputDir);
          tracker.addTaskResult(result);

          if (result.status === "completed") {
            console.log(`   ✅ Completed`);
          } else if (result.status === "failed") {
            hasFailedTask = true;
            console.log(`   ❌ Failed: ${result.error}`);
            if (!opts.continueOnError) {
              console.log("\n⚠️  Flow stopped due to task failure");
              console.log("   Use --continue-on-error to continue");
              break;
            }
          }

          // Update flow state
          flowState.currentTaskIndex = i + 1;
          await saveFlowState(flowState);
        }

        // Generate report
        console.log("\n" + "═".repeat(60));
        console.log("📊 Generating report...");

        flowState.status = hasFailedTask ? "failed" : "completed";
        flowState.completedAt = new Date().toISOString();
        await saveFlowState(flowState);

        const report = generateReport(
          flowState,
          tracker.getProgress().completedTasks > 0 ? [] : [],
        );

        console.log("\n" + "═".repeat(60));
        if (hasFailedTask) {
          console.log("⚠️  Flow Completed with Failures!");
        } else {
          console.log("🎉 Flow Complete!");
        }
        console.log("═".repeat(60));
        console.log(`\n📊 Summary:`);
        console.log(`   Project: ${projectName}`);
        console.log(
          `   Tasks: ${report.progress.completedTasks}/${report.progress.totalTasks} completed`,
        );
        console.log(`   Duration: ${report.duration}`);

        if (report.recommendations.length > 0) {
          console.log(`\n💡 Recommendations:`);
          for (const rec of report.recommendations) {
            console.log(`   - ${rec}`);
          }
        }

        console.log("\n" + "═".repeat(60));
        console.log("🚀 Next steps:");
        console.log(`   1. cd ${projectName}`);
        console.log("   2. Review the generated code");
        console.log("   3. Run tests: npm test");
        console.log("   4. Start development: npm run dev");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Flow failed: ${msg}`);
        process.exit(1);
      }
    },
  );

flow
  .command("list")
  .description("List all flows")
  .option("-o, --output <dir>", "Output directory", ".")
  .action(async (opts: { output: string }) => {
    try {
      const { listFlowStates } = await import("@aide-dev/flow");

      console.log("📋 AIDE Flows");
      console.log("─".repeat(50));

      const states = await listFlowStates(opts.output);

      if (states.length === 0) {
        console.log("   No flows found.");
        console.log("   Use 'aide flow start <idea>' to create a new flow.");
        return;
      }

      for (const state of states) {
        const icon =
          state.status === "completed"
            ? "✅"
            : state.status === "failed"
              ? "❌"
              : state.status === "running"
                ? "🔄"
                : "⏸️";

        console.log(`\n${icon} ${state.id}`);
        console.log(`   Project: ${state.config.projectName}`);
        console.log(`   Status: ${state.status}`);
        console.log(`   Started: ${state.startedAt}`);
        if (state.completedAt) {
          console.log(`   Completed: ${state.completedAt}`);
        }
      }

      console.log("\n" + "─".repeat(50));
      console.log("💡 Use 'aide flow status <flow-id>' for details");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to list flows: ${msg}`);
      process.exit(1);
    }
  });

flow
  .command("status")
  .description("Show flow status")
  .argument("<flow-id>", "Flow ID")
  .option("-o, --output <dir>", "Output directory", ".")
  .action(async (flowId: string, opts: { output: string }) => {
    try {
      const { loadFlowState } = await import("@aide-dev/flow");

      console.log("📊 Flow Status");
      console.log("─".repeat(50));

      const state = await loadFlowState(flowId, opts.output);

      if (!state) {
        console.error(`❌ Flow "${flowId}" not found.`);
        console.log("   Use 'aide flow list' to see available flows.");
        process.exit(1);
      }

      const icon =
        state.status === "completed"
          ? "✅"
          : state.status === "failed"
            ? "❌"
            : state.status === "running"
              ? "🔄"
              : "⏸️";

      console.log(`\n${icon} Flow: ${state.id}`);
      console.log(`\n📝 Details:`);
      console.log(`   Project: ${state.config.projectName}`);
      console.log(`   Idea: ${state.config.idea}`);
      console.log(`   Status: ${state.status}`);
      console.log(`   Current Step: ${state.currentStep}`);
      console.log(`   Started: ${state.startedAt}`);

      if (state.completedAt) {
        console.log(`   Completed: ${state.completedAt}`);
      }

      if (state.error) {
        console.log(`\n❌ Error:`);
        console.log(`   ${state.error}`);
      }

      console.log("\n" + "─".repeat(50));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to show flow status: ${msg}`);
      process.exit(1);
    }
  });

// ── mind command ──────────────────────────────────────────
// AIDE Mind — transforms ideas into structured designs and implementation plans.
// Inspired by Superpowers' brainstorming skill, this command helps
// non-professional programmers go from idea to working code.
//
// Usage:
//   aide mind brainstorm "I want to build a blog"
//   aide mind plan docs/aide/specs/blog-design.md
//   aide mind full "I want to build a blog"
const mind = program
  .command("mind")
  .description("Project design and planning from ideas");

mind
  .command("brainstorm")
  .description("Interactive brainstorming session to refine your idea")
  .argument("<idea>", "Your project idea or description")
  .option(
    "-o, --output <dir>",
    "Output directory for design documents",
    "docs/aide/specs",
  )
  .action(async (idea: string, _opts: { output: string }) => {
    try {
      const { exploreProjectContext, generateQuestions } =
        await import("@aide-dev/mind");

      console.log("🧠 AIDE Mind - Brainstorming Session");
      console.log("─".repeat(50));
      console.log(`\n💡 Your idea: ${idea}\n`);

      // Create session
      // Step 1: Explore context
      console.log("🔍 Step 1: Exploring project context...");
      const context = await exploreProjectContext(process.cwd());
      console.log(
        `   Detected tech stack: ${context.techStack.join(", ") || "New project"}\n`,
      );

      // Step 2: Generate questions
      console.log("❓ Step 2: Generating clarifying questions...");
      const questions = generateQuestions(idea, context);

      // For CLI, we'll show all questions at once (interactive mode would be in MCP)
      console.log("   I need to understand your requirements better:\n");
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`   ${i + 1}. ${q.question}`);
        if (q.options) {
          console.log(`      Options: ${q.options.join(", ")}`);
        }
        console.log(`      Context: ${q.context}\n`);
      }

      console.log("─".repeat(50));
      console.log("💡 To proceed with design and planning, run:");
      console.log('   aide mind full "' + idea + '"');
      console.log(
        "   This will generate a design document and implementation plan automatically.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Brainstorming failed: ${msg}`);
      process.exit(1);
    }
  });

mind
  .command("plan")
  .description("Generate implementation plan from a design document")
  .argument("[designPath]", "Path to design document")
  .option("-o, --output <dir>", "Output directory for plan", "docs/aide/plans")
  .action(async (designPath: string | undefined, opts: { output: string }) => {
    try {
      const { generatePlan, writePlanDocument } = await import("@aide-dev/mind");
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      console.log("📋 AIDE Mind - Plan Generation");
      console.log("─".repeat(50));

      // If no design path, error out — a real design document is required
      if (!designPath) {
        console.error("❌ No design document provided.");
        console.error("   Usage: aide mind plan <designPath>");
        console.error("   Or use 'aide mind full <idea>' to generate both design and plan.");
        process.exit(1);
      }

      // Read existing design document
      const designContent = await fs.readFile(designPath, "utf-8");
      console.log(`📄 Reading design from: ${designPath}`);

      // Parse design document: extract YAML frontmatter and markdown sections
      let projectName = path.basename(path.dirname(designPath));
      const sections: Array<{ id: string; title: string; content: string }> = [];

      // Extract YAML frontmatter (--- ... ---)
      const frontmatterMatch = designContent.match(/^---\s*\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const fm = frontmatterMatch[1];
        const nameMatch = fm.match(/projectName\s*:\s*["']?(.+?)["']?\s*$/m);
        if (nameMatch) projectName = nameMatch[1].trim();
      }

      // Extract markdown ## headings as sections
      const sectionRegex = /^## (.+)$/gm;
      let secMatch;
      const sectionPositions: Array<{ title: string; index: number }> = [];
      while ((secMatch = sectionRegex.exec(designContent)) !== null) {
        sectionPositions.push({ title: secMatch[1].trim(), index: secMatch.index });
      }
      for (let i = 0; i < sectionPositions.length; i++) {
        const start = sectionPositions[i].index;
        const end = i + 1 < sectionPositions.length ? sectionPositions[i + 1].index : designContent.length;
        const content = designContent.slice(start, end).trim();
        sections.push({
          id: sectionPositions[i].title.toLowerCase().replace(/\s+/g, "-"),
          title: sectionPositions[i].title,
          content,
        });
      }

      // Fallback: if no sections found, use entire content as one section
      if (sections.length === 0) {
        sections.push({
          id: "overview",
          title: "Overview",
          content: designContent,
        });
      }

      const design = {
        projectName,
        idea: sections[0].content.substring(0, 200),
        approaches: [
          {
            id: "default",
            name: "Default Approach",
            description: "Implementation based on the provided design document",
            pros: ["Follows existing design"],
            cons: ["No alternative explored"],
            complexity: "medium" as const,
            estimatedTime: "TBD",
            techStack: [] as string[],
          },
        ],
        selectedApproach: "default",
        sections,
        metadata: {
          createdAt: new Date().toISOString(),
          version: "1.0.0",
          status: "draft" as const,
        },
      };

      const plan = generatePlan(design);
      const outputPath = path.join(opts.output, "plan.md");
      await fs.mkdir(opts.output, { recursive: true });
      await writePlanDocument(plan, opts.output);

      console.log(`✅ Plan generated: ${outputPath}`);
      console.log(`   Tasks: ${plan.tasks.length}`);
      console.log(`   Estimated time: ${plan.metadata.totalEstimatedTime}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Plan generation failed: ${msg}`);
      process.exit(1);
    }
  });

mind
  .command("full")
  .description("Complete flow: brainstorm → design → plan")
  .argument("<idea>", "Your project idea or description")
  .option("-o, --output <dir>", "Output directory", "docs/aide")
  .action(async (idea: string, opts: { output: string }) => {
    try {
      const {
        exploreProjectContext,
        generateQuestions,
        generateApproaches,
        generateDesign,
        generatePlan,
        writeDocuments,
      } = await import("@aide-dev/mind");

      console.log("🧠 AIDE Mind - Complete Design Flow");
      console.log("═".repeat(60));
      console.log(`\n💡 Your idea: ${idea}\n`);

      // Step 1: Explore context
      console.log("🔍 Step 1/7: Exploring project context...");
      const context = await exploreProjectContext(process.cwd());
      console.log(
        `   ✅ Tech stack: ${context.techStack.join(", ") || "New project"}`,
      );

      // Step 2: Generate questions (for display)
      console.log("\n❓ Step 2/7: Generating clarifying questions...");
      const questions = generateQuestions(idea, context);
      console.log(`   ✅ Generated ${questions.length} questions`);

      // Step 3: Generate approaches
      console.log("\n🎯 Step 3/7: Proposing approaches...");
      const approaches = generateApproaches(idea, context, {});
      console.log(`   ✅ Generated ${approaches.length} approaches`);
      for (const approach of approaches) {
        console.log(
          `      - ${approach.name} (${approach.complexity}, ${approach.estimatedTime})`,
        );
      }

      // Step 4: Generate design (using first approach)
      console.log("\n📐 Step 4/7: Generating design document...");
      const design = generateDesign(idea, context, {}, approaches[0]);
      console.log(`   ✅ Generated ${design.sections.length} design sections`);

      // Step 5: Generate plan
      console.log("\n📋 Step 5/7: Generating implementation plan...");
      const plan = generatePlan(design);
      console.log(`   ✅ Generated ${plan.tasks.length} tasks`);
      console.log(`   ⏱️  Estimated time: ${plan.metadata.totalEstimatedTime}`);

      // Step 6: Write documents
      console.log("\n💾 Step 6/7: Writing documents...");
      const { designPath, planPath } = await writeDocuments(
        design,
        plan,
        opts.output,
      );
      console.log(`   ✅ Design: ${designPath}`);
      console.log(`   ✅ Plan: ${planPath}`);

      // Step 7: Summary
      console.log("\n🎉 Step 7/7: Complete!");
      console.log("═".repeat(60));
      console.log("\n📊 Summary:");
      console.log(`   Project: ${design.projectName}`);
      console.log(`   Approach: ${design.approaches[0].name}`);
      console.log(`   Tasks: ${plan.tasks.length}`);
      console.log(`   Estimated time: ${plan.metadata.totalEstimatedTime}`);
      console.log("\n📁 Output files:");
      console.log(`   Design: ${designPath}`);
      console.log(`   Plan: ${planPath}`);
      console.log("\n🚀 Next steps:");
      console.log("   1. Review the design document");
      console.log("   2. Open the plan and start with task_1");
      console.log("   3. Use AIDE's guard_verify to check each task");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Full flow failed: ${msg}`);
      process.exit(1);
    }
  });

// ── mcp command ────────────────────────────────────────────
// Wires up the `@aide-dev/mcp-server` package so `aide mcp serve` brings up
// the stdio MCP server. Configured AI tools (Claude Code, Cursor, …)
// point their `mcpServers` block at this command:
//
//   { "mcpServers": { "aide": { "command": "aide", "args": ["mcp", "serve"] } } }
//
// The transport is stdio, so this command never returns — it stays
// running for as long as the parent process keeps it alive.
const mcp = program.command("mcp").description("Model Context Protocol server");

mcp
  .command("serve")
  .description("Start the MCP server (stdio transport)")
  .action(async () => {
    const { startMCPServer } = await import("@aide-dev/mcp-server");
    await startMCPServer();
  });

program.parse();
