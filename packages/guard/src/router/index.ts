/**
 * CodeShield - 智能路由引擎
 * 根据任务类型、策略和历史性能选择最优模型
 */

import { TaskType } from "../types.js";
import type {
  RouteStrategy,
  ModelConfig,
  RoutingEntry,
  ModelPerformance,
  ChatMessage,
} from "../types.js";

// ==================== 任务分类器 ====================

/** 各任务类型的关键词映射 */
const TASK_KEYWORDS: Record<TaskType, string[]> = {
  [TaskType.debugging]: [
    "debug",
    "fix",
    "error",
    "bug",
    "issue",
    "crash",
    "exception",
    "traceback",
    "stack trace",
    "修复",
    "调试",
    "报错",
    "异常",
  ],
  [TaskType.refactoring]: [
    "refactor",
    "rename",
    "restructure",
    "clean up",
    "optimize",
    "simplify",
    "重构",
    "重命名",
    "优化",
  ],
  [TaskType.testing]: [
    "test",
    "spec",
    "unit test",
    "integration test",
    "coverage",
    "mock",
    "stub",
    "测试",
    "单元测试",
  ],
  [TaskType.code_review]: [
    "review",
    "audit",
    "check",
    "inspect",
    "analyze",
    "lint",
    "审查",
    "检查",
    "审计",
  ],
  [TaskType.code_generation]: [
    "generate",
    "create",
    "implement",
    "build",
    "write",
    "develop",
    "scaffold",
    "生成",
    "创建",
    "实现",
    "编写",
  ],
  [TaskType.explanation]: [
    "explain",
    "what does",
    "how does",
    "why",
    "describe",
    "tell me",
    "解释",
    "说明",
    "什么是",
    "为什么",
  ],
  [TaskType.code_completion]: [
    "complete",
    "continue",
    "finish",
    "fill",
    "补全",
    "继续",
  ],
  [TaskType.general]: [],
};

/** 代码存在指示词 */
const CODE_INDICATORS = [
  "function",
  "class",
  "import",
  "export",
  "const",
  "let",
  "var",
  "def ",
  "return",
  "async",
  "await",
  "=>",
  "===",
  "!==",
  "{",
  "}",
  "()",
  "[]",
  "```",
];

/**
 * 基于规则的任务分类器
 * 根据消息内容中的关键词、消息长度和代码存在性判断任务类型
 */
export class RuleBasedClassifier {
  /**
   * 根据聊天消息分类任务类型
   */
  classify(messages: ChatMessage[]): TaskType {
    // 合并所有用户消息
    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content);
    const combinedText = userMessages.join(" ").toLowerCase();

    if (!combinedText.trim()) {
      return TaskType.general;
    }

    // 计算各任务类型的匹配分数
    const scores = new Map<TaskType, number>();

    for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        // 中文关键词不使用 \b 边界（中文无词边界），英文关键词使用 \b
        const isChinese = /[\u4e00-\u9fff]/.test(keyword);
        const regex = isChinese
          ? new RegExp(escapeRegex(keyword), "gi")
          : new RegExp(`\\b${escapeRegex(keyword)}\\b`, "gi");
        const matches = combinedText.match(regex);
        if (matches) {
          score += matches.length;
        }
      }
      scores.set(taskType as TaskType, score);
    }

    // 考虑消息长度和代码存在性
    const hasCode = CODE_INDICATORS.some((indicator) =>
      combinedText.includes(indicator.toLowerCase()),
    );
    const messageLength = combinedText.length;

    // 有代码且消息较长，倾向 code_generation 或 debugging
    if (hasCode) {
      const currentGenScore = scores.get(TaskType.code_generation) || 0;
      scores.set(TaskType.code_generation, currentGenScore + 0.5);

      // 如果包含错误相关内容，增加 debugging 分数
      if (
        combinedText.includes("error") ||
        combinedText.includes("exception")
      ) {
        const currentDebugScore = scores.get(TaskType.debugging) || 0;
        scores.set(TaskType.debugging, currentDebugScore + 1);
      }
    }

    // 短消息倾向 code_completion
    if (messageLength < 100 && hasCode) {
      const currentCompScore = scores.get(TaskType.code_completion) || 0;
      scores.set(TaskType.code_completion, currentCompScore + 1);
    }

    // 超长消息倾向 code_generation
    if (messageLength > 1000) {
      const currentGenScore = scores.get(TaskType.code_generation) || 0;
      scores.set(TaskType.code_generation, currentGenScore + 0.5);
    }

    // 找到最高分的任务类型
    let bestType: TaskType = TaskType.general;
    let bestScore = 0;

    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // 如果没有明显匹配，根据是否有代码判断
    if (bestScore === 0) {
      if (hasCode) {
        return TaskType.code_completion;
      }
      return TaskType.general;
    }

    return bestType;
  }
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ==================== 默认模型配置 ====================

