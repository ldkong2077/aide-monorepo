# 快速开始指南

本指南帮助你在 5 分钟内开始使用 AIDE。

---

## 第一步：安装 AIDE

### 前置要求

确保你已安装 Node.js 20+：

```bash
# 检查 Node.js 版本
node --version

# 如果没有安装，访问 https://nodejs.org 下载安装
```

### 安装 AIDE

```bash
npm install -g @aide-dev/cli
```

### 验证安装

```bash
aide --version
# 应该显示版本号，如 1.0.0
```

---

## 第二步：初始化项目

进入你的项目目录：

```bash
cd your-project
```

运行初始化命令：

```bash
aide init
```

**这会做什么**：

1. 自动检测你安装的 AI 工具（Claude Code、Cursor、opencode）
2. 写入 MCP 配置到各工具
3. 生成验证规则文件
4. 构建代码知识图谱

---

## 第三步：开始使用

### 方式一：让 AI 自动验证（推荐）

初始化完成后，重启你的 AI 工具（Claude Code、Cursor 等）。

现在，每次 AI 修改代码后，AIDE 会自动验证：

```
你：修复 auth.ts 中的 bug
    ↓
AI：编写修复代码
    ↓
AIDE：自动验证
    ↓
验证通过 → AI 告诉你 "修复完成"
验证失败 → AI 自动修复后重新验证
```

### 方式二：手动验证

```bash
# 验证单个文件
aide guard check -f src/auth.ts

# 验证整个项目
aide guard verify -p .

# 验证 git 暂存区
aide guard verify --staged
```

### 方式三：从想法开始（非专业程序员）

```bash
# 告诉 AIDE 你的想法
aide mind full "我想做一个待办事项应用"
```

AIDE 会：

1. 问你问题理解需求
2. 生成设计文档
3. 创建实施计划
4. 指导你逐步实现

---

## 常见问题

### Q: 初始化失败怎么办？

```bash
# 确保在项目根目录运行
cd your-project

# 确保有 package.json 文件
ls package.json

# 如果没有，先创建
npm init -y
```

### Q: AI 工具没有自动验证？

1. 确保已重启 AI 工具
2. 检查配置文件是否正确：
   - Claude Code: `~/.claude.json`
   - Cursor: `.cursor/mcp.json`
   - opencode: `opencode.json`

### Q: 如何卸载？

```bash
npm uninstall -g @aide-dev/cli
```

---

## 下一步

- [CLI 命令参考](cli-reference.md) - 了解所有命令
- [架构说明](architecture.md) - 了解工作原理
- [贡献指南](../CONTRIBUTING.md) - 参与贡献
