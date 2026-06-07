/**
 * AIDE Mind - Writing Plans Module
 * Generates implementation plans from design documents.
 * Inspired by Superpowers' writing-plans skill.
 */

import type {
  DesignDocument,
  DesignSection,
  PlanDocument,
  ImplementationTask,
} from "./types.js";

/** Extract key terms from design sections for file naming */
function extractKeywords(sections: DesignSection[]): string[] {
  const keywords: string[] = [];
  for (const section of sections) {
    const combined = `${section.title} ${section.content}`;
    // Extract nouns and domain terms from Chinese/English text
    const matches = combined.match(
      /\b(?:用户|内容|评论|文章|订单|商品|支付|认证|授权|通知|搜索|上传|下载|API|REST|GraphQL|数据库|缓存|队列|日志|监控|部署|Docker|K8s|CI|CD|[a-zA-Z][a-zA-Z0-9]{2,})\b/g,
    );
    if (matches) {
      for (const m of matches) {
        if (!keywords.includes(m)) keywords.push(m);
      }
    }
    if (section.subsections) {
      keywords.push(...extractKeywords(section.subsections));
    }
  }
  return keywords;
}

/** Determine if the design mentions a specific technology */
function hasTech(design: DesignDocument, tech: string): boolean {
  const searchIn = [
    design.idea,
    ...design.approaches.flatMap((a) => [
      a.name,
      a.description,
      ...a.techStack,
    ]),
    ...design.sections.flatMap((s) => [s.title, s.content]),
  ];
  return searchIn.some((text) =>
    text.toLowerCase().includes(tech.toLowerCase()),
  );
}

