/**
 * AIDE Mind - Type Definitions
 * Types for project design and planning from ideas.
 */

/** Processing mode for mind_process */
export type MindMode = "brainstorm" | "plan" | "full";

/** Brainstorming step */
export type BrainstormStep =
  | "explore_context"
  | "ask_questions"
  | "propose_approaches"
  | "present_design"
  | "write_documents"
  | "self_review"
  | "user_approval"
  | "transition";

/** Clarifying question */
export interface ClarifyingQuestion {
  id: string;
  question: string;
  context: string;
  options?: string[];
  required: boolean;
}

/** Proposed approach */
export interface ProposedApproach {
  id: string;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  complexity: "low" | "medium" | "high";
  estimatedTime: string;
  techStack: string[];
}

/** Design section */
export interface DesignSection {
  id: string;
  title: string;
  content: string;
  subsections?: DesignSection[];
}

/** Design document */
export interface DesignDocument {
  projectName: string;
  idea: string;
  approaches: ProposedApproach[];
  selectedApproach: string;
  sections: DesignSection[];
  metadata: {
    createdAt: string;
    version: string;
    status: "draft" | "review" | "approved";
  };
}

/** Implementation task */
export interface ImplementationTask {
  id: string;
  title: string;
  description: string;
  files: string[];
  dependencies: string[];
  verification: string[];
  estimatedTime: string;
  priority: "high" | "medium" | "low";
}

/** Plan document */
export interface PlanDocument {
  projectName: string;
  designRef: string;
  tasks: ImplementationTask[];
  metadata: {
    createdAt: string;
    version: string;
    totalEstimatedTime: string;
    status: "draft" | "review" | "approved";
  };
}

/** Brainstorming session state */
export interface BrainstormSession {
  id: string;
  idea: string;
  currentStep: BrainstormStep;
  questions: ClarifyingQuestion[];
  answers: Record<string, string>;
  approaches: ProposedApproach[];
  selectedApproach?: string;
  design?: DesignDocument;
  plan?: PlanDocument;
  startedAt: string;
  completedAt?: string;
}

/** Mind process result */
export interface MindProcessResult {
  sessionId: string;
  success: boolean;
  step: BrainstormStep;
  output?: {
    designPath?: string;
    planPath?: string;
    message: string;
  };
  error?: string;
}

/** Project context for brainstorming */
export interface ProjectContext {
  rootPath: string;
  existingFiles: string[];
  techStack: string[];
  packageJson?: Record<string, unknown>;
  readme?: string;
  hasTests: boolean;
  hasCi: boolean;
}
