# Lumina Gateway — Implementation Runbook

Now implement the entire project end-to-end.

## Non-negotiable constraint

Do not stop after a milestone to ask questions or wait for confirmation.
Proceed through every milestone in `docs/plans.md` until the whole project is complete and fully validated.

---

## Agent 行为模式

你不是一个只会写代码的聊天机器人，而是一个具备**自我修正循环（Self-Correction Loop）**的工程代理。在每个 Task 中严格遵循以下闭环：

### 闭环执行循环 (Execution Loop)

每个 Task 必须经历完整的 5 步循环：

```
预检 (Pre-check)
  → 执行 (Implement)
    → 自测 (Self-test)
      → 同步 (Sync)
        → 汇报 (Report)
```

1. **预检**：在改动代码前，先读取相关文件的上下文，确认依赖关系和现有接口。
2. **执行**：按 `docs/tasks.md` 编写代码，确保符合 `docs/prompt.md` 的规格要求。
3. **自测**：运行验证命令。如果报错，**自行分析错误原因并修正**，不要止步于报错信息。持续循环直到通过。
4. **同步**：如果当前 Task 的改动影响了之前已完成的代码，立即同步更新，保持全局一致性。
5. **汇报**：每完成一个 Task，在 `docs/tasks.md` 中勾选 `[x]`，并在 commit message 中体现。

### 自我修复规则 (Self-Correction)

- 如果代码运行报错，**读取完整的错误日志**，分析根因，然后修正。不要简单地重试相同的命令。
- 如果连续 3 次修复同一个错误仍然失败，**停止修复**。在 `docs/plans.md` 的 "Implementation notes" 中记录：错误描述、已尝试的方案、判断的根因。然后跳到下一个 Task 并标记当前 Task 为 `[!]` 阻塞。
- 修复 Bug 时必须先写一个能重现问题的失败测试，再修复代码，最后确认测试通过。

### 副作用分析 (Side-Effect Analysis)

在开始每个 Task 前，先分析：

- 当前改动会影响哪些已有文件/模块？
- 是否会破坏已有的类型接口或测试？
- 是否需要同步修改上下游依赖？

如果发现当前 Task 与之前已完成的 Task 产生**逻辑冲突**，**立即停止编写**。记录冲突点，列出解决方案，选择影响最小的方案执行。

---

## 超时与熔断策略 (Timeout & Fallback)

### 工具调用超时

- 运行 `npm run test`、`npm run build` 等命令时，如果超过 **2 分钟**没有响应，立即中断进程。
- 中断后分析：是否引入了逻辑死循环、未关闭的文件流、或无限递归。
- 不要重复执行同一个超时命令。先修复根因，再重新运行。

### 状态回滚

- 如果某个 Task 的改动导致项目整体不可运行（`npm run dev` 挂掉），立即回滚该 Task 的所有改动（`git checkout -- <files>`），重新分析后再执行。
- **原则：宁可任务失败报错，也不要让项目处于不可运行的状态。**

---

## Execution rules (follow strictly)

1. **按 `docs/tasks.md` 中的 Phase / Task 顺序逐项执行。** `docs/plans.md` 为架构参考。如果有歧义，做合理决策并记录到 `docs/plans.md` 的 "Implementation notes and decision log"。

2. **每个 Task 保持最小化。** 一个 Task 只做一件事，一个 commit 只对应一个 Task。

3. **After every Phase 的验证任务：**
   - Run verification commands: `npm run lint`, `npm run typecheck`, `npm run test`
   - Fix all failures immediately (self-correction loop)
   - Commit with a clear message referencing the Task ID

4. **If a bug is discovered at any point:**
   - Write a failing test that reproduces it
   - Fix the bug
   - Confirm the test now passes
   - Record a short note in `docs/plans.md` under "Implementation notes"

5. **Keep the server runnable at every Task.** `npm run dev` must never be broken.

---

## Validation requirements

- Maintain the "verification checklist" section in `docs/plans.md` and keep it accurate as the repo evolves.
- Provider selection must be deterministic — enforce with unit tests that assert exact ordering given fixed DB state.
- Billing calculations must be precise — enforce with tests that compare against hand-calculated expected values.
- Protocol conversion must be tested for both directions with fixture-based tests.

## Documentation requirements

Update `docs/documentation.md` continuously as you implement. At the end, ensure it includes:

- What Lumina Gateway is
- Local setup and one-command dev start (`npm run dev`)
- Environment variables reference
- How to run tests, lint, typecheck
- How to run migrations and seed data
- API reference for all endpoints (OpenAI, Anthropic, admin)
- Provider selection algorithm explanation
- Billing calculation examples
- Error response format documentation
- Repo structure overview
- Troubleshooting common issues

---

## Completion criteria (do not stop until all are true)

- [ ] All tasks in `docs/tasks.md` are marked `[x]`.
- [ ] `npm run dev` starts the server and `/health` returns 200.
- [ ] OpenAI-format requests work (streaming and non-streaming).
- [ ] Anthropic-format requests work (streaming and non-streaming).
- [ ] Failover works across multiple providers (tested with mocked upstreams).
- [ ] Billing writes usage logs without deducting balance.
- [ ] Admin routes for provider/model management work.
- [ ] `npm run test`, `npm run lint`, and `npm run typecheck` all pass.
- [ ] `docs/documentation.md` is accurate and complete.

---

Start now by reading `docs/tasks.md` and beginning Phase 01 / T-01.1. Continue until everything is finished.
