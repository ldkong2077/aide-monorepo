/**
 * @aide/dashboard - Visual workflow progress tracking
 *
 * This package provides the Dashboard module for AIDE, which visualizes
 * workflow progress, task status, verification results, and cost tracking.
 *
 * Dashboard provides:
 * - Real-time flow progress tracking
 * - Task status visualization
 * - Verification result history
 * - Cost tracking and trends
 * - Console, JSON, and Markdown output formats
 */

// Types
export type {
  DashboardView,
  DashboardFilter,
  DashboardSummary,
  FlowSummary,
  TaskSummary,
  VerificationSummary,
  CostSummary,
  DashboardData,
  DashboardOptions,
} from './types.js';

// Data Layer
export {
  DataCollector,
  createDataCollector,
} from './data.js';

// API Layer
export {
  DashboardAPI,
  createDashboardAPI,
} from './api.js';
