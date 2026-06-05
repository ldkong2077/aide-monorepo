/**
 * AIDE Dashboard - API Layer
 * REST API for dashboard data.
 */

import type { DashboardData, DashboardFilter, DashboardView } from './types.js';
import { DataCollector, createDataCollector } from './data.js';

/** Dashboard API class */
export class DashboardAPI {
  private collector: DataCollector;

  constructor(outputDir: string) {
    this.collector = createDataCollector(outputDir);
  }

  /** Get dashboard data */
  async getData(filter?: DashboardFilter): Promise<DashboardData> {
    return this.collector.collectData(filter);
  }

  /** Get summary */
  async getSummary() {
    const data = await this.collector.collectData();
    return data.summary;
  }

  /** Get flows */
  async getFlows(filter?: DashboardFilter) {
    const data = await this.collector.collectData(filter);
    return data.flows;
  }

  /** Get recent tasks */
  async getRecentTasks() {
    const data = await this.collector.collectData();
    return data.recentTasks;
  }

  /** Get recent verifications */
  async getRecentVerifications() {
    const data = await this.collector.collectData();
    return data.recentVerifications;
  }

  /** Get costs */
  async getCosts() {
    const data = await this.collector.collectData();
    return data.costs;
  }

  /** Format data as console output */
  formatConsoleOutput(data: DashboardData): string {
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                    AIDE Dashboard                          ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Last updated: ${data.lastUpdated}`);
    lines.push('');

    // Summary
    lines.push('📊 Summary');
    lines.push('─'.repeat(60));
    lines.push(`  Flows: ${data.summary.totalFlows} total, ${data.summary.activeFlows} active, ${data.summary.completedFlows} completed, ${data.summary.failedFlows} failed`);
    lines.push(`  Tasks: ${data.summary.totalTasks} total, ${data.summary.completedTasks} completed, ${data.summary.failedTasks} failed`);
    lines.push(`  Verifications: ${data.summary.totalVerifications} total, ${data.summary.trustVerdicts} TRUST, ${data.summary.reviewVerdicts} REVIEW, ${data.summary.rejectVerdicts} REJECT`);
    lines.push(`  Costs: $${data.summary.estimatedCost.toFixed(2)} estimated, $${data.summary.actualCost.toFixed(2)} actual`);
    lines.push('');

    // Flows
    if (data.flows.length > 0) {
      lines.push('🚀 Flows');
      lines.push('─'.repeat(60));
      for (const flow of data.flows.slice(0, 5)) {
        const icon = flow.status === 'completed' ? '✅' :
                    flow.status === 'failed' ? '❌' :
                    flow.status === 'running' ? '🔄' : '⏸️';
        lines.push(`  ${icon} ${flow.projectName} (${flow.progress}%)`);
        lines.push(`     Status: ${flow.status} | Tasks: ${flow.tasksCompleted}/${flow.tasksTotal}`);
      }
      lines.push('');
    }

    // Costs
    lines.push('💰 Costs');
    lines.push('─'.repeat(60));
    lines.push('  By Provider:');
    for (const [provider, cost] of Object.entries(data.costs.costByProvider)) {
      lines.push(`    ${provider}: $${cost.toFixed(2)}`);
    }
    lines.push('');

    // Cost trend
    lines.push('📈 Cost Trend (Last 7 days)');
    lines.push('─'.repeat(60));
    for (const point of data.costs.costTrend.slice(-7)) {
      const bar = '█'.repeat(Math.round(point.cost * 2));
      lines.push(`  ${point.date}: ${bar} $${point.cost.toFixed(2)}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  /** Format data as JSON output */
  formatJsonOutput(data: DashboardData): string {
    return JSON.stringify(data, null, 2);
  }

  /** Format data as markdown output */
  formatMarkdownOutput(data: DashboardData): string {
    const lines: string[] = [];

    lines.push('# AIDE Dashboard');
    lines.push('');
    lines.push(`Last updated: ${data.lastUpdated}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Flows | ${data.summary.totalFlows} |`);
    lines.push(`| Active Flows | ${data.summary.activeFlows} |`);
    lines.push(`| Completed Flows | ${data.summary.completedFlows} |`);
    lines.push(`| Failed Flows | ${data.summary.failedFlows} |`);
    lines.push(`| Total Tasks | ${data.summary.totalTasks} |`);
    lines.push(`| Completed Tasks | ${data.summary.completedTasks} |`);
    lines.push(`| Failed Tasks | ${data.summary.failedTasks} |`);
    lines.push(`| Total Verifications | ${data.summary.totalVerifications} |`);
    lines.push(`| TRUST Verdicts | ${data.summary.trustVerdicts} |`);
    lines.push(`| REVIEW Verdicts | ${data.summary.reviewVerdicts} |`);
    lines.push(`| REJECT Verdicts | ${data.summary.rejectVerdicts} |`);
    lines.push(`| Estimated Cost | $${data.summary.estimatedCost.toFixed(2)} |`);
    lines.push(`| Actual Cost | $${data.summary.actualCost.toFixed(2)} |`);
    lines.push('');

    // Flows
    if (data.flows.length > 0) {
      lines.push('## Flows');
      lines.push('');
      lines.push('| Project | Status | Progress | Tasks |');
      lines.push('|---------|--------|----------|-------|');
      for (const flow of data.flows.slice(0, 10)) {
        lines.push(`| ${flow.projectName} | ${flow.status} | ${flow.progress}% | ${flow.tasksCompleted}/${flow.tasksTotal} |`);
      }
      lines.push('');
    }

    // Costs
    lines.push('## Costs');
    lines.push('');
    lines.push('### By Provider');
    lines.push('');
    lines.push('| Provider | Cost |');
    lines.push('|----------|------|');
    for (const [provider, cost] of Object.entries(data.costs.costByProvider)) {
      lines.push(`| ${provider} | $${cost.toFixed(2)} |`);
    }
    lines.push('');

    return lines.join('\n');
  }
}

/** Create a dashboard API instance */
export function createDashboardAPI(outputDir: string): DashboardAPI {
  return new DashboardAPI(outputDir);
}
