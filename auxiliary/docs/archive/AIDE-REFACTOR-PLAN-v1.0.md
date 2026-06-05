# AIDE 项目修改计划 v1.0

> **⚠️ ARCHIVED — 2026-06-02**
>
> This document was the working plan for the v0.1.0 → v1.0.0 refactor. It is **out of date** as of v1.0.0 release. The plan called for a 12-week, 300-hour, 23-task program; the actual work was completed faster thanks to focused subagent delegation.
>
> For the *current* project documentation, see:
> - [DOCUMENTATION.md](../../DOCUMENTATION.md) — top-level index
> - [CHANGELOG.md](../../CHANGELOG.md) — what shipped in each release
> - [docs/architecture.md](../architecture.md) — system design
> - [docs/security.md](../security.md) — security policy
>
> This plan is kept for historical reference only.

---

# AIDE 项目修改计划 v1.0

> **项目**: AIDE (AI Development Environment) — AI 辅助开发统一工具包
> **文档版本**: 1.0
> **基线版本**: 0.1.0 (135 TS 文件 / 9 测试 / 6.7% 覆盖率)
> **目标版本**: 1.0.0 (生产就绪)
> **计划周期**: 12 周 (3 阶段 × 4 周)
> **创建日期**: 2026-06-01
> **关联文档**: [AIDE-2026-06-01-AUDIT.md](./AIDE-2026-06-01-AUDIT.md) (审核报告)

---

## 0. 文档说明

本文档基于 2026-06-01 完成的项目全面审核结果,定义了从 0.1.0 到 1.0.0 的全部修改任务。
每个任务包含: **目标、文件、步骤、验收标准、风险、工时、依赖、责任角色**。

- **优先级分级**: P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Strategic)
- **工时单位**: 人时 (h),1 人时 ≈ 实际工作 1 小时
- **总工时估算**: 约 300 人时 (12 周 × 25h/周)
- **责任角色**: 单一执行者 (Agent) + 自动化子代理 (Subagent)
- **协作原则**: 所有可并行的子任务使用 `task()` 委托给子代理并行执行

---

## 1. 执行摘要

### 1.1 现状与目标差距

| 维度 | 当前 (0.1.0) | 目标 (1.0.0) | 差距 |
|---|---|---|---|
| TypeScript 严格性 | 4/7 包关闭 strict | 全部 strict | Critical |
| `as any` 使用 | 14 处 (全在 mcp-server) | 0 处 | Critical |
| 测试覆盖率 (文件) | 6.7% | ≥ 60% | High |
| CI/CD | 无 | GitHub Actions 全套 | Critical |
| 已知 BUG | 3 个 Critical | 0 | Critical |
| 同步 I/O | 17+ 处阻塞 | ≤ 5 处 | Medium |
| 文档完整度 | 2/10 | 9/10 | Medium |
| 安全审计 | 未做 | 关键路径已审 | High |
| 性能基线 | 无 | 已记录 | Medium |

### 1.2 三大核心原则

1. **修复优先于改进** — 所有 P0 缺陷必须 100% 解决才能进入 P1
2. **测试覆盖同步** — 每个新功能必须有对应测试,无测试代码不合并
3. **可观测性内建** — 每个修改项必须产生可度量的改进,不能凭感觉

### 1.3 阶段划分

```
┌─────────────────┬─────────────────┬─────────────────┐
│  阶段一:稳固     │  阶段二:增强     │  阶段三:生产化   │
│  W1 - W4        │  W5 - W8        │  W9 - W12       │
│  P0 + CI        │  P1 主体        │  P2 核心 + P3    │
│  + 关键 P1      │  + 部分 P2      │  战略项          │
├─────────────────┼─────────────────┼─────────────────┤
│  6 任务 / 40h   │  8 任务 / 80h   │  9 任务 / 180h  │
│  发布 0.2.0     │  发布 0.5.0     │  发布 1.0.0     │
└─────────────────┴─────────────────┴─────────────────┘
```

---

## 2. 范围定义

### 2.1 In-Scope (本计划覆盖)

- ✅ 7 个 `@aide/*` 包的代码修复与增强
- ✅ TypeScript 类型安全强化 (strict + 移除 as any)
- ✅ 测试覆盖提升 (新增 30+ 测试文件)
- ✅ CI/CD 流水线建立 (GitHub Actions)
- ✅ 工具链配置 (ESLint flat config, Prettier, Husky, Commitlint, Changesets)
- ✅ 关键性能优化 (graph 索引、guard 验证、router 路由)
- ✅ 安全增强 (CORS、路径白名单、API key 文档化)
- ✅ 文档更新 (README, CONTRIBUTING, 新建 docs/concepts, docs/guides)
- ✅ Docker 镜像优化与安全加固
- ✅ 路径/CLI 行为兼容性处理

### 2.2 Out-of-Scope (明确排除)

- ❌ 新增 packages (v2.0 评估,如 `@aide/web`、`@aide/cloud`)
- ❌ VSCode/JetBrains 扩展 (P3 仅探索,不交付)
- ❌ 商业版功能 (v1.0 之后规划)
- ❌ 数据库切换 (better-sqlite3 保持)
- ❌ MCP 2.0 适配 (等待 SDK 稳定)
- ❌ 远程 SaaS 化改造 (架构级别,需独立项目)

---

## 3. 任务优先级总表

| 优先级 | 任务数 | 估计工时 | 关键产出 | 目标完成 |
|---|---|---|---|---|
| **P0** | 6 | 40h | CI 全绿、0 个 Critical BUG | W1 末 |
| **P1** | 8 | 80h | 测试 ≥ 60%、ESLint 全过、文档更新 | W4 末 |
| **P2** | 5 | 100h | graph 增强、guard 智能、router 多租户 | W8 末 |
| **P3** | 4 | 80h | 可观测性、文档站、Helm chart、离线模式 | W12 末 |
| **合计** | **23** | **300h** | 1.0.0 生产就绪 | **W12 末** |