/** 内置模型配置表 */
export const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    cost_per_1k_input: 0.0027,
    cost_per_1k_output: 0.011,
    quality_score: 9.0,
    speed_score: 6.0,
    max_context: 128000,
  },
  {
    id: "deepseek-flash",
    name: "DeepSeek Flash",
    provider: "deepseek",
    cost_per_1k_input: 0.0001,
    cost_per_1k_output: 0.0004,
    quality_score: 7.5,
    speed_score: 9.5,
    max_context: 64000,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    cost_per_1k_input: 0.005,
    cost_per_1k_output: 0.015,
    quality_score: 9.0,
    speed_score: 7.0,
    max_context: 128000,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    cost_per_1k_input: 0.00015,
    cost_per_1k_output: 0.0006,
    quality_score: 7.0,
    speed_score: 9.0,
    max_context: 128000,
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
    quality_score: 9.5,
    speed_score: 7.5,
    max_context: 200000,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    cost_per_1k_input: 0.0008,
    cost_per_1k_output: 0.004,
    quality_score: 7.5,
    speed_score: 9.0,
    max_context: 200000,
  },
];

// ==================== 路由引擎 ====================

/** 路由结果 */
export interface RouteResult {
  provider: string;
  model: string;
}

/** 路由引擎配置 */
export interface RouteEngineOptions {
  strategy?: RouteStrategy;
  routingTable?: Record<string, RoutingEntry[]>;
  modelConfigs?: ModelConfig[];
}

/**
 * 智能路由引擎
 * 根据任务类型、路由策略和历史性能选择最优模型
 */
export class RouteEngine {
  private classifier: RuleBasedClassifier;
  private strategy: RouteStrategy;
  private routingTable: Record<string, RoutingEntry[]>;
  private modelConfigs: Map<string, ModelConfig>;
  private performanceData: Map<string, ModelPerformance>;
  private enabledProviders: Set<string>;

  constructor(options: RouteEngineOptions = {}) {
    this.classifier = new RuleBasedClassifier();
    this.strategy = options.strategy || "balanced";
    this.routingTable = options.routingTable || this.getDefaultRoutingTable();
    this.modelConfigs = new Map();
    this.performanceData = new Map();
    this.enabledProviders = new Set();

    // 加载模型配置
    const configs = options.modelConfigs || MODEL_CONFIGS;
    for (const config of configs) {
      this.modelConfigs.set(config.id, config);
    }
  }

  /** 设置启用的 Provider 列表 */
  setEnabledProviders(providers: string[]): void {
    this.enabledProviders = new Set(providers);
  }

  /** 设置路由策略 */
  setStrategy(strategy: RouteStrategy): void {
    this.strategy = strategy;
  }

  /**
   * 从消息中分类任务类型
   */
  classifyTask(messages: ChatMessage[]): TaskType {
    return this.classifier.classify(messages);
  }

