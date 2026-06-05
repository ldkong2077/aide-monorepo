/**
 * Agent-instructions template — the markdown body each agent target
 * writes into its conventional instructions file (CLAUDE.md /
 * AGENTS.md / aide.mdc / etc.).
 *
 * The body content is identical across agents because the AIDE
 * usage advice is agent-agnostic — only the destination filename and
 * any optional frontmatter (Cursor `.mdc`) varies per target.
 *
 * The legacy `claude-md-template.ts` re-exports these names for
 * backwards compatibility with downstream importers.
 *
 * ## Iron Law Style Guide
 *
 * This template uses IRON LAW framing inspired by the Superpowers
 * project (obra/superpowers). The key principles:
 *
 * 1. **NO X WITHOUT Y** — absolute gates, not suggestions
 * 2. **Negative consequences** — explain what happens when rules are broken
 * 3. **Evidence before claims** — verify before declaring success
 * 4. **Specific rejection criteria** — concrete examples of what NOT to do
 *
 * These patterns measurably improve AI agent behavior because they:
 * - Override the AI's tendency to rationalize skipping steps
 * - Provide clear decision boundaries (pass/fail, not "maybe")
 * - Create accountability through explicit consequences
 */

/** Markers used by the marker-based section replacement. */
export const CODEGRAPH_SECTION_START = "<!-- AIDE_START -->";
export const CODEGRAPH_SECTION_END = "<!-- AIDE_END -->";

/**
 * The full marker-delimited block written into each agent's
 * instructions file. Includes the start/end markers so the section
 * can be detected and replaced on re-install.
 *
 * Tool names MUST stay in sync with what `@aide/mcp-server` actually
 * exposes (see `packages/mcp-server/src/index.ts` `TOOLS` constant).
 * A previous version of this template listed tools
 * (`codegraph_search`, `codegraph_callers`, `codegraph_context`,
 * `codegraph_status`, …) that did not match the server and would
 * have driven agents to call nonexistent tools.
 *
 * Tone note: the body uses IRON LAW framing (NO X WITHOUT Y) rather
 * than "consider using" guidance because the user expects AIDE to be
 * a "superpower" they don't have to think about — passive guidance
 * is consistently ignored by the agent. The IRON LAWS section
 * is the load-bearing part; everything else is reference material.
 */
