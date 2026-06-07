/**
 * CodeGuard - 置信度评分引擎
 * 综合多个维度的检查结果，计算代码变更的整体置信度分数
 */

import type {
  ConfidenceScore,
  DiffResult,
  HallucinationReport,
  ScoreDimensions,
  Severity,
  TestResult,
  Verdict,
} from "../types.js";

/** 各维度的权重配置 */
const DIMENSION_WEIGHTS = {
  diffSafety: 0.3, // 差异安全性权重 30%
  hallucinationFree: 0.35, // 无幻觉程度权重 35%
  testPassRate: 0.25, // 测试通过率权重 25%
  typeCheck: 0.1, // 类型检查权重 10%
} as const;

/** 置信度判定阈值 */
const VERDICT_THRESHOLDS = {
  TRUST: 80, // >= 80 信任
  REVIEW: 50, // >= 50 需要审查
  // < 50 拒绝
} as const;

/**
 * 置信度评分引擎
 * 综合AST差异分析、幻觉检测、测试结果等维度计算置信度
 */
export class ConfidenceScorer {
  /**
   * 计算置信度分数
   * @param diffResult AST差异分析结果
   * @param hallucinations 幻觉检测报告
   * @param testResult 测试结果（可选）
   */
  computeScore(
    diffResult: DiffResult[],
    hallucinations: HallucinationReport[],
    testResult?: TestResult,
  ): ConfidenceScore {
    // 计算各维度分数
    const dimensions: ScoreDimensions = {
      diffSafety: this.computeDiffSafetyScore(diffResult),
      hallucinationFree: this.computeHallucinationFreeScore(hallucinations),
      testPassRate: this.computeTestPassRateScore(testResult),
      typeCheck: this.computeTypeCheckScore(diffResult),
    };

    // 计算加权总分
    const overall = Math.round(
      dimensions.diffSafety * DIMENSION_WEIGHTS.diffSafety +
        dimensions.hallucinationFree * DIMENSION_WEIGHTS.hallucinationFree +
        dimensions.testPassRate * DIMENSION_WEIGHTS.testPassRate +
        dimensions.typeCheck * DIMENSION_WEIGHTS.typeCheck,
    );

    // 生成风险因素。Missing evidence is intentionally part of the risk
    // model: for AIDE's target users, "not checked" must not read as "safe".
    const riskFactors = this.generateRiskFactors(
      diffResult,
      hallucinations,
      testResult,
    );

    // 判定结果
    const verdict = this.determineVerdict(overall, testResult);

    return {
      overall,
      verdict,
      dimensions,
      riskFactors,
    };
  }

