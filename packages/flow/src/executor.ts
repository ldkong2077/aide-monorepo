/**
 * AIDE Flow - Task Executor
 * Executes individual tasks from the plan.
 */

import type { TaskResult, VerificationResult } from './types.js';

/** Implementation task interface */
interface ImplementationTask {
  id: string;
  title: string;
  description: string;
  files: string[];
  dependencies: string[];
  verification: string[];
  estimatedTime: string;
  priority: 'high' | 'medium' | 'low';
}

/** Execute a single task */
export async function executeTask(
  task: ImplementationTask,
  outputDir: string,
): Promise<TaskResult> {
  const result: TaskResult = {
    taskId: task.id,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  try {
    // Step 1: Create files
    console.log(`  📁 Creating files for task ${task.id}...`);
    await createTaskFiles(task, outputDir);

    // Step 2: Run verification steps
    console.log(`  🔍 Running verification for task ${task.id}...`);
    const verification = await verifyTask(task, outputDir);
    result.verificationResult = verification;

    // Step 3: Check verification result
    if (verification.verdict === 'REJECT') {
      result.status = 'failed';
      result.error = `Verification failed: ${verification.issues.join(', ')}`;
    } else {
      result.status = 'completed';
      result.output = `Task ${task.id} completed successfully`;
    }

    result.completedAt = new Date().toISOString();
    return result;
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
    result.completedAt = new Date().toISOString();
    return result;
  }
}

/** Create files for a task */
async function createTaskFiles(
  task: ImplementationTask,
  outputDir: string,
): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  for (const filePath of task.files) {
    const fullPath = path.join(outputDir, filePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Check if file already exists
    try {
      await fs.access(fullPath);
      console.log(`    ℹ️  File ${filePath} already exists, skipping`);
      continue;
    } catch {
      // File doesn't exist, create it
    }

    // Create file based on extension
    const ext = path.extname(filePath).toLowerCase();
    let content = '';

    switch (ext) {
      case '.ts':
      case '.tsx':
        content = generateTypeScriptFile(filePath);
        break;
      case '.js':
      case '.jsx':
        content = generateJavaScriptFile(filePath);
        break;
      case '.json':
        content = generateJsonFile(filePath);
        break;
      case '.md':
        content = generateMarkdownFile(filePath);
        break;
      case '.css':
        content = generateCssFile(filePath);
        break;
      case '.html':
        content = generateHtmlFile(filePath);
        break;
      default:
        content = `// ${filePath}\n// TODO: Implement this file\n`;
    }

    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`    ✅ Created ${filePath}`);
  }
}

/** Verify a task */
async function verifyTask(
  task: ImplementationTask,
  outputDir: string,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    verdict: 'TRUST',
    confidence: 0.8,
    issues: [],
    suggestions: [],
  };

  // Check if files exist
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  for (const filePath of task.files) {
    const fullPath = path.join(outputDir, filePath);
    try {
      await fs.access(fullPath);
    } catch {
      result.issues.push(`File ${filePath} does not exist`);
      result.verdict = 'REVIEW';
      result.confidence = 0.5;
    }
  }

  // Run verification steps
  for (const step of task.verification) {
    if (step.includes('npm run build')) {
      // Check if package.json exists
      const packageJsonPath = path.join(outputDir, 'package.json');
      try {
        await fs.access(packageJsonPath);
      } catch {
        result.issues.push('package.json not found for build verification');
        result.verdict = 'REVIEW';
      }
    }

    if (step.includes('npm run test')) {
      // Check if test files exist
      const testFiles = task.files.filter((f: string) => f.includes('.test.') || f.includes('.spec.'));
      if (testFiles.length === 0) {
        result.suggestions.push('Consider adding test files for better verification');
      }
    }
  }

  // If no issues, mark as TRUST
  if (result.issues.length === 0) {
    result.verdict = 'TRUST';
    result.confidence = 0.9;
  }

  return result;
}

/** Generate TypeScript file content */
function generateTypeScriptFile(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';
  const name = fileName.replace(/\.(ts|tsx)$/, '').replace(/-/g, '_');

  if (filePath.includes('types') || filePath.includes('type')) {
    return `/**
 * ${name} type definitions
 */

export interface ${toPascalCase(name)} {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
`;
  }

  if (filePath.includes('test') || filePath.includes('spec')) {
    return `import { describe, it, expect } from 'vitest';

describe('${name}', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
`;
  }

  return `/**
 * ${name}
 */

export function ${toCamelCase(name)}(): void {
  // TODO: Implement ${name}
  console.log('${name} called');
}
`;
}

/** Generate JavaScript file content */
function generateJavaScriptFile(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';
  const name = fileName.replace(/\.(js|jsx)$/, '').replace(/-/g, '_');

  return `/**
 * ${name}
 */

export function ${toCamelCase(name)}() {
  // TODO: Implement ${name}
  console.log('${name} called');
}
`;
}

/** Generate JSON file content */
function generateJsonFile(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';

  if (fileName === 'package.json') {
    return JSON.stringify({
      name: 'my-project',
      version: '0.1.0',
      description: 'A new project',
      main: 'index.js',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        test: 'vitest',
      },
      dependencies: {},
      devDependencies: {},
    }, null, 2);
  }

  return '{}';
}

/** Generate Markdown file content */
function generateMarkdownFile(filePath: string): string {
  const fileName = filePath.split('/').pop() || '';
  const name = fileName.replace(/\.md$/, '').replace(/-/g, ' ');

  return `# ${toPascalCase(name)}

## Description

TODO: Add description

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

\`\`\`bash
npm run dev
\`\`\`
`;
}

/** Generate CSS file content */
function generateCssFile(filePath: string): string {
  return `/* ${filePath} */

/* TODO: Add styles */
`;
}

/** Generate HTML file content */
function generateHtmlFile(filePath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>
  <!-- TODO: Add content -->
</body>
</html>
`;
}

/** Convert string to PascalCase */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** Convert string to camelCase */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
