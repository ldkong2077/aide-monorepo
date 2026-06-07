/**
 * CodeGuard - AST差异分析引擎
 * 基于AST的代码差异分析，检测结构性变更并评估风险
 */

import type { DiffChange, DiffResult, RiskLevel, Language } from "../types.js";
import { ChangeType } from "../types.js";

/**
 * AST节点（简化表示）
 */
interface ASTNode {
  /** 节点类型 */
  type: string;
  /** 起始位置 */
  startPosition: { row: number; column: number };
  /** 结束位置 */
  endPosition: { row: number; column: number };
  /** 子节点 */
  children: ASTNode[];
  /** 节点文本 */
  text?: string;
  /** 命名子节点 */
  namedChildren?: ASTNode[];
  /** 是否为命名节点 */
  isNamed?: boolean;
  /** 字段名到子节点的映射 */
  fields?: Record<string, ASTNode | ASTNode[] | null>;
}

/**
 * AST差异分析器
 * 使用tree-sitter解析代码并分析结构性变更
 */
export class ASTDiffAnalyzer {
  /**
   * 分析两个版本代码之间的差异
   */
  analyzeDiff(
    beforeContent: string,
    afterContent: string,
    filePath: string,
  ): DiffResult {
    const language = this.detectLanguage(filePath);
    const beforeAST = this.parseToAST(beforeContent, language);
    const afterAST = this.parseToAST(afterContent, language);

    const changes = this.extractStructuralChanges(beforeAST, afterAST);
    const classifiedChanges = changes.map((c) =>
      this.classifyChange(c, filePath),
    );
    const riskScore = this.computeRiskScore(classifiedChanges);
    const summary = this.generateDiffSummary({
      filePath: filePath,
      changes: classifiedChanges,
      riskScore: riskScore,
      summary: "",
    });

    return {
      filePath: filePath,
      changes: classifiedChanges,
      riskScore: riskScore,
      summary,
    };
  }

  /**
   * 将代码解析为AST
   * 使用tree-sitter进行解析
   */
  parseToAST(code: string, language: Language): ASTNode {
    try {
      // 尝试使用tree-sitter进行解析
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Parser = require("tree-sitter");
      const parser = new Parser();

      switch (language) {
        case "python": {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const Python = require("tree-sitter-python");
          parser.setLanguage(Python);
          break;
        }
        case "typescript": {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const TypeScript = require("tree-sitter-typescript").typescript;
          parser.setLanguage(TypeScript);
          break;
        }
        case "javascript": {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const JavaScript = require("tree-sitter-javascript");
          parser.setLanguage(JavaScript);
          break;
        }
        case "go": {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const Go = require("tree-sitter-go");
          parser.setLanguage(Go);
          break;
        }
        default:
          // 未知语言，返回基于文本分析的简化AST
          return this.buildFallbackAST(code);
      }

      const tree = parser.parse(code);
      return this.convertTreeSitterNode(tree.rootNode, code);
    } catch {
      // tree-sitter不可用时，使用基于文本的回退方案
      return this.buildFallbackAST(code);
    }
  }

