/**
 * @aide/mind - Project Understanding Engine Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectMind, IDEA_ORGANIZE_PROMPT } from './index.js';
import type { LLMAdapter } from './index.js';

describe('ProjectMind', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-mind-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('processIdea', () => {
    it('throws when no LLM adapter configured', async () => {
      const mind = new ProjectMind({ enabled: true, defaultModel: 'deepseek' });
      await expect(mind.processIdea('build a blog')).rejects.toThrow('No LLM adapter configured');
    });

    it('processes idea and generates files', async () => {
      const mockAdapter: LLMAdapter = {
        chat: async () => JSON.stringify({
          name: 'test-blog',
          name_cn: '测试博客',
          description: 'A test blog project',
          tech_stack: ['TypeScript', 'React'],
          features: ['Posts', 'Comments'],
          workflow: 'Plan → Code → Test',
        }),
      };

      const mind = new ProjectMind({ enabled: true, defaultModel: 'deepseek' }, mockAdapter);
      const result = await mind.processIdea('build a blog', tmpDir);

      expect(result.success).toBe(true);
      expect(result.projectName).toBe('test-blog');
      expect(result.outputPath).toContain('test-blog');
      expect(Object.keys(result.files)).toContain('CLAUDE.md');
      expect(Object.keys(result.files)).toContain('CODE_STANDARDS.md');
      expect(Object.keys(result.files)).toContain('WORKFLOW.md');
      expect(Object.keys(result.files)).toContain('prompts/initial.md');

      // Verify files were actually created
      expect(fs.existsSync(result.files['CLAUDE.md'])).toBe(true);
      expect(fs.existsSync(result.files['CODE_STANDARDS.md'])).toBe(true);
      expect(fs.existsSync(result.files['WORKFLOW.md'])).toBe(true);
    });

    it('handles non-JSON LLM output with regex fallback', async () => {
      const mockAdapter: LLMAdapter = {
        chat: async () => `Here is the project plan:
{
  "name": "regex-test",
  "name_cn": "正则测试",
  "description": "Test regex extraction",
  "tech_stack": ["Python"],
  "features": ["Feature 1"]
}
That's the plan.`,
      };

      const mind = new ProjectMind({ enabled: true, defaultModel: 'deepseek' }, mockAdapter);
      const result = await mind.processIdea('test', tmpDir);

      expect(result.success).toBe(true);
      expect(result.projectName).toBe('regex-test');
    });

    it('throws on completely invalid LLM output', async () => {
      const mockAdapter: LLMAdapter = {
        chat: async () => 'This is not JSON at all and has no curly braces',
      };

      const mind = new ProjectMind({ enabled: true, defaultModel: 'deepseek' }, mockAdapter);
      await expect(mind.processIdea('test', tmpDir)).rejects.toThrow('Failed to parse LLM output');
    });

    it('detects language from tech stack', async () => {
      const mockAdapter: LLMAdapter = {
        chat: async () => JSON.stringify({
          name: 'py-project',
          description: 'Python project',
          tech_stack: ['Python', 'FastAPI'],
          features: ['API'],
        }),
      };

      const mind = new ProjectMind({ enabled: true, defaultModel: 'deepseek' }, mockAdapter);
      const result = await mind.processIdea('build an API', tmpDir);

      // CODE_STANDARDS.md should mention Python
      const standardsContent = fs.readFileSync(result.files['CODE_STANDARDS.md'], 'utf-8');
      expect(standardsContent).toContain('Python');
    });
  });
});

describe('IDEA_ORGANIZE_PROMPT', () => {
  it('contains placeholder for user input', () => {
    expect(IDEA_ORGANIZE_PROMPT).toContain('{user_input}');
  });

  it('asks for JSON output', () => {
    expect(IDEA_ORGANIZE_PROMPT).toContain('JSON');
  });

  it('includes all required fields', () => {
    expect(IDEA_ORGANIZE_PROMPT).toContain('name');
    expect(IDEA_ORGANIZE_PROMPT).toContain('description');
    expect(IDEA_ORGANIZE_PROMPT).toContain('tech_stack');
    expect(IDEA_ORGANIZE_PROMPT).toContain('features');
  });
});
