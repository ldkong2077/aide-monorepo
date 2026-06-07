# AIDE 新手入门指南

> 给**不会写代码**或**刚接触编程**的朋友，教你如何用 AI 工具安全、高效地完成项目。

---

## 一、AIDE 是什么？

简单说：**AIDE 是一个帮你"检查 AI 写的代码有没有问题"的工具。**

你平时可能用 Cursor、Claude Code、Codex 等 AI 工具来写代码。这些工具确实方便，但它们也会犯错——比如：

- 编造不存在的函数或库
- 写出了根本跑不起来的东西
- 引入了安全隐患

AIDE 的作用就是在 AI 改完代码后，自动帮你检查一遍，告诉你是**可以信任**、**需要复查**还是**有问题需要修复**。

它就像一个"代码安全卫士"，在你和 AI 之间加一道保险。

---

## 二、安装 AIDE

### 1. 先安装 Node.js

AIDE 依赖 Node.js，如果你电脑上还没有：

1. 访问 https://nodejs.org
2. 下载 **LTS 版本**（推荐）
3. 安装时全部点"下一步"就行
4. 安装完成后，打开终端（Mac 叫"终端"，Windows 叫"命令提示符"或 PowerShell）
5. 输入 `node --version`，如果显示 `v20.x.x` 或更高版本，就安装成功了

### 2. 安装 AIDE

在终端输入：

```bash
npm install -g @aide-dev/cli
```

**这是什么意思？**

| 部分 | 含义 |
|------|------|
| `npm` | Node.js 的包管理工具，类似"手机应用商店" |
| `install` | 安装 |
| `-g` | 全局安装（装了之后任何项目都能用） |
| `@aide-dev/cli` | AIDE 这个工具的包名 |

安装完成后，输入：

```bash
aide --version
```

如果显示 `1.1.0`，说明安装成功！

---

## 三、快速开始：三步搞定

### 第一步：进入你的项目

```bash
cd 你的项目文件夹
```

比如：

```bash
cd /Users/ldkong/my-project
```

> ⚠️ 如果你的项目还没有 `package.json` 文件，先运行：
> ```bash
> npm init -y
> ```

### 第二步：初始化 AIDE

```bash
aide init
```

这条命令会自动帮你做以下几件事：

1. 检测你电脑上的 AI 编程工具（Claude Code、Cursor、Codex 等）
2. 配置 AI 工具和 AIDE 的连接
3. 生成验证配置文件
4. 构建项目的代码知识图谱

### 第三步：开始使用

初始化完成后，**重启你的 AI 工具**（关闭再打开），AI 工具就会自动使用 AIDE 来验证它写的代码了。

**你也可以手动验证：**

```bash
# 验证一个文件
aide guard check -f src/auth.ts

# 验证整个项目
aide guard verify -p .

# 验证 git 暂存的文件
aide guard verify --staged
```

---

## 四、从想法到项目：完整流程

如果你有一个项目想法但不知道怎么做，AIDE 可以帮你规划：

```bash
aide mind full "我想做一个带登录功能的待办事项应用"
```

AIDE 会自动：

1. 分析你的项目
2. 生成设计文档（存到 `docs/aide/` 文件夹）
3. 生成实施计划（列出每个要做的步骤）

然后你打开 AI 编程工具，按照计划一步步让 AI 帮你实现就行。

**还有现成的模板可以用：**

```bash
# 查看所有模板
aide template list

# 查看模板详情
aide template info todo-app

# 创建项目
aide template create todo-app my-todo-app
```

---

## 五、理解 AIDE 的判断结果

AIDE 会给出三种判断结果：

| 结果 | 意思 | 你该怎么做 |
|------|------|-----------|
| **TRUST** ✅ | 检查通过，没发现问题 | 可以放心使用 |
| **REVIEW** ⚠️ | 有一些不确定，需要你检查 | 让 AI 解释一下，然后让 AI 修改后重新检查 |
| **REJECT** ❌ | 发现了高风险问题 | 必须修改，不能直接用 |

**对于不会写代码的你来说，记住一句话：**

> 看到 REVIEW 或 REJECT，就告诉 AI 工具："AIDE 发现了问题，请修复。"

---

## 六、支持的 AI 工具

AIDE 支持以下 AI 编程工具：

| 工具 | 说明 |
|------|------|
| **Claude Code** | Anthropic 的 AI 编程助手 |
| **Cursor** | 流行的 AI 代码编辑器 |
| **Codex CLI** | OpenAI 的代码生成工具 |
| **opencode** | 开源的 AI 编程工具 |
| **Hermes** | 另一个 AI 编程助手 |

大多数用户用的是 **Cursor** 或 **Claude Code**，AIDE 对它们都有完整支持。

---

## 七、常见问题

### Q: 安装 `npm` 提示命令不存在？

你可能需要重启终端，或者你的 Node.js 没有安装好。重新安装 Node.js 并确认 `node --version` 能正常显示版本号。

### Q: AI 工具没有自动验证？

1. 确保已**完全重启** AI 工具（不是重新打开标签页）
2. 检查配置文件是否正确：
   - Claude Code: `~/.claude.json`
   - Cursor: `.cursor/mcp.json`
   - opencode: `opencode.json`

### Q: 如何卸载 AIDE？

```bash
npm uninstall -g @aide-dev/cli
```

### Q: AIDE 会上传我的代码吗？

不会。AIDE 的所有验证都在你的本地电脑完成，不会上传任何项目代码到服务器。

### Q: 我完全没有编程基础，能用 AIDE 吗？

完全可以。你只需要：

1. 安装 Node.js 和 AIDE（照着上面做就行）
2. 打开 AI 工具（Cursor、Claude Code 等）
3. 用自然语言告诉 AI 你想要什么
4. AIDE 会自动检查 AI 写的代码

你不需要懂代码，AIDE 就是为不会写代码的人设计的。

---

## 八、命令速查表

| 命令 | 说明 |
|------|------|
| `aide init` | 初始化项目，配置 AI 工具 |
| `aide guard verify` | 验证代码 |
| `aide guard check -f 文件名` | 检查单个文件 |
| `aide mind full "你的想法"` | 从想法生成设计和计划 |
| `aide template list` | 查看可用的项目模板 |
| `aide template create 模板名 项目名` | 用模板创建项目 |
| `aide mcp serve` | 启动 MCP 服务器 |
| `aide flow start "你的想法"` | 自动执行完整开发流程 |

---

## 九、下一步

- [完整的命令参考](./docs/cli-reference.md)
- [架构说明](./docs/architecture.md)
- [GitHub 仓库](https://github.com/ldkong2077/aide-monorepo)
- [贡献指南](./CONTRIBUTING.md)

---

> **提示：** 如果你有任何问题，可以在 [GitHub Issues](https://github.com/ldkong2077/aide-monorepo/issues) 上提问。
