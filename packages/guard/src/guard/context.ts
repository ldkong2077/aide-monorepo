/**
 * CodeGuard - 上下文构建器
 * 借鉴CodeGraph的自适应输出预算模式，根据项目规模动态调整验证报告的详细程度
 */

import * as fs from 'fs';
import * as path from 'path';
import type { VerificationReport, HallucinationReport } from '../types.js';

/**
 * 验证报告输出预算
 * 根据项目规模动态调整报告的详细程度，避免小项目输出过多冗余信息，
 * 大项目则提供更完整的上下文
 */
export interface VerifyOutputBudget {
  /** 最大输出字符数 */
  maxOutputChars: number;
  /** 每个差异结果的最大详情行数 */
  maxDiffDetailLines: number;
  /** 最大幻觉报告数量 */
  maxHallucinationReports: number;
  /** 每个幻觉报告的最大代码片段长度 */
  maxSnippetLength: number;
  /** 最大风险因素数量 */
  maxRiskFactors: number;
  /** 是否包含建议部分 */
  includeSuggestions: boolean;
  /** 是否包含测试详情 */
  includeTestDetails: boolean;
  /** 是否包含置信度维度详情 */
  includeConfidenceDimensions: boolean;
  /** 是否包含预算提示 */
  includeBudgetNote: boolean;
}

/**
 * 根据项目文件数量计算输出预算
 */
export function getVerifyOutputBudget(fileCount: number): VerifyOutputBudget {
  if (fileCount < 50) {
    // 小项目：精简输出
    return {
      maxOutputChars: 4000,
      maxDiffDetailLines: 5,
      maxHallucinationReports: 10,
      maxSnippetLength: 200,
      maxRiskFactors: 5,
      includeSuggestions: true,
      includeTestDetails: true,
      includeConfidenceDimensions: false,
      includeBudgetNote: false,
    };
  }
  if (fileCount < 500) {
    // 中小项目
    return {
      maxOutputChars: 8000,
      maxDiffDetailLines: 10,
      maxHallucinationReports: 20,
      maxSnippetLength: 300,
      maxRiskFactors: 8,
      includeSuggestions: true,
      includeTestDetails: true,
      includeConfidenceDimensions: true,
      includeBudgetNote: true,
    };
  }
  if (fileCount < 5000) {
    // 中大型项目
    return {
      maxOutputChars: 15000,
      maxDiffDetailLines: 15,
      maxHallucinationReports: 30,
      maxSnippetLength: 500,
      maxRiskFactors: 10,
      includeSuggestions: true,
      includeTestDetails: true,
      includeConfidenceDimensions: true,
      includeBudgetNote: true,
    };
  }
  // 大型项目：完整输出
  return {
    maxOutputChars: 25000,
    maxDiffDetailLines: 20,
    maxHallucinationReports: 50,
    maxSnippetLength: 800,
    maxRiskFactors: 15,
    includeSuggestions: true,
    includeTestDetails: true,
    includeConfidenceDimensions: true,
    includeBudgetNote: true,
  };
}

/**
 * 统计项目文件数量
 */
export function countProjectFiles(projectDir: string): number {
  const codeExtensions = new Set(['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java']);
  const ignoreDirs = new Set([
    'node_modules', '.git', '__pycache__', 'dist', 'build',
    '.venv', 'venv', 'vendor', '.next', '.nuxt', 'target',
  ]);
  let count = 0;

  const walk = (dir: string, depth: number = 0): void => {
    if (depth > 10) return; // 防止过深递归
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoreDirs.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (codeExtensions.has(ext)) count++;
        }
      }
    } catch {
      // 跳过无权限目录
    }
  };

  walk(projectDir);
  return count;
}

/**
 * 上下文构建器
 * 根据输出预算裁剪验证报告，生成适合AI工具上下文窗口的精简报告
 */
export class ContextBuilder {
  private budget: VerifyOutputBudget;

  constructor(fileCount: number) {
    this.budget = getVerifyOutputBudget(fileCount);
  }

