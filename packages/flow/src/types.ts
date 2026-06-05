/**
 * AIDE Flow - Type Definitions
 * Types for complete development workflow orchestration.
 */

/** Flow status */
export type FlowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** Task status */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** Flow step */
export type FlowStep = 
  | 'init'
  | 'design'
  | 'plan'
  | 'execute'
  | 'verify'
  | 'report';

/** Flow configuration */
export interface FlowConfig {
  idea: string;
  projectName: string;
  outputDir: string;
  autoVerify: boolean;
  continueOnError: boolean;
  maxRetries: number;
}

/** Flow state */
export interface FlowState {
  id: string;
  config: FlowConfig;
  status: FlowStatus;
  currentStep: FlowStep;
  currentTaskIndex: number;
  designPath?: string;
  planPath?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/** Task execution result */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: string;
  error?: string;
  verificationResult?: VerificationResult;
  startedAt: string;
  completedAt?: string;
}

/** Verification result */
export interface VerificationResult {
  verdict: 'TRUST' | 'REVIEW' | 'REJECT';
  confidence: number;
  issues: string[];
  suggestions: string[];
}

/** Flow progress */
export interface FlowProgress {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  currentTask?: string;
  percentage: number;
  estimatedTimeRemaining?: string;
}

/** Flow report */
export interface FlowReport {
  flowId: string;
  projectName: string;
  status: FlowStatus;
  tasks: TaskResult[];
  progress: FlowProgress;
  duration: string;
  summary: string;
  recommendations: string[];
}

/** Flow options */
export interface FlowOptions {
  autoVerify?: boolean;
  continueOnError?: boolean;
  maxRetries?: number;
  skipDesign?: boolean;
  skipPlan?: boolean;
  templateId?: string;
}
