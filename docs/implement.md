# Lumina Gateway — Implementation Runbook

Now implement the entire project end-to-end.

## Non-negotiable constraint

Do not stop after a milestone to ask questions or wait for confirmation.
Proceed through every milestone in `docs/plans.md` until the whole project is complete and fully validated.

## Execution rules (follow strictly)

1. **Treat `docs/tasks.md` as执行清单，`docs/plans.md` 为架构参考。** 按 `tasks.md` 中的 Phase / Task 顺序逐项执行。如果有歧义，做合理决策并记录到 `docs/plans.md` 的 "Implementation notes and decision log"。

2. **Implement deliberately with small, reviewable diffs.** Avoid bundling unrelated changes.

3. **After every milestone:**
   - Run verification commands: `npm run lint`, `npm run typecheck`, `npm run test`
   - Fix all failures immediately
   - Add or update tests that cover the milestone's core behavior
   - Commit with a clear message that references the milestone name

4. **If a bug is discovered at any point:**
   - Write a failing test that reproduces it
   - Fix the bug
   - Confirm the test now passes
   - Record a short note in `docs/plans.md` under "Implementation notes"

5. **Keep the server runnable at every milestone.** `npm run dev` must never be broken.

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

## Completion criteria (do not stop until all are true)

- [ ] All milestones in `docs/plans.md` are implemented and checked off.
- [ ] `npm run dev` starts the server and `/health` returns 200.
- [ ] OpenAI-format requests work (streaming and non-streaming).
- [ ] Anthropic-format requests work (streaming and non-streaming).
- [ ] Failover works across multiple providers (tested with mocked upstreams).
- [ ] Billing correctly deducts balance and writes usage logs.
- [ ] Admin routes for provider/model management work.
- [ ] `npm run test`, `npm run lint`, and `npm run typecheck` all pass.
- [ ] `docs/documentation.md` is accurate and complete.

---

Start now by reading `docs/plans.md` and beginning Milestone 01. Continue until everything is finished.
