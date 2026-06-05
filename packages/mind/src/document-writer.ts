/**
 * AIDE Mind - Document Writer
 * Writes design and plan documents to disk.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DesignDocument, PlanDocument } from './types.js';
import { formatPlanAsMarkdown } from './writing-plans.js';

/** Format design document as markdown */
export function formatDesignAsMarkdown(design: DesignDocument): string {
  const lines: string[] = [];

  lines.push(`# ${design.projectName} - 设计文档`);
  lines.push('');
  lines.push(`**生成时间**: ${design.metadata.createdAt}`);
  lines.push(`**版本**: ${design.metadata.version}`);
  lines.push(`**状态**: ${design.metadata.status}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Project overview
  lines.push('## 项目概述');
  lines.push('');
  lines.push(`**项目名称**: ${design.projectName}`);
  lines.push(`**项目描述**: ${design.idea}`);
  lines.push('');

  // Approaches
  if (design.approaches.length > 0) {
    lines.push('## 技术方案');
    lines.push('');
    for (const approach of design.approaches) {
      lines.push(`### ${approach.name}`);
      lines.push('');
      lines.push(approach.description);
      lines.push('');
      lines.push(`**复杂度**: ${approach.complexity}`);
      lines.push(`**预计时间**: ${approach.estimatedTime}`);
      lines.push(`**技术栈**: ${approach.techStack.join(', ')}`);
      lines.push('');
      if (approach.pros.length > 0) {
        lines.push('**优点**:');
        for (const pro of approach.pros) {
          lines.push(`- ${pro}`);
        }
        lines.push('');
      }
      if (approach.cons.length > 0) {
        lines.push('**缺点**:');
        for (const con of approach.cons) {
          lines.push(`- ${con}`);
        }
        lines.push('');
      }
    }
  }

  // Design sections
  for (const section of design.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.content);
    lines.push('');

    if (section.subsections) {
      for (const subsection of section.subsections) {
        lines.push(`### ${subsection.title}`);
        lines.push('');
        lines.push(subsection.content);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/** Ensure directory exists */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/** Write design document to disk */
export async function writeDesignDocument(
  design: DesignDocument,
  outputDir: string,
): Promise<string> {
  await ensureDir(outputDir);

  const fileName = `${design.projectName.toLowerCase().replace(/\s+/g, '-')}-design.md`;
  const filePath = path.join(outputDir, fileName);

  const content = formatDesignAsMarkdown(design);
  await fs.writeFile(filePath, content, 'utf-8');

  return filePath;
}

/** Write plan document to disk */
export async function writePlanDocument(
  plan: PlanDocument,
  outputDir: string,
): Promise<string> {
  await ensureDir(outputDir);

  const fileName = `${plan.projectName.toLowerCase().replace(/\s+/g, '-')}-plan.md`;
  const filePath = path.join(outputDir, fileName);

  const content = formatPlanAsMarkdown(plan);
  await fs.writeFile(filePath, content, 'utf-8');

  return filePath;
}

/** Write both design and plan documents */
export async function writeDocuments(
  design: DesignDocument,
  plan: PlanDocument,
  outputDir: string,
): Promise<{ designPath: string; planPath: string }> {
  const designPath = await writeDesignDocument(design, outputDir);
  const planPath = await writePlanDocument(plan, outputDir);

  return { designPath, planPath };
}