  /**
   * 构建精简的验证报告文本
   */
  buildReport(report: VerificationReport): string {
    const parts: string[] = [];

    // 置信度摘要
    const score = report.confidence.overall;
    const verdict = report.confidence.verdict;
    const verdictLabel = verdict === 'TRUST' ? 'PASS' : verdict === 'REVIEW' ? 'REVIEW' : 'REJECT';

    parts.push(`## CodeGuard Report [${verdictLabel}] Score: ${score}/100`);
    parts.push('');

    // 差异分析摘要
    const diffResults = report.diffResults || [];
    if (diffResults.length > 0) {
      parts.push('### Changes');
      const limitedDiffs = diffResults.slice(0, this.budget.maxDiffDetailLines);
      for (const diff of limitedDiffs) {
        parts.push(`- ${diff.filePath}: ${diff.summary || 'N/A'} (risk: ${diff.riskScore})`);
      }
      if (diffResults.length > limitedDiffs.length) {
        parts.push(`  ... and ${diffResults.length - limitedDiffs.length} more files`);
      }
      parts.push('');
    }

    // 幻觉检测摘要
    if (report.hallucinations.length > 0) {
      parts.push('### Issues Found');
      const critical = report.hallucinations.filter(h => h.severity === 'critical');
      const high = report.hallucinations.filter(h => h.severity === 'high');
      const other = report.hallucinations.filter(h => h.severity !== 'critical' && h.severity !== 'high');

      // 优先显示严重问题
      const prioritized = [
        ...critical.slice(0, this.budget.maxHallucinationReports),
        ...high.slice(0, Math.max(0, this.budget.maxHallucinationReports - critical.length)),
        ...other.slice(0, Math.max(0, this.budget.maxHallucinationReports - critical.length - high.length)),
      ];

      for (const issue of prioritized) {
        const severityLabel = issue.severity.toUpperCase();
        const location = issue.location || issue.line ? ` (line ${issue.line})` : '';
        parts.push(`- [${severityLabel}]${location} ${issue.message}`);
        if (this.budget.includeSuggestions && issue.suggestion) {
          parts.push(`  Fix: ${issue.suggestion}`);
        }
      }

      const remaining = report.hallucinations.length - prioritized.length;
      if (remaining > 0) {
        parts.push(`  ... and ${remaining} more issues`);
      }
      parts.push('');
    }

    // 测试结果
    const testResult = report.testResult;
    if (testResult && this.budget.includeTestDetails) {
      parts.push('### Tests');
      parts.push(`Passed: ${testResult.passed}/${testResult.total} | Failed: ${testResult.failed} | Duration: ${testResult.duration}ms`);
      if (testResult.errors.length > 0) {
        parts.push('Failed tests:');
        for (const err of testResult.errors.slice(0, 5)) {
          parts.push(`  - ${err.testName}: ${err.message}`);
        }
      }
      parts.push('');
    }

    // 置信度维度
    if (this.budget.includeConfidenceDimensions && report.confidence.dimensions) {
      parts.push('### Confidence Breakdown');
      const dims = report.confidence.dimensions;
      parts.push(`- Diff Safety: ${dims.diffSafety}/100`);
      parts.push(`- Hallucination Free: ${dims.hallucinationFree}/100`);
      parts.push(`- Test Pass Rate: ${dims.testPassRate}/100`);
      parts.push(`- Type Check: ${dims.typeCheck}/100`);
      parts.push('');
    }

    // 风险因素
    if (report.confidence.riskFactors.length > 0) {
      parts.push('### Risk Factors');
      for (const factor of report.confidence.riskFactors.slice(0, this.budget.maxRiskFactors)) {
        parts.push(`- ${factor}`);
      }
      parts.push('');
    }

    // 建议
    if (this.budget.includeSuggestions) {
      parts.push('### Recommendation');
      if (verdict === 'TRUST') {
        parts.push('Code changes are safe to merge.');
      } else if (verdict === 'REVIEW') {
        parts.push('Manual review recommended before merging.');
      } else {
        parts.push('High risk. Revise and re-verify before merging.');
      }
    }

    // 预算提示
    if (this.budget.includeBudgetNote) {
      parts.push('');
      parts.push(`_Report budget: ${this.budget.maxOutputChars} chars | Files checked: ${report.files_checked.length}_`);
    }

    // 裁剪到最大字符数
    let result = parts.join('\n');
    if (result.length > this.budget.maxOutputChars) {
      result = result.substring(0, this.budget.maxOutputChars - 20) + '\n\n_[truncated]_';
    }

    return result;
  }

  /**
   * 构建幻觉检测的精简报告
   */
  buildHallucinationReport(hallucinations: HallucinationReport[], language: string): string {
    if (hallucinations.length === 0) {
      return `No hallucinations detected in ${language} code.`;
    }

    const parts: string[] = [];
    parts.push(`## Hallucination Check (${language})`);
    parts.push(`Found ${hallucinations.length} potential issue(s):\n`);

    const limited = hallucinations.slice(0, this.budget.maxHallucinationReports);
    for (const report of limited) {
      const severity = report.severity.toUpperCase();
      const location = report.line ? ` (line ${report.line})` : '';
      parts.push(`- **[${severity}]**${location} ${report.message}`);
      if (report.suggestion) {
        parts.push(`  Fix: ${report.suggestion}`);
      }
    }

    const remaining = hallucinations.length - limited.length;
    if (remaining > 0) {
      parts.push(`\n... and ${remaining} more issues`);
    }

    return parts.join('\n');
  }
}
