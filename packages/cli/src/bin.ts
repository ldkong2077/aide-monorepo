#!/usr/bin/env node
/**
 * aide — Unified CLI for AI Development Environment
 */
import { Command } from 'commander';
import { CLI_VERSION } from './index.js';

const program = new Command();

program
  .name('aide')
  .description('AIDE - AI Development Environment toolkit')
  .version(CLI_VERSION);

// ── graph commands ──────────────────────────────────────────
const graph = program.command('graph').description('Code graph operations');

graph.command('init')
  .description('Initialize code graph in current project')
  .option('-p, --path <dir>', 'Project path', '.')
  .action(async (opts) => {
    const { CodeGraph } = await import('@aide/graph');
    await CodeGraph.init(opts.path);
    console.log('Code graph initialized at', opts.path);
  });

graph.command('index')
  .description('Index the codebase')
  .option('-p, --path <dir>', 'Project path', '.')
  .action(async (opts) => {
    const { CodeGraph } = await import('@aide/graph');
    const cg = await CodeGraph.init(opts.path);
    await cg.indexAll();
    console.log('Indexing complete.');
  });

graph.command('status')
  .description('Show graph status')
  .action(async () => {
    const { CodeGraph } = await import('@aide/graph');
    console.log('Initialized:', CodeGraph.isInitialized('.'));
  });

// ── guard commands ──────────────────────────────────────────
const guard = program.command('guard').description('Code verification');

guard.command('verify')
  .description('Verify AI-generated code')
  .option('-f, --files <glob>', 'Files to verify', '**/*.{ts,py,go}')
  .option('--base <ref>', 'Git base ref for diff', 'HEAD~1')
  .option('--staged', 'Verify staged changes')
  .option('--no-test', 'Skip test execution')
  .option('--format <fmt>', 'Output format (console|json|markdown)', 'console')
  .action(async (opts) => {
    try {
      const { Verifier, formatConsoleReport, formatJSONReport, formatMarkdownReport } = await import('@aide/guard');
      const verifier = new Verifier();
      const report = await verifier.verify({
        ...(opts.staged ? { staged: true } : { path: opts.files }),
        noTest: opts.noTest,
        format: opts.format,
      });
      const formatters: Record<string, (r: any) => string> = {
        console: formatConsoleReport,
        json: formatJSONReport,
        markdown: formatMarkdownReport,
      };
      console.log(formatters[opts.format]?.(report) ?? formatConsoleReport(report));
      process.exit(report.confidence.verdict === 'REJECT' ? 1 : 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Verification failed: ${msg}`);
      process.exit(1);
    }
  });

guard.command('check')
  .description('Run hallucination check on a single file')
  .option('-f, --file <path>', 'File to check')
  .action(async (opts) => {
    try {
      if (!opts.file) {
        console.error('Error: --file is required');
        process.exit(1);
      }
      const { HallucinationDetector } = await import('@aide/guard');
      const fs = await import('fs');
      const pathMod = await import('path');
      const content = fs.readFileSync(opts.file, 'utf-8');
      const ext = pathMod.extname(opts.file).toLowerCase();
      const langMap: Record<string, string> = {
        '.py': 'python', '.ts': 'typescript', '.tsx': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript', '.go': 'go',
      };
      const language = (langMap[ext] || 'unknown') as import('@aide/guard').Language;
      const projectDir = process.cwd();
      const detector = new HallucinationDetector();
      const result = detector.detect(content, language, projectDir);
      if (result.length === 0) {
        console.log('✅ No hallucinations detected');
      } else {
        console.log(`❌ Found ${result.length} hallucination(s):`);
        for (const h of result) {
          console.log(`  [${h.severity}] L${h.line || '?'}: ${h.message}`);
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

// ── router commands ─────────────────────────────────────────
const router = program.command('router').description('Smart model router');

router.command('start')
  .description('Start the routing proxy server')
  .option('-p, --port <number>', 'Port number', '9900')
  .action(async (opts) => {
    try {
      const { createProxyServer } = await import('@aide/guard');
      const { loadConfig } = await import('@aide/core');
      const config = loadConfig();
      config.server.port = parseInt(opts.port, 10);
      const server = await createProxyServer({ config });
      await server.listen({ port: config.server.port, host: '0.0.0.0' });
      console.log(`🚀 AIDE proxy server running on http://0.0.0.0:${config.server.port}`);
      process.on('SIGINT', async () => {
        console.log('\n⏹️  Shutting down...');
        await server.close();
        process.exit(0);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Failed to start router: ${msg}`);
      process.exit(1);
    }
  });

// ── mind commands ───────────────────────────────────────────
const mind = program.command('mind').description('Project understanding engine');

mind.command('process')
  .description('Process an idea into project files')
  .option('-i, --idea <text>', 'Idea text')
  .option('-o, --output <dir>', 'Output directory', '.')
  .action(async (opts) => {
    try {
      if (!opts.idea) {
        console.error('Error: --idea is required');
        process.exit(1);
      }
      const { ProjectMind } = await import('@aide/mind');
      const { loadConfig } = await import('@aide/core');
      const { ProviderRegistry } = await import('@aide/guard');
      const config = loadConfig();
      // Register enabled providers
      const registry = new ProviderRegistry();
      for (const [name, provConfig] of Object.entries(config.providers)) {
        if (provConfig.enabled && provConfig.apiKey) {
          registry.registerProvider(name, provConfig);
        }
      }
      const provider = registry.getProvider(config.mind.defaultModel);
      if (!provider) {
        console.error(`Provider "${config.mind.defaultModel}" not available. Check your configuration.`);
        process.exit(1);
      }
      // Wrap as LLMAdapter interface
      const adapter = {
        chat: async (messages: import('@aide/core').ChatMessage[]) => {
          const resp = await provider.chatCompletion({
            model: config.mind.defaultModel,
            messages,
          });
          return resp.choices[0]?.message?.content || '';
        },
      };
      const mindEngine = new ProjectMind(config.mind, adapter);
      const result = await mindEngine.processIdea(opts.idea, opts.output);
      console.log(`✅ Project "${result.projectName}" created at ${result.outputPath}`);
      console.log('Generated files:');
      for (const [name, filePath] of Object.entries(result.files)) {
        console.log(`  📄 ${name} → ${filePath}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Mind processing failed: ${msg}`);
      process.exit(1);
    }
  });

// ── config commands ─────────────────────────────────────────
const config = program.command('config').description('Configuration management');

config.command('init')
  .description('Generate default config file')
  .option('-o, --output <dir>', 'Output directory', '.')
  .action(async (opts) => {
    const { generateDefaultConfigFile } = await import('@aide/core');
    const p = generateDefaultConfigFile(opts.output);
    console.log('Config file generated at:', p);
  });

config.command('show')
  .description('Show current configuration')
  .action(async () => {
    const { loadConfig } = await import('@aide/core');
    const cfg = loadConfig();
    console.log(JSON.stringify(cfg, null, 2));
  });

program.parse();
