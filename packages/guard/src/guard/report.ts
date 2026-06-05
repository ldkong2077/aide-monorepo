/**
 * CodeGuard - 报告格式化输出
 * 提供终端彩色输出、JSON和Markdown格式的验证报告
 */

import type {
  VerificationReport,
  ConfidenceScore,
  HallucinationReport,
  DiffResult,
} from '../types.js';

/**
 * 考虑中文字符宽度的 padEnd
 * 中文字符占2个显示宽度，ASCII字符占1个
 */
function visualPadEnd(str: string, targetWidth: number): string {
  let visualWidth = 0;
  for (const ch of str) {
    visualWidth += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }
  return str + ' '.repeat(Math.max(0, targetWidth - visualWidth));
}

/**
 * 报告格式化器
 * 将验证报告转换为不同格式的输出
 */
export class ReportFormatter {
  /**
   * 格式化为终端彩色输出
   * 带边框和颜色的美观终端报告
   */
  formatConsoleReport(report: VerificationReport): string {
    const lines: string[] = [];
    const { confidence, hallucinations, testResult } = report;
    const diffResults = report.diffResults || [];

    // 顶部边框
    lines.push('┌─────────────────────────────────────────────────────────────┐');

    // 标题和总体置信度
    const scoreColor = this.getScoreColor(confidence.overall);
    const verdictText = this.getVerdictText(confidence.verdict);
    lines.push(`│  🛡️  CodeGuard 验证报告                                      │`);
    lines.push(`│                                                             │`);
    lines.push(
      visualPadEnd(
        `│  置信度: ${scoreColor}${confidence.overall}/100${this.resetColor()}  ${verdictText}`,
        62,
      ) + '│',
    );
    lines.push('├─────────────────────────────────────────────────────────────┤');

    // 评分维度分解
    lines.push('│  📊 评分维度                                                │');
    lines.push(this.formatDimensionLine('差异安全性', confidence.dimensions.diffSafety, '30%'));
    lines.push(
      this.formatDimensionLine('无幻觉程度', confidence.dimensions.hallucinationFree, '35%'),
    );
    lines.push(this.formatDimensionLine('测试通过率', confidence.dimensions.testPassRate, '25%'));
    lines.push(this.formatDimensionLine('类型检查  ', confidence.dimensions.typeCheck, '10%'));
    lines.push('├─────────────────────────────────────────────────────────────┤');

    // 关键问题（严重和高）
    const criticalIssues = hallucinations.filter(
      (h) => h.severity === 'critical' || h.severity === 'high',
    );
    if (criticalIssues.length > 0) {
      lines.push('│  🔴 关键问题                                                │');
      for (const issue of criticalIssues.slice(0, 10)) {
        const icon = issue.severity === 'critical' ? '🔴' : '🟡';
        const msg = this.truncate(`  ${icon} L${issue.line || '?'}: ${issue.message}`, 57);
        lines.push(visualPadEnd(`│${msg}`, 62) + '│');
      }
      lines.push('├─────────────────────────────────────────────────────────────┤');
    }

    // 警告（中等）
    const warnings = hallucinations.filter((h) => h.severity === 'medium');
    if (warnings.length > 0) {
      lines.push('│  🟡 警告                                                    │');
      for (const warning of warnings.slice(0, 5)) {
        const msg = this.truncate(`  🟡 L${warning.line || '?'}: ${warning.message}`, 57);
        lines.push(visualPadEnd(`│${msg}`, 62) + '│');
      }
      lines.push('├─────────────────────────────────────────────────────────────┤');
    }

    // 通过的检查
    const passedChecks = this.getPassedChecks(diffResults, hallucinations);
    if (passedChecks.length > 0) {
      lines.push('│  ✅ 通过的检查                                              │');
      for (const check of passedChecks) {
        const msg = this.truncate(`  ✅ ${check}`, 57);
        lines.push(visualPadEnd(`│${msg}`, 62) + '│');
      }
      lines.push('├─────────────────────────────────────────────────────────────┤');
    }

    // 测试结果
    if (testResult) {
      lines.push('│  🧪 测试结果                                                │');
      const testIcon = testResult.failed === 0 ? '✅' : '❌';
      lines.push(
        visualPadEnd(
          `│  ${testIcon} 通过: ${testResult.passed}/${testResult.total}  失败: ${testResult.failed}  耗时: ${testResult.duration}ms`,
          62,
        ) + '│',
      );
      if (testResult.errors.length > 0) {
        for (const error of testResult.errors.slice(0, 3)) {
          const errMsg = this.truncate(`  ❌ ${error.testName}: ${error.message}`, 57);
          lines.push(visualPadEnd(`│${errMsg}`, 62) + '│');
        }
      }
      lines.push('├─────────────────────────────────────────────────────────────┤');
    }

    // 风险因素
    if (confidence.riskFactors.length > 0) {
      lines.push('│  ⚠️  风险因素                                               │');
      for (const factor of confidence.riskFactors.slice(0, 5)) {
        const msg = this.truncate(`  ${factor}`, 57);
        lines.push(visualPadEnd(`│${msg}`, 62) + '│');
      }
      lines.push('├─────────────────────────────────────────────────────────────┤');
    }

    // 建议
    lines.push('│  💡 建议                                                    │');
    const recommendation = this.getRecommendation(confidence);
    const recLines = this.wrapText(recommendation, 55);
    for (const recLine of recLines) {
      lines.push(visualPadEnd(`│  ${recLine}`, 60) + '│');
    }

    // 底部边框
    lines.push('└─────────────────────────────────────────────────────────────┘');

    return lines.join('\n');
  }