---

## 4. P0 关键修改项 (Week 1-2)

### P0-1: 修复 mcp-server 路径/类型安全 (8h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/mcp-server/src/index.ts` |
| **当前问题** | 14 处 `as any`;L125 `verifier.verify({ path: args.files?.join(',') })` 把数组 join 成字符串当 path |
| **目标状态** | 全部用 Zod 校验;`as any` 计数 = 0;`guard_verify` 支持单/多文件 |
| **实施步骤** | ① 引入 `zod` 依赖;② 定义 `GuardVerifyArgsSchema` 等所有 tool args schema;③ 替换 `(args as any)` 为 `GuardVerifyArgsSchema.parse(args)`;④ `guard_verify` 改为循环验证或聚合;⑤ 加单元测试 |
| **验收标准** | `grep -r "as any" packages/mcp-server/src` = 0;`npm test packages/mcp-server` 全过;新增 5+ Zod 单元测试 |
| **风险** | 中 — 行为变更是 breaking change,需更新 README |
| **依赖** | 无 |
| **责任** | Lead: Agent / Subagent: deep (类型设计) |
| **回滚** | git revert 即可,纯重构 |

### P0-2: 修复 CLI guard verify 参数语义 (6h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/cli/src/bin.ts` (重点 L59、L96) |
| **当前问题** | L59 `path: opts.files` 把 glob 字符串当 path 传;L96 projectDir 用 `process.cwd()` |
| **目标状态** | `--file` / `--path` / `--pattern` 三选项互斥,语义清晰 |
| **实施步骤** | ① 重新设计 commander option;② 提取 `resolveTargets(opts)` 工具函数;③ 与 guard 的 `findProjectRoot` 对齐;④ 加 snapshot 测试;⑤ 更新 README CLI 章节 |
| **验收标准** | `aide guard verify --path src/` 工作;`aide guard verify --file src/foo.ts` 工作;`aide guard verify --pattern "src/**/*.ts"` 工作;3 个 snapshot 测试通过 |
| **风险** | 中 — 破坏性变更,但原行为本身就是 bug |
| **依赖** | P0-1 (需先有类型安全的 verifier.verify 接口) |
| **责任** | Lead: Agent / Subagent: quick (CLI 改动小) |
| **回滚** | git revert,文档保留旧用法说明 |

### P0-3: 修复 proxy 流式 + fallback header 冲突 (12h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/guard/src/proxy/index.ts` (重点 L131-258) |
| **当前问题** | 130-258 行大函数混合流式/非流式/fallback,`reply.header()` 调用时机不正确 |
| **目标状态** | 拆为 `handleStreaming`、`handleNonStreaming`、`handleErrorFallback` 三个独立函数 |
| **实施步骤** | ① 提取流式响应到 `handleStreamingResponse(req, reply, body)`;② 提取非流式到 `handleNonStreamingResponse`;③ fallback 改用 `reply.code(500).send()` 在 head 发送前;④ 引入 `StreamResponseBuilder` 工具类;⑤ 编写集成测试 (含 mock provider 故障) |
| **验收标准** | 单函数 < 80 行;`npm test packages/guard` 全过;新增 8+ 集成测试覆盖 happy/error/timeout |
| **风险** | 高 — 核心代理路径,影响所有 LLM 请求;需对照 OpenAI/Anthropic 协议 |
| **依赖** | 无 |
| **责任** | Lead: Agent / Subagent: deep (流式协议细节) |
| **回滚** | 保留旧代码 1 周,新代码 feature flag 切换 |

### P0-4: 启用 TypeScript strict 模式 (12h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/graph/tsconfig.json`、`packages/guard/tsconfig.json`、`packages/router/tsconfig.json`、`packages/cli/tsconfig.json` |
| **当前问题** | 4 个包 `noImplicitAny: false` + `strictNullChecks: false` |
| **目标状态** | 全部 strict,`npm run typecheck` 0 错误 |
| **实施步骤** | ① 逐个包打开 strict 选项(分阶段,先 graph 再 guard 等);② 修复 `tsc` 暴露的所有类型错误(预期 50-200 个);③ 重点:`guard/src/guard/verifier.ts:520-560`、`guard/src/proxy/index.ts:64-150`、`graph/src/extraction/index.ts`;④ 引入 `strictest` 选项到 `guard` 关键模块 |
| **验收标准** | 4 个 tsconfig 启用全部 strict;`npm run typecheck` 退出码 0;新增 0 个 `as any` / `@ts-ignore` |
| **风险** | 中 — 暴露深层 null/undefined bug;测试可能同时失败 |
| **依赖** | 无 (与其他 P0 并行) |
| **责任** | Lead: Agent / Subagent: deep (逐个包) |
| **回滚** | tsconfig revert 单包即可,粒度安全 |

### P0-5: 建立 CI/CD 流水线 (4h)