  /**
   * 提取结构性变更
   */
  extractStructuralChanges(
    beforeAST: ASTNode,
    afterAST: ASTNode,
  ): DiffChange[] {
    const changes: DiffChange[] = [];

    // 提取前后AST中的函数定义
    const beforeFunctions = this.extractFunctions(beforeAST);
    const afterFunctions = this.extractFunctions(afterAST);

    // 检测新增的函数
    for (const [name, node] of afterFunctions) {
      if (!beforeFunctions.has(name)) {
        changes.push({
          type: ChangeType.NEW_FUNCTION,
          risk: "medium",
          reason: `新增函数: ${name}`,
          file: "",
          location: `L${node.startPosition.row + 1}-${node.endPosition.row + 1}`,
          before: "",
          after: node.text || "",
        });
      }
    }

    // 检测删除的函数
    for (const [name, node] of beforeFunctions) {
      if (!afterFunctions.has(name)) {
        changes.push({
          type: ChangeType.DELETED_FUNCTION,
          risk: "high",
          reason: `删除函数: ${name}`,
          file: "",
          location: `L${node.startPosition.row + 1}-${node.endPosition.row + 1}`,
          before: node.text || "",
          after: "",
        });
      }
    }

    // 检测函数签名变更
    for (const [name, afterNode] of afterFunctions) {
      const beforeNode = beforeFunctions.get(name);
      if (beforeNode) {
        const sigChanges = this.detectSignatureChanges(
          beforeNode,
          afterNode,
          name,
        );
        changes.push(...sigChanges);
      }
    }

    // 提取控制流结构
    const beforeControlFlow = this.extractControlFlow(beforeAST);
    const afterControlFlow = this.extractControlFlow(afterAST);

    // 检测控制流变更
    const flowChanges = this.detectControlFlowChanges(
      beforeControlFlow,
      afterControlFlow,
    );
    changes.push(...flowChanges);

    // 检测导出/公开API变更
    const exportChanges = this.detectExportChanges(beforeAST, afterAST);
    changes.push(...exportChanges);

    // 检测空值检查/守卫条件的移除
    const guardChanges = this.detectGuardRemovals(beforeAST, afterAST);
    changes.push(...guardChanges);

    // 检测重命名/移动
    const refactorChanges = this.detectRefactoring(beforeAST, afterAST);
    changes.push(...refactorChanges);

    // 检测格式化/注释变更
    const cosmeticChanges = this.detectCosmeticChanges(beforeAST, afterAST);
    changes.push(...cosmeticChanges);

    return changes;
  }

  /**
   * 分类变更，指定变更类型和风险等级
   */
  classifyChange(change: DiffChange, filePath: string): DiffChange {
    const classified = { ...change, file: filePath };

    // 根据变更类型设置风险等级
    const riskMapping: Record<ChangeType, RiskLevel> = {
      SIGNATURE_CHANGE: "critical",
      LOGIC_CHANGE: "high",
      API_CHANGE: "critical",
      GUARD_REMOVED: "critical",
      NEW_FUNCTION: "medium",
      DELETED_FUNCTION: "high",
      REFACTOR: "medium",
      COSMETIC: "low",
    };

    classified.risk = riskMapping[change.type] || "medium";
    return classified;
  }

  /**
   * 计算整体风险分数 (0-1)
   * 基于变更的数量和严重程度
   */
  computeRiskScore(changes: DiffChange[]): number {
    if (changes.length === 0) return 0;

    // 各风险等级的权重
    const riskWeights: Record<RiskLevel, number> = {
      critical: 1.0,
      high: 0.7,
      medium: 0.4,
      low: 0.1,
    };

    // 计算加权风险总和
    const totalRisk = changes.reduce((sum, change) => {
      return sum + riskWeights[change.risk];
    }, 0);

    // 使用对数缩放避免少量critical变更就达到1.0
    const rawScore = totalRisk / (totalRisk + 5);

    return Math.min(1, Math.round(rawScore * 100) / 100);
  }

