/**
 * @aide-dev/templates - Pre-built project templates for quick start
 *
 * This package provides project templates for AIDE, which help
 * non-professional programmers quickly start new projects.
 *
 * Available templates:
 * - todo-app: A simple TODO application with React
 * - api-server: A RESTful API server with Express
 * - cli-tool: A command-line tool with Commander.js
 * - nextjs-app: A full-stack application with Next.js App Router
 * - fastapi-app: A REST API with FastAPI and SQLAlchemy
 */

// Types
export type {
  TemplateCategory,
  TemplateDifficulty,
  TemplateFile,
  TemplateConfig,
  ProjectTemplate,
  TemplateSelection,
  TemplateGenerationResult,
} from "./types.js";
import type { ProjectTemplate } from "./types.js";

// Templates
import { todoAppTemplate } from "./todo-app/template.js";
import { apiServerTemplate } from "./api-server/template.js";
import { cliToolTemplate } from "./cli-tool/template.js";
import { nextjsAppTemplate } from "./nextjs-app/template.js";
import { fastapiAppTemplate } from "./fastapi-app/template.js";

/** All available templates */
export const templates: Record<string, ProjectTemplate> = {
  "todo-app": todoAppTemplate,
  "api-server": apiServerTemplate,
  "cli-tool": cliToolTemplate,
  "nextjs-app": nextjsAppTemplate,
  "fastapi-app": fastapiAppTemplate,
};

/** Get template by ID */
export function getTemplate(id: string): ProjectTemplate | undefined {
  return templates[id];
}

/** List all template IDs */
export function listTemplateIds(): string[] {
  return Object.keys(templates);
}

/** Get templates by category */
export function getTemplatesByCategory(category: string): ProjectTemplate[] {
  return Object.values(templates).filter((t) => t.config.category === category);
}

/** Get templates by difficulty */
export function getTemplatesByDifficulty(
  difficulty: string,
): ProjectTemplate[] {
  return Object.values(templates).filter(
    (t) => t.config.difficulty === difficulty,
  );
}

/** Replace template variables in a string */
export function replaceTemplateVars(
  content: string,
  vars: Record<string, string>,
): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

/** Generate project from template */
export async function generateFromTemplate(
  templateId: string,
  projectName: string,
  outputDir: string,
): Promise<{
  success: boolean;
  filesCreated: string[];
  error?: string;
}> {
  const template = getTemplate(templateId);
  if (!template) {
    return {
      success: false,
      filesCreated: [],
      error: `Template "${templateId}" not found`,
    };
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const filesCreated: string[] = [];

  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Generate each file
    for (const file of template.files) {
      const filePath = path.join(
        outputDir,
        replaceTemplateVars(file.path, { projectName }),
      );
      const content = replaceTemplateVars(file.content, { projectName });

      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Write file
      await fs.writeFile(filePath, content, "utf-8");
      filesCreated.push(filePath);
    }

    return {
      success: true,
      filesCreated,
    };
  } catch (error) {
    return {
      success: false,
      filesCreated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Re-export templates for direct access
export {
  todoAppTemplate,
  apiServerTemplate,
  cliToolTemplate,
  nextjsAppTemplate,
  fastapiAppTemplate,
};
