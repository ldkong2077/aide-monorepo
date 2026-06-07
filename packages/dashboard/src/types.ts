/**
 * AIDE Dashboard - Type Definitions
 * Types for visual workflow progress tracking.
 */

/** Dashboard view type */
export type DashboardView =
  | "overview"
  | "flows"
  | "tasks"
  | "verification"
  | "costs";

/** Dashboard filter */
export interface DashboardFilter {
  status?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  projectName?: string;
}

/** Dashboard summary */
export interface DashboardSummary {
  totalFlows: number;
  activeFlows: number;
  completedFlows: number;
  failedFlows: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalVerifications: number;
  trustVerdicts: number;
  reviewVerdicts: number;
  rejectVerdicts: number;
  estimatedCost: number;
  actualCost: number;
}

/** Flow summary for dashboard */
export interface FlowSummary {
  id: string;
  projectName: string;
  status: string;
  progress: number;
  tasksTotal: number;
  tasksCompleted: number;
  tasksFailed: number;
  startedAt: string;
  completedAt?: string;
  estimatedTimeRemaining?: string;
  cost?: number;
}

/** Task summary for dashboard */
export interface TaskSummary {
  id: string;
  flowId: string;
  title: string;
  status: string;
  verificationVerdict?: string;
  duration?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

/** Verification summary for dashboard */
export interface VerificationSummary {
  id: string;
  file: string;
  verdict: string;
  confidence: number;
  issuesCount: number;
  timestamp: string;
}

/** Cost tracking */
export interface CostSummary {
  totalCost: number;
  costByProvider: Record<string, number>;
  costByFlow: Record<string, number>;
  costTrend: Array<{
    date: string;
    cost: number;
  }>;
}

/** Dashboard data */
export interface DashboardData {
  summary: DashboardSummary;
  flows: FlowSummary[];
  recentTasks: TaskSummary[];
  recentVerifications: VerificationSummary[];
  costs: CostSummary;
  lastUpdated: string;
}

/** Dashboard options */
export interface DashboardOptions {
  view?: DashboardView;
  filter?: DashboardFilter;
  refreshInterval?: number;
  autoRefresh?: boolean;
}
