/**
 * CodeGuard - Report Formatter Tests
 */
import { describe, it, expect } from 'vitest';
import {
  ReportFormatter,
  formatConsoleReport,
  formatJSONReport,
  formatMarkdownReport,
} from './report.js';
import type { VerificationReport } from '../types.js';

describe('ReportFormatter', () => {
  const formatter = new ReportFormatter();

  const baseReport: VerificationReport = {
    timestamp: Date.now(),
    files_checked: ['src/main.ts'],
    diffResults: [],
    hallucinations: [],
    testResult: null,
    confidence: {
      overall: 85,
      verdict: 'TRUST',
      dimensions: {
        diffSafety: 90,
        hallucinationFree: 85,
        testPassRate: 50,
        typeCheck: 90,
      },
      riskFactors: [],
    },
    summary: '',
  };

  describe('formatConsoleReport', () => {
    it('contains report header', () => {
      const output = formatter.formatConsoleReport(baseReport);
      expect(output).toContain('CodeGuard');
      expect(output).toContain('85/100');
    });

    it('shows TRUST verdict', () => {
      const output = formatter.formatConsoleReport(baseReport);
      // Verdict text uses Chinese: ✅ 信任
      expect(output).toContain('信任');
    });

    it('shows REVIEW verdict', () => {
      const report = {
        ...baseReport,
        confidence: { ...baseReport.confidence, overall: 65, verdict: 'REVIEW' as const },
      };
      const output = formatter.formatConsoleReport(report);
      expect(output).toContain('需审查');
    });

    it('shows REJECT verdict', () => {
      const report = {
        ...baseReport,
        confidence: { ...baseReport.confidence, overall: 30, verdict: 'REJECT' as const },
      };
      const output = formatter.formatConsoleReport(report);
      expect(output).toContain('拒绝');
    });

    it('shows hallucination issues', () => {
      const report = {
        ...baseReport,
        hallucinations: [
          {
            severity: 'critical' as const,
            message: 'Critical: fake import',
            category: 'package_import' as const,
          },
          {
            severity: 'high' as const,
            message: 'High: bad API',
            category: 'api_signature' as const,
          },
        ],
      };
      const output = formatter.formatConsoleReport(report);
      expect(output).toContain('Critical: fake import');
    });

    it('shows test results', () => {
      const report = {
        ...baseReport,
        testResult: { passed: 8, failed: 2, total: 10, errors: [], duration: 1500 },
      };
      const output = formatter.formatConsoleReport(report);
      expect(output).toContain('8/10');
      expect(output).toContain('2');
    });

    it('shows risk factors', () => {
      const report = {
        ...baseReport,
        confidence: {
          ...baseReport.confidence,
          riskFactors: ['Factor 1', 'Factor 2'],
        },
      };
      const output = formatter.formatConsoleReport(report);
      expect(output).toContain('Factor 1');
    });
  });

  describe('formatJSONReport', () => {
    it('returns valid JSON', () => {
      const output = formatter.formatJSONReport(baseReport);
      const parsed = JSON.parse(output);
      expect(parsed.confidence.overall).toBe(85);
      expect(parsed.confidence.verdict).toBe('TRUST');
    });

    it('includes all report fields', () => {
      const output = formatter.formatJSONReport(baseReport);
      const parsed = JSON.parse(output);
      expect(parsed.files_checked).toBeDefined();
      expect(parsed.hallucinations).toBeDefined();
      expect(parsed.confidence).toBeDefined();
    });
  });

  describe('formatMarkdownReport', () => {
    it('contains Markdown headers', () => {
      const output = formatter.formatMarkdownReport(baseReport);
      expect(output).toContain('##');
      expect(output).toContain('CodeGuard');
    });

    it('contains score table', () => {
      const output = formatter.formatMarkdownReport(baseReport);
      expect(output).toContain('差异安全性');
      expect(output).toContain('无幻觉程度');
    });

    it('shows passed checks for clean code', () => {
      const output = formatter.formatMarkdownReport(baseReport);
      expect(output).toContain('通过的检查');
    });

    it('shows critical issues section', () => {
      const report = {
        ...baseReport,
        hallucinations: [
          {
            severity: 'critical' as const,
            message: 'Fake package',
            category: 'package_import' as const,
            line: 5,
          },
        ],
      };
      const output = formatter.formatMarkdownReport(report);
      expect(output).toContain('关键问题');
      expect(output).toContain('Fake package');
    });
  });

  describe('convenience functions', () => {
    it('formatConsoleReport produces same output', () => {
      const a = formatConsoleReport(baseReport);
      const b = formatter.formatConsoleReport(baseReport);
      expect(a).toBe(b);
    });

    it('formatJSONReport produces same output', () => {
      const a = formatJSONReport(baseReport);
      const b = formatter.formatJSONReport(baseReport);
      expect(a).toBe(b);
    });

    it('formatMarkdownReport produces same output', () => {
      const a = formatMarkdownReport(baseReport);
      const b = formatter.formatMarkdownReport(baseReport);
      expect(a).toBe(b);
    });
  });
});
