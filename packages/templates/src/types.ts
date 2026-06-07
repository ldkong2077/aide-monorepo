/**
 * AIDE Templates - Type Definitions
 * Types for project templates.
 */

/** Template category */
export type TemplateCategory = "web" | "api" | "cli" | "library" | "fullstack";

/** Template difficulty level */
export type TemplateDifficulty = "beginner" | "intermediate" | "advanced";

/** Template file */
export interface TemplateFile {
  path: string;
  content: string;
  description: string;
  isRequired: boolean;
}

/** Template configuration */
export interface TemplateConfig {
  name: string;
  description: string;
  category: TemplateCategory;
  difficulty: TemplateDifficulty;
  techStack: string[];
  features: string[];
  estimatedTime: string;
  author: string;
  version: string;
}

/** Project template */
export interface ProjectTemplate {
  id: string;
  config: TemplateConfig;
  files: TemplateFile[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  setupInstructions: string[];
  verificationSteps: string[];
}

/** Template selection */
export interface TemplateSelection {
  templateId: string;
  projectName: string;
  outputDir: string;
  customizations?: Record<string, string>;
}

/** Template generation result */
export interface TemplateGenerationResult {
  success: boolean;
  projectName: string;
  templateId: string;
  outputDir: string;
  filesCreated: string[];
  nextSteps: string[];
  error?: string;
}