  /**
   * 格式化为JSON输出
   * 供程序化使用的结构化JSON
   */
  formatJSONReport(report: VerificationReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * 格式化为Markdown输出
   * 适用于PR评论的Markdown格式
   */
  formatMarkdownReport(report: VerificationReport): string {
    const { confidence, hallucinations, testResult } = report;
    const diffResults = report.diffResults || [];
    const lines: string[] = [];

    // 标题
    lines.push('## 🛡️ CodeGuard 验证报告\n');

    // 总体评分
    const scoreBadge = this.getScoreBadge(confidence.overall);
    const verdictBadge = this.getVerdictBadge(confidence.verdict);
    lines.push(`**置信度**: ${scoreBadge} ${verdictBadge}\n`);

    // 评分维度
    lines.push('### 📊 评分维度\n');
    lines.push('| 维度 | 分数 | 权重 |');
    lines.push('|------|------|------|');
    lines.push(`| 差异安全性 | ${this.formatScoreBar(confidence.dimensions.diffSafety)} | 30% |`);
    lines.push(
      `| 无幻觉程度 | ${this.formatScoreBar(confidence.dimensions.hallucinationFree)} | 35% |`,
    );
    lines.push(`| 测试通过率 | ${this.formatScoreBar(confidence.dimensions.testPassRate)} | 25% |`);
    lines.push(`| 类型检查 | ${this.formatScoreBar(confidence.dimensions.typeCheck)} | 10% |`);
    lines.push('');

    // 关键问题
    const criticalIssues = hallucinations.filter(
      (h) => h.severity === 'critical' || h.severity === 'high',
    );
    if (criticalIssues.length > 0) {
      lines.push('### 🔴 关键问题\n');
      for (const issue of criticalIssues) {
        const icon = issue.severity === 'critical' ? '🔴' : '🟡';
        lines.push(`- ${icon} **L${issue.line || '?'}**: ${issue.message}`);
        if (issue.suggestion) {
          lines.push(`  > 💡 ${issue.suggestion}`);
        }
      }
      lines.push('');
    }

    // 警告
    const warnings = hallucinations.filter((h) => h.severity === 'medium');
    if (warnings.length > 0) {
      lines.push('### 🟡 警告\n');
      for (const warning of warnings) {
        lines.push(`- 🟡 **L${warning.line || '?'}**: ${warning.message}`);
      }
      lines.push('');
    }

    // 通过的检查
    const passedChecks = this.getPassedChecks(diffResults, hallucinations);
    if (passedChecks.length > 0) {
      lines.push('### ✅ 通过的检查\n');
      for (const check of passedChecks) {
        lines.push(`- ✅ ${check}`);
      }
      lines.push('');
    }

    // 测试结果
    if (testResult) {
      lines.push('### 🧪 测试结果\n');
      const testIcon = testResult.failed === 0 ? '✅' : '❌';
      lines.push(
        `${testIcon} 通过: **${testResult.passed}/${testResult.total}** | 失败: **${testResult.failed}** | 耗时: ${testResult.duration}ms\n`,
      );
      if (testResult.errors.length > 0) {
        lines.push('<details><summary>失败详情</summary>\n');
        for (const error of testResult.errors) {
          lines.push(`- **${error.testName}**: ${error.message}`);
        }
        lines.push('\n</details>\n');
      }
    }

    // 风险因素
    if (confidence.riskFactors.length > 0) {
      lines.push('### ⚠️ 风险因素\n');
      for (const factor of confidence.riskFactors) {
        lines.push(`- ${factor}`);
      }
      lines.push('');
    }

    // 建议
    lines.push('### 💡 建议\n');
    lines.push(this.getRecommendation(confidence));
    lines.push('');

    // 差异分析详情
    if (diffResults.length > 0) {
      lines.push('<details><summary>📋 差异分析详情</summary>\n');
      for (const diff of diffResults) {
        lines.push(`#### ${diff.filePath}\n`);
        lines.push(`- 风险分数: ${(diff.riskScore * 100).toFixed(0)}%`);
        lines.push(`- 变更数量: ${diff.changes.length}`);
        for (const change of diff.changes) {
          const riskIcon = this.getRiskIcon(change.risk);
          lines.push(`  - ${riskIcon} ${change.reason}`);
        }
        lines.push('');
      }
      lines.push('</details>\n');
    }

    return lines.join('\n');
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 获取分数对应的ANSI颜色代码
   */
  private getScoreColor(score: number): string {
    if (score >= 80) return '\x1b[32m'; // 绿色
    if (score >= 50) return '\x1b[33m'; // 黄色
    return '\x1b[31m'; // 红色
  }

  /**
   * 重置ANSI颜色
   */
  private resetColor(): string {
    return '\x1b[0m';
  }

  /**
   * 获取判定结果文本
   */
  private getVerdictText(verdict: string): string {
    switch (verdict) {
      case 'TRUST':
        return '✅ 信任';
      case 'REVIEW':
        return '⚠️ 需审查';
      case 'REJECT':
        return '🔴 拒绝';
      default:
        return verdict;
    }
  }

  /**
   * 格式化维度行
   */
  private formatDimensionLine(name: string, score: number, weight: string): string {
    const bar = this.formatProgressBar(score);
    const color = this.getScoreColor(score);
    const reset = this.resetColor();
    const content = `│  ${name} ${bar} ${color}${score}${reset}  (权重${weight})`;
    return visualPadEnd(content, 62) + '│';
  }

  /**
   * 格式化进度条
   */
  private formatProgressBar(score: number): string {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * 换行文本（考虑中文字符宽度）
   */
  private wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let currentLine = '';
    let currentWidth = 0;

    for (const char of text) {
      const charWidth = char.charCodeAt(0) > 0x7f ? 2 : 1;

      if (char === ' ' && currentWidth + charWidth > maxWidth) {
        lines.push(currentLine);
        currentLine = '';
        currentWidth = 0;
      } else if (currentWidth + charWidth > maxWidth) {
        if (currentLine) lines.push(currentLine);
        currentLine = char;
        currentWidth = charWidth;
      } else {
        currentLine += char;
        currentWidth += charWidth;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * 获取通过的检查列表
   */
  private getPassedChecks(
    diffResults: DiffResult[],
    hallucinations: HallucinationReport[],
  ): string[] {
    const checks: string[] = [];

    // 检查各类幻觉是否未检测到
    const categories = new Set(hallucinations.map((h) => h.category));
    if (!categories.has('package_import')) {
      checks.push('所有包导入验证通过');
    }
    if (!categories.has('api_signature')) {
      checks.push('API签名验证通过');
    }
    if (!categories.has('ai_pattern')) {
      checks.push('未检测到AI生成模式');
    }
    if (!categories.has('logic_issue')) {
      checks.push('逻辑检查通过');
    }

    // 检查差异分析
    const hasCriticalChanges = diffResults.some((r) =>
      r.changes.some((c) => c.risk === 'critical'),
    );
    if (!hasCriticalChanges) {
      checks.push('无关键结构性变更');
    }

    const hasGuardRemoval = diffResults.some((r) =>
      r.changes.some((c) => c.type === 'GUARD_REMOVED'),
    );
    if (!hasGuardRemoval) {
      checks.push('守卫条件未被移除');
    }

    return checks;
  }

  /**
   * 获取建议文本
   */
  private getRecommendation(confidence: ConfidenceScore): string {
    if (confidence.verdict === 'TRUST') {
      return '代码变更置信度较高，可以安全合并。建议在合并前进行快速人工确认。';
    }

    if (confidence.verdict === 'REVIEW') {
      const parts: string[] = ['代码变更需要人工审查。'];
      if (confidence.dimensions.hallucinationFree < 70) {
        parts.push('请重点检查幻觉检测标记的问题，确认依赖和API是否真实存在。');
      }
      if (confidence.dimensions.diffSafety < 70) {
        parts.push('请仔细审查结构性变更，特别是函数签名和公开API的修改。');
      }
      if (confidence.dimensions.testPassRate < 70) {
        parts.push('请确保所有测试通过后再合并。');
      }
      return parts.join(' ');
    }

    // REJECT
    const parts: string[] = ['代码变更风险较高，建议修改后重新验证。'];
    if (confidence.dimensions.hallucinationFree < 50) {
      parts.push('存在严重的幻觉问题，请确认所有导入和API调用是否正确。');
    }
    if (confidence.dimensions.diffSafety < 50) {
      parts.push('存在关键的结构性变更，请重新评估变更的必要性。');
    }
    return parts.join(' ');
  }

  /**
   * 获取Markdown格式的分数徽章
   */
  private getScoreBadge(score: number): string {
    if (score >= 80) return `![pass](https://img.shields.io/badge/score-${score}-green)`;
    if (score >= 50) return `![warn](https://img.shields.io/badge/score-${score}-yellow)`;
    return `![fail](https://img.shields.io/badge/score-${score}-red)`;
  }

  /**
   * 获取Markdown格式的判定徽章
   */
  private getVerdictBadge(verdict: string): string {
    switch (verdict) {
      case 'TRUST':
        return '![trust](https://img.shields.io/badge/verdict-TRUST-green)';
      case 'REVIEW':
        return '![review](https://img.shields.io/badge/verdict-REVIEW-yellow)';
      case 'REJECT':
        return '![reject](https://img.shields.io/badge/verdict-REJECT-red)';
      default:
        return verdict;
    }
  }

  /**
   * 格式化Markdown分数条
   */
  private formatScoreBar(score: number): string {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${score}`;
  }

  /**
   * 获取风险等级图标
   */
  private getRiskIcon(riskLevel: string): string {
    switch (riskLevel) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }
}

// 导出便捷函数
/**
 * 格式化为终端彩色输出
 */
export function formatConsoleReport(report: VerificationReport): string {
  return new ReportFormatter().formatConsoleReport(report);
}

/**
 * 格式化为JSON输出
 */
export function formatJSONReport(report: VerificationReport): string {
  return new ReportFormatter().formatJSONReport(report);
}

/**
 * 格式化为Markdown输出
 */
export function formatMarkdownReport(report: VerificationReport): string {
  return new ReportFormatter().formatMarkdownReport(report);
}
