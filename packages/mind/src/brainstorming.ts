/**
 * AIDE Mind - Brainstorming Module
 * Core logic for the brainstorming process.
 * Inspired by Superpowers' brainstorming skill.
 */

import type {
  BrainstormSession,
  BrainstormStep,
  ClarifyingQuestion,
  ProposedApproach,
  DesignDocument,
  DesignSection,
  ProjectContext,
  MindProcessResult,
} from "./types.js";

/** Generate a unique session ID */
function generateSessionId(): string {
  return `mind_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Create a new brainstorming session */
export function createSession(idea: string): BrainstormSession {
  return {
    id: generateSessionId(),
    idea,
    currentStep: "explore_context",
    questions: [],
    answers: {},
    approaches: [],
    startedAt: new Date().toISOString(),
  };
}

/** Get the next step in the brainstorming process */
export function getNextStep(
  currentStep: BrainstormStep,
): BrainstormStep | null {
  const stepOrder: BrainstormStep[] = [
    "explore_context",
    "ask_questions",
    "propose_approaches",
    "present_design",
    "write_documents",
    "self_review",
    "user_approval",
    "transition",
  ];
  const currentIndex = stepOrder.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === stepOrder.length - 1) {
    return null;
  }
  return stepOrder[currentIndex + 1];
}

/** Build context for the brainstorming process */
export async function exploreProjectContext(
  rootPath: string,
): Promise<ProjectContext> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const context: ProjectContext = {
    rootPath,
    existingFiles: [],
    techStack: [],
    hasTests: false,
    hasCi: false,
  };

  try {
    // Read package.json if exists
    const packageJsonPath = path.join(rootPath, "package.json");
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(packageJsonContent);
      context.packageJson = packageJson;
      context.techStack.push("node.js");

      // Detect frameworks
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };
      if (deps["react"]) context.techStack.push("react");
      if (deps["vue"]) context.techStack.push("vue");
      if (deps["angular"]) context.techStack.push("angular");
      if (deps["express"]) context.techStack.push("express");
      if (deps["fastify"]) context.techStack.push("fastify");
      if (deps["next"]) context.techStack.push("next.js");
      if (deps["nuxt"]) context.techStack.push("nuxt");
      if (deps["typescript"]) context.techStack.push("typescript");
      if (deps["vitest"] || deps["jest"]) context.hasTests = true;
    } catch {
      // No package.json
    }

    // Read README if exists
    const readmePath = path.join(rootPath, "README.md");
    try {
      context.readme = await fs.readFile(readmePath, "utf-8");
    } catch {
      // No README
    }

    // Check for CI configuration
    const ciFiles = [
      ".github/workflows",
      ".gitlab-ci.yml",
      ".circleci",
      "Jenkinsfile",
    ];
    for (const ciFile of ciFiles) {
      try {
        await fs.access(path.join(rootPath, ciFile));
        context.hasCi = true;
        break;
      } catch {
        // No CI
      }
    }

    // Scan for source files
    const scanDir = async (dir: string, maxDepth = 3): Promise<void> => {
      if (maxDepth <= 0) return;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await scanDir(fullPath, maxDepth - 1);
          } else if (entry.name.match(/\.(ts|tsx|js|jsx|py|go|rs|java)$/)) {
            context.existingFiles.push(fullPath);
          }
        }
      } catch {
        // Permission denied or not a directory
      }
    };

    await scanDir(rootPath);
  } catch {
    // Ignore errors during context exploration
  }

  return context;
}

/** Generate clarifying questions based on the idea and context */
export function generateQuestions(
  _idea: string,
  context: ProjectContext,
): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = [];

  // Core requirements
  questions.push({
    id: "purpose",
    question: "这个项目的主要目的是什么？",
    context: "理解核心目标有助于定义范围",
    options: ["个人博客", "企业网站", "电商平台", "作品集", "工具应用", "其他"],
    required: true,
  });

  questions.push({
    id: "audience",
    question: "目标用户是谁？",
    context: "了解用户群体有助于设计界面和功能",
    options: ["个人用户", "企业用户", "开发者", "普通消费者", "内部团队"],
    required: true,
  });

  // Technical constraints
  if (context.techStack.length > 0) {
    questions.push({
      id: "tech_preference",
      question: `检测到现有技术栈: ${context.techStack.join(", ")}。是否要使用相同的技术栈？`,
      context: "保持技术栈一致可以减少学习成本",
      options: ["是，使用现有技术栈", "否，我想尝试新技术", "不确定，帮我推荐"],
      required: true,
    });
  } else {
    questions.push({
      id: "tech_preference",
      question: "你有偏好的技术栈吗？",
      context: "选择合适的技术栈影响开发效率",
      options: [
        "React + TypeScript",
        "Vue + TypeScript",
        "Node.js + Express",
        "Python + FastAPI",
        "不确定，帮我推荐",
      ],
      required: true,
    });
  }

  // Scope & scale
  questions.push({
    id: "scope",
    question: "项目的规模和时间预期？",
    context: "这会影响技术方案的选择",
    options: [
      "小型项目 (1-2周)",
      "中型项目 (1-2月)",
      "大型项目 (3月+)",
      "不确定",
    ],
    required: true,
  });

  questions.push({
    id: "features",
    question: "有哪些核心功能必须实现？",
    context: "明确 MVP 范围，避免范围蔓延",
    options: [
      "用户认证",
      "数据存储",
      "API 接口",
      "实时功能",
      "支付集成",
      "文件上传",
    ],
    required: true,
  });

  // Success criteria
  questions.push({
    id: "success",
    question: "如何定义项目成功？",
    context: "明确成功标准有助于做出正确的技术决策",
    options: ["能正常运行", "用户体验好", "可扩展维护", "性能优秀", "安全可靠"],
    required: true,
  });

  return questions;
}

/** Generate proposed approaches based on requirements */
export function generateApproaches(
  idea: string,
  _context: ProjectContext,
  _answers: Record<string, string>,
): ProposedApproach[] {
  const approaches: ProposedApproach[] = [];

  // Check if idea matches any template
  const templateMatch = matchTemplate(idea);
  if (templateMatch) {
    // Use template as the primary approach
    approaches.push({
      id: `template_${templateMatch.id}`,
      name: `${templateMatch.config.name} (推荐模板)`,
      description: templateMatch.config.description,
      pros: ["开箱即用", "最佳实践", "完整的项目结构", "文档齐全"],
      cons: ["可能需要定制", "模板可能过时"],
      complexity:
        templateMatch.config.difficulty === "beginner"
          ? "low"
          : templateMatch.config.difficulty === "intermediate"
            ? "medium"
            : "high",
      estimatedTime: templateMatch.config.estimatedTime,
      techStack: templateMatch.config.techStack,
    });
  }

  // Approach A: Simple & Fast
  approaches.push({
    id: "simple",
    name: "简洁快速方案",
    description: "使用成熟的技术栈，快速实现核心功能",
    pros: ["开发速度快", "技术成熟稳定", "社区资源丰富", "易于维护"],
    cons: ["可能缺乏灵活性", "扩展性有限", "定制化程度低"],
    complexity: "low",
    estimatedTime: "1-2 周",
    techStack: ["React", "TypeScript", "Node.js"],
  });

  // Approach B: Flexible & Modern
  approaches.push({
    id: "flexible",
    name: "灵活现代方案",
    description: "使用现代框架，提供更好的架构和扩展性",
    pros: ["架构清晰", "易于扩展", "开发体验好", "类型安全"],
    cons: ["学习曲线较陡", "开发时间较长", "需要更多配置"],
    complexity: "medium",
    estimatedTime: "2-4 周",
    techStack: ["Next.js", "TypeScript", "PostgreSQL"],
  });

  // Approach C: Enterprise-grade
  approaches.push({
    id: "enterprise",
    name: "企业级方案",
    description: "完整的架构设计，适合长期维护和团队协作",
    pros: ["高度可扩展", "完整的测试覆盖", "企业级安全", "团队协作友好"],
    cons: ["开发周期长", "复杂度高", "过度设计风险"],
    complexity: "high",
    estimatedTime: "1-2 月",
    techStack: [
      "React",
      "TypeScript",
      "Node.js",
      "PostgreSQL",
      "Redis",
      "Docker",
    ],
  });

  return approaches;
}

/** Match idea to a template */
function matchTemplate(idea: string): {
  id: string;
  config: {
    name: string;
    description: string;
    difficulty: string;
    estimatedTime: string;
    techStack: string[];
  };
} | null {
  const lowerIdea = idea.toLowerCase();

  // Simple keyword matching
  if (
    lowerIdea.includes("todo") ||
    lowerIdea.includes("待办") ||
    lowerIdea.includes("任务")
  ) {
    return {
      id: "todo-app",
      config: {
        name: "TODO Application",
        description:
          "A simple TODO application with React, TypeScript, and localStorage",
        difficulty: "beginner",
        estimatedTime: "2-3 hours",
        techStack: ["React", "TypeScript", "Vite", "Tailwind CSS"],
      },
    };
  }

  if (
    lowerIdea.includes("api") ||
    lowerIdea.includes("服务器") ||
    lowerIdea.includes("后端")
  ) {
    return {
      id: "api-server",
      config: {
        name: "API Server",
        description:
          "A RESTful API server with Express, TypeScript, and PostgreSQL",
        difficulty: "intermediate",
        estimatedTime: "4-6 hours",
        techStack: ["Express", "TypeScript", "PostgreSQL", "Prisma"],
      },
    };
  }

  if (
    lowerIdea.includes("cli") ||
    lowerIdea.includes("命令行") ||
    lowerIdea.includes("工具")
  ) {
    return {
      id: "cli-tool",
      config: {
        name: "CLI Tool",
        description: "A command-line tool with Commander.js and TypeScript",
        difficulty: "beginner",
        estimatedTime: "2-3 hours",
        techStack: ["Node.js", "TypeScript", "Commander.js", "Inquirer.js"],
      },
    };
  }

  return null;
}

/** Generate design document */
export function generateDesign(
  idea: string,
  context: ProjectContext,
  answers: Record<string, string>,
  selectedApproach: ProposedApproach,
): DesignDocument {
  const sections: DesignSection[] = [
    {
      id: "overview",
      title: "项目概述",
      content: `
## 项目概述

**项目名称**: ${answers["purpose"] || "我的项目"}
**项目描述**: ${idea}
**目标用户**: ${answers["audience"] || "待定"}
**技术栈**: ${selectedApproach.techStack.join(", ")}
**预计时间**: ${selectedApproach.estimatedTime}
**现有代码文件**: ${context.existingFiles.length}
**已有测试**: ${context.hasTests ? "是" : "否"}
**已有 CI**: ${context.hasCi ? "是" : "否"}
      `.trim(),
    },
    {
      id: "architecture",
      title: "架构设计",
      content: `
## 架构设计

### 整体架构

\`\`\`
┌─────────────────────────────────────────────────────────┐
│                    前端 (Frontend)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  页面   │  │  组件   │  │  状态   │  │  路由   │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    后端 (Backend)                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  API    │  │  业务   │  │  数据   │  │  认证   │  │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    数据层 (Data)                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │  数据库 │  │  缓存   │  │  存储   │               │
│  └─────────┘  └─────────┘  └─────────┘               │
└─────────────────────────────────────────────────────────┘
\`\`\`
      `.trim(),
    },
    {
      id: "data_model",
      title: "数据模型",
      content: `
## 数据模型

### 核心实体

\`\`\`typescript
// 用户实体
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// 内容实体
interface Content {
  id: string;
  title: string;
  body: string;
  authorId: string;
  status: 'draft' | 'published';
  createdAt: Date;
  updatedAt: Date;
}
\`\`\`

### 实体关系

\`\`\`
User (1) ──┬── (N) Content
           │
           └── (N) Comment
\`\`\`
      `.trim(),
    },
    {
      id: "api_design",
      title: "API 设计",
      content: `
## API 设计

### RESTful 端点

\`\`\`
GET    /api/users          - 获取用户列表
GET    /api/users/:id      - 获取单个用户
POST   /api/users          - 创建用户
PUT    /api/users/:id      - 更新用户
DELETE /api/users/:id      - 删除用户

GET    /api/contents       - 获取内容列表
GET    /api/contents/:id   - 获取单个内容
POST   /api/contents       - 创建内容
PUT    /api/contents/:id   - 更新内容
DELETE /api/contents/:id   - 删除内容
\`\`\`

### 认证方式

使用 JWT Token 进行身份认证：
\`\`\`
Authorization: Bearer <token>
\`\`\`
      `.trim(),
    },
    {
      id: "ui_design",
      title: "用户界面",
      content: `
## 用户界面

### 页面结构

\`\`\`
├── 首页 (/)
│   ├── 导航栏
│   ├── 内容列表
│   └── 页脚
│
├── 详情页 (/detail/:id)
│   ├── 内容详情
│   ├── 评论区
│   └── 相关推荐
│
├── 用户中心 (/user)
│   ├── 个人资料
│   ├── 我的内容
│   └── 设置
│
└── 管理后台 (/admin)
    ├── 内容管理
    ├── 用户管理
    └── 系统设置
\`\`\`

### 响应式设计

- **桌面端**: 1200px+ 宽度
- **平板端**: 768px - 1199px
- **移动端**: < 768px
      `.trim(),
    },
    {
      id: "implementation",
      title: "实现细节",
      content: `
## 实现细节

### 文件结构

\`\`\`
src/
├── components/          # 可复用组件
│   ├── ui/             # 基础 UI 组件
│   ├── layout/         # 布局组件
│   └── features/       # 功能组件
│
├── pages/              # 页面组件
├── hooks/              # 自定义 Hooks
├── services/           # API 服务
├── store/              # 状态管理
├── utils/              # 工具函数
├── types/              # 类型定义
└── styles/             # 样式文件
\`\`\`

### 关键算法

1. **数据分页**: 使用游标分页提高性能
2. **搜索优化**: 使用全文索引
3. **缓存策略**: Redis 缓存热点数据
      `.trim(),
    },
    {
      id: "testing",
      title: "测试策略",
      content: `
## 测试策略

### 测试金字塔

\`\`\`
         /\\
        /  \\  E2E 测试 (10%)
       /----\\
      /      \\  集成测试 (20%)
     /--------\\
    /          \\  单元测试 (70%)
   /____________\\
\`\`\`

### 测试覆盖

- **单元测试**: 工具函数、纯函数
- **集成测试**: API 端点、数据库操作
- **E2E 测试**: 关键用户流程

### 测试命令

\`\`\`bash
npm run test          # 运行所有测试
npm run test:unit     # 运行单元测试
npm run test:int      # 运行集成测试
npm run test:e2e      # 运行 E2E 测试
\`\`\`
      `.trim(),
    },
  ];

  return {
    projectName: answers["purpose"] || "我的项目",
    idea,
    approaches: [selectedApproach],
    selectedApproach: selectedApproach.id,
    sections,
    metadata: {
      createdAt: new Date().toISOString(),
      version: "1.0.0",
      status: "draft",
    },
  };
}

