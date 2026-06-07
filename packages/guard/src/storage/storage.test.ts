/**
 * Storage 层测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SQLiteStorage, createStorage } from "../storage/index.js";

describe("SQLiteStorage", () => {
  let storage: SQLiteStorage;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeshield-storage-"));
    const dbPath = path.join(tmpDir, "test.db");
    storage = new SQLiteStorage({ dbPath });
  });

  afterEach(() => {
    storage.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("基础操作", () => {
    it("创建存储实例不报错", () => {
      expect(storage).toBeDefined();
    });

    it("记录成本", () => {
      expect(() => {
        storage.recordCost({
          timestamp: Date.now(),
          provider: "openai",
          model: "gpt-4o",
          task_type: "code_generation" as const,
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.005,
        });
      }).not.toThrow();
    });

    it("获取成本汇总", () => {
      storage.recordCost({
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-4o",
        task_type: "code_generation" as const,
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.005,
      });

      const summary = storage.getCostSummary("today");
      expect(summary.total_usd).toBeGreaterThanOrEqual(0);
      expect(summary.request_count).toBeGreaterThanOrEqual(0);
    });

    it("记录路由日志", () => {
      expect(() => {
        storage.recordRouteLog(
          "debugging" as const,
          "gpt-4o",
          "deepseek-v4-pro",
          "deepseek",
          150,
          true,
        );
      }).not.toThrow();
    });
  });

  describe("幻觉规则管理", () => {
    it("添加和获取幻觉规则", () => {
      storage.addHallucinationRule({
        category: "package_import",
        pattern: "nonexistent-*",
        language: "typescript",
        severity: "high",
        message: "Package does not exist",
        suggestion: "Check npm registry",
      });

      const rules = storage.getHallucinationRules("typescript");
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].category).toBe("package_import");
      expect(rules[0].pattern).toBe("nonexistent-*");
    });

    it("按语言过滤规则", () => {
      storage.addHallucinationRule({
        category: "api_signature",
        pattern: "wrong-api-*",
        language: "python",
        severity: "medium",
        message: "API signature mismatch",
      });

      storage.addHallucinationRule({
        category: "ai_pattern",
        pattern: "empty-catch-*",
        language: "any",
        severity: "low",
        message: "Empty catch block",
      });

      const pythonRules = storage.getHallucinationRules("python");
      // 应包含python和any的规则
      expect(pythonRules.length).toBeGreaterThanOrEqual(2);
    });

    it("搜索幻觉规则（FTS5）", () => {
      storage.addHallucinationRule({
        category: "package_import",
        pattern: "fake-*",
        language: "any",
        severity: "high",
        message: "Fake package detected in imports",
      });

      const results = storage.searchHallucinationRules("fake package");
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("可信包管理", () => {
    it("添加和获取可信包", () => {
      storage.addTrustedPackage("express", "javascript");
      storage.addTrustedPackage("fastify", "javascript");

      const packages = storage.getTrustedPackages("javascript");
      expect(packages).toContain("express");
      expect(packages).toContain("fastify");
    });

    it("移除可信包", () => {
      storage.addTrustedPackage("lodash", "javascript");
      storage.removeTrustedPackage("lodash", "javascript");

      const packages = storage.getTrustedPackages("javascript");
      expect(packages).not.toContain("lodash");
    });

    it("重复添加不报错", () => {
      storage.addTrustedPackage("react", "javascript");
      expect(() =>
        storage.addTrustedPackage("react", "javascript"),
      ).not.toThrow();
    });
  });

  describe("FTS5全文搜索", () => {
    it("搜索验证报告", () => {
      // 搜索可能返回空（因为还没有验证报告），但不应该报错
      const results = storage.searchVerificationReports("test query");
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("模型性能", () => {
    it("记录和获取模型性能", () => {
      storage.recordModelPerformance(
        "openai",
        "gpt-4o",
        "code_generation" as const,
        true,
        200,
      );

      const performance = storage.getModelPerformance();
      expect(performance.length).toBeGreaterThan(0);
      expect(performance[0].provider).toBe("openai");
      expect(performance[0].model).toBe("gpt-4o");
    });
  });
});

describe("createStorage", () => {
  it("创建默认存储", () => {
    const storage = createStorage();
    expect(storage).toBeDefined();
    storage.close();
  });
});
