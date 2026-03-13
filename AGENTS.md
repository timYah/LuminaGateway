# Agent Workflow — Instructions

## Bootstrap vs. Continue

**If `agent-docs/tasks.md` already exists** — the project has already been bootstrapped. Skip bootstrap entirely and go to the **Workflow** section below. If the user provides a new requirement (e.g., "添加用户登录功能", "优化首页加载速度", "修复 XXX bug"), follow the **Handling new requirements** process.

**If `agent-docs/tasks.md` does not exist** — run bootstrap:

When the user says something like "参考 PRD，实现这个产品" or "Start execution":

1. **Read the PRD** file the user specifies (or find it in the project root / `docs/` directory).
2. **Analyze existing codebase** (if any) — Scan the project for existing source code, config files (`package.json`, `Cargo.toml`, etc.), directory structure, and conventions. Identify what has already been built, the tech stack in use, and the current project state. If the project is empty, skip this step.
3. **Generate `agent-docs/spec.md`** — Extract and restructure the PRD into a formal project specification following the template in `agent-docs/spec.md.template`. Fill in all sections: core goals, non-goals, hard requirements, deliverables, product spec, etc. If an existing codebase was found, note the current state and what remains to be built.
4. **Generate `agent-docs/plan.md`** — Create a milestone plan with architecture overview, risk register, and Decision log. At least 10 milestones, each with scope, key files, acceptance criteria, and verification commands. For existing projects, mark already-completed work and plan only the remaining milestones.
5. **Generate `agent-docs/tasks.md`** — Break every milestone into granular Tasks. Each Phase ends with a ✅ verification task. For existing projects, pre-mark completed Tasks as `[x]` based on the codebase analysis.
6. **Update this `AGENTS.md` file** — Fill in the "Project info" section below with the project name, description, tech stack, verification commands, and code conventions derived from the PRD and existing codebase.
7. **Generate `agent-docs/runbook.md`** — Copy from `agent-docs/runbook.md.template` and fill in the completion criteria.
8. **Delete all template files** — Remove `agent-docs/spec.md.template` and `agent-docs/runbook.md.template`. They are no longer needed after bootstrap.
9. **Commit** all generated files and template deletions: `docs(T-00.0): bootstrap project from PRD`.
10. **Present plan to user for review** — Summarize the generated architecture, milestones, and task breakdown. For existing projects, clearly highlight what was detected as already done vs. what will be built. Then **stop and wait for user confirmation**. Do NOT start coding until the user explicitly approves (e.g., "确认", "开始执行", "LGTM", "go").
   - If the user requests changes verbally (e.g., adjust milestones, modify tech stack, add/remove features), apply **all** requested changes to the relevant files at once, commit, and present the updated plan again. Do NOT stop after each individual change to ask — complete everything the user asked for in one pass, then re-present.
   - If the user directly edits project files themselves, re-read the modified files, adapt the plan accordingly, commit, and re-present.
   - Repeat this review loop until the user confirms.
11. **Begin execution** — Start from the first incomplete Task.

---

## Project info

> The agent fills in this section during bootstrap. Before bootstrap, these are blank.

**Project name**: (auto-filled from PRD)

**Description**: TypeScript Hono LLM gateway adding newapi-style passthrough + convert routes for OpenAI Responses/Realtime, Claude Messages, and Gemini generateContent.

**Tech stack**: TypeScript (ESM), Node.js 18+, Hono, Zod, Drizzle ORM, Vitest, ESLint, Vite/Nuxt UI (admin).

**Verification commands**:
```bash
npm run lint
npm run typecheck
npm run test
```

**Code conventions**: TypeScript ESM; Hono route modules in `src/routes`; business logic in `src/services`; Zod validators in `src/types/validators.ts`; errors use `gateway_error` shape; passthrough filters hop-by-hop headers.

---

## Key documents

- `agent-docs/spec.md` — Full project specification and requirements (the target)
- `agent-docs/plan.md` — Milestone plan, architecture overview, risk register, and decision log
- `agent-docs/tasks.md` — Granular task list — source of truth for execution order
- `agent-docs/runbook.md` — Execution runbook with rules and completion criteria
- `agent-docs/documentation.md` — Living documentation updated as milestones complete

> **Only agent workflow documents** (spec, plan, tasks, runbook, documentation) belong in `agent-docs/`. All other project documents (PRD, API docs, guides, changelogs, etc.) go in `docs/`.

## Language

- Respond to users in **Chinese** unless the user explicitly requests another language.
- Code, comments, commit messages, and documentation files are written in **English**.

## Workflow

1. Read `agent-docs/tasks.md` and find the next incomplete Task (marked `[ ]`).
2. **Pre-check**: Read related file context, analyze dependencies and potential side effects.
3. **Implement**: Complete the Task with minimal changes.
4. **Self-test**: Run verification commands. If they fail, analyze the error and fix it autonomously — do not wait for human intervention.
5. Mark the Task as `[x]` in `agent-docs/tasks.md`.
6. **Commit**: `git add` the relevant files (including the updated `tasks.md`) and `git commit` (format described below in Git commit rules), then continue to the next Task.

### Handling new requirements

When the user requests something not already listed in `agent-docs/tasks.md`:

1. Append a new Phase at the end of `agent-docs/tasks.md` (incrementing the phase number).
2. Break the requirement into Tasks at a consistent granularity. The first Task should be `T-XX.0 Update task list and documentation`.
3. The last Task in each Phase must be a ✅ verification task.
4. Once appended, execute them following the standard workflow.

### Self-correction principles

- When an error occurs, read the full log, analyze the root cause, then fix. Do not blindly retry.
- If the same error persists after 3 consecutive fix attempts → mark the Task as `[!]` (blocked), record the issue in `agent-docs/plan.md` under the Decision log section, and skip to the next Task.
- No change may break the project's runnable state. If it does, roll back immediately.

### Timeout policy

- If a tool invocation (test/build/lint) produces no response for over **2 minutes** → kill the process, analyze whether the change introduced an infinite loop or resource leak, fix the root cause, then retry.

## Git commit rules

- **Never commit before verification passes.** Run all relevant verification commands first; only commit after they succeed. If tests fail, fix first, then commit.
- **One Task, one commit.** After a Task passes verification, commit it immediately. Do not batch multiple Tasks into a single commit.
- Only stage files related to the current Task. Never use `git add -A` or `git add .`.

### Commit message format

```
<type>(T-<phase>.<seq>): <short description>
```

**type** values:

| type | usage |
|------|-------|
| `feat` | New feature, file, or module |
| `test` | New or updated tests |
| `fix` | Bug fix |
| `refactor` | Refactor (no behavior change) |
| `chore` | Dependency install, script config, tooling |
| `docs` | Documentation update |

**Examples:**

```
docs(T-00.0): bootstrap project from PRD
chore(T-01.1): initialize project with package manager
feat(T-03.2): implement user authentication service
test(T-03.3): add auth service unit tests
fix(T-03.3): fix token validation edge case found during testing
docs(T-10.1): update documentation to reflect final implementation
```
