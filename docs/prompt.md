# Lumina Gateway — Project Specification

You are Codex acting as a senior backend engineer and system architect. Build a production-grade **LLM aggregation gateway** called **Lumina Gateway** from scratch.

## Core goals

- A unified API gateway that accepts **both** OpenAI (`/v1/chat/completions`) and Anthropic (`/v1/messages`) request formats.
- Aggregate multiple upstream LLM providers (OpenAI, Anthropic, Google, third-party proxies) and **route requests intelligently** based on priority and health.
- **Automatic failover**: when a provider returns quota/rate-limit errors, seamlessly retry with the next available provider — the client should be unaware.
- Real-time token-based billing: compute and record usage cost after every completion without deducting provider balances.
- Clean, type-safe TypeScript codebase with Hono, Vercel AI SDK, and Drizzle ORM.
- You will run for hours: plan first, then implement milestone by milestone. Do not skip the planning phase.

## Non-goals

- No frontend UI dashboard in this phase (API + CLI management only).
- No user auth / multi-tenancy (single-operator gateway).
- No prompt caching or semantic caching layer.
- No custom fine-tuning or model hosting.

## Hard requirements

- **Local run experience**: one command to start (`npm run dev`). Must run on macOS with Node LTS.
- **Tech stack**: TypeScript + Hono + Vercel AI SDK + Drizzle ORM. Use only open-source dependencies.
- **Database**: SQLite by default (via `better-sqlite3`), with PostgreSQL as an optional driver switchable via `DATABASE_TYPE` env var.
- **Streaming**: full SSE streaming support for both OpenAI and Anthropic response formats.
- **Security**: gateway protected by a single `GATEWAY_API_KEY` checked via Bearer token middleware.
- Every milestone must include verification steps (tests, lint, typecheck).

## Hard constraints

- All provider API keys are stored in the database, never hard-coded.
- Balance is informational only — the gateway does NOT query upstream billing APIs.
- Provider selection must be deterministic given the same priority/health state (testable).
- Token counting relies on AI SDK's `usage` callback; no custom tokenizer.
- Request/response protocol conversion must be lossless for the supported subset (messages, system, tools, temperature, max_tokens, stream).

## Deliverables

A repo that contains:

- A working Hono API server implementing the features below
- Database schema + migrations (Drizzle)
- Seed script to populate demo providers
- Scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `db:migrate`, `db:seed`
- A `docs/plans.md` file capturing the full implementation plan

## Product spec (build this)

### A) Protocol gateway — unified API surface

- `POST /v1/chat/completions` — OpenAI-compatible endpoint
  - Accepts standard OpenAI request body (`model`, `messages`, `stream`, `temperature`, `max_tokens`, `tools`, `tool_choice`)
  - Returns OpenAI-format response (non-streaming JSON or SSE stream)
- `POST /v1/messages` — Anthropic-compatible endpoint
  - Accepts standard Anthropic request body (`model`, `messages`, `system`, `stream`, `temperature`, `max_tokens`, `tools`)
  - Returns Anthropic-format response (non-streaming JSON or SSE stream)
- Both endpoints forward the requested `model` slug directly to the selected upstream provider.

### B) Provider management (database-driven)

- Providers table: `id`, `name`, `protocol` (openai | anthropic | google), `baseUrl`, `apiKey`, `balance`, `inputPrice`, `outputPrice`, `isActive`, `priority`, `createdAt`, `updatedAt`
- Usage logs table: `id`, `providerId`, `modelSlug`, `inputTokens`, `outputTokens`, `cost`, `statusCode`, `latencyMs`, `createdAt`
- Admin CRUD via internal routes or seed script (no public admin API in v1).

### C) Smart routing — "The Switch"

- **Priority routing (default)**: among active providers, pick the one with the lowest `priority` (then `id` as tiebreaker).
- **Health-aware fallback**: if the chosen provider returns `402`, `429`, `401`, or `5xx`:
  - Mark it temporarily unhealthy (circuit breaker; defaults: quota 5m, rate limit 60s, server 30s).
  - Immediately retry with the next candidate — no error returned to client unless all candidates exhausted.
- **Deterministic selection**: given the same DB state, the same provider is always chosen (important for tests).

### D) Token billing engine

- After each successful completion, use Vercel AI SDK's `usage` object (`promptTokens`, `completionTokens`) to calculate cost.
- Cost formula: `(inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice`
- Resolve `inputPrice` and `outputPrice` from the provider first, then fall back to `DEFAULT_INPUT_PRICE` / `DEFAULT_OUTPUT_PRICE`, otherwise record `0`.
- Insert a row into the `usageLogs` table for auditing.
- Provider balances are not deducted; they remain informational.
- For streaming responses, billing happens in the `onFinish` callback after the stream completes.

### E) Protocol conversion layer

- When the gateway's external format differs from the upstream provider's protocol:
  - OpenAI request → Anthropic upstream: convert messages format, map `system` to top-level field, translate tool schemas.
  - Anthropic request → OpenAI upstream: reverse mapping.
- The AI SDK handles most of this, but the gateway must correctly map request parameters and wrap/unwrap response envelopes for the client.
- Streaming events must be re-framed to match the client's expected SSE format.

### F) Configuration and environment

```
DATABASE_TYPE=sqlite          # sqlite | postgres
DATABASE_URL=file:./.runtime/lumina.db # or postgres://...
GATEWAY_API_KEY=sk-lumina-xxx # bearer token for gateway auth
DEFAULT_INPUT_PRICE=0.0       # optional, USD per 1M input tokens
DEFAULT_OUTPUT_PRICE=0.0      # optional, USD per 1M output tokens
PORT=3000
LOG_LEVEL=info                # debug | info | warn | error
```

### G) Quality and engineering

- Strong TypeScript types for:
- Provider entities and usage logs
  - Request/response schemas (OpenAI format, Anthropic format)
  - Router decision types
  - Billing calculation types
- Unit tests for:
  - Provider selection algorithm (deterministic)
  - Billing calculation
  - Protocol conversion (message format mapping)
  - Circuit breaker behavior
- Integration tests for:
  - End-to-end request flow with mocked upstream
  - Failover across providers
  - Streaming response correctness

## Process requirements (follow strictly)

### PLANNING FIRST (write this before coding anything):

Create `docs/plans.md` with a milestone plan (at least 10 milestones). For each milestone include: scope, key files/modules, acceptance criteria, and commands to verify. Include a "risk register" with top technical risks and mitigation plans (streaming relay, protocol conversion edge cases, balance race conditions, circuit breaker timing). Include an "architecture overview" section describing:

- Request lifecycle (ingress → auth → route → upstream call → billing → response)
- Provider selection algorithm
- Protocol conversion strategy
- Billing pipeline
- Database schema relationships
- Error handling and fallback flow

### SCAFFOLD SECOND:

Initialize the repo with TypeScript + Hono. Add Drizzle ORM with SQLite driver. Add Vitest, ESLint, and strict TypeScript settings. Ensure `npm run dev` starts the Hono server. Ensure health check endpoint returns 200.

### IMPLEMENT THIRD:

Implement one milestone at a time. After each milestone: run verification commands, fix issues, commit with a clear message.

Keep diffs reviewable and avoid giant unstructured changes.

If you hit complexity choices:
- Prefer correctness and reliability over extra features.
- Document tradeoffs and decisions in `docs/plans.md` as you go.

---

Start now.
First, create `docs/plans.md` with the complete plan, risk register, and architecture overview. Do NOT start coding until `docs/plans.md` exists and is coherent.
