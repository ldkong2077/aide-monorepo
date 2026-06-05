/**
 * CodeGuard 上下文构建器测试
 */

import { describe, it, expect } from 'vitest';
import { getVerifyOutputBudget, countProjectFiles, ContextBuilder } from '../guard/context.js';
import type { VerificationReport, HallucinationReport, ConfidenceScore } from '../types.js';

describe('getVerifyOutputBudget', () => {
  it('小项目（<50文件）返回精简预算', () => {
    const budget = getVerifyOutputBudget(10);
    expect(budget.maxOutputChars).toBe(4000);
    expect(budget.maxDiffDetailLines).toBe(5);
    expect(budget.maxHallucinationReports).toBe(10);
    expect(budget.includeConfidenceDimensions).toBe(false);
    expect(budget.includeBudgetNote).toBe(false);
  });

  it('中小项目（50-500文件）返回中等预算', () => {
    const budget = getVerifyOutputBudget(100);
    expect(budget.maxOutputChars).toBe(8000);
    expect(budget.includeConfidenceDimensions).toBe(true);
    expect(budget.includeBudgetNote).toBe(true);
  });

  it('中大型项目（500-5000文件）返回较大预算', () => {
    const budget = getVerifyOutputBudget(1000);
    expect(budget.maxOutputChars).toBe(15000);
    expect(budget.maxHallucinationReports).toBe(30);
  });

  it('大型项目（>5000文件）返回完整预算', () => {
    const budget = getVerifyOutputBudget(10000);
    expect(budget.maxOutputChars).toBe(25000);
    expect(budget.maxHallucinationReports).toBe(50);
    expect(budget.maxSnippetLength).toBe(800);
  });

  it('边界值正确', () => {
    const small = getVerifyOutputBudget(49);
    expect(small.maxOutputChars).toBe(4000);

    const medium1 = getVerifyOutputBudget(50);
    expect(medium1.maxOutputChars).toBe(8000);

    const medium2 = getVerifyOutputBudget(499);
    expect(medium2.maxOutputChars).toBe(8000);

    const large1 = getVerifyOutputBudget(500);
    expect(large1.maxOutputChars).toBe(15000);

    const large2 = getVerifyOutputBudget(4999);
    expect(large2.maxOutputChars).toBe(15000);

    const xlarge = getVerifyOutputBudget(5000);
    expect(xlarge.maxOutputChars).toBe(25000);
  });
});

describe('countProjectFiles', () => {
  it('不存在的目录返回0', () => {
    expect(countProjectFiles('/nonexistent/path/12345')).toBe(0);
  });
});

describe('ContextBuilder', () => {
  const mockConfidence: ConfidenceScore = {
    overall: 75,
    verdict: 'REVIEW',
    dimensions: {
      diffSafety: 80,
      hallucinationFree: 70,
      testPassRate: 75,
      typeCheck: 85,
    },
    riskFactors: ['New function added without tests', 'API signature changed'],
  };

  const mockReport: VerificationReport = {
    timestamp: Date.now(),
    files_checked: ['src/main.ts', 'src/utils.ts'],
    diffResults: [
      {
        filePath: 'src/main.ts',
        changes: [],
        riskScore: 40,
        summary: '2 changes: 1 new function, 1 signature change',
      },
    ],
    hallucinations: [
      {
        severity: 'high',
        message: 'Package "nonexistent-lib" not found',
        suggestion: 'Check package name or install it',
        category: 'package_import',
      },
      {
        severity: 'medium',
        message: 'API call uses wrong parameter order',
        suggestion: 'Check API documentation',
        category: 'api_signature',
      },
    ],
    testResult: {
      passed: 8,
      failed: 2,
      total: 10,
      errors: [
        { testName: 'testAuth', message: 'Expected 200, got 401' },
        { testName: 'testDB', message: 'Connection timeout' },
      ],
      duration: 1500,
    },
    confidence: mockConfidence,
    summary: '',
  };

  it('小项目报告包含基本信息', () => {
    const builder = new ContextBuilder(10);
    const report = builder.buildReport(mockReport);

    expect(report).toContain('CodeGuard Report');
    expect(report).toContain('REVIEW');
    expect(report).toContain('75/100');
    expect(report).toContain('Issues Found');
  });

  it('大项目报告包含置信度维度', () => {
    const builder = new ContextBuilder(1000);
    const report = builder.buildReport(mockReport);

    expect(report).toContain('Confidence Breakdown');
    expect(report).toContain('Diff Safety');
    expect(report).toContain('Hallucination Free');
  });

  it('无幻觉时不显示Issues部分', () => {
    const cleanReport: VerificationReport = {
      ...mockReport,
      hallucinations: [],
    };

    const builder = new ContextBuilder(100);
    const report = builder.buildReport(cleanReport);

    expect(report).not.toContain('Issues Found');
  });

  it('报告被裁剪到最大字符数', () => {
    const manyHallucinations: HallucinationReport[] = Array.from({ length: 100 }, (_, i) => ({
      severity: 'medium' as const,
      message: `Issue ${i}: ${'x'.repeat(200)}`,
      category: 'ai_pattern' as const,
    }));

    const largeReport: VerificationReport = {
      ...mockReport,
      hallucinations: manyHallucinations,
    };

    const builder = new ContextBuilder(10); // 小项目，maxOutputChars=4000
    const report = builder.buildReport(largeReport);

    expect(report.length).toBeLessThanOrEqual(4020); // 允许截断标记的额外字符
  });

  it('buildHallucinationReport无幻觉时返回简洁消息', () => {
    const builder = new ContextBuilder(100);
    const report = builder.buildHallucinationReport([], 'python');
    expect(report).toContain('No hallucinations detected');
  });

  it('buildHallucinationReport有幻觉时显示详情', () => {
    const builder = new ContextBuilder(100);
    const hallucinations: HallucinationReport[] = [
      {
        severity: 'critical',
        message: 'Package not found',
        line: 10,
        suggestion: 'Install the package',
        category: 'package_import',
      },
    ];
    const report = builder.buildHallucinationReport(hallucinations, 'typescript');
    expect(report).toContain('CRITICAL');
    expect(report).toContain('Package not found');
    expect(report).toContain('Install the package');
  });

  it('TRUST判定显示正面建议', () => {
    const trustReport: VerificationReport = {
      ...mockReport,
      confidence: { ...mockConfidence, overall: 90, verdict: 'TRUST' },
    };

    const builder = new ContextBuilder(100);
    const report = builder.buildReport(trustReport);
    expect(report).toContain('PASS');
    expect(report).toContain('safe to merge');
  });

  it('REJECT判定显示警告建议', () => {
    const rejectReport: VerificationReport = {
      ...mockReport,
      confidence: { ...mockConfidence, overall: 20, verdict: 'REJECT' },
    };

    const builder = new ContextBuilder(100);
    const report = builder.buildReport(rejectReport);
    expect(report).toContain('REJECT');
    expect(report).toContain('High risk');
  });
});
