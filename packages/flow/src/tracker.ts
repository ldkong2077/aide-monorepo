/**
 * AIDE Flow - Progress Tracker
 * Tracks and displays flow progress.
 */

import type { FlowState, FlowProgress, TaskResult } from './types.js';

/** Progress tracker class */
export class ProgressTracker {
  private state: FlowState;
  private taskResults: TaskResult[];
  private listeners: Array<(progress: FlowProgress) => void> = [];

  constructor(state: FlowState) {
    this.state = state;
    this.taskResults = [];
  }

  /** Update flow state */
  updateState(state: FlowState): void {
    this.state = state;
    this.notifyListeners();
  }

  /** Add task result */
  addTaskResult(result: TaskResult): void {
    const existingIndex = this.taskResults.findIndex(t => t.taskId === result.taskId);
    if (existingIndex >= 0) {
      this.taskResults[existingIndex] = result;
    } else {
      this.taskResults.push(result);
    }
    this.notifyListeners();
  }

  /** Get current progress */
  getProgress(): FlowProgress {
    const totalTasks = this.taskResults.length;
    const completedTasks = this.taskResults.filter(t => t.status === 'completed').length;
    const failedTasks = this.taskResults.filter(t => t.status === 'failed').length;
    const skippedTasks = this.taskResults.filter(t => t.status === 'skipped').length;
    const currentTask = this.taskResults.find(t => t.status === 'running');

    const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Estimate time remaining
    let estimatedTimeRemaining: string | undefined;
    const completedTasksList = this.taskResults.filter(
      t => t.status === 'completed' && t.completedAt && t.startedAt
    );
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

  /** Subscribe to progress updates */
  onProgress(listener: (progress: FlowProgress) => void): void {
    this.listeners.push(listener);
  }

  /** Notify listeners of progress update */
  private notifyListeners(): void {
    const progress = this.getProgress();
    for (const listener of this.listeners) {
      listener(progress);
    }
  }

  /** Print progress to console */
  printProgress(): void {
    const progress = this.getProgress();
    const bar = this.createProgressBar(progress.percentage);

    console.log('\n' + '═'.repeat(60));
    console.log('📊 Flow Progress');
    console.log('═'.repeat(60));
    console.log(`\n${bar} ${progress.percentage}%`);
    console.log(`\n📋 Tasks: ${progress.completedTasks}/${progress.totalTasks} completed`);

    if (progress.failedTasks > 0) {
      console.log(`❌ Failed: ${progress.failedTasks}`);
    }

    if (progress.skippedTasks > 0) {
      console.log(`⏭️  Skipped: ${progress.skippedTasks}`);
    }

    if (progress.currentTask) {
      console.log(`🔄 Current: ${progress.currentTask}`);
    }

    if (progress.estimatedTimeRemaining) {
      console.log(`⏱️  Time remaining: ${progress.estimatedTimeRemaining}`);
    }

    console.log('\n' + '═'.repeat(60));
  }

  /** Create a progress bar */
  private createProgressBar(percentage: number, length: number = 30): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /** Print task summary */
  printTaskSummary(): void {
    console.log('\n📝 Task Summary:');
    console.log('─'.repeat(60));

    for (const task of this.taskResults) {
      const icon = this.getStatusIcon(task.status);
      console.log(`${icon} ${task.taskId}`);

      if (task.error) {
        console.log(`   ❌ Error: ${task.error}`);
      }

      if (task.verificationResult) {
        const verdictIcon = this.getVerdictIcon(task.verificationResult.verdict);
        console.log(`   ${verdictIcon} Verification: ${task.verificationResult.verdict}`);
      }
    }

    console.log('─'.repeat(60));
  }

  /** Get status icon */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'running':
        return '🔄';
      case 'skipped':
        return '⏭️';
      default:
        return '⏳';
    }
  }

  /** Get verdict icon */
  private getVerdictIcon(verdict: string): string {
    switch (verdict) {
      case 'TRUST':
        return '✅';
      case 'REVIEW':
        return '⚠️';
      case 'REJECT':
        return '❌';
      default:
        return '❓';
    }
  }
}

/** Create a progress tracker */
export function createProgressTracker(state: FlowState): ProgressTracker {
  return new ProgressTracker(state);
}