/** Self-review the design document */
export function selfReviewDesign(design: DesignDocument): {
  score: number;
  issues: string[];
  suggestions: string[];
  recommendation: string;
} {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check completeness
  if (design.sections.length < 5) {
    issues.push("设计文档缺少必要章节");
    suggestions.push("添加更多设计章节，如架构、数据模型、API 设计等");
  }

  // Check consistency
  const sectionIds = design.sections.map((s) => s.id);
  const requiredSections = ["overview", "architecture", "data_model"];
  for (const required of requiredSections) {
    if (!sectionIds.includes(required)) {
      issues.push(`缺少必要章节: ${required}`);
      suggestions.push(`添加 ${required} 章节`);
    }
  }

  // Check feasibility
  if (design.approaches.length === 0) {
    issues.push("没有选择技术方案");
    suggestions.push("至少提供一个技术方案");
  }

  // Calculate score
  let score = 10;
  score -= issues.length * 2;
  score = Math.max(0, score);

  return {
    score,
    issues,
    suggestions,
    recommendation: score >= 7 ? "可以继续实施" : "需要改进后继续",
  };
}

/** Process a brainstorming step */
export async function processStep(
  session: BrainstormSession,
  input?: string,
): Promise<MindProcessResult> {
  try {
    switch (session.currentStep) {
      case "explore_context": {
        const context = await exploreProjectContext(process.cwd());
        return {
          sessionId: session.id,
          success: true,
          step: session.currentStep,
          output: {
            message: `项目上下文探索完成。检测到技术栈: ${context.techStack.join(", ") || "新项目"}`,
          },
        };
      }

      case "ask_questions": {
        if (!input) {
          // Generate questions
          const context = await exploreProjectContext(process.cwd());
          const questions = generateQuestions(session.idea, context);
          session.questions = questions;
          return {
            sessionId: session.id,
            success: true,
            step: session.currentStep,
            output: {
              message: `我需要了解一些信息来帮助你设计项目。\n\n${questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}`,
            },
          };
        }
        // Process answer
        return {
          sessionId: session.id,
          success: true,
          step: session.currentStep,
          output: {
            message: "好的，我已记录你的回答。请继续回答下一个问题。",
          },
        };
      }

      case "propose_approaches": {
        const context = await exploreProjectContext(process.cwd());
        const approaches = generateApproaches(
          session.idea,
          context,
          session.answers,
        );
        session.approaches = approaches;
        return {
          sessionId: session.id,
          success: true,
          step: session.currentStep,
          output: {
            message: `基于你的需求，我提出以下方案：\n\n${approaches.map((a, i) => `${i + 1}. ${a.name}\n   ${a.description}\n   复杂度: ${a.complexity} | 时间: ${a.estimatedTime}`).join("\n\n")}`,
          },
        };
      }

      case "present_design": {
        const context = await exploreProjectContext(process.cwd());
        const approaches =
          session.approaches.length > 0
            ? session.approaches
            : generateApproaches(session.idea, context, session.answers);
        const selectedApproach = approaches[0];
        const design = generateDesign(
          session.idea,
          context,
          session.answers,
          selectedApproach,
        );
        session.design = design;
        return {
          sessionId: session.id,
          success: true,
          step: session.currentStep,
          output: {
            message: `设计文档已生成：\n\n${design.sections.map((s, i) => `${i + 1}. ${s.title}`).join("\n")}`,
          },
        };
      }

      case "self_review": {
        if (!session.design) {
          return {
            sessionId: session.id,
            success: false,
            step: session.currentStep,
            error: "设计文档未生成",
          };
        }
        const review = selfReviewDesign(session.design);
        return {
          sessionId: session.id,
          success: true,
          step: session.currentStep,
          output: {
            message: `自检完成：\n- 得分: ${review.score}/10\n- 建议: ${review.recommendation}\n- 问题: ${review.issues.length} 个`,
          },
        };
      }

      default:
        return {
          sessionId: session.id,
          success: false,
          step: session.currentStep,
          error: `未知步骤: ${session.currentStep}`,
        };
    }
  } catch (error) {
    return {
      sessionId: session.id,
      success: false,
      step: session.currentStep,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