export const INSTRUCTIONS_TEMPLATE = `${CODEGRAPH_SECTION_START}
## AIDE — automatic code verification

This project has the AIDE MCP server configured. You have 5 tools that the user expects you to use as part of your default workflow, not as optional aids. Treating them as optional defeats the point of having them.

### IRON LAWS — 不可违反的绝对规则

这些规则没有例外。跳过任何一条 = 你没有完成工作。

---

**IRON LAW 1: NO CODE EDIT WITHOUT VERIFICATION**

\`\`\`
NO Edit / Write / MultiEdit on .ts / .tsx / .js / .jsx / .py / .go 
WITHOUT calling guard_verify BEFORE reporting the change.
\`\`\`

**MUST call \`guard_verify\` after every code edit, before reporting the change to the user.**

每次代码编辑后，必须调用 \`guard_verify\`，然后才能告诉用户"改好了"。
- \`REJECT\` → 修复问题，重新验证，直到 \`TRUST\`
- \`REVIEW\` → 在回复中明确列出所有警告
- "trivial" 改动？**尤其是 trivial 改动** — 最严重的幻觉往往藏在最简单的代码里

**违反后果**：用户会收到包含幻觉的代码，然后花时间调试你声称"已经验证过"的东西。

---

**IRON LAW 2: NO CLAIM WITHOUT QUERY**

\`\`\`
NO claim that a symbol exists / is exported / is imported / is used
WITHOUT calling codegraph_query first.
\`\`\`

**MUST call \`codegraph_query\` before claiming a symbol exists, is exported, is imported, or is used.**

永远不要凭记忆或 grep 回答"X 在哪里定义"。
codegraph 是 AST 解析后的真实数据源，一次调用就能给出准确答案。

**违反后果**：你会告诉用户某个函数存在，但它实际上不存在或已被删除。用户会浪费时间寻找幽灵代码。

---

**IRON LAW 3: NO STRUCTURAL QUESTION WITHOUT GRAPH**

\`\`\`
NO answer to "how does X work" / "what depends on Y" / "what would break if I changed Z"
WITHOUT calling codegraph_query first.
\`\`\`

结构问题 = 代码图谱问题。读文件是低效的，用 codegraph 一次就能拿到完整的调用关系。

**违反后果**：你会遗漏关键依赖，用户会因为你的"部分答案"做出错误的架构决策。

---

**IRON LAW 4: NO STALE QUERY**

\`\`\`
NO query on a file that may have changed since the last index
WITHOUT calling codegraph_index first.
\`\`\`

在 git pull、分支切换、或你自己的编辑之后，先刷新索引再查询。
文件监听有 ~500ms 延迟，不要在编辑后立即查询同一个文件。

**违反后果**：你会基于过时的索引回答问题，用户会得到与实际代码不符的答案。

---

**IRON LAW 5: EVIDENCE BEFORE CLAIMS**

\`\`\`
NO completion claim WITHOUT fresh verification evidence.
\`\`\`

在你说"完成了"之前：
1. 你调用 \`guard_verify\` 了吗？
2. 结果是 \`TRUST\` 吗？
3. 如果是 \`REVIEW\`，你列出警告了吗？

"应该没问题"不是验证。"我检查过了"不是证据。

**违反后果**：用户会收到未经验证的代码，然后在生产环境中发现 bug。

---

### Available tools (exhaustive)

| Tool | Call when… | Args |
|---|---|---|
| \`codegraph_index\` | After edits, after git operations, when a query returns stale-looking results | \`{ "path": "<dir>" }\` |
| \`codegraph_query\` | You need to find / trace / explain any symbol | \`{ "query": "<name>", "kind": "symbol" | "definition" | "reference" }\` |
| \`guard_verify\` | **After every code edit (MANDATORY)** | \`{ "file": "<path>" }\` or \`{ "files": ["<path>", ...] }\` |
| \`guard_check\` | Lighter single-file check without the full test pipeline | \`{ "file": "<path>" }\` |
| \`mind_process\` | Scaffolding a new project from a description | \`{ "idea": "<text>" }\`, \`{ "outputDir": "<dir>" }\` |

### Anti-patterns — AIDE WILL REJECT THESE

**NEVER** do the following. These will cause your output quality to be flagged:

| 反模式 | 为什么有害 | 正确做法 |
|--------|-----------|---------|
| 用 grep 找符号定义 | grep 是正则匹配，不是 AST 解析 | 用 \`codegraph_query kind=definition\` |
| 用 grep 验证图谱结果 | 图谱是解析后的 AST 数据 | 信任图谱，不要重复验证 |
| 不调 guard_verify 就说"改好了" | 你无法确认代码没有幻觉 | 每次编辑后必须验证 |
| 读整个模块来"理解它" | 浪费 context budget | 用 \`codegraph_query\` 获取调用图，只读入口点 |
| 凭记忆回答"谁调用了 Y" | 记忆会出错，图谱不会 | 用 \`codegraph_query kind=reference\` |
| 在 \`catch {}\` 里什么都不做 | 静默吞掉错误 | 至少记录日志或重新抛出 |
| 用 \`any\` 类型 | 绕过类型检查 | 定义具体类型 |
| 用 \`data\`/\`result\` 作为变量名 | 模糊的命名 = 模糊的意图 | 用描述性名称 |

### If AIDE returns "not initialized"

项目没有 \`.aide/\` 索引。问用户：*"This project has no AIDE index yet. Want me to run \`aide init\` to build it?"* 不要用 grep 绕过缺失的索引 — 索引是你其他工具工作的基础，绕过比修复更慢。

### Workflow: 从想法到验证代码

AIDE 不只是验证工具，它是完整的开发流程保障：

\`\`\`
1. 描述需求 → AI 生成代码
2. AI 调用 guard_verify → 获得 TRUST/REVIEW/REJECT
3. 如果 REJECT → AI 修复，重新验证
4. 如果 REVIEW → AI 列出警告，用户决定是否继续
5. 如果 TRUST → 用户收到经过验证的代码
\`\`\`

**这个流程是强制的。** AI 不能跳过验证直接报告完成。
${CODEGRAPH_SECTION_END}`;

/**
 * Backwards-compat alias. Existing downstream code may import
 * `CLAUDE_MD_TEMPLATE` from this module via the re-export shim in
 * `claude-md-template.ts`.
 */
export const CLAUDE_MD_TEMPLATE = INSTRUCTIONS_TEMPLATE;
