# Lumina Gateway — Agent Instructions

## What this project is

Lumina Gateway is a TypeScript-based LLM aggregation gateway. It unifies multiple AI providers (OpenAI, Anthropic, Google, third-party proxies) behind a single API endpoint with balance-aware routing and automatic failover.

## Key documents (read these first)

- `docs/prompt.md` — Full project specification and requirements (the target)
- `docs/plans.md` — Milestone plan, architecture overview, risk register, and decision log
- `docs/tasks.md` — Granular task list (152 tasks across 36 phases) — source of truth for execution order
- `docs/implement.md` — Execution runbook with rules and completion criteria
- `docs/documentation.md` — Living documentation updated as milestones complete

## Tech stack

- **Language**: TypeScript (strict mode)
- **API framework**: Hono
- **AI interaction**: Vercel AI SDK
- **ORM**: Drizzle ORM
- **Database**: SQLite (default, via better-sqlite3) / PostgreSQL (optional)
- **Testing**: Vitest
- **Linting**: ESLint

## Workflow

1. Read `docs/tasks.md` 找到下一个未完成的 Task。
2. **预检**：读取相关文件上下文，分析依赖关系和潜在副作用。
3. **执行**：实现该 Task，保持最小化改动。
4. **自测**：运行 `npm run lint && npm run typecheck && npm run test`。如果失败，自行分析并修复，不要等待人类干预。
5. **提交**：`git add` 相关文件并 `git commit`（格式见下方 Git commit rules）。
6. 在 `docs/tasks.md` 中勾选 `[x]`，继续下一个 Task。

### 自我修复原则

- 报错时读取完整日志，分析根因后再修复，不要盲目重试。
- 同一错误连续修复 3 次仍失败 → 标记 `[!]` 阻塞，记录到 `docs/plans.md`，跳到下一个 Task。
- 任何改动不得破坏 `npm run dev` 的可运行状态。如果破坏了，立即回滚。

### 超时策略

- 工具调用（test/build/lint）超过 2 分钟无响应 → 中断进程，分析是否引入死循环或资源泄漏，修复后再重试。

## Verification commands

```bash
npm run dev          # start dev server
npm run build        # compile
npm run lint         # lint check
npm run typecheck    # type check
npm run test         # run tests
npm run db:migrate   # run migrations
npm run db:seed      # seed demo data
```

## Git commit rules

- **每完成一个 Task（如 T-01.1）必须立即 `git add` 相关文件并 `git commit`。** 不要将多个 Task 合并为一次提交。
- 验证任务（如 T-01.11）在所有测试通过后也需单独提交。
- 只 stage 当前 Task 涉及的文件，禁止 `git add -A` 或 `git add .`。

### Commit message 格式

```
<type>(T-<phase>.<seq>): <简要描述>
```

**type** 取值：

| type | 用途 |
|------|------|
| `feat` | 新增功能、文件、模块 |
| `test` | 新增或修改测试 |
| `fix` | 修复 bug |
| `refactor` | 重构（不改变行为） |
| `chore` | 依赖安装、脚本配置、工具链 |
| `docs` | 文档更新 |

**示例：**

```
chore(T-01.1): initialize package.json with type module
chore(T-01.2): install hono and @hono/node-server
feat(T-01.8): create Hono app factory with /health endpoint
test(T-01.11): verify scaffold — lint, typecheck, test all pass
feat(T-05.6): implement atomic balance deduction in providerService
test(T-05.7): add providerService unit tests
fix(T-05.7): fix deductBalance race condition found during testing
docs(T-36.1): update documentation.md to reflect final implementation
```

## Code conventions

- Use Hono's standard patterns for routes and middleware.
- Use Drizzle's query builder (not raw SQL).
- All services are plain functions or classes — no dependency injection framework.
- Tests go in `__tests__/` directories adjacent to the code they test.
- Error responses match the format expected by the client (OpenAI or Anthropic).
