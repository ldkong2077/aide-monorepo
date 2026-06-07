# CLI 命令参考

AIDE 提供以下命令：

---

## 基础命令

### `aide init`

初始化 AIDE 在当前项目中。

```bash
aide init [options]

# 选项：
# -y, --yes          跳过确认，自动使用默认配置
# -t, --target       指定 AI 工具（claude, cursor, opencode, codex, hermes）
```

**示例**：

```bash
# 自动初始化
aide init

# 跳过确认
aide init -y

# 只配置 Claude Code
aide init -t claude
```

---

### `aide install`

配置 AI 工具使用 AIDE。

```bash
aide install [options]

# 选项：
# -y, --yes          跳过确认
# -t, --target       指定 AI 工具
# -l, --location     配置范围（global 或 local）
# --print-config     打印配置片段（不写入文件）
```

**示例**：

```bash
# 全局配置所有 AI 工具
aide install -y

# 只打印 Cursor 的配置
aide install --print-config cursor
```

---

## 代码验证命令

### `aide guard verify`

验证代码文件或目录。

```bash
aide guard verify [options]

# 选项：
# -f, --file         单个文件
# --files            多个文件（逗号分隔）
# --pattern          glob 模式
# -p, --path         目录
# --staged           验证 git 暂存区
# --base             git diff 基准分支
# --head             git diff 目标分支
# --no-test          跳过测试
# --format           输出格式（console, json, markdown）
```

**示例**：

```bash
# 验证单个文件
aide guard verify -f src/auth.ts

# 验证整个项目
aide guard verify -p .

# 验证暂存区
aide guard verify --staged

# 验证两个分支的差异
aide guard verify --base main --head feature/new-api

# 输出 JSON 格式
aide guard verify --format json
```

---

### `aide guard check`

检查单个文件的幻觉问题。

```bash
aide guard check -f <file>

# 选项：
# -f, --file         要检查的文件（必需）
```

**示例**：

```bash
aide guard check -f src/auth.ts
```

**输出**：

```
✅ No hallucinations detected
```

或

```
❌ Found 3 hallucination(s):
  [HIGH] L12: Import 'fancy-lib' does not exist
    💡 Did you mean 'lodash'?
  [MEDIUM] L18: Function 'sortByV2' not defined
    💡 Use 'sortBy' from lodash
```

---

## 代码图谱命令

### `aide graph init`

初始化代码知识图谱。

```bash
aide graph init [options]

# 选项：
# -p, --path         项目路径（默认：当前目录）
```

---

### `aide graph index`

索引代码库。

```bash
aide graph index [options]

# 选项：
# -p, --path         项目路径
```

---

### `aide graph status`

显示图谱状态。

```bash
aide graph status
```

---

## 项目设计命令

### `aide mind brainstorm`

交互式头脑风暴。

```bash
aide mind brainstorm "<idea>"

# 选项：
# -o, --output       输出目录（默认：docs/aide/specs）
```

**示例**：

```bash
aide mind brainstorm "我想做一个博客系统"
```

---

### `aide mind plan`

从设计文档生成实施计划。

```bash
aide mind plan [designPath]

# 选项：
# -o, --output       输出目录（默认：docs/aide/plans）
```

---

### `aide mind full`

完整流程：头脑风暴 → 设计 → 计划。

```bash
aide mind full "<idea>"

# 选项：
# -o, --output       输出目录（默认：docs/aide）
```

**示例**：

```bash
aide mind full "我想做一个待办事项应用"
```

---

## 项目模板命令

### `aide template list`

列出所有可用模板。

```bash
aide template list [options]

# 选项：
# -c, --category     按分类过滤（web, api, cli, library, fullstack）
# -d, --difficulty   按难度过滤（beginner, intermediate, advanced）
```

---

### `aide template info`

显示模板详情。

```bash
aide template info <template-id>
```

**示例**：

```bash
aide template info todo-app
```

---

### `aide template create`

从模板创建项目。

```bash
aide template create <template-id> <project-name> [options]

# 选项：
# -o, --output       输出目录（默认：当前目录）
```

**示例**：

```bash
aide template create todo-app my-todo-app
```

---

## 开发流程命令

### `aide flow start`

启动开发流程。

```bash
aide flow start "<idea>" [options]

# 选项：
# -n, --name         项目名称
# -o, --output       输出目录
# --no-verify        跳过自动验证
# --continue-on-error  失败时继续
```

---

### `aide flow list`

列出所有流程。

```bash
aide flow list [options]

# 选项：
# -o, --output       输出目录
```

---

### `aide flow status`

显示流程状态。

```bash
aide flow status <flow-id> [options]

# 选项：
# -o, --output       输出目录
```

---

## 仪表盘命令

### `aide dashboard`

显示项目仪表盘。

```bash
aide dashboard [options]

# 选项：
# -f, --format       输出格式（console, json, markdown）
# -v, --view         视图（overview, flows, tasks, verification, costs）
# -o, --output       输出目录
```

---

## MCP 命令

### `aide mcp serve`

启动 MCP 服务器。

```bash
aide mcp serve
```

**说明**：此命令用于 AI 工具调用，通常不需要手动运行。

---

## 配置命令

### `aide config init`

生成默认配置文件。

```bash
aide config init [options]

# 选项：
# -o, --output       输出目录（默认：当前目录）
```

---

### `aide config show`

显示当前配置。

```bash
aide config show
```

---

## 全局选项

### `--version`

显示版本号。

```bash
aide --version
```

### `--help`

显示帮助信息。

```bash
aide --help
aide <command> --help
```

---

## 退出码

| 退出码 | 含义           |
| ------ | -------------- |
| 0      | 成功           |
| 1      | 验证失败或错误 |

---

## 环境变量

| 变量               | 说明                                 |
| ------------------ | ------------------------------------ |
| `AIDE_CONFIG_PATH` | 自定义配置文件路径                   |
| `AIDE_LOG_LEVEL`   | 日志级别（debug, info, warn, error） |

---

## 示例工作流

### 完整开发流程

```bash
# 1. 安装
npm install -g aide

# 2. 初始化项目
cd my-project
aide init

# 3. 从想法开始
aide mind full "我想做一个博客系统"

# 4. 按计划实现代码
# ... 编写代码 ...

# 5. 验证代码
aide guard verify -p .

# 6. 提交代码
git add .
git commit -m "feat: 添加博客系统"
```

### CI/CD 集成

```bash
# 在 CI 中验证代码
aide guard verify --staged --format json

# 如果验证失败，退出码为 1
if [ $? -ne 0 ]; then
  echo "代码验证失败"
  exit 1
fi
```