  /**
   * 计算差异安全性分数 (0-100)
   * 基于AST差异分析的风险分数
   */
  private computeDiffSafetyScore(diffResult: DiffResult[]): number {
    if (diffResult.length === 0) return 100;

    // 计算平均风险分数
    const avgRisk =
      diffResult.reduce((sum, r) => sum + r.riskScore, 0) / diffResult.length;

    // 检查是否有critical级别的变更
    const hasCritical = diffResult.some((r) =>
      r.changes.some((c) => c.risk === "critical"),
    );

    // 基础分数：风险分数越低越安全
    let score = Math.round((1 - avgRisk) * 100);

    // 如果存在critical变更，额外扣分
    if (hasCritical) {
      const criticalCount = diffResult.reduce(
        (sum, r) => sum + r.changes.filter((c) => c.risk === "critical").length,
        0,
      );
      score = Math.max(0, score - criticalCount * 10);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算无幻觉程度分数 (0-100)
   * 基于幻觉检测的数量和严重程度
   */
  private computeHallucinationFreeScore(
    hallucinations: HallucinationReport[],
  ): number {
    if (hallucinations.length === 0) return 100;

    // 各严重程度的扣分
    const severityDeduction: Record<Severity, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      info: 1,
    };

    // 计算总扣分
    const totalDeduction = hallucinations.reduce((sum, h) => {
      return sum + severityDeduction[h.severity];
    }, 0);

    return Math.max(0, 100 - totalDeduction);
  }

  /**
   * 计算测试通过率分数 (0-100)
   * 无测试或测试未运行时保守给低分；最终 verdict 也会被限制为 REVIEW。
   */
  private computeTestPassRateScore(testResult?: TestResult): number {
    if (!testResult || testResult.total === 0) return 30;

    const passRate = testResult.passed / testResult.total;

    // 基础分数基于通过率
    let score = Math.round(passRate * 100);

    // 如果有失败测试，额外扣分
    if (testResult.failed > 0) {
      score = Math.max(0, score - testResult.failed * 5);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 计算类型检查分数 (0-100)
   * 基于差异分析中的类型相关变更
   */
  private computeTypeCheckScore(diffResult: DiffResult[]): number {
    // 简化实现：检查是否有签名变更
    const signatureChanges = diffResult.reduce(
      (sum, r) =>
        sum + r.changes.filter((c) => c.type === "SIGNATURE_CHANGE").length,
      0,
    );

    if (signatureChanges === 0) return 90; // 无签名变更，默认高分

    // 每个签名变更扣分
    return Math.max(0, 90 - signatureChanges * 20);
  }

  /**
   * 判定置信度等级
   */
  private determineVerdict(score: number, testResult?: TestResult): Verdict {
    if (testResult?.failed && testResult.failed > 0) return "REJECT";

    const missingTestEvidence = !testResult || testResult.total === 0;
    if (missingTestEvidence && score >= VERDICT_THRESHOLDS.TRUST)
      return "REVIEW";

    if (score >= VERDICT_THRESHOLDS.TRUST) return "TRUST";
    if (score >= VERDICT_THRESHOLDS.REVIEW) return "REVIEW";
    return "REJECT";
  }

  /**
   * 生成人类可读的风险因素描述
   */
  generateRiskFactors(
    diffResult: DiffResult[],
    hallucinations: HallucinationReport[],
    testResult?: TestResult,
  ): string[] {
    const factors: string[] = [];

    if (!testResult) {
      factors.push("⚠️ 未运行相关测试，验证证据不足，需要人工审查");
    } else if (testResult.total === 0) {
      factors.push("⚠️ 未发现相关测试，无法证明变更通过测试，需要人工审查");
    } else if (testResult.failed > 0) {
      factors.push(`🔴 有 ${testResult.failed} 个测试失败，不能信任当前变更`);
    }

    // 基于差异分析的风险因素
    for (const result of diffResult) {
      const criticalChanges = result.changes.filter(
        (c) => c.risk === "critical",
      );
      const highChanges = result.changes.filter((c) => c.risk === "high");

      if (criticalChanges.length > 0) {
        factors.push(
          `🔴 ${result.filePath} 存在 ${criticalChanges.length} 处关键变更: ` +
            criticalChanges.map((c) => c.reason).join("; "),
        );
      }

      if (highChanges.length > 0) {
        factors.push(
          `🟡 ${result.filePath} 存在 ${highChanges.length} 处高风险变更: ` +
            highChanges
              .slice(0, 3)
              .map((c) => c.reason)
              .join("; "),
        );
      }

      if (result.riskScore >= 0.7) {
        factors.push(
          `⚠️ ${result.filePath} 整体风险分数较高 (${(result.riskScore * 100).toFixed(0)}%)`,
        );
      }
    }

    // 基于幻觉检测的风险因素
    const criticalHallucinations = hallucinations.filter(
      (h) => h.severity === "critical",
    );
    const highHallucinations = hallucinations.filter(
      (h) => h.severity === "high",
    );
    const mediumHallucinations = hallucinations.filter(
      (h) => h.severity === "medium",
    );

    if (criticalHallucinations.length > 0) {
      factors.push(
        `🔴 检测到 ${criticalHallucinations.length} 处严重幻觉问题: ` +
          criticalHallucinations.map((h) => h.message).join("; "),
      );
    }

    if (highHallucinations.length > 0) {
      factors.push(
        `🟡 检测到 ${highHallucinations.length} 处高级别幻觉问题: ` +
          highHallucinations
            .slice(0, 3)
            .map((h) => h.message)
            .join("; "),
      );
    }

    if (mediumHallucinations.length > 0) {
      factors.push(
        `⚡ 检测到 ${mediumHallucinations.length} 处中等级别幻觉问题`,
      );
    }

    // 按类别汇总
    const packageImportIssues = hallucinations.filter(
      (h) => h.category === "package_import",
    );
    if (packageImportIssues.length > 0) {
      factors.push(
        `📦 存在 ${packageImportIssues.length} 处包导入问题，可能是不存在的依赖`,
      );
    }

    const apiSignatureIssues = hallucinations.filter(
      (h) => h.category === "api_signature",
    );
    if (apiSignatureIssues.length > 0) {
      factors.push(
        `🔧 存在 ${apiSignatureIssues.length} 处API签名问题，可能是虚构的方法调用`,
      );
    }

    const aiPatternIssues = hallucinations.filter(
      (h) => h.category === "ai_pattern",
    );
    if (aiPatternIssues.length > 0) {
      factors.push(
        `🤖 存在 ${aiPatternIssues.length} 处AI生成模式特征，代码可能由AI生成且未充分审查`,
      );
    }

    const logicIssues = hallucinations.filter(
      (h) => h.category === "logic_issue",
    );
    if (logicIssues.length > 0) {
      factors.push(
        `🧩 存在 ${logicIssues.length} 处逻辑问题，可能影响代码正确性`,
      );
    }

    return factors;
  }
}
