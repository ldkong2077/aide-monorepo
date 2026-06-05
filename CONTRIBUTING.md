# 贡献指南

感谢你对 AIDE 的关注！我们欢迎各种形式的贡献。

---

## 如何贡献

### 报告问题

发现 bug？请在 [GitHub Issues](https://github.com/your-username/aide-monorepo/issues) 中报告：

1. 搜索是否已有相同问题
2. 创建新 Issue，包含：
   - 问题描述
   - 复现步骤
   - 期望行为
   - 实际行为
   - 环境信息（Node.js 版本、操作系统等）

### 提交功能建议

有好的想法？在 Issues 中创建功能建议：

1. 描述功能用途
2. 说明解决什么问题
3. 提供使用场景

### 贡献代码

1. Fork 项目
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m "feat: add new feature"`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

---

## 开发环境

### 前置要求

- Node.js 20.0.0+
- npm 9.0.0+
- Git

### 设置步骤

```bash
# 1. Fork 并克隆
git clone https://github.com/ldkong2077/aide-monorepo.git
cd aide-monorepo

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 运行测试
npm test
```

### 开发命令

```bash
npm run build          # 构建所有包
npm test               # 运行测试
npm run lint           # 检查代码风格
npm run lint:fix       # 自动修复代码风格
npm run format         # 格式化代码
npm run typecheck      # 类型检查
```

---

## 项目结构

```
aide-monorepo/
├── packages/
│   ├── cli/           # CLI 入口
│   ├── mcp-server/    # MCP 服务器
│   ├── guard/         # 验证引擎
│   ├── graph/         # 代码图谱
│   ├── core/          # 共享类型
│   ├── mind/          # 项目设计
│   ├── templates/     # 项目模板
│   ├── flow/          # 开发流程
│   └── dashboard/     # 仪表盘
├── docs/              # 文档
└── config/            # 配置文件
```

---

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式（不影响功能）
- `refactor:` 重构
- `test:` 测试
- `chore:` 构建/工具更新

**示例**：
```bash
git commit -m "feat: 添加 Python 幻觉检测"
git commit -m "fix: 修复 CLI 参数解析错误"
git commit -m "docs: 更新快速开始指南"
```

---

## 代码规范

### TypeScript

- 使用严格模式
- 避免 `any` 类型
- 使用接口定义对象结构
- 导出类型

### 代码风格

- 使用项目提供的 ESLint 和 Prettier 配置
- 编写清晰的变量和函数名
- 复杂逻辑添加注释

### 测试

- 新功能必须有测试
- 测试文件放在 `__tests__/` 或使用 `.test.ts` 后缀
- 使用 Vitest 运行测试

---

## Pull Request 检查清单

提交 PR 前，请确保：

- [ ] 代码通过所有测试：`npm test`
- [ ] 代码通过 lint 检查：`npm run lint`
- [ ] 代码已格式化：`npm run format`
- [ ] 更新了相关文档
- [ ] 提交信息符合规范
- [ ] PR 描述清晰

---

## 发布流程

1. 更新版本号
2. 更新 CHANGELOG.md
3. 创建发布 PR
4. 合并后自动发布到 npm

---

## 获取帮助

- GitHub Issues: 报告问题
- GitHub Discussions: 提问讨论
- Email: info@numboxhub.com

---

## 许可证

贡献即表示你同意你的代码在 MIT 许可证下发布。

---

**感谢你的贡献！**