  /**
   * 执行路由：根据任务类型和策略选择最优模型
   */
  route(
    taskType: TaskType,
    originalModel?: string,
    strategy?: RouteStrategy,
  ): RouteResult {
    const effectiveStrategy = strategy || this.strategy;
    const entries = this.getAvailableEntries(taskType);

    if (entries.length === 0) {
      // 没有可用路由，回退到原始模型
      return {
        provider: "deepseek",
        model: originalModel || "deepseek-flash",
      };
    }

    // 如果只有一条路由，直接使用
    if (entries.length === 1) {
      return { provider: entries[0].provider, model: entries[0].model };
    }

    // 根据策略选择
    switch (effectiveStrategy) {
      case "cost":
        return this.routeByCost(entries);
      case "quality":
        return this.routeByQuality(entries);
      case "balanced":
      default:
        return this.routeByBalanced(entries, taskType);
    }
  }

  /**
   * 记录模型请求结果，用于性能追踪
   */
  recordPerformance(
    provider: string,
    model: string,
    taskType: TaskType,
    success: boolean,
    latencyMs: number,
  ): void {
    const key = `${provider}:${model}:${taskType}`;
    const existing = this.performanceData.get(key);

    if (existing) {
      existing.total_requests += 1;
      if (success) {
        existing.success_count += 1;
      }
      existing.avg_latency_ms =
        (existing.avg_latency_ms * (existing.total_requests - 1) + latencyMs) /
        existing.total_requests;
      existing.last_used = Date.now();
    } else {
      this.performanceData.set(key, {
        provider,
        model,
        task_type: taskType,
        total_requests: 1,
        success_count: success ? 1 : 0,
        avg_latency_ms: latencyMs,
        last_used: Date.now(),
      });
    }
  }

  /**
   * 获取模型性能数据
   */
  getModelPerformance(): ModelPerformance[] {
    return Array.from(this.performanceData.values());
  }

