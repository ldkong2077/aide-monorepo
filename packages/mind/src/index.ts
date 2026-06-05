/**
 * @aide/mind - Project design and planning from ideas
 *
 * This package provides the Mind module for AIDE, which helps
 * non-professional programmers transform their ideas into
 * structured, implementable designs.
 *
 * Inspired by Superpowers' brainstorming skill, Mind provides:
 * - Interactive Q&A to refine requirements
 * - Multiple approach proposals with trade-offs
 * - Design document generation
 * - Implementation plan generation
 */

// Types
export type {
  MindMode,
  BrainstormStep,
  ClarifyingQuestion,
  ProposedApproach,
  DesignSection,
  DesignDocument,
  ImplementationTask,
  PlanDocument,
  BrainstormSession,
  MindProcessResult,
  ProjectContext,
} from './types.js';

// Brainstorming
export {
  createSession,
  getNextStep,
  exploreProjectContext,
  generateQuestions,
  generateApproaches,
  generateDesign,
  selfReviewDesign,
  processStep,
} from './brainstorming.js';

// Writing Plans
export {
  generatePlan,
  formatPlanAsMarkdown,
} from './writing-plans.js';

// Document Writer
export {
  formatDesignAsMarkdown,
  writeDesignDocument,
  writePlanDocument,
  writeDocuments,
} from './document-writer.js';

// Prompts (for advanced usage)
export {
  MIND_SYSTEM_PROMPT,
  EXPLORE_CONTEXT_PROMPT,
  GENERATE_QUESTIONS_PROMPT,
  PROPOSE_APPROACHES_PROMPT,
  GENERATE_DESIGN_PROMPT,
  SELF_REVIEW_PROMPT,
} from './prompts.js';
