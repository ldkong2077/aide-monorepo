/**
 * AIDE Flow - Core Engine
 * Orchestrates the complete development workflow.
 */

import type {
  FlowConfig,
  FlowState,
  FlowStep,
  FlowStatus,
  FlowOptions,
  FlowProgress,
  FlowReport,
  TaskResult,
} from './types.js';

/** Generate a unique flow ID */
function generateFlowId(): string {
  return `flow_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Create a new flow */
export function createFlow(config: FlowConfig): FlowState {
  return {
    id: generateFlowId(),
    config,
    status: 'pending',
    currentStep: 'init',
    currentTaskIndex: 0,
    startedAt: new Date().toISOString(),
  };
}

/** Get the next step in the flow */
function getNextStep(currentStep: FlowStep): FlowStep | null {
  const stepOrder: FlowStep[] = [
    'init',
    'design',
    'plan',
    'execute',
    'verify',
    'report',
  ];
  const currentIndex = stepOrder.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === stepOrder.length - 1) {
    return null;
  }
  return stepOrder[currentIndex + 1];
}

/** Calculate flow progress */
export function calculateProgress(
  state: FlowState,
  taskResults: TaskResult[],
): FlowProgress {
  const totalTasks = taskResults.length;
  const completedTasks = taskResults.filter(t => t.status === 'completed').length;
  const failedTasks = taskResults.filter(t => t.status === 'failed').length;
  const skippedTasks = taskResults.filter(t => t.status === 'skipped').length;
  const currentTask = taskResults.find(t => t.status === 'running');

  const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Estimate time remaining based on average task time
  let estimatedTimeRemaining: string | undefined;
  const completedTasksList = taskResults.filter(t => t.status === 'completed' && t.completedAt && t.startedAt);
  if (completedTasksList.length > 0 && completedTasks < totalTasks) {
    const avgTime = completedTasksList.reduce((sum, t) => {
      const duration = new Date(t.completedAt!).getTime() - new Date(t.startedAt).getTime();
      return sum + duration;
    }, 0) / completedTasksList.length;

    const remainingTasks = totalTasks - completedTasks - failedTasks - skippedTasks;
    const remainingMs = avgTime * remainingTasks;
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    estimatedTimeRemaining = `${remainingMinutes} minutes`;
  }

  return {
    totalTasks,
    completedTasks,
    failedTasks,
    skippedTasks,
    currentTask: currentTask?.taskId,
    percentage,
    estimatedTimeRemaining,
  };
}

/** Generate flow report */
export function generateReport(
  state: FlowState,
  taskResults: TaskResult[],
): FlowReport {
  const progress = calculateProgress(state, taskResults);
  
  const duration = state.completedAt
    ? formatDuration(new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime())
    : 'In progress';

  const summary = generateSummary(state, progress);
  const recommendations = generateRecommendations(state, taskResults);

  return {
    flowId: state.id,
    projectName: state.config.projectName,
    status: state.status,
    tasks: taskResults,
    progress,
    duration,
    summary,
    recommendations,
  };
}

/** Format duration in milliseconds to human readable */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/** Generate summary text */
function generateSummary(state: FlowState, progress: FlowProgress): string {
  const lines: string[] = [];

  lines.push(`Project: ${state.config.projectName}`);
  lines.push(`Status: ${state.status}`);
  lines.push(`Progress: ${progress.percentage}%`);
  lines.push(`Tasks: ${progress.completedTasks}/${progress.totalTasks} completed`);

  if (progress.failedTasks > 0) {
    lines.push(`Failed: ${progress.failedTasks} tasks`);
  }

  if (progress.skippedTasks > 0) {
    lines.push(`Skipped: ${progress.skippedTasks} tasks`);
  }

  return lines.join('\n');
}

/** Generate recommendations */
function generateRecommendations(
  state: FlowState,
  taskResults: TaskResult[],
): string[] {
  const recommendations: string[] = [];

  // Check for failed tasks
  const failedTasks = taskResults.filter(t => t.status === 'failed');
  if (failedTasks.length > 0) {
    recommendations.push('Review and fix failed tasks before proceeding');
    for (const task of failedTasks) {
      if (task.error) {
        recommendations.push(`  - ${task.taskId}: ${task.error}`);
      }
    }
  }

  // Check for verification issues
  const tasksWithIssues = taskResults.filter(
    t => t.verificationResult?.verdict === 'REVIEW' || t.verificationResult?.verdict === 'REJECT'
  );
  if (tasksWithIssues.length > 0) {
    recommendations.push('Address verification issues');
    for (const task of tasksWithIssues) {
      if (task.verificationResult?.issues) {
        for (const issue of task.verificationResult.issues) {
          recommendations.push(`  - ${task.taskId}: ${issue}`);
        }
      }
    }
  }

  // General recommendations
  const completedCount = taskResults.filter(t => t.status === 'completed').length;
  const totalCount = taskResults.length;
  if (completedCount === totalCount && totalCount > 0) {
    recommendations.push('All tasks completed! Consider running a full verification');
    recommendations.push('Review the generated code and tests');
    recommendations.push('Consider adding documentation');
  }

  return recommendations;
}

/** Save flow state to disk */
export async function saveFlowState(state: FlowState): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const stateDir = path.join(state.config.outputDir, '.aide', 'flows');
  await fs.mkdir(stateDir, { recursive: true });

  const statePath = path.join(stateDir, `${state.id}.json`);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/** Load flow state from disk */
export async function loadFlowState(flowId: string, outputDir: string): Promise<FlowState | null> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const statePath = path.join(outputDir, '.aide', 'flows', `${flowId}.json`);
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** List all flow states */
export async function listFlowStates(outputDir: string): Promise<FlowState[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const stateDir = path.join(outputDir, '.aide', 'flows');
  try {
    await fs.access(stateDir);
  } catch {
    return [];
  }

  const files = await fs.readdir(stateDir);
  const states: FlowState[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const content = await fs.readFile(path.join(stateDir, file), 'utf-8');
        states.push(JSON.parse(content));
      } catch {
        // Skip invalid files
      }
    }
  }

  return states.sort((a, b) => 
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}
