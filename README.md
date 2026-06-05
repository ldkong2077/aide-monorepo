# AIDE - AI 编程验证工具

> 让非专业程序员也能安全地使用 AI 编程

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue.svg)](https://modelcontextprotocol.io/)

---

## 为什么需要 AIDE？

**问题**：84% 的开发者使用 AI 编程工具，但 AI 生成的代码经常有问题：

- ❌ 编造不存在的包和函数（幻觉）
- ❌ 逻辑错误、死代码
- ❌ 安全漏洞
- ❌ 非专业程序员无法判断代码质量

**解决方案**：AIDE 自动验证 AI 生成的代码，确保每一行都可靠。

---

## 30 秒快速开始

```bash
# 1. 安装
npm install -g aide

# 2. 进入你的项目
cd your-project

# 3. 一键初始化（自动配置所有 AI 工具）
aide init
```

**完成！** 现在你的 AI 编程工具（Claude Code、Cursor、opencode）会自动验证每一次代码修改。

---

## 核心功能

### 1. 自动验证 AI 代码

AI 每次修改代码后，AIDE 自动检查：

```bash
# 手动验证单个文件
aide guard check -f src/auth.ts

# 验证整个项目
aide guard verify -p .
```

**检查内容**：
- 幻觉检测（不存在的包/函数）
- 逻辑错误
- 代码质量
- 测试覆盖

**输出结果**：
- ✅ `TRUST` - 代码可靠，可以使用
- ⚠️ `REVIEW` - 需要人工审查
- ❌ `REJECT` - 代码有问题，需要修复

---

### 2. 从想法到代码（非专业程序员首选）

不知道如何开始？告诉 AIDE 你的想法：

```bash
# 描述你的想法，AIDE 帮你规划
aide mind full "我想做一个待办事项应用"
```

**AIDE 会**：
1. 问你问题理解需求
2. 生成设计文档
3. 创建实施计划
4. 指导你逐步实现

---

### 3. 代码知识图谱

理解代码结构，快速定位问题：

```bash
# 查询函数定义
codegraph_query(query="authenticate", kind="definition")

# 查询谁调用了这个函数
codegraph_query(query="authenticate", kind="reference")
```

---

### 4. 项目模板快速启动

```bash
# 查看可用模板
aide template list

# 从模板创建项目
aide template create todo-app my-todo-app
```

**可用模板**：
- `todo-app` - React + TypeScript 待办事项
- `api-server` - Express + Prisma API 服务
- `cli-tool` - Commander.js 命令行工具

---

## 工作原理

```
你：告诉 AI 要做什么
        ↓
AI：编写代码
        ↓
AIDE：自动验证（guard_verify）
        ↓
    ┌─────────────┐
    │ 检查结果    │
    │ TRUST ✓     │
    │ REVIEW ⚠️   │
    │ REJECT ✗    │
    └─────────────┘
        ↓
通过 → 提交代码
失败 → AI 自动修复后重新验证
```

---

## 支持的 AI 工具

| 工具 | 支持状态 |
|------|----------|
| Claude Code | ✅ 完全支持 |
| Cursor | ✅ 完全支持 |
| opencode | ✅ 完全支持 |
| Codex CLI | ✅ 完全支持 |
| Hermes | ✅ 完全支持 |

---

## 安装要求

- Node.js 20.0.0 或更高版本
- npm 9.0.0 或更高版本

---

## 详细文档

- [快速开始指南](docs/quick-start.md)
- [CLI 命令参考](docs/cli-reference.md)
- [架构说明](docs/architecture.md)
- [贡献指南](CONTRIBUTING.md)

---

## 常见问题

### Q: 非专业程序员能用吗？

**可以！** AIDE 就是为非专业程序员设计的。你只需要：

1. `npm install -g aide` - 安装
2. `aide init` - 初始化
3. 告诉 AI 你要做什么 - AIDE 自动验证

### Q: 会收费吗？

**核心功能永久免费**。AIDE 是开源项目，MIT 协议。

### Q: 我的代码会被上传吗？

**不会**。所有验证都在本地进行，代码不会上传到任何服务器。

### Q: 支持哪些编程语言？

支持所有主流语言：
- JavaScript / TypeScript
- Python
- Go
- 以及更多...

---

## 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 联系方式

- GitHub Issues: [提交问题](https://github.com/ldkong2077/aide-monorepo/issues)
- Email: info@numboxhub.com

---

**如果 AIDE 对你有帮助，请给个 Star ⭐ 支持一下！**
