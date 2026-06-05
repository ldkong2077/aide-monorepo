/**
 * AIDE Dashboard - Data Layer
 * Collects and aggregates data from all AIDE modules.
 */

import type {
  DashboardData,
  DashboardSummary,
  FlowSummary,
  TaskSummary,
  VerificationSummary,
  CostSummary,
  DashboardFilter,
} from './types.js';

/** Flow state interface (simplified) */
interface FlowState {
  id: string;
  config: {
    projectName: string;
    idea: string;
  };
  status: string;
  currentStep: string;
  currentTaskIndex: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/** Data collector class */
export class DataCollector {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /** Collect all dashboard data */
  async collectData(filter?: DashboardFilter): Promise<DashboardData> {
    const flows = await this.collectFlows(filter);
    const summary = this.calculateSummary(flows);
    const recentTasks = await this.collectRecentTasks();
    const recentVerifications = await this.collectRecentVerifications();
    const costs = await this.collectCosts(flows);

    return {
      summary,
      flows,
      recentTasks,
      recentVerifications,
      costs,
      lastUpdated: new Date().toISOString(),
    };
  }

  /** Collect flow summaries */
  private async collectFlows(filter?: DashboardFilter): Promise<FlowSummary[]> {
    // In a real implementation, this would import from @aide/flow
    // For now, return empty array to avoid module resolution issues
    return [];
  }

  /** Calculate progress from flow state */
  private calculateProgress(state: FlowState): number {
    // This is a simplified calculation
    // In a real implementation, this would use the actual task results
    if (state.status === 'completed') return 100;
    if (state.status === 'failed') return 0;
    if (state.status === 'pending') return 0;
    
    // For running flows, estimate based on current task index
    const estimatedTotalTasks = 10; // Default estimate
    return Math.round((state.currentTaskIndex / estimatedTotalTasks) * 100);
  }

  /** Estimate time remaining */
  private estimateTimeRemaining(state: FlowState): string | undefined {
    if (state.status === 'completed' || state.status === 'failed') {
      return undefined;
    }

    // Simplified estimation
    return 'Calculating...';
  }

  /** Calculate summary from flows */
  private calculateSummary(flows: FlowSummary[]): DashboardSummary {
    const totalFlows = flows.length;
    const activeFlows = flows.filter(f => f.status === 'running').length;
    const completedFlows = flows.filter(f => f.status === 'completed').length;
    const failedFlows = flows.filter(f => f.status === 'failed').length;

    const totalTasks = flows.reduce((sum, f) => sum + f.tasksTotal, 0);
    const completedTasks = flows.reduce((sum, f) => sum + f.tasksCompleted, 0);
    const failedTasks = flows.reduce((sum, f) => sum + f.tasksFailed, 0);

    // These would be calculated from actual verification data
    const totalVerifications = completedTasks;
    const trustVerdicts = Math.round(completedTasks * 0.8);
    const reviewVerdicts = Math.round(completedTasks * 0.15);
    const rejectVerdicts = Math.round(completedTasks * 0.05);

    // Cost estimates
    const estimatedCost = totalTasks * 0.02; // $0.02 per task estimate
    const actualCost = estimatedCost * 0.9; // 90% of estimate

    return {
      totalFlows,
      activeFlows,
      completedFlows,
      failedFlows,
      totalTasks,
      completedTasks,
      failedTasks,
      totalVerifications,
      trustVerdicts,
      reviewVerdicts,
      rejectVerdicts,
      estimatedCost,
      actualCost,
    };
  }

  /** Collect recent tasks */
  private async collectRecentTasks(): Promise<TaskSummary[]> {
    // In a real implementation, this would read from task history
    // For now, return empty array
    return [];
  }

  /** Collect recent verifications */
  private async collectRecentVerifications(): Promise<VerificationSummary[]> {
    // In a real implementation, this would read from verification history
    // For now, return empty array
    return [];
  }

  /** Collect cost data */
  private async collectCosts(flows: FlowSummary[]): Promise<CostSummary> {
    const totalCost = flows.reduce((sum, f) => sum + (f.cost || 0), 0);
    
    // Group by flow
    const costByFlow: Record<string, number> = {};
    for (const flow of flows) {
      if (flow.cost) {
        costByFlow[flow.projectName] = flow.cost;
      }
    }

    // Cost by provider (simulated)
    const costByProvider: Record<string, number> = {
      'deepseek': totalCost * 0.6,
      'openai': totalCost * 0.3,
      'anthropic': totalCost * 0.1,
    };

    // Cost trend (simulated)
    const costTrend = this.generateCostTrend();

    return {
      totalCost,
      costByProvider,
      costByFlow,
      costTrend,
    };
  }

  /** Generate simulated cost trend */
  private generateCostTrend(): Array<{ date: string; cost: number }> {
    const trend: Array<{ date: string; cost: number }> = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      trend.push({
        date: date.toISOString().split('T')[0],
        cost: Math.random() * 5 + 1, // Random cost between $1-6
      });
    }

    return trend;
  }
}

/** Create a data collector */
export function createDataCollector(outputDir: string): DataCollector {
  return new DataCollector(outputDir);
}
