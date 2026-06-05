/**
 * AIDE Mind - Writing Plans Module
 * Generates implementation plans from design documents.
 * Inspired by Superpowers' writing-plans skill.
 */

import type {
  DesignDocument,
  PlanDocument,
  ImplementationTask,
} from './types.js';

/** Generate implementation plan from design document */
export function generatePlan(design: DesignDocument): PlanDocument {
  const tasks: ImplementationTask[] = [];

  // Task 1: Project setup
  tasks.push({
    id: 'task_1',
    title: '项目初始化',
    description: '创建项目结构和配置文件',
    files: [
      'package.json',
      'tsconfig.json',
      '.gitignore',
      'README.md',
    ],
    dependencies: [],
    verification: [
      'npm install 成功',
      'npm run build 成功',
    ],
    estimatedTime: '10 分钟',
    priority: 'high',
  });

  // Task 2: Core types
  tasks.push({
    id: 'task_2',
    title: '定义核心类型',
    description: '创建 TypeScript 类型定义文件',
    files: [
      'src/types/index.ts',
      'src/types/user.ts',
      'src/types/content.ts',
    ],
    dependencies: ['task_1'],
    verification: [
      'TypeScript 编译无错误',
      '类型定义完整',
    ],
    estimatedTime: '15 分钟',
    priority: 'high',
  });

  // Task 3: Database setup
  tasks.push({
    id: 'task_3',
    title: '数据库设置',
    description: '配置数据库连接和模型',
    files: [
      'src/database/index.ts',
      'src/database/schema.ts',
      'src/database/migrations/001_init.sql',
    ],
    dependencies: ['task_2'],
    verification: [
      '数据库连接成功',
      '迁移脚本执行成功',
    ],
    estimatedTime: '20 分钟',
    priority: 'high',
  });

  // Task 4: API layer
  tasks.push({
    id: 'task_4',
    title: '实现 API 层',
    description: '创建 RESTful API 端点',
    files: [
      'src/api/index.ts',
      'src/api/routes/users.ts',
      'src/api/routes/content.ts',
      'src/api/middleware/auth.ts',
    ],
    dependencies: ['task_3'],
    verification: [
      'API 端点可访问',
      '请求/响应格式正确',
      '认证中间件工作',
    ],
    estimatedTime: '30 分钟',
    priority: 'high',
  });

  // Task 5: Frontend setup
  tasks.push({
    id: 'task_5',
    title: '前端项目设置',
    description: '初始化前端框架和基础组件',
    files: [
      'src/frontend/package.json',
      'src/frontend/tsconfig.json',
      'src/frontend/src/App.tsx',
      'src/frontend/src/main.tsx',
    ],
    dependencies: ['task_1'],
    verification: [
      '前端开发服务器启动',
      '首页可访问',
    ],
    estimatedTime: '15 分钟',
    priority: 'high',
  });

  // Task 6: UI components
  tasks.push({
    id: 'task_6',
    title: '实现 UI 组件',
    description: '创建基础 UI 组件库',
    files: [
      'src/frontend/src/components/ui/Button.tsx',
      'src/frontend/src/components/ui/Input.tsx',
      'src/frontend/src/components/ui/Card.tsx',
      'src/frontend/src/components/layout/Header.tsx',
      'src/frontend/src/components/layout/Footer.tsx',
    ],
    dependencies: ['task_5'],
    verification: [
      '组件可渲染',
      '组件样式正确',
      '组件响应式',
    ],
    estimatedTime: '25 分钟',
    priority: 'medium',
  });

  // Task 7: Pages
  tasks.push({
    id: 'task_7',
    title: '实现页面',
    description: '创建主要页面组件',
    files: [
      'src/frontend/src/pages/Home.tsx',
      'src/frontend/src/pages/Detail.tsx',
      'src/frontend/src/pages/User.tsx',
      'src/frontend/src/pages/Admin.tsx',
    ],
    dependencies: ['task_6'],
    verification: [
      '页面可访问',
      '页面导航正常',
      '页面数据展示正确',
    ],
    estimatedTime: '30 分钟',
    priority: 'high',
  });

  // Task 8: Integration
  tasks.push({
    id: 'task_8',
    title: '前后端集成',
    description: '连接前端和后端 API',
    files: [
      'src/frontend/src/services/api.ts',
      'src/frontend/src/hooks/useApi.ts',
      'src/frontend/src/store/index.ts',
    ],
    dependencies: ['task_4', 'task_7'],
    verification: [
      'API 调用成功',
      '数据正确展示',
      '状态管理正常',
    ],
    estimatedTime: '20 分钟',
    priority: 'high',
  });

  // Task 9: Testing
  tasks.push({
    id: 'task_9',
    title: '编写测试',
    description: '添加单元测试和集成测试',
    files: [
      'src/__tests__/api/users.test.ts',
      'src/__tests__/api/content.test.ts',
      'src/__tests__/components/Button.test.tsx',
      'src/__tests__/pages/Home.test.tsx',
    ],
    dependencies: ['task_8'],
    verification: [
      '所有测试通过',
      '测试覆盖率 > 70%',
    ],
    estimatedTime: '25 分钟',
    priority: 'medium',
  });

  // Task 10: Documentation
  tasks.push({
    id: 'task_10',
    title: '编写文档',
    description: '完善项目文档',
    files: [
      'README.md',
      'docs/api.md',
      'docs/deployment.md',
      'docs/development.md',
    ],
    dependencies: ['task_9'],
    verification: [
      '文档完整',
      '文档准确',
      '示例可运行',
    ],
    estimatedTime: '15 分钟',
    priority: 'low',
  });

  // Calculate total estimated time
  const totalMinutes = tasks.reduce((sum, task) => {
    const match = task.estimatedTime.match(/(\d+)/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);

  return {
    projectName: design.projectName,
    designRef: `${design.projectName}-design.md`,
    tasks,
    metadata: {
      createdAt: new Date().toISOString(),
      version: '1.0.0',
      totalEstimatedTime: `${Math.ceil(totalMinutes / 60)} 小时`,
      status: 'draft',
    },
  };
}

/** Format plan as markdown */
export function formatPlanAsMarkdown(plan: PlanDocument): string {
  const lines: string[] = [];

  lines.push(`# ${plan.projectName} - 实施计划`);
  lines.push('');
  lines.push(`**生成时间**: ${plan.metadata.createdAt}`);
  lines.push(`**预计总时间**: ${plan.metadata.totalEstimatedTime}`);
  lines.push(`**任务数量**: ${plan.tasks.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Task list
  lines.push('## 任务列表');
  lines.push('');

  for (const task of plan.tasks) {
    lines.push(`### ${task.id}: ${task.title}`);
    lines.push('');
    lines.push(`**描述**: ${task.description}`);
    lines.push('');
    lines.push(`**优先级**: ${task.priority}`);
    lines.push(`**预计时间**: ${task.estimatedTime}`);
    lines.push('');

    if (task.files.length > 0) {
      lines.push('**涉及文件**:');
      for (const file of task.files) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }

    if (task.dependencies.length > 0) {
      lines.push('**依赖任务**:');
      for (const dep of task.dependencies) {
        lines.push(`- ${dep}`);
      }
      lines.push('');
    }

    if (task.verification.length > 0) {
      lines.push('**验证步骤**:');
      for (const verification of task.verification) {
        lines.push(`- [ ] ${verification}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // Dependency graph
  lines.push('## 依赖关系图');
  lines.push('');
  lines.push('```');
  lines.push('task_1 (项目初始化)');
  lines.push('  ├── task_2 (核心类型)');
  lines.push('  │     └── task_3 (数据库设置)');
  lines.push('  │           └── task_4 (API 层)');
  lines.push('  │                 └── task_8 (前后端集成)');
  lines.push('  │                       └── task_9 (编写测试)');
  lines.push('  │                             └── task_10 (编写文档)');
  lines.push('  │');
  lines.push('  └── task_5 (前端项目设置)');
  lines.push('        └── task_6 (UI 组件)');
  lines.push('              └── task_7 (页面)');
  lines.push('                    └── task_8 (前后端集成)');
  lines.push('```');
  lines.push('');

  // Next steps
  lines.push('## 下一步');
  lines.push('');
  lines.push('1. 从 `task_1` 开始，按依赖顺序执行');
  lines.push('2. 每个任务完成后，运行验证步骤');
  lines.push('3. 所有验证通过后，继续下一个任务');
  lines.push('4. 如遇问题，检查依赖任务是否完成');
  lines.push('');

  return lines.join('\n');
}