  /**
   * 生成人类可读的差异摘要
   */
  generateDiffSummary(result: DiffResult): string {
    const { changes, riskScore, filePath } = result;

    if (changes.length === 0) {
      return `${filePath}: 无结构性变更`;
    }

    // 按类型统计变更
    const typeCounts = new Map<ChangeType, number>();
    for (const change of changes) {
      typeCounts.set(change.type, (typeCounts.get(change.type) || 0) + 1);
    }

    const parts: string[] = [`${filePath}:`];

    // 风险等级描述
    if (riskScore >= 0.7) {
      parts.push(`⚠️ 高风险 (风险分: ${(riskScore * 100).toFixed(0)}%)`);
    } else if (riskScore >= 0.3) {
      parts.push(`⚡ 中风险 (风险分: ${(riskScore * 100).toFixed(0)}%)`);
    } else {
      parts.push(`✅ 低风险 (风险分: ${(riskScore * 100).toFixed(0)}%)`);
    }

    // 变更类型描述映射
    const typeDescriptions: Record<ChangeType, string> = {
      SIGNATURE_CHANGE: "函数签名变更",
      LOGIC_CHANGE: "控制流变更",
      API_CHANGE: "公开API变更",
      GUARD_REMOVED: "守卫条件移除",
      NEW_FUNCTION: "新增函数",
      DELETED_FUNCTION: "删除函数",
      REFACTOR: "重构/重命名",
      COSMETIC: "格式化/注释变更",
    };

    for (const [type, count] of typeCounts) {
      parts.push(`  - ${typeDescriptions[type]}: ${count}处`);
    }

    // 列出关键变更
    const criticalChanges = changes.filter((c) => c.risk === "critical");
    if (criticalChanges.length > 0) {
      parts.push("  关键变更:");
      for (const change of criticalChanges.slice(0, 5)) {
        parts.push(`    🔴 ${change.reason}`);
      }
    }

    return parts.join("\n");
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 根据文件路径检测语言
   */
  private detectLanguage(filePath: string): Language {
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "py":
        return "python";
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "go":
        return "go";
      default:
        return "unknown";
    }
  }

  /**
   * 转换tree-sitter节点为内部AST节点
   */
  private convertTreeSitterNode(node: unknown, code: string): ASTNode {
    const n = node as {
      type: string;
      startPosition: { row: number; column: number };
      endPosition: { row: number; column: number };
      childCount: number;
      child(i: number): unknown;
      text: string;
      isNamed: boolean;
      namedChildren: unknown[];
    };

    const children: ASTNode[] = [];
    for (let i = 0; i < n.childCount; i++) {
      children.push(this.convertTreeSitterNode(n.child(i), code));
    }

    return {
      type: n.type,
      startPosition: n.startPosition,
      endPosition: n.endPosition,
      children,
      text: n.text,
      isNamed: n.isNamed,
    };
  }

  /**
   * 构建回退AST（当tree-sitter不可用时）
   * 基于文本分析构建简化的AST
   */
  private buildFallbackAST(code: string): ASTNode {
    const lines = code.split("\n");
    const children: ASTNode[] = [];

    const funcPatterns = [
      /^(?:function\s+(\w+))/,
      /^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\()/,
      /^(?:def\s+(\w+))/,
      /^(?:func\s+(\w+))/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let funcName: string | null = null;
      for (const pattern of funcPatterns) {
        const match = line.match(pattern);
        if (match) {
          funcName = match[1] || match[2] || match[3] || match[4] || null;
          break;
        }
      }
      if (funcName) {
        children.push({
          type: "function_definition",
          startPosition: { row: i, column: 0 },
          endPosition: { row: i, column: line.length },
          children: [],
          text: line,
        });
      }
    }

    return {
      type: "program",
      startPosition: { row: 0, column: 0 },
      endPosition: { row: lines.length - 1, column: 0 },
      children,
    };
  }