  /**
   * 获取指定任务类型的可用路由条目
   */
  private getAvailableEntries(taskType: TaskType): RoutingEntry[] {
    const entries = this.routingTable[taskType] || [];
    return entries.filter((entry) => {
      // 过滤掉未启用的 Provider
      if (
        this.enabledProviders.size > 0 &&
        !this.enabledProviders.has(entry.provider)
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * 成本优先路由：选择最便宜的模型
   */
  private routeByCost(entries: RoutingEntry[]): RouteResult {
    // 质量阈值：至少达到6分
    const QUALITY_THRESHOLD = 6.0;

    const candidates = entries
      .map((entry) => ({
        entry,
        config: this.modelConfigs.get(entry.model),
      }))
      .filter(
        (item) => item.config && item.config.quality_score >= QUALITY_THRESHOLD,
      )
      .sort((a, b) => {
        // 按输出成本排序（输出通常比输入贵）
        const costA =
          (a.config!.cost_per_1k_input + a.config!.cost_per_1k_output) / 2;
        const costB =
          (b.config!.cost_per_1k_input + b.config!.cost_per_1k_output) / 2;
        return costA - costB;
      });

    if (candidates.length === 0) {
      // 回退到优先级最高的
      const fallback = entries.sort((a, b) => a.priority - b.priority)[0];
      return { provider: fallback.provider, model: fallback.model };
    }

    const best = candidates[0];
    return { provider: best.entry.provider, model: best.entry.model };
  }

  /**
   * 质量优先路由：选择质量最高的模型
   */
  private routeByQuality(entries: RoutingEntry[]): RouteResult {
    const candidates = entries
      .map((entry) => ({
        entry,
        config: this.modelConfigs.get(entry.model),
      }))
      .filter((item) => item.config)
      .sort((a, b) => b.config!.quality_score - a.config!.quality_score);

    if (candidates.length === 0) {
      const fallback = entries.sort((a, b) => a.priority - b.priority)[0];
      return { provider: fallback.provider, model: fallback.model };
    }

    const best = candidates[0];
    return { provider: best.entry.provider, model: best.entry.model };
  }

  /**
   * 均衡路由：综合质量、速度和成本
   * 加权分数 = 质量*0.5 + 速度*0.3 + (1-归一化成本)*0.2
   */
  private routeByBalanced(
    entries: RoutingEntry[],
    taskType: TaskType,
  ): RouteResult {
    const candidates = entries
      .map((entry) => {
        const config = this.modelConfigs.get(entry.model);
        const perfKey = `${entry.provider}:${entry.model}:${taskType}`;
        const perf = this.performanceData.get(perfKey);
        return { entry, config, perf };
      })
      .filter((item) => item.config);

    if (candidates.length === 0) {
      const fallback = entries.sort((a, b) => a.priority - b.priority)[0];
      return { provider: fallback.provider, model: fallback.model };
    }

    // 计算成本归一化因子
    const maxCost = Math.max(
      ...candidates.map(
        (c) => (c.config!.cost_per_1k_input + c.config!.cost_per_1k_output) / 2,
      ),
    );

    // 计算每个候选的综合分数
    const scored = candidates.map((candidate) => {
      const { config, perf } = candidate;
      const avgCost =
        (config!.cost_per_1k_input + config!.cost_per_1k_output) / 2;
      const normalizedCost = maxCost > 0 ? avgCost / maxCost : 0;

      // 基础分数
      let score =
        config!.quality_score * 0.5 +
        config!.speed_score * 0.3 +
        (1 - normalizedCost) * 0.2;

      // 根据历史性能调整
      if (perf && perf.total_requests >= 3) {
        const successRate = perf.success_count / perf.total_requests;
        // 成功率低于50%时大幅降低分数
        if (successRate < 0.5) {
          score *= 0.5;
        } else if (successRate < 0.8) {
          score *= 0.8;
        }
        // 延迟惩罚：超过5秒降低分数
        if (perf.avg_latency_ms > 5000) {
          score *= 0.7;
        }
      }

      return { ...candidate, score };
    });

    // 按综合分数降序排序
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return { provider: best.entry.provider, model: best.entry.model };
  }

  /**
   * 获取默认路由表
   */
  private getDefaultRoutingTable(): Record<string, RoutingEntry[]> {
    return {
      [TaskType.code_completion]: [
        { model: "deepseek-flash", provider: "deepseek", priority: 1 },
        { model: "gpt-4o-mini", provider: "openai", priority: 2 },
      ],
      [TaskType.code_generation]: [
        { model: "deepseek-v4-pro", provider: "deepseek", priority: 1 },
        { model: "gpt-4o", provider: "openai", priority: 2 },
        {
          model: "claude-sonnet-4-20250514",
          provider: "anthropic",
          priority: 3,
        },
      ],
      [TaskType.debugging]: [
        { model: "deepseek-v4-pro", provider: "deepseek", priority: 1 },
        {
          model: "claude-sonnet-4-20250514",
          provider: "anthropic",
          priority: 2,
        },
      ],
      [TaskType.refactoring]: [
        { model: "deepseek-v4-pro", provider: "deepseek", priority: 1 },
        { model: "gpt-4o", provider: "openai", priority: 2 },
      ],
      [TaskType.code_review]: [
        { model: "deepseek-v4-pro", provider: "deepseek", priority: 1 },
        {
          model: "claude-sonnet-4-20250514",
          provider: "anthropic",
          priority: 2,
        },
      ],
      [TaskType.explanation]: [
        { model: "deepseek-flash", provider: "deepseek", priority: 1 },
        { model: "gpt-4o-mini", provider: "openai", priority: 2 },
      ],
      [TaskType.testing]: [
        { model: "deepseek-v4-pro", provider: "deepseek", priority: 1 },
        { model: "gpt-4o", provider: "openai", priority: 2 },
      ],
      [TaskType.general]: [
        { model: "deepseek-flash", provider: "deepseek", priority: 1 },
        { model: "gpt-4o-mini", provider: "openai", priority: 2 },
      ],
    };
  }
}
