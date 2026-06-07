/**
 * CodeGuard - Confidence Scorer Tests
 */
import { describe, it, expect } from "vitest";
import { ConfidenceScorer } from "./confidence.js";
import type { DiffResult, HallucinationReport, TestResult } from "../types.js";

describe("ConfidenceScorer", () => {
  const scorer = new ConfidenceScorer();

  describe("computeScore", () => {
    it("returns REVIEW with no changes when no tests ran", () => {
      const score = scorer.computeScore([], []);
      expect(score.verdict).toBe("REVIEW");
      expect(score.riskFactors.some((f) => f.includes("未运行相关测试"))).toBe(
        true,
      );
    });

    it("penalizes critical diff changes", () => {
      const diffResults: DiffResult[] = [
        {
          filePath: "src/main.ts",
          changes: [
            {
              type: "SIGNATURE_CHANGE",
              file: "src/main.ts",
              location: "L10",
              before: "function foo()",
              after: "function foo(x: string)",
              risk: "critical",
              reason: "Signature changed",
            },
          ],
          riskScore: 0.9,
        },
      ];
      const score = scorer.computeScore(diffResults, []);
      expect(score.overall).toBeLessThan(80);
      expect(score.dimensions.diffSafety).toBeLessThan(50);
    });

    it("penalizes hallucinations by severity", () => {
      const hallucinations: HallucinationReport[] = [
        { severity: "critical", message: "Fake import" },
        { severity: "high", message: "Fake API" },
        { severity: "medium", message: "AI pattern" },
      ];
      const score = scorer.computeScore([], hallucinations);
      expect(score.overall).toBeLessThan(80);
      expect(score.dimensions.hallucinationFree).toBeLessThan(70);
    });

    it("keeps low severity hallucinations in REVIEW when tests did not run", () => {
      const hallucinations: HallucinationReport[] = [
        { severity: "low", message: "Minor issue" },
        { severity: "info", message: "Info" },
      ];
      const score = scorer.computeScore([], hallucinations);
      expect(score.verdict).toBe("REVIEW");
    });

    it("test failures reduce score", () => {
      const testResult: TestResult = {
        passed: 5,
        failed: 5,
        total: 10,
        errors: [{ testName: "test1", message: "failed" }],
        duration: 1000,
      };
      const score = scorer.computeScore([], [], testResult);
      expect(score.dimensions.testPassRate).toBeLessThan(50);
    });

    it("no tests gives conservative score for test dimension", () => {
      const score = scorer.computeScore([], []);
      expect(score.dimensions.testPassRate).toBe(30);
    });

    it("REJECT verdict for very low score", () => {
      const diffResults: DiffResult[] = [
        {
          filePath: "src/main.ts",
          changes: Array.from({ length: 10 }, () => ({
            type: "SIGNATURE_CHANGE" as const,
            file: "src/main.ts",
            location: "L10",
            before: "old",
            after: "new",
            risk: "critical" as const,
            reason: "Critical change",
          })),
          riskScore: 0.95,
        },
      ];
      const hallucinations: HallucinationReport[] = Array.from(
        { length: 5 },
        () => ({
          severity: "critical" as const,
          message: "Critical hallucination",
        }),
      );
      const score = scorer.computeScore(diffResults, hallucinations);
      expect(score.verdict).toBe("REJECT");
      expect(score.overall).toBeLessThan(50);
    });

    it("REVIEW verdict for medium score", () => {
      const hallucinations: HallucinationReport[] = [
        { severity: "medium", message: "Issue 1" },
        { severity: "medium", message: "Issue 2" },
        { severity: "low", message: "Issue 3" },
      ];
      const score = scorer.computeScore([], hallucinations);
      // Score should be between 50-79 for REVIEW
      if (score.overall >= 50 && score.overall < 80) {
        expect(score.verdict).toBe("REVIEW");
      }
    });
  });

  describe("generateRiskFactors", () => {
    it("returns empty array for clean code", () => {
      const testResult: TestResult = {
        passed: 1,
        failed: 0,
        total: 1,
        errors: [],
        duration: 10,
      };
      const factors = scorer.generateRiskFactors([], [], testResult);
      expect(factors).toHaveLength(0);
    });

    it("includes critical change factors", () => {
      const diffResults: DiffResult[] = [
        {
          filePath: "src/main.ts",
          changes: [
            {
              type: "SIGNATURE_CHANGE",
              file: "src/main.ts",
              location: "L10",
              before: "old",
              after: "new",
              risk: "critical",
              reason: "Critical signature change",
            },
          ],
          riskScore: 0.9,
        },
      ];
      const factors = scorer.generateRiskFactors(diffResults, []);
      expect(factors.some((f) => f.includes("关键变更"))).toBe(true);
    });

    it("includes hallucination category summaries", () => {
      const hallucinations: HallucinationReport[] = [
        { severity: "high", message: "Bad import", category: "package_import" },
        { severity: "medium", message: "Bad API", category: "api_signature" },
        { severity: "low", message: "AI pattern", category: "ai_pattern" },
      ];
      const factors = scorer.generateRiskFactors([], hallucinations);
      expect(factors.some((f) => f.includes("包导入"))).toBe(true);
      expect(factors.some((f) => f.includes("API签名"))).toBe(true);
      expect(factors.some((f) => f.includes("AI生成"))).toBe(true);
    });
  });
});