  /**
   * 提取AST中的函数定义
   */
  private extractFunctions(ast: ASTNode): Map<string, ASTNode> {
    const functions = new Map<string, ASTNode>();

    const traverse = (node: ASTNode) => {
      // 匹配各种语言的函数定义节点类型
      const functionTypes = [
        "function_definition", // Python, Go
        "function_declaration", // JavaScript/TypeScript
        "arrow_function", // JavaScript/TypeScript
        "method_definition", // JavaScript/TypeScript 类方法
        "function_expression", // JavaScript/TypeScript
      ];

      if (functionTypes.includes(node.type)) {
        const name = this.extractFunctionName(node);
        if (name) {
          functions.set(name, node);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
    return functions;
  }

  /**
   * 提取函数名
   */
  private extractFunctionName(node: ASTNode): string | null {
    // 从子节点中查找函数名
    for (const child of node.children) {
      if (
        child.type === "identifier" ||
        child.type === "name" ||
        child.type === "property_identifier"
      ) {
        return child.text || null;
      }
    }

    // 从文本中提取
    if (node.text) {
      const match = /(?:function|def|func)\s+(\w+)/.exec(node.text);
      if (match) return match[1];

      const arrowMatch = /(?:const|let|var)\s+(\w+)\s*=/.exec(node.text);
      if (arrowMatch) return arrowMatch[1];
    }

    return null;
  }

  /**
   * 检测函数签名变更
   */
  private detectSignatureChanges(
    beforeNode: ASTNode,
    afterNode: ASTNode,
    name: string,
  ): DiffChange[] {
    const changes: DiffChange[] = [];
    const beforeText = beforeNode.text || "";
    const afterText = afterNode.text || "";

    // 提取参数列表
    const beforeParams = this.extractParameters(beforeText);
    const afterParams = this.extractParameters(afterText);

    // 检查参数是否变更
    if (beforeParams !== afterParams) {
      changes.push({
        type: ChangeType.SIGNATURE_CHANGE,
        risk: "critical",
        reason: `函数签名变更: ${name} 参数从 (${beforeParams}) 变为 (${afterParams})`,
        file: "",
        location: `L${afterNode.startPosition.row + 1}`,
        before: beforeText.split("\n")[0],
        after: afterText.split("\n")[0],
      });
    }

    // 检查返回类型变更
    const beforeReturn = this.extractReturnType(beforeText);
    const afterReturn = this.extractReturnType(afterText);
    if (beforeReturn !== afterReturn) {
      changes.push({
        type: ChangeType.SIGNATURE_CHANGE,
        risk: "critical",
        reason: `函数返回类型变更: ${name} 从 ${beforeReturn || "void"} 变为 ${afterReturn || "void"}`,
        file: "",
        location: `L${afterNode.startPosition.row + 1}`,
        before: beforeText.split("\n")[0],
        after: afterText.split("\n")[0],
      });
    }

    return changes;
  }

  /**
   * 提取参数列表文本
   */
  private extractParameters(funcText: string): string {
    const match = /\(([^)]*)\)/.exec(funcText);
    return match ? match[1].replace(/\s+/g, " ").trim() : "";
  }

  /**
   * 提取返回类型
   */
  private extractReturnType(funcText: string): string {
    const tsMatch = /\)\s*:\s*([A-Za-z_]\w*(?:<[^>]*>)?(?:\[\])?)/.exec(
      funcText,
    );
    if (tsMatch) return tsMatch[1];

    const pyMatch = /\)\s*->\s*(\w+)/.exec(funcText);
    if (pyMatch) return pyMatch[1];

    const goMatch = /\)\s*([A-Za-z_*]+)\s*\{/.exec(funcText);
    if (goMatch) return goMatch[1];

    return "";
  }