/** Generate implementation plan from design document */
export function generatePlan(design: DesignDocument): PlanDocument {
  const tasks: ImplementationTask[] = [];
  const keywords = extractKeywords(design.sections);
  let taskCounter = 0;

  // Select the chosen approach to drive tech decisions
  const chosenApproach = design.approaches.find(
    (a) => a.id === design.selectedApproach,
  );
  const techStackDesc = chosenApproach
    ? `（技术栈: ${chosenApproach.techStack.join(", ")}）`
    : "";

  // Task 1: Project setup — driven by the selected approach's tech stack
  taskCounter++;
  const setupFiles = [
    "package.json",
    "tsconfig.json",
    ".gitignore",
    "README.md",
  ];
  const setupVerification = ["npm install 成功", "npm run build 成功"];
  tasks.push({
    id: `task_${taskCounter}`,
    title: "项目初始化",
    description: `创建 ${design.projectName ?? "项目"} 项目结构和配置文件${techStackDesc}`,
    files: setupFiles,
    dependencies: [],
    verification: setupVerification,
    estimatedTime: "10 分钟",
    priority: "high",
  });

  const setupId = `task_${taskCounter}`;

  // Task 2: Core types — derived from design sections
  taskCounter++;
  const typeFiles: string[] = ["src/types/index.ts"];
  for (const section of design.sections) {
    const slug = section.title.toLowerCase().replace(/\s+/g, "-");
    typeFiles.push(`src/types/${slug}.ts`);
  }
  tasks.push({
    id: `task_${taskCounter}`,
    title: "定义核心类型与数据模型",
    description: `根据设计文档中的 ${design.sections.length} 个模块定义 TypeScript 类型`,
    files: typeFiles,
    dependencies: [setupId],
    verification: ["TypeScript 编译无错误", "类型定义覆盖所有设计模块"],
    estimatedTime: `${Math.max(15, design.sections.length * 5)} 分钟`,
    priority: "high",
  });

  const typesId = `task_${taskCounter}`;

  // Task 3: Database setup — only if design mentions a database
  let dbId = typesId;
  if (
    hasTech(design, "数据库") ||
    hasTech(design, "database") ||
    hasTech(design, "sql") ||
    hasTech(design, "mongodb") ||
    hasTech(design, "prisma") ||
    hasTech(design, "orm")
  ) {
    taskCounter++;
    tasks.push({
      id: `task_${taskCounter}`,
      title: "数据库与数据持久化",
      description: "配置数据库连接、模型和初始迁移",
      files: [
        "src/database/index.ts",
        "src/database/schema.ts",
        "src/database/migrations/001_init.sql",
      ],
      dependencies: [typesId],
      verification: ["数据库连接成功", "迁移脚本执行成功"],
      estimatedTime: "20 分钟",
      priority: "high",
    });
    dbId = `task_${taskCounter}`;
  }

  // Task 4: Backend / API layer — driven by design sections
  taskCounter++;
  const apiFiles: string[] = ["src/api/index.ts"];
  for (const section of design.sections) {
    const slug = section.title.toLowerCase().replace(/\s+/g, "-");
    apiFiles.push(`src/api/routes/${slug}.ts`);
  }
  apiFiles.push("src/api/middleware/auth.ts");
  tasks.push({
    id: `task_${taskCounter}`,
    title: "实现业务逻辑与 API 层",
    description: `根据设计文档中的 ${design.sections.length} 个模块创建 API 端点`,
    files: apiFiles,
    dependencies: [dbId],
    verification: ["API 端点可访问", "请求/响应格式正确", "认证中间件工作"],
    estimatedTime: `${Math.max(30, design.sections.length * 10)} 分钟`,
    priority: "high",
  });

  const apiId = `task_${taskCounter}`;

  // Task 5: Frontend setup — only if design mentions frontend/UI
  let uiId = apiId;
  if (
    hasTech(design, "前端") ||
    hasTech(design, "frontend") ||
    hasTech(design, "react") ||
    hasTech(design, "vue") ||
    hasTech(design, "ui") ||
    hasTech(design, "页面") ||
    hasTech(design, "界面")
  ) {
    taskCounter++;
    tasks.push({
      id: `task_${taskCounter}`,
      title: "前端项目设置",
      description: "初始化前端框架和基础组件",
      files: [
        "src/frontend/package.json",
        "src/frontend/tsconfig.json",
        "src/frontend/src/App.tsx",
        "src/frontend/src/main.tsx",
      ],
      dependencies: [setupId],
      verification: ["前端开发服务器启动", "首页可访问"],
      estimatedTime: "15 分钟",
      priority: "high",
    });

    const frontendId = `task_${taskCounter}`;

    // Task: UI components
    taskCounter++;
    const componentFiles: string[] = [];
    for (const kw of keywords.slice(0, 5)) {
      const slug = kw.toLowerCase();
      componentFiles.push(`src/frontend/src/components/${slug}/index.tsx`);
    }
    if (componentFiles.length === 0) {
      componentFiles.push(
        "src/frontend/src/components/ui/Button.tsx",
        "src/frontend/src/components/ui/Input.tsx",
        "src/frontend/src/components/ui/Card.tsx",
      );
    }
    tasks.push({
      id: `task_${taskCounter}`,
      title: "实现 UI 组件",
      description: `根据设计文档创建 ${componentFiles.length} 个 UI 组件`,
      files: componentFiles,
      dependencies: [frontendId],
      verification: ["组件可渲染", "组件样式正确", "组件响应式"],
      estimatedTime: "25 分钟",
      priority: "medium",
    });

    const componentsId = `task_${taskCounter}`;

    // Task: Pages
    taskCounter++;
    const pageFiles: string[] = [];
    for (const section of design.sections) {
      const slug = section.title.toLowerCase().replace(/\s+/g, "-");
      pageFiles.push(`src/frontend/src/pages/${slug}.tsx`);
    }
    if (pageFiles.length === 0) {
      pageFiles.push("src/frontend/src/pages/Home.tsx");
    }
    tasks.push({
      id: `task_${taskCounter}`,
      title: `实现 ${design.sections.length} 个页面`,
      description: `根据设计文档创建 ${pageFiles.length} 个页面组件`,
      files: pageFiles,
      dependencies: [componentsId],
      verification: ["页面可访问", "页面导航正常", "页面数据展示正确"],
      estimatedTime: `${Math.max(20, pageFiles.length * 10)} 分钟`,
      priority: "high",
    });

    uiId = `task_${taskCounter}`;
  }

  // Task: Integration — only if both frontend and backend exist
  if (apiId !== setupId && uiId !== apiId) {
    taskCounter++;
    tasks.push({
      id: `task_${taskCounter}`,
      title: "前后端集成",
      description: "连接前端和后端 API，实现数据流",
      files: [
        "src/frontend/src/services/api.ts",
        "src/frontend/src/hooks/useApi.ts",
        "src/frontend/src/store/index.ts",
      ],
      dependencies: [apiId, uiId],
      verification: ["API 调用成功", "数据正确展示", "状态管理正常"],
      estimatedTime: "20 分钟",
      priority: "high",
    });
    uiId = `task_${taskCounter}`;
  }

  // Task: Testing
  taskCounter++;
  const testFiles: string[] = [];
  for (const section of design.sections) {
    const slug = section.title.toLowerCase().replace(/\s+/g, "-");
    testFiles.push(`src/__tests__/${slug}.test.ts`);
  }
  if (testFiles.length === 0) {
    testFiles.push("src/__tests__/core.test.ts");
  }
  tasks.push({
    id: `task_${taskCounter}`,
    title: "编写测试",
    description: `为 ${design.sections.length} 个模块添加单元测试和集成测试`,
    files: testFiles,
    dependencies: [uiId],
    verification: ["所有测试通过", "测试覆盖率 > 70%"],
    estimatedTime: `${Math.max(15, design.sections.length * 10)} 分钟`,
    priority: "medium",
  });

  const testId = `task_${taskCounter}`;

  // Task: Documentation
  taskCounter++;
  tasks.push({
    id: `task_${taskCounter}`,
    title: "编写文档",
    description: "完善项目文档",
    files: [
      "README.md",
      "docs/api.md",
      "docs/deployment.md",
      "docs/development.md",
    ],
    dependencies: [testId],
    verification: ["文档完整", "文档准确", "示例可运行"],
    estimatedTime: "15 分钟",
    priority: "low",
  });

  // Calculate total estimated time
  const totalMinutes = tasks.reduce((sum, task) => {
    const match = task.estimatedTime.match(/(\d+)/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);

  return {
    projectName: design.projectName,
    designRef: `${(design.projectName ?? "project").toLowerCase().replace(/\s+/g, "-")}-design.md`,
    tasks,
    metadata: {
      createdAt: new Date().toISOString(),
      version: design.metadata?.version ?? "1.0.0",
      totalEstimatedTime: `${Math.ceil(totalMinutes / 60)} 小时 ${totalMinutes % 60} 分钟`,
      status: "draft",
    },
  };
}

/** Format plan as markdown */
export function formatPlanAsMarkdown(plan: PlanDocument): string {
  const lines: string[] = [];

  lines.push(`# ${plan.projectName} - 实施计划`);
  lines.push("");
  lines.push(`**生成时间**: ${plan.metadata.createdAt}`);
  lines.push(`**预计总时间**: ${plan.metadata.totalEstimatedTime}`);
  lines.push(`**任务数量**: ${plan.tasks.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Task list
  lines.push("## 任务列表");
  lines.push("");

  for (const task of plan.tasks) {
    lines.push(`### ${task.id}: ${task.title}`);
    lines.push("");
    lines.push(`**描述**: ${task.description}`);
    lines.push("");
    lines.push(`**优先级**: ${task.priority}`);
    lines.push(`**预计时间**: ${task.estimatedTime}`);
    lines.push("");

    if (task.files.length > 0) {
      lines.push("**涉及文件**:");
      for (const file of task.files) {
        lines.push(`- \`${file}\``);
      }
      lines.push("");
    }

    if (task.dependencies.length > 0) {
      lines.push("**依赖任务**:");
      for (const dep of task.dependencies) {
        lines.push(`- ${dep}`);
      }
      lines.push("");
    }

    if (task.verification.length > 0) {
      lines.push("**验证步骤**:");
      for (const verification of task.verification) {
        lines.push(`- [ ] ${verification}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // Dependency graph — generated dynamically from task dependencies
  lines.push("## 依赖关系图");
  lines.push("");
  lines.push("```");
  for (const task of plan.tasks) {
    if (task.dependencies.length === 0) {
      lines.push(`${task.id} (${task.title})`);
    } else {
      const deps = task.dependencies.join(", ");
      lines.push(`${task.id} (${task.title}) ← ${deps}`);
    }
  }
  lines.push("```");
  lines.push("");

  // Next steps
  lines.push("## 下一步");
  lines.push("");
  lines.push("1. 从 `task_1` 开始，按依赖顺序执行");
  lines.push("2. 每个任务完成后，运行验证步骤");
  lines.push("3. 所有验证通过后，继续下一个任务");
  lines.push("4. 如遇问题，检查依赖任务是否完成");
  lines.push("");

  return lines.join("\n");
}
