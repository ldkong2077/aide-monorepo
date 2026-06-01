/**
 * @aide/mind — Project understanding & context generation engine.
 * TypeScript rewrite of project-mind.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MindConfig, ChatMessage } from '@aide/core';

export interface ProjectInfo {
  name: string;
  name_cn?: string;
  description: string;
  tech_stack: string[];
  features: string[];
  workflow?: string;
  constraints?: string;
}

export interface ProcessResult {
  success: boolean;
  projectName: string;
  outputPath: string;
  files: Record<string, string>;
}

export interface LLMAdapter {
  chat(messages: ChatMessage[]): Promise<string>;
}

export const IDEA_ORGANIZE_PROMPT = `You are a project architect. Analyze the following idea and return a JSON object with:
- name: kebab-case project name
- name_cn: Chinese project name
- description: clear project description
- tech_stack: array of technologies
- features: array of key features
- workflow: development workflow description
- constraints: any special constraints

User idea:
{user_input}

Return ONLY valid JSON, no markdown.`;

function detectLanguage(techStack: string[]): string {
  const map: Record<string, string> = {
    python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
    java: 'Java', go: 'Go', rust: 'Rust', csharp: 'C#', cpp: 'C++',
  };
  for (const tech of techStack) {
    const lower = tech.toLowerCase();
    for (const [key, lang] of Object.entries(map)) {
      if (lower.includes(key)) return lang;
    }
  }
  return 'TypeScript';
}

function generateClaudeMd(info: ProjectInfo): string {
  return `# ${info.name}\n\n${info.description}\n\n## Tech Stack\n${info.tech_stack.map(t => '- ' + t).join('\n')}\n\n## Features\n${info.features.map(f => '- ' + f).join('\n')}\n`;
}

function generateCodeStandards(language: string): string {
  return `# Code Standards (${language})\n\n## General Guidelines\n- Write clean, readable code\n- Add comments for complex logic\n- Follow ${language} best practices\n- Write tests for critical paths\n`;
}

function generateWorkflowMd(workflow?: string): string {
  return `# Development Workflow\n\n${workflow || 'Standard development workflow: Plan → Implement → Test → Review → Deploy'}\n`;
}

export class ProjectMind {
  private config: MindConfig;
  private adapter: LLMAdapter | null;

  constructor(config: MindConfig, adapter?: LLMAdapter) {
    this.config = config;
    this.adapter = adapter ?? null;
  }

  async processIdea(idea: string, outputDir?: string): Promise<ProcessResult> {
    if (!this.adapter) throw new Error('No LLM adapter configured');

    const prompt = IDEA_ORGANIZE_PROMPT.replace('{user_input}', idea);
    const resultText = await this.adapter.chat([{ role: 'user', content: prompt }]);

    let projectInfo: ProjectInfo;
    try {
      projectInfo = JSON.parse(resultText);
    } catch {
      const match = resultText.match(/\{[\s\S]*\}/);
      if (match) { projectInfo = JSON.parse(match[0]); }
      else { throw new Error('Failed to parse LLM output: ' + resultText.slice(0, 200)); }
    }

    const projectName = projectInfo.name || 'untitled-project';
    const outputPath = path.resolve(outputDir || process.cwd(), projectName);
    const files = this.generateFiles(projectInfo, outputPath);

    return { success: true, projectName, outputPath, files };
  }

  private generateFiles(info: ProjectInfo, outputPath: string): Record<string, string> {
    fs.mkdirSync(outputPath, { recursive: true });
    const files: Record<string, string> = {};
    const lang = detectLanguage(info.tech_stack || []);

    const claudePath = path.join(outputPath, 'CLAUDE.md');
    fs.writeFileSync(claudePath, generateClaudeMd(info), 'utf-8');
    files['CLAUDE.md'] = claudePath;

    const standardsPath = path.join(outputPath, 'CODE_STANDARDS.md');
    fs.writeFileSync(standardsPath, generateCodeStandards(lang), 'utf-8');
    files['CODE_STANDARDS.md'] = standardsPath;

    const workflowPath = path.join(outputPath, 'WORKFLOW.md');
    fs.writeFileSync(workflowPath, generateWorkflowMd(info.workflow), 'utf-8');
    files['WORKFLOW.md'] = workflowPath;

    const promptsDir = path.join(outputPath, 'prompts');
    fs.mkdirSync(promptsDir, { recursive: true });
    const promptPath = path.join(promptsDir, 'initial.md');
    fs.writeFileSync(promptPath, '# Initial Prompt\n\n' + info.description + '\n', 'utf-8');
    files['prompts/initial.md'] = promptPath;

    return files;
  }
}

export const MIND_VERSION = '1.0.0';