  /**
   * 提取控制流结构
   */
  private extractControlFlow(ast: ASTNode): ASTNode[] {
    const controlFlowNodes: ASTNode[] = [];
    const controlFlowTypes = [
      "if_statement",
      "if_expression",
      "for_statement",
      "for_expression",
      "for_in_statement",
      "while_statement",
      "switch_statement",
      "match_expression",
      "try_statement",
      "try_expression",
    ];

    const traverse = (node: ASTNode) => {
      if (controlFlowTypes.includes(node.type)) {
        controlFlowNodes.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
    return controlFlowNodes;
  }

  /**
   * 检测控制流变更
   */
  private detectControlFlowChanges(
    beforeFlow: ASTNode[],
    afterFlow: ASTNode[],
  ): DiffChange[] {
    const changes: DiffChange[] = [];

    // 简化比较：比较控制流节点的文本
    const beforeTexts = new Set(beforeFlow.map((n) => n.text?.trim()));
    const afterTexts = new Set(afterFlow.map((n) => n.text?.trim()));

    // 新增的控制流
    for (const node of afterFlow) {
      if (!beforeTexts.has(node.text?.trim())) {
        changes.push({
          type: ChangeType.LOGIC_CHANGE,
          risk: "high",
          reason: `新增控制流结构: ${node.type}`,
          file: "",
          location: `L${node.startPosition.row + 1}-${node.endPosition.row + 1}`,
          before: "",
          after: node.text || "",
        });
      }
    }

    // 删除的控制流
    for (const node of beforeFlow) {
      if (!afterTexts.has(node.text?.trim())) {
        changes.push({
          type: ChangeType.LOGIC_CHANGE,
          risk: "high",
          reason: `移除控制流结构: ${node.type}`,
          file: "",
          location: `L${node.startPosition.row + 1}-${node.endPosition.row + 1}`,
          before: node.text || "",
          after: "",
        });
      }
    }

    return changes;
  }

  /**
   * 检测导出/公开API变更
   */
  private detectExportChanges(
    beforeAST: ASTNode,
    afterAST: ASTNode,
  ): DiffChange[] {
    const changes: DiffChange[] = [];

    const beforeExports = this.extractExports(beforeAST);
    const afterExports = this.extractExports(afterAST);

    // 新增的导出
    for (const [name, node] of afterExports) {
      if (!beforeExports.has(name)) {
        changes.push({
          type: ChangeType.API_CHANGE,
          risk: "critical",
          reason: `新增公开导出: ${name}`,
          file: "",
          location: `L${node.startPosition.row + 1}`,
          before: "",
          after: node.text || "",
        });
      }
    }

    // 删除的导出
    for (const [name, node] of beforeExports) {
      if (!afterExports.has(name)) {
        changes.push({
          type: ChangeType.API_CHANGE,
          risk: "critical",
          reason: `移除公开导出: ${name}`,
          file: "",
          location: `L${node.startPosition.row + 1}`,
          before: node.text || "",
          after: "",
        });
      }
    }

    return changes;
  }

  /**
   * 提取导出声明
   */
  private extractExports(ast: ASTNode): Map<string, ASTNode> {
    const exports = new Map<string, ASTNode>();

    const traverse = (node: ASTNode) => {
      // JavaScript/TypeScript export
      if (
        node.type === "export_statement" ||
        node.type === "export_default_declaration"
      ) {
        const name = this.extractExportName(node);
        if (name) exports.set(name, node);
      }

      // Python: 没有显式export，但__all__变量控制导出
      if (node.type === "assignment" && node.text?.includes("__all__")) {
        exports.set("__all__", node);
      }

      // Go: 大写开头的标识符即为导出
      if (node.type === "function_definition" && node.text) {
        const nameMatch = /func\s+([A-Z]\w*)/.exec(node.text);
        if (nameMatch) {
          exports.set(nameMatch[1], node);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
    return exports;
  }

  /**
   * 提取导出名
   */
  private extractExportName(node: ASTNode): string | null {
    if (node.text) {
      const match =
        /export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type)\s+(\w+)/.exec(
          node.text,
        );
      if (match) return match[1];
    }
    return null;
  }

  /**
   * 检测守卫条件移除
   */
  private detectGuardRemovals(
    beforeAST: ASTNode,
    afterAST: ASTNode,
  ): DiffChange[] {
    const changes: DiffChange[] = [];

    const beforeGuards = this.extractGuardConditions(beforeAST);
    const afterGuards = this.extractGuardConditions(afterAST);

    // 检测被移除的守卫条件
    for (const [key, node] of beforeGuards) {
      if (!afterGuards.has(key)) {
        changes.push({
          type: ChangeType.GUARD_REMOVED,
          risk: "critical",
          reason: `守卫条件被移除: ${key}`,
          file: "",
          location: `L${node.startPosition.row + 1}`,
          before: node.text || "",
          after: "",
        });
      }
    }

    return changes;
  }

  /**
   * 提取守卫条件（null检查、边界检查等）
   */
  private extractGuardConditions(ast: ASTNode): Map<string, ASTNode> {
    const guards = new Map<string, ASTNode>();

    const traverse = (node: ASTNode) => {
      if (node.type === "if_statement" && node.text) {
        const text = node.text;
        // 检测常见的守卫模式
        const guardPatterns = [
          /if\s*\(\s*!?(\w+)\s*\)/, // if (x) / if (!x)
          /if\s*\(\s*\w+\s*(?:===?|!==?)\s*null\s*\)/, // if (x === null)
          /if\s*\(\s*\w+\s*(?:===?|!==?)\s*undefined\s*\)/, // if (x === undefined)
          /if\s*\(\s*\w+\s*instanceof\s+\w+\s*\)/, // if (x instanceof Y)
          /if\s*\(\s*Array\.isArray\(/, // if (Array.isArray(x))
          /if\s*\(\s*typeof\s+\w+/, // if (typeof x === ...)
          /if\s+\w+\s+is\s+None/, // Python: if x is None
        ];

        for (const pattern of guardPatterns) {
          if (pattern.test(text)) {
            const key = text.split("\n")[0].trim().substring(0, 100);
            guards.set(key, node);
            break;
          }
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
    return guards;
  }

  /**
   * 检测重构/重命名
   */
  private detectRefactoring(
    beforeAST: ASTNode,
    afterAST: ASTNode,
  ): DiffChange[] {
    const changes: DiffChange[] = [];

    // 简化实现：检测函数名变更
    const beforeFuncs = this.extractFunctions(beforeAST);
    const afterFuncs = this.extractFunctions(afterAST);

    // 查找可能的重命名（函数体相似但名称不同）
    const deletedNames: string[] = [];
    const addedNames: string[] = [];

    for (const name of beforeFuncs.keys()) {
      if (!afterFuncs.has(name)) deletedNames.push(name);
    }
    for (const name of afterFuncs.keys()) {
      if (!beforeFuncs.has(name)) addedNames.push(name);
    }

    // 如果删除和新增数量相同，可能是重命名
    if (deletedNames.length > 0 && deletedNames.length === addedNames.length) {
      for (let i = 0; i < deletedNames.length; i++) {
        const beforeNode = beforeFuncs.get(deletedNames[i]);
        const afterNode = afterFuncs.get(addedNames[i]);

        if (beforeNode && afterNode) {
          // 简单的文本相似度检查
          const similarity = this.computeTextSimilarity(
            beforeNode.text || "",
            afterNode.text || "",
          );

          if (similarity > 0.7) {
            changes.push({
              type: ChangeType.REFACTOR,
              risk: "medium",
              reason: `可能的重命名: ${deletedNames[i]} → ${addedNames[i]}`,
              file: "",
              location: `L${afterNode.startPosition.row + 1}`,
              before: beforeNode.text?.split("\n")[0] || "",
              after: afterNode.text?.split("\n")[0] || "",
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * 检测格式化/注释变更
   */
  private detectCosmeticChanges(
    beforeAST: ASTNode,
    afterAST: ASTNode,
  ): DiffChange[] {
    const changes: DiffChange[] = [];

    // 提取注释节点
    const beforeComments = this.extractComments(beforeAST);
    const afterComments = this.extractComments(afterAST);

    // 比较注释数量
    const commentDiff = Math.abs(afterComments.length - beforeComments.length);
    if (commentDiff > 0) {
      changes.push({
        type: ChangeType.COSMETIC,
        risk: "low",
        reason: `注释变更: ${commentDiff}处增减`,
        file: "",
        location: "",
        before: "",
        after: "",
      });
    }

    return changes;
  }

  /**
   * 提取注释节点
   */
  private extractComments(ast: ASTNode): ASTNode[] {
    const comments: ASTNode[] = [];
    const commentTypes = [
      "comment",
      "line_comment",
      "block_comment",
      "comment_block",
    ];

    const traverse = (node: ASTNode) => {
      if (commentTypes.includes(node.type)) {
        comments.push(node);
      }
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
    return comments;
  }

  /**
   * 计算文本相似度（简单的Jaccard相似度）
   */
  private computeTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
