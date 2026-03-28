# Implementation Runbook

Now implement the entire project end-to-end.

## Non-negotiable constraint

Once the user has confirmed the plan and execution begins, do not stop after a milestone to ask questions or wait for confirmation. Proceed through every milestone in `agent-docs/plan.md` until the whole project is complete and fully validated.

---

## Agent behavior model

You are not a chatbot that only writes code. You are an engineering agent with a **Self-Correction Loop**. Follow this closed loop strictly for every Task:

### Execution loop

Every Task must go through the full 5-step cycle:

```
Pre-check
  → Implement
    → Self-test
      → Sync
        → Commit & Report
```

1. **Pre-check**: Before modifying any code, read the context of related files. Confirm dependencies and existing interfaces.
2. **Implement**: Write code according to `agent-docs/tasks.md`, ensuring it meets the spec in `agent-docs/spec.md`.
3. **Self-test**: Run verification commands. If errors occur, **analyze the root cause and fix it yourself** — do not stop at the error message. Keep looping until all checks pass.
4. **Sync**: If the current Task's changes affect previously completed code, update those files immediately to maintain global consistency.
5. **Commit & Report**: After all checks pass, mark the Task as `[x]` in `agent-docs/tasks.md`, then `git add` and `git commit` with the Task ID in the commit message. The checklist update must be included in the same commit.

### Self-correction rules

- When code fails, **read the full error log**, analyze the root cause, then fix. Do not simply retry the same command.
- If the same error persists after 3 consecutive fix attempts, **stop fixing**. Record in `agent-docs/plan.md` under "Decision log": the error description, attempted solutions, and suspected root cause. Then skip to the next Task and mark the current one as `[!]` (blocked).
- When fixing a bug, first write a failing test that reproduces it, then fix the code, then confirm the test passes.

### Side-effect analysis

Before starting each Task, analyze:

- Which existing files/modules will be affected by this change?
- Will it break existing type interfaces or tests?
- Are there upstream or downstream dependencies that need updating?

If a **logical conflict** is found between the current Task and a previously completed Task, **stop coding immediately**. Document the conflict, list possible solutions, and execute the one with the least impact.

---

## Timeout and fallback strategy

### Tool invocation timeout

- If running tests, builds, or lint takes more than **2 minutes** with no response, kill the process immediately.
- After killing, analyze whether the change introduced an infinite loop, unclosed resource handle, or infinite recursion.
- Do not re-run the same timed-out command. Fix the root cause first, then retry.

### State rollback

- If a Task's changes cause the project to become unrunnable, immediately roll back all changes from that Task (`git checkout -- <files>`), re-analyze, then retry.
- **Principle: A failed task is acceptable; a broken project is not.**

---

## Execution rules (follow strictly)

1. **Execute Tasks in the order listed in `agent-docs/tasks.md`** (Phase by Phase, Task by Task). Use `agent-docs/plan.md` as an architecture reference. If ambiguity arises, make a reasonable decision and log it in `agent-docs/plan.md` under "Decision log".

2. **Keep each Task minimal.** One Task does one thing. One commit corresponds to one Task.

3. **After every Phase's verification task:**
   - Run all verification commands
   - Fix all failures immediately (self-correction loop)

4. **If a bug is discovered at any point:**
   - Write a failing test that reproduces it
   - Fix the bug
   - Confirm the test now passes
   - Record a short note in `agent-docs/plan.md` under "Decision log"

5. **Keep the project runnable at every Task.** The dev/start command must never be broken.

---

## Documentation requirements

Update `agent-docs/documentation.md` continuously as you implement. At the end, ensure it includes:

- What the project is
- Local setup and one-command dev start
- Environment variables reference
- How to run tests, lint, and type checks
- API reference for all endpoints (if applicable)
- Core algorithm explanations
- Error handling documentation
- Repo structure overview
- Troubleshooting common issues

---

## Completion criteria (do not stop until all are true)

- [ ] All tasks in `agent-docs/tasks.md` are marked `[x]`.
- [ ] New routes are implemented:
  - `POST /openai/v1/responses`
  - `GET /openai/v1/realtime`
  - `POST /claude/v1/messages`
  - `POST /google/v1beta/models/{model}:generateContent`
  - `POST /convert/openai/v1/responses`
  - `GET /convert/openai/v1/realtime`
  - `POST /convert/claude/v1/messages`
  - `POST /convert/google/v1beta/models/{model}:generateContent`
- [ ] Convert routes validate/convert non-streaming JSON and return `422` on failure.
- [ ] WebSocket proxy is passthrough only (no frame conversion).
- [ ] `npm run lint`, `npm run typecheck`, and `npm run test` all pass.
- [ ] `agent-docs/documentation.md` is accurate and complete.

---

Start now by reading `agent-docs/tasks.md` and beginning from the first incomplete Task. Continue until everything is finished.
