/**
 * @aide/flow - Complete development workflow orchestration
 *
 * This package provides the Flow module for AIDE, which orchestrates
 * the complete development workflow from idea to working code.
 *
 * Inspired by Superpowers' subagent-driven-development skill, Flow provides:
 * - Automated task execution
 * - Progress tracking
 * - Verification after each task
 * - Report generation
 */

// Types
export type {
  FlowStatus,
  TaskStatus,
  FlowStep,
  FlowConfig,
  FlowState,
  TaskResult,
  VerificationResult,
  FlowProgress,
  FlowReport,
  FlowOptions,
} from './types.js';

// Core Engine
export {
  createFlow,
  calculateProgress,
  generateReport,
  saveFlowState,
  loadFlowState,
  listFlowStates,
} from './engine.js';

// Task Executor
export {
  executeTask,
} from './executor.js';

// Progress Tracker
export {
  ProgressTracker,
  createProgressTracker,
} from './tracker.js';