| 项 | 内容 |
|---|---|
| **文件** | 新建 `.github/workflows/ci.yml`、`.github/dependabot.yml`、`.github/CODEOWNERS` |
| **目标状态** | PR 必跑 typecheck + test + build;Dependabot 自动 PR |
| **实施步骤** | ① 创建 ci.yml: matrix {node: 20, 22} × {os: ubuntu-latest, windows-latest, macos-latest};② 步骤: checkout → setup-node@v4 → `npm ci` → `npm run typecheck` → `npm test` → `npm run build`;③ 启用 cache: `cache: 'npm'`;④ Dependabot: weekly npm + github-actions;⑤ CODEOWNERS: 关键模块分配 |
| **验收标准** | PR 自动触发 CI;任何失败阻断合并;Dependabot 自动开 PR |
| **风险** | 低 — 仅配置文件 |
| **依赖** | GitHub 仓库已存在 (https://github.com/aide-dev/aide) |
| **责任** | Lead: Agent |
| **回滚** | 删除 workflow 文件即可 |

### P0-6: 修复 mcp-server 路径遍历风险 + 同步 I/O (4h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/mcp-server/src/index.ts:136`、所有 `fs.readFileSync` 调用 |
| **当前问题** | 异步 handler 中 `fs.readFileSync`;无路径白名单(潜在任意文件读取) |
| **目标状态** | 全部异步;路径必须在 projectDir 内 |
| **实施步骤** | ① 替换 `fs.readFileSync` → `await fs.promises.readFile`;② 引入 `path.resolve` + `path.relative` 白名单检查;③ 越界抛 `AideError('PATH_TRAVERSAL')`;④ 加单元测试 |
| **验收标准** | `grep -r "Sync(" packages/mcp-server/src` = 0;越界路径被拒测试通过 |
| **风险** | 中 — 性能可能下降(同步 vs 异步),但安全性提升巨大 |
| **依赖** | P0-1 (类型先稳) |
| **责任** | Lead: Agent / Subagent: quick (单文件改动) |
| **回滚** | git revert 即可 |

### P0 阶段交付物 (W2 末)
- [ ] 0 个 P0 缺陷
- [ ] CI 全绿
- [ ] 4 个包启用 strict
- [ ] `as any` 计数 = 0
- [ ] 至少 5 个新测试文件
- [ ] 发布 v0.2.0 tag

---

## 5. P1 重要修改项 (Week 3-6)

### P1-1: 工具链完整化 (ESLint/Prettier/Husky/Changesets) (8h)

| 项 | 内容 |
|---|---|
| **文件** | `eslint.config.js` (新建)、`.prettierrc.json`、`commitlint.config.js`、`.husky/`、`.changeset/config.json` |
| **目标状态** | 提交前自动 lint + format;commit msg 受控;版本管理自动化 |
| **实施步骤** | ① ESLint flat config: `@typescript-eslint/recommended-type-checked` + `no-explicit-any: error` + `no-floating-promises: error`;② Prettier: `printWidth: 100`、`singleQuote: true`;③ Husky: pre-commit → lint-staged;commit-msg → commitlint;④ Changesets: `fixed` 模式(整个 monorepo 一个版本) |
| **验收标准** | `npm run lint` 0 错误;commit 含违规代码被拒;CHANGELOG.md 自动生成 |
| **风险** | 中 — 现有代码可能大量违规,首次 lint 会有 100+ 错误,需批量 auto-fix |
| **依赖** | 无 |
| **责任** | Lead: Agent / Subagent: quick (配置) |
| **回滚** | 删除配置文件即可 |

### P1-2: graph 包核心测试覆盖 (16h)

| 项 | 内容 |
|---|---|
| **文件** | 新增 `packages/graph/src/extraction/extraction-orchestrator.test.ts`、`graph-traverser.test.ts`、`reference-resolver.test.ts`、`context-builder.test.ts` |
| **目标状态** | graph 包覆盖率 0% → 60% |
| **实施步骤** | ① ExtractionOrchestrator: mock tree-sitter parser,测试批处理、错误恢复、worker 池;② GraphTraverser: BFS、调用图、类型层级、影响半径;③ ReferenceResolver: 框架感知解析、导入解析、名称匹配;④ ContextBuilder: FTS + 子图 + 代码块拼接 |
| **验收标准** | `npm run test:coverage` graph 包 ≥ 60%;所有 public API 有 happy path + 1 error path |
| **风险** | 中 — graph 依赖 tree-sitter WASM,测试需 mock 完整 |
| **依赖** | P0-4 (strict 先稳) |
| **责任** | Lead: Agent / Subagent: deep (大模块) |
| **回滚** | 测试 revert 不影响功能 |

### P1-3: guard 包测试覆盖 (12h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/guard/src/guard/verifier.test.ts` (新建)、`hallucination.test.ts` (扩展)、`proxy.test.ts` (新建) |
| **目标状态** | guard 包覆盖率 60% → 80% |
| **实施步骤** | ① Verifier: AST diff、verdict 逻辑、超时控制;② Hallucination: 全部 5 类检测 + 边界;③ Proxy: 路由、provider 故障转移、CORS、token 验证;④ Storage: CRUD、并发、迁移 |
| **验收标准** | `npm run test:coverage` guard 包 ≥ 80% |
| **风险** | 中 — 需 mock LLM provider(Anthropic/OpenAI SDK) |
| **依赖** | P0-3 (proxy 重构后) |
| **责任** | Lead: Agent / Subagent: deep |

### P1-4: mcp-server 与 cli 测试覆盖 (8h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/mcp-server/src/*.test.ts` (新建)、`packages/cli/src/bin.test.ts` (新建) |
| **目标状态** | mcp-server 0% → 70%;cli 0% → 50% |
| **实施步骤** | ① mcp-server: 5 个 tool happy + error path;② cli: snapshot 测试每个命令 stdout/exit;③ 错误恢复测试: provider 故障、配置缺失 |
| **验收标准** | mcp-server ≥ 70% 文件覆盖;cli ≥ 50% |
| **风险** | 中 — MCP server 测试需 mock stdio transport |
| **依赖** | P0-1, P0-2 |
| **责任** | Lead: Agent / Subagent: quick |

### P1-5: 错误处理统一化 (8h)

| 项 | 内容 |
|---|---|
| **文件** | 全部 `catch` 块、错误处理路径 |
| **当前问题** | `core/errors.ts` 有 `AideError` 基类,但实际有 20+ 处 `catch { /* skip */ }` 模式 |
| **目标状态** | 全部 catch 走 `AideError` 层级;非关键错误使用 `LogLevel.WARN` 替代吞掉 |
| **实施步骤** | ① 审计所有 catch 块;② 关键 catch 抛 AideError;③ 静默 catch 改为 logger.warn;④ 加 5+ 错误处理集成测试 |
| **验收标准** | `grep -r "catch.*{" packages/ --include="*.ts" -A 2 | grep -E "{[^}]*$"` 检查空 catch;新增 5+ 错误测试 |
| **风险** | 中 — 改变行为可能影响未发现的成功路径 |
| **依赖** | 无 |
| **责任** | Lead: Agent |
| **回滚** | 逐函数 revert 安全 |

### P1-6: 性能基线 + 关键优化 (12h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/graph/src/extraction/index.ts`、`packages/guard/src/guard/verifier.ts` |
| **目标状态** | graph 索引 10k 文件 < 5 分钟;verifier 单文件 < 200ms |
| **实施步骤** | ① 添加 benchmark 脚本 `bench/`: graph-init、guard-check、router-classify;② 优化 graph batch 调度;③ verifier 改为全异步 I/O;④ router 加模型性能缓存;⑤ 文档化性能基线到 `docs/performance.md` |
| **验收标准** | bench 脚本可运行;README 含 perf badge;P95 延迟文档化 |
| **风险** | 中 — 性能优化可能引入 bug |
| **依赖** | P0-4 (strict) |
| **责任** | Lead: Agent / Subagent: ultrabrain (性能优化需深度) |

### P1-7: 安全加固 (8h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/guard/src/proxy/index.ts`、`packages/core/src/config.ts` |
| **目标状态** | CORS 可配置;API key 文档化(警告不要入 yaml);proxy 强制 token |
| **实施步骤** | ① CORS origin 改读 `server.corsOrigins` 配置;② 启动时若 `server.token` 缺失且非 dev 模式则拒绝启动;③ README 增加 "API Key 安全" 章节;④ 引入 `helmet` 中间件(proxy) |
| **验收标准** | CORS 配置可定制;启动时校验 token;helmet 集成测试通过 |
| **风险** | 中 — 改变默认行为,可能影响已有部署 |
| **依赖** | P0-3 |
| **责任** | Lead: Agent / Subagent: quick |

### P1-8: 文档更新 (8h)

| 项 | 内容 |
|---|---|
| **文件** | `README.md`、`CONTRIBUTING.md`、新建 `docs/concepts/`、`docs/guides/`、`docs/architecture.md`、`docs/security.md` |
| **目标状态** | 新用户 10 分钟内能跑通;贡献者 30 分钟能贡献 |
| **实施步骤** | ① README 重写: Quick Start、CLI 全命令、MCP 工具表、配置示例;② CONTRIBUTING 加 "分支命名规范"、"提交规范"、"PR 模板";③ docs/concepts/: graph/guard/router/mind 概念文档;④ docs/guides/: "如何在 IDE 集成"、"如何添加自定义 guard 规则"、"如何扩展 graph 解析器";⑤ docs/security.md: 威胁模型、CVE 报告流程 |
| **验收标准** | VitePress 站点可构建;所有功能在文档中有对应章节 |
| **风险** | 低 |
| **依赖** | 无 |
| **责任** | Lead: Agent / Subagent: writing |

### P1 阶段交付物 (W6 末)
- [ ] 测试覆盖率 ≥ 60%
- [ ] ESLint 0 错误
- [ ] Husky + commitlint 生效
- [ ] Changesets 配置完成
- [ ] 性能基线文档化
- [ ] CORS + token 强制
- [ ] 文档站可构建
- [ ] 发布 v0.5.0 tag

---

## 6. P2 核心增强 (Week 7-10)

### P2-1: graph 嵌入向量检索 (24h)

| 项 | 内容 |
|---|---|
| **文件** | 新增 `packages/graph/src/embeddings/` |
| **目标状态** | 语义搜索支持(替代纯 FTS5) |
| **实施步骤** | ① 集成 `@xenova/transformers` (本地嵌入);② SQLite vec0 扩展或 LanceDB 二选一;③ hybrid 检索: FTS + vector + graph 联合;④ `codegraph_query` 加 `mode=semantic` 选项;⑤ 基准测试 |
| **验收标准** | 语义查询 < 200ms;hybrid 检索召回率优于纯 FTS 20% |
| **风险** | 高 — 向量模型选择、维度权衡、本地资源占用 |
| **依赖** | P0-4, P1-2 |
| **责任** | Lead: Agent / Subagent: ultrabrain |

### P2-2: guard LLM-as-judge 集成 (16h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/guard/src/guard/llm-judge.ts` (新建) |
| **目标状态** | 可选 LLM 评审,提高检测准确率 |
| **实施步骤** | ① 设计 prompt 模板;② 集成 provider registry;③ 评分合并: heuristic * 0.6 + LLM * 0.4;④ 缓存 LLM 评审结果;⑤ 默认关闭,需 `guard.llmJudge.enabled: true` 启用 |
| **验收标准** | 开启后 TRUST 误判率 ↓ 30%;关闭时无性能影响 |
| **风险** | 高 — LLM 调用增加延迟 2-5x,需设计 fallback |
| **依赖** | P0-3 |
| **责任** | Lead: Agent / Subagent: ultrabrain |

### P2-3: router 多租户 + 成本熔断 (16h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/guard/src/router/` |
| **目标状态** | 团队级配额、成本上限、租户隔离 |
| **实施步骤** | ① 增加 `tenantId` 概念(从 request header 读);② 配额表 schema: `quota(tenantId, dailyLimit, monthlyLimit)`;③ 中间件: 超过配额返 429;④ 成本追踪表: `cost(tenantId, modelId, tokens, cost)`;⑤ 熔断: 单日成本超阈值切到 cost 策略 |
| **验收标准** | 多租户隔离测试通过;配额超限返 429;成本熔断测试通过 |
| **风险** | 中 — 需在 day 1 设计,后期改造成本高 |
| **依赖** | P0-3 |
| **责任** | Lead: Agent / Subagent: deep |

### P2-4: mind 模板系统 (16h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/mind/src/templates/` |
| **目标状态** | 支持 React Native / Next.js / FastAPI / Tauri 等模板 |
| **实施步骤** | ① 模板 schema 定义;② 模板仓库(可内置或从 git fetch);③ LLM 流程: 总架构 → 拆解功能 → 文件清单 → 模板填充;④ 集成 git init + graph init;⑤ 模板测试 |
| **验收标准** | 5+ 模板可用;mind_process 可选 `--template` 参数 |
| **风险** | 中 — 模板维护成本 |
| **依赖** | 无 |
| **责任** | Lead: Agent / Subagent: deep |

### P2-5: mcp-server 增强 (12h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/mcp-server/src/` |
| **目标状态** | Resource 暴露、Prompt 模板、stream 工具 |
| **实施步骤** | ① `aide://config` / `aide://graph/stats` / `aide://guard/recent` resources;② `prompts/list`: `code-review-with-aide`、`refactor-with-impact`;③ `codegraph_explore` 支持 stream chunk;④ token 用量统计 |
| **验收标准** | resources 可被 MCP client 列出;prompts 可调用 |
| **风险** | 中 — MCP SDK API 变化需关注 |
| **依赖** | P0-1 |
| **责任** | Lead: Agent / Subagent: deep |

### P2 阶段交付物 (W10 末)
- [ ] graph 语义搜索可用
- [ ] guard LLM judge 可选启用
- [ ] router 多租户隔离
- [ ] mind 5+ 模板
- [ ] mcp resources + prompts
- [ ] 发布 v0.8.0 tag

---

## 7. P3 战略项 (Week 11-12)

### P3-1: 可观测性 (OpenTelemetry) (20h)

| 项 | 内容 |
|---|---|
| **文件** | 新增 `packages/observability/` 或在 core 内 |
| **目标状态** | OTLP trace + Prometheus metrics |
| **实施步骤** | ① 集成 `@opentelemetry/sdk-node`;② auto-instrumentation: http、fastify、sqlite;③ `/metrics` 端点 Prometheus 格式;④ 关键 span: guard_verify、graph_query、router_classify;⑤ 文档化部署到 Jaeger/Tempo |
| **验收标准** | `/metrics` 暴露关键指标;trace 在 Jaeger 可查 |
| **风险** | 中 |
| **依赖** | P2 各项 |
| **责任** | Lead: Agent / Subagent: deep |

### P3-2: VitePress 文档站 (16h)

| 项 | 内容 |
|---|---|
| **文件** | 新建 `docs-site/` (与 docs/ 配合) |
| **目标状态** | aidenav.github.io 类文档站 |
| **实施步骤** | ① VitePress 初始化;② 主题定制;③ 内容填充(从 docs/ 迁移);④ Algolia DocSearch 集成;⑤ GitHub Pages 自动部署 |
| **验收标准** | 站点可访问;搜索可用;P1-8 内容已上线 |
| **风险** | 低 |
| **依赖** | P1-8 |
| **责任** | Lead: Agent / Subagent: writing |

### P3-3: Helm chart + K8s 部署 (20h)

| 项 | 内容 |
|---|---|
| **文件** | 新建 `deploy/helm/` |
| **目标状态** | K8s 一键部署 |
| **实施步骤** | ① helm create;② ConfigMap + Secret 模板;③ Service + Ingress;④ PVC for SQLite;⑤ HPA 配置;⑥ README 部署指南 |
| **验收标准** | `helm install` 成功;`kubectl get pods` 全部 Running |
| **风险** | 中 — K8s 测试环境成本 |
| **依赖** | P1-7 |
| **责任** | Lead: Agent / Subagent: deep |

### P3-4: 离线模式 (本地 LLM) (24h)

| 项 | 内容 |
|---|---|
| **文件** | `packages/guard/src/provider/ollama.ts` (新建) |
| **目标状态** | 全部特性可在无外网时运行 |
| **实施步骤** | ① 集成 Ollama API;② 模型选择策略(按可用性);③ provider fallback: ollama → openai → anthropic;④ 配置 schema 加 `providers.ollama`;⑤ README 离线部署章节 |
| **验收标准** | 断网时 guard verify 可用 ollama 跑 LLM-judge |
| **风险** | 高 — 模型质量差异,需重新校准阈值 |
| **依赖** | P2-2 |
| **责任** | Lead: Agent / Subagent: ultrabrain |

### P3 阶段交付物 (W12 末)
- [ ] OpenTelemetry 集成
- [ ] 文档站上线
- [ ] Helm chart 可用
- [ ] 离线模式可用
- [ ] 发布 v1.0.0 tag
- [ ] 生产就绪检查清单 100% 完成

---

## 8. 实施时间表

```
Week      1      2      3      4      5      6      7      8      9      10     11     12
─────────────────────────────────────────────────────────────────────────────────────
P0-1  [████████]
P0-2  [████]
P0-3  [████████████]
P0-4  [████████████]
P0-5  [████]
P0-6  [████]
                ↑ v0.2.0 发布
P1-1         [████████]
P1-2         [████████████████]
P1-3              [████████████]
P1-4                 [████████]
P1-5                 [████████]
P1-6                    [████████████]
P1-7                    [████████]
P1-8                       [████████]
                            ↑ v0.5.0 发布
P2-1                              [████████████████████████]
P2-2                              [████████████████]
P2-3                                   [████████████████]
P2-4                                   [████████████████]
P2-5                                        [████████████]
                                                ↑ v0.8.0 发布
P3-1                                                    [████████████████████]
P3-2                                                    [████████████████]
P3-3                                                         [████████████████████]
P3-4                                                              [████████████████████████]
                                                                     ↑ v1.0.0 发布
```

**关键里程碑**:
- **W2 末**: v0.2.0 — P0 全部完成
- **W6 末**: v0.5.0 — P1 全部完成
- **W10 末**: v0.8.0 — P2 全部完成
- **W12 末**: v1.0.0 — 生产就绪

---

## 9. 责任分配

由于本项目采用单一执行者 (Agent) + 子代理协作模式,责任分配如下:

### 9.1 角色定义

| 角色 | 职责 | 使用场景 |
|---|---|---|
| **Lead Agent (主代理)** | 协调、决策、审核、合并 | 所有阶段 |
| **Subagent: deep** | 大模块的完整实现 | P0-3, P0-4, P1-2, P2-3, P3-1, P3-3 |
| **Subagent: quick** | 单文件小改 | P0-2, P0-6, P1-4, P1-7 |
| **Subagent: ultrabrain** | 高难度逻辑优化 | P1-6, P2-1, P2-2, P3-4 |
| **Subagent: visual-engineering** | UI/文档站主题 | P3-2 |
| **Subagent: writing** | 文档撰写 | P1-8, P3-2 |
| **Oracle** | 关键架构决策评审 | P0-3, P2-1, P2-2 |

### 9.2 任务分配矩阵

| 任务 | 主负责 | 并行辅助 | 审核 |
|---|---|---|---|
| P0-1 | Subagent: deep | - | Lead |
| P0-2 | Subagent: quick | - | Lead |
| P0-3 | Subagent: deep | - | Oracle |
| P0-4 | Subagent: deep | - | Lead |
| P0-5 | Lead | - | - |
| P0-6 | Subagent: quick | - | Lead |
| P1-1 | Subagent: quick | - | Lead |
| P1-2 | Subagent: deep | - | Lead |
| P1-3 | Subagent: deep | - | Lead |
| P1-4 | Subagent: quick | - | Lead |
| P1-5 | Lead | - | - |
| P1-6 | Subagent: ultrabrain | - | Oracle |
| P1-7 | Subagent: quick | - | Lead |
| P1-8 | Subagent: writing | - | Lead |
| P2-1 | Subagent: ultrabrain | - | Oracle |
| P2-2 | Subagent: ultrabrain | - | Oracle |
| P2-3 | Subagent: deep | - | Lead |
| P2-4 | Subagent: deep | - | Lead |
| P2-5 | Subagent: deep | - | Lead |
| P3-1 | Subagent: deep | - | Lead |
| P3-2 | Subagent: visual-engineering + writing | - | Lead |
| P3-3 | Subagent: deep | - | Lead |
| P3-4 | Subagent: ultrabrain | - | Oracle |

### 9.3 每日站会 (Daily Check-in)

每个工作日开始时,Lead Agent 输出:
1. 昨日完成项
2. 今日计划项
3. 阻塞项
4. 风险更新

---

## 10. 测试策略

### 10.1 测试金字塔

```
         ╱╲
        ╱  ╲         系统测试 (E2E)
       ╱ 5% ╲        真实环境,关键场景
      ╱──────╲
     ╱        ╲      集成测试 (30%)
    ╱   25%    ╲     模块间协作,MCP 协议,Provider 集成
   ╱────────────╲
  ╱              ╲   单元测试 (65%)
 ╱     70%        ╲  单函数/类,纯逻辑,高覆盖率
╱──────────────────╲
```

### 10.2 各阶段测试要求

| 阶段 | 单测覆盖率 | 集成测试 | 系统测试 |
|---|---|---|---|
| P0 结束 | 现有 9 文件不破坏 | proxy/verify 核心 5 场景 | Docker 启动 + curl /health |
| P1 结束 | ≥ 60% | 15+ 场景 | CLI 端到端、IDE 集成 |
| P2 结束 | ≥ 70% | 25+ 场景 | 性能 benchmark、并发 |
| P3 结束 | ≥ 75% | 35+ 场景 | 离线模式、K8s 部署、文档站 |

### 10.3 关键测试场景清单 (P0-P1)

| # | 类型 | 场景 | 验收 |
|---|---|---|---|
| T01 | 单测 | `verifier.verify({ file })` 正常文件 | TRUST |
| T02 | 单测 | `verifier.verify({ file })` 幻觉包导入 | REJECT |
| T03 | 单测 | `routeEngine.classify("修复 bug")` | cost 策略 |
| T04 | 单测 | `codeGraph.query("OrderController")` | 找到节点 |
| T05 | 单测 | `config.load()` 多级回退 | defaults 应用 |
| T06 | 集成 | `aide mcp serve` → stdio JSON-RPC | 5 tools 列出 |
| T07 | 集成 | `aide mcp serve` → guard_verify 端到端 | 返回 verdict |
| T08 | 集成 | proxy `/v1/chat/completions` 流式 | SSE 正确 |
| T09 | 集成 | proxy provider 故障转移 | 回退到备份 |
| T10 | 系统 | `docker compose up` + `curl /health` | 200 OK |
| T11 | 系统 | 完整 CLI 流程: `init → index → verify` | exit 0 |
| T12 | 系统 | MCP 与 Claude Code (模拟) 集成 | 工具调用成功 |

### 10.4 性能基准 (P1 末必须达成)

| 操作 | 当前 | 目标 | 测试方法 |
|---|---|---|---|
| `aide graph init` (10k 文件) | 未知 | < 5 分钟 | bench/graph-init.ts |
| `aide guard check -f` (单文件) | 未知 | < 200ms (P95) | bench/guard-check.ts |
| `router.classify` | 未知 | < 5ms | bench/router.ts |
| `mcp tool/call` 全链路 | 未知 | < 500ms | bench/mcp.ts |

---

## 11. 质量门禁 (Quality Gates)

### 11.1 PR 合并必须满足

```yaml
typecheck: 0 错误
lint: 0 错误 (warning 可接受,但需修复注释)
test: 全过
coverage: 文件覆盖率 ≥ 当前基线 - 1%
build: 成功
commit: 符合 conventional commits
changelog: 包含 changeset 文件
```

### 11.2 发布必须满足 (额外)

```yaml
performance: P95 延迟不回归 > 10%
security: 无新增 Critical 漏洞
docs: 新功能有对应文档
docker: 镜像可构建且 < 500MB
smoke: 5 关键场景通过
```

### 11.3 自动检查脚本

```bash
# scripts/release-check.sh (P1-1 后建立)
npm run typecheck && \
  npm run lint && \
  npm test && \
  npm run build && \
  docker build -t aide:test ./deploy/docker && \
  bash scripts/smoke-test.sh
```

---

## 12. 发布策略

### 12.1 版本规则

- 主版本 (x.0.0): 破坏性 API 变更
- 次版本 (0.x.0): 新功能
- 修订版 (0.0.x): bug fix

### 12.2 发布流程

```
1. feature/xxx 分支开发
2. PR 触发 CI,Lead 审核
3. 合并到 main
4. Changesets 累积变更
5. CI 触发 release PR
6. Lead 合并 release PR → 自动发布 npm + Docker
7. GitHub Release 自动创建
```

### 12.3 回滚策略

| 场景 | 回滚方法 |
|---|---|
| 单 PR bug | revert PR,重打 tag |
| 性能回归 | 上一版本 npm tag 切换 |
| 数据损坏 | better-sqlite3 WAL checkpoint + 备份恢复 |
| Docker 镜像 | 切回上一 tag |

---

## 13. 风险登记册

| ID | 风险 | 概率 | 影响 | 缓解措施 | 触发条件 |
|---|---|---|---|---|---|
| R1 | P0 修复引入新 bug | 中 | 高 | 严格回归测试,小步合并 | 测试失败 |
| R2 | graph 嵌入向量集成超时 | 中 | 中 | P2-1 限定 24h 探索,失败回退到 hybrid FTS | W8 中 |
| R3 | MCP SDK 2.0 break change | 低 | 高 | 锁版本,适配层 | SDK 1.x EOL |
| R4 | Anthropic/OpenAI 协议变化 | 中 | 中 | 已有 provider 抽象,只需更新 | 协议字段变化 |
| R5 | CI 资源不足(macOS runner) | 中 | 中 | 限制 macOS 跑特定 job | 每月成本 > $50 |
| R6 | Windows 测试不稳定 | 中 | 中 | 标记 known issues,优先 Linux | 测试 flaky > 5% |
| R7 | 子代理质量不达标 | 中 | 高 | Lead 审核每个子代理输出 | 任务失败 |
| R8 | better-sqlite3 编译问题 | 低 | 高 | 文档化预编译包,npm 镜像 | 编译失败 |
| R9 | 文档站构建失败 | 低 | 低 | P3-2 推迟,仅 markdown | 站点坏 |
| R10 | Helm chart 兼容性 | 中 | 中 | 只支持 K8s 1.24+ | 安装失败 |

---

## 14. 验收标准 (Definition of Done for v1.0.0)

### 14.1 必须达成 (Must-Have)

- [ ] 0 个 P0/P1 缺陷
- [ ] `npm run typecheck` 0 错误
- [ ] `npm run lint` 0 错误
- [ ] 测试覆盖率 ≥ 75% (文件)
- [ ] 35+ 集成测试场景全过
- [ ] CI/CD 完整可用
- [ ] Docker 镜像 < 500MB
- [ ] 文档站可访问且完整
- [ ] 性能基线文档化
- [ ] 安全审计 checklist 通过
- [ ] CHANGELOG.md 完整
- [ ] README 包含完整 Quick Start

### 14.2 应该达成 (Should-Have)

- [ ] 嵌入向量检索可用
- [ ] LLM judge 可选启用
- [ ] 多租户隔离
- [ ] 5+ 模板
- [ ] MCP resources + prompts
- [ ] Helm chart 可用
- [ ] 离线模式可用

### 14.3 可以达成 (Nice-to-Have)

- [ ] OpenTelemetry trace
- [ ] VSCode 扩展 PoC
- [ ] GitHub Action 集成

---

## 附录 A: 文件级修改清单 (P0 部分)

| 文件 | 修改类型 | 行数估算 |
|---|---|---|
| `packages/mcp-server/src/index.ts` | 重构 + Zod 引入 | +80 / -40 |
| `packages/mcp-server/package.json` | 加 zod 依赖 | +3 |
| `packages/cli/src/bin.ts` | 重写参数解析 | +40 / -20 |
| `packages/guard/src/proxy/index.ts` | 拆分函数 | +60 / -120 |
| `packages/guard/src/proxy/index.ts` | 加 helmet | +5 |
| `packages/guard/src/proxy/index.ts` | CORS 配置化 | +15 / -5 |
| `packages/graph/tsconfig.json` | 启用 strict | +3 / -2 |
| `packages/guard/tsconfig.json` | 启用 strict | +3 / -2 |
| `packages/router/tsconfig.json` | 启用 strict | +3 / -2 |
| `packages/cli/tsconfig.json` | 启用 strict | +3 / -2 |
| `packages/graph/src/**/*.ts` | strict 修复 | +200 / -100 |
| `packages/guard/src/**/*.ts` | strict 修复 | +150 / -80 |
| `packages/router/src/**/*.ts` | strict 修复 | +20 / -10 |
| `packages/cli/src/**/*.ts` | strict 修复 | +30 / -15 |
| `.github/workflows/ci.yml` | 新建 | +60 |
| `.github/dependabot.yml` | 新建 | +20 |
| `.github/CODEOWNERS` | 新建 | +15 |
| `packages/mcp-server/src/*.test.ts` | 新建 5+ 测试 | +300 |

---

## 附录 B: 新增依赖列表

| 依赖 | 阶段 | 用途 | 估计大小 |
|---|---|---|---|
| `zod` | P0-1 | MCP args 校验 | +50KB |
| `helmet` | P1-7 | HTTP 安全头 | +30KB |
| `@opentelemetry/sdk-node` | P3-1 | 可观测性 | +2MB |
| `@opentelemetry/auto-instrumentations-node` | P3-1 | 自动埋点 | +1MB |
| `prom-client` | P3-1 | Prometheus metrics | +50KB |
| `lance-db` 或 `sqlite-vec` | P2-1 | 向量检索 | +500KB |
| `@xenova/transformers` | P2-1 | 本地嵌入 | +5MB (懒加载) |
| `commitlint` + `@commitlint/config-conventional` | P1-1 | 提交规范 | 0 (dev) |
| `husky` + `lint-staged` | P1-1 | pre-commit | 0 (dev) |
| `@changesets/cli` | P1-1 | 版本管理 | 0 (dev) |
| `prettier` | P1-1 | 格式化 | 0 (dev) |

---

## 附录 C: 版本控制规范 (分支命名)

基于 CONTRIBUTING.md 的 "Create a feature branch from `main`":

| 分支类型 | 命名模式 | 示例 | 用途 |
|---|---|---|---|
| 主干 | `main` | `main` | 稳定代码 |
| 功能 | `feature/<scope>-<desc>` | `feature/p0-mcp-zod` | 新功能 |
| 修复 | `fix/<scope>-<desc>` | `fix/proxy-stream-header` | bug 修复 |
| 重构 | `refactor/<scope>-<desc>` | `refactor/graph-strict` | 重构 |
| 文档 | `docs/<desc>` | `docs/security-model` | 仅文档 |
| 发布 | `release/v<version>` | `release/v0.2.0` | 发布准备 |

### 推荐分支 (本计划)

```
main (稳定)
└── feature/v1.0-refactor  ← 主修改分支(本计划)
    ├── feature/p0-mcp-zod
    ├── fix/p0-cli-guard-verify
    ├── refactor/p0-proxy-stream
    ├── refactor/p0-typescript-strict
    ├── chore/p0-ci-setup
    ├── fix/p0-mcp-path-traversal
    ├── chore/p1-toolchain
    ├── test/p1-graph-coverage
    ├── test/p1-guard-coverage
    ├── ... (其他 P1-P3 子分支)
```

---

## 附录 D: Git 初始化与基线策略

由于 `D:\aide-monorepo` 当前**不是 Git 仓库**,需先初始化:

```bash
# 步骤 1: 初始化
cd D:\aide-monorepo
git init
git config user.name "AIDE Refactor Agent"
git config user.email "agent@aide-dev.local"

# 步骤 2: 创建基线 commit(基于当前 0.1.0 状态)
git add -A
git commit -m "chore: initial commit at v0.1.0 (baseline)"
git tag v0.1.0

# 步骤 3: 切换到 main 分支
git branch -M main

# 步骤 4: 创建修改分支
git checkout -b feature/v1.0-refactor

# 步骤 5: 后续每次修改按子分支开发,PR 合并到 feature/v1.0-refactor
```

### 安全考虑

- 跳过 husky(基线 commit 时不触发 lint 钩子):`HUSKY=0 git commit`
- 不强制 GPG 签名(本地环境可能没有)
- 不推送到远程(除非用户指定)

---

## 附录 E: 单次会话执行范围建议

由于 12 周计划超出单次会话能力,建议分批次执行:

### 推荐批次

| 批次 | 任务 | 估计会话次数 | 适用 |
|---|---|---|---|
| **批次 1** | P0 全部 (6 任务) | 1-2 次会话 | 修 Critical BUG + CI |
| **批次 2** | P1 全部 (8 任务) | 3-4 次会话 | 测试 + 工具链 + 文档 |
| **批次 3** | P2 全部 (5 任务) | 4-5 次会话 | 核心增强 |
| **批次 4** | P3 全部 (4 任务) | 3-4 次会话 | 生产化 |

### 当前会话建议

如果用户希望"立即可执行"的内容,推荐:

**本会话完成**:
- ✅ Git 初始化 (如用户同意)
- ✅ 创建 `feature/v1.0-refactor` 分支
- ✅ P0-1 修复 mcp-server Zod
- ✅ P0-2 修复 CLI guard verify
- ✅ P0-4 部分: graph 包 strict (最复杂,先动)
- ✅ 运行 typecheck + 现有测试
- ✅ 提交到 feature/v1.0-refactor

**下次会话**:
- P0-3 proxy 重构
- P0-4 完成剩余 strict
- P0-5 CI 建立
- P0-6 路径遍历

**后续会话**:
- P1 全部...

---

**计划文档结束**。如对本计划有调整意见(优先级/工时/任务内容),请告知。
