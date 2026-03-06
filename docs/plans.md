# Lumina Gateway — Implementation Plan

This document is the complete execution plan, risk register, and architecture overview. We will implement milestone by milestone, validating each step with lint, typecheck, tests, and verification commands.

## Guiding principles

- **Reliability over flash**: failover must be invisible to the client; billing must be accurate.
- **Determinism**: provider selection given the same DB state must always yield the same result.
- **Clear separations**: routing / billing / protocol-conversion are framework-agnostic and independently testable.
- **Incremental delivery**: every milestone produces a runnable, testable artifact.

---

## Architecture overview

### Request lifecycle

```
Client Request
    │
    ▼
[Auth Middleware]  ── verify GATEWAY_API_KEY via Bearer token
    │
    ▼
[Format Detection]  ── determine if request is OpenAI or Anthropic format
    │
    ▼
[Model Resolution]  ── look up `slug` in models table → find candidate providers
    │
    ▼
[Provider Router]   ── select provider by priority (asc) → id (asc)
    │                   filter: isActive=true, not circuit-broken
    ▼
[Protocol Adapter]  ── convert request to upstream provider's native format
    │
    ▼
[Upstream Call]     ── Vercel AI SDK streamText / generateText
    │
    ▼
[Response Relay]    ── re-frame SSE events to client's expected format
    │
    ▼
[Billing Hook]      ── onFinish: calculate cost, write usage log
    │
    ▼
[Fallback Loop]     ── on quota/rate error → mark provider unhealthy → retry next
```

### Provider selection algorithm

```
function selectProvider(modelSlug):
  candidates = db.models
    .where(slug = modelSlug)
    .join(providers)
    .where(isActive = true AND NOT circuitBroken)
    .orderBy(priority ASC, id ASC)

  return candidates[0]  // deterministic: same state → same pick
```

### Protocol conversion strategy

Vercel AI SDK abstracts most differences. The gateway handles:

1. **Request envelope**: map client format → AI SDK universal format
2. **Response envelope**: map AI SDK output → client's expected format
3. **Streaming**: for OpenAI clients, emit `data: {...}\n\n` chunks; for Anthropic clients, emit `event: content_block_delta\ndata: {...}\n\n` style events
4. **Tools/function calling**: normalize tool schemas between formats

### Billing pipeline

```
onFinish(result):
  inputCost  = (result.usage.promptTokens / 1_000_000) * model.inputPrice
  outputCost = (result.usage.completionTokens / 1_000_000) * model.outputPrice
  totalCost  = inputCost + outputCost

  INSERT INTO usageLogs (providerId, modelSlug, inputTokens, outputTokens, cost, ...)
```

### Database schema relationships

```
providers (1) ──< models (N)        // one provider has many model mappings
providers (1) ──< usageLogs (N)     // one provider has many usage records
models.slug ← request.model        // client references model by slug
```

### Error handling and fallback flow

```
for each candidate in sortedProviders:
  try:
    response = callUpstream(candidate, request)
    billUsage(candidate, response.usage)
    return response
  catch error:
    if isQuotaError(error):        // 402
      openCircuitBreaker(candidate, cooldown=5m)
      continue
    if isRateLimitError(error):    // 429
      openCircuitBreaker(candidate, cooldown=60s)
      continue
    if isAuthError(error):         // 401
      deactivateProvider(candidate)
      continue
    if isServerError(error):       // 5xx
      openCircuitBreaker(candidate, cooldown=30s)
      continue
    throw error                    // unknown error → propagate

throw new Error("All providers exhausted")
```

---

## Milestones

### Milestone 01 — Repo scaffold + tooling foundation [x]

**Scope:**
- Initialize TypeScript project with `tsconfig.json` (strict mode).
- Add Hono as the API framework.
- Add Vitest, ESLint, and scripts.
- Add Drizzle ORM with `better-sqlite3` driver.
- Create directory structure: `src/`, `src/db/`, `src/routes/`, `src/services/`, `src/middleware/`, `src/types/`.

**Key files/modules:**
- `package.json`
- `tsconfig.json`
- `src/index.ts` (Hono app entry)
- `src/app.ts` (Hono app factory)
- `drizzle.config.ts`

**Acceptance criteria:**
- `npm install` succeeds on Node LTS.
- `npm run dev` starts the Hono server on configured PORT.
- `GET /health` returns `{ status: "ok" }`.
- Lint/typecheck/test commands run.

**Verification commands:**
```bash
npm run dev
npm run lint
npm run typecheck
npm run test
curl http://localhost:3000/health
```

---

### Milestone 02 — Database schema + migrations [x]

**Scope:**
- Define Drizzle schema for `providers`, `models`, `usageLogs` tables (SQLite).
- Define Drizzle schema for PostgreSQL variant.
- Implement database factory (`getDb()`) that switches by `DATABASE_TYPE`.
- Create and run initial migration.

**Key files/modules:**
- `src/db/schema/providers.ts`
- `src/db/schema/models.ts`
- `src/db/schema/usageLogs.ts`
- `src/db/index.ts` (factory)
- `src/db/migrate.ts`
- `drizzle/` (migration output)

**Acceptance criteria:**
- `npm run db:migrate` creates the database file and tables.
- Schema supports both SQLite and PostgreSQL.
- Foreign key from `models.providerId` → `providers.id` exists.
- Indexes on `models.slug` and `usageLogs.createdAt`.

**Verification commands:**
```bash
npm run db:migrate
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 03 — Seed script + provider CRUD service [x]

**Scope:**
- Create seed script that populates demo providers and models.
- Implement `ProviderService` with CRUD operations.
- Implement `ModelService` for model lookups.

**Key files/modules:**
- `src/db/seed.ts`
- `src/services/providerService.ts`
- `src/services/modelService.ts`
- `src/services/__tests__/providerService.test.ts`

**Acceptance criteria:**
- `npm run db:seed` populates at least 3 providers and 5+ model mappings.
- Service methods are typed and tested.
- `getActiveProvidersByModel(slug)` returns providers sorted by priority asc, id asc.

**Verification commands:**
```bash
npm run db:seed
npm run test -- providerService
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 04 — Auth middleware + route skeleton [x]

**Scope:**
- Implement Bearer token auth middleware checking `GATEWAY_API_KEY`.
- Create route handlers for `/v1/chat/completions` and `/v1/messages` (stub responses).
- Add request validation with Zod schemas.

**Key files/modules:**
- `src/middleware/auth.ts`
- `src/routes/openai.ts`
- `src/routes/anthropic.ts`
- `src/types/openai.ts`
- `src/types/anthropic.ts`
- `src/middleware/__tests__/auth.test.ts`

**Acceptance criteria:**
- Requests without valid Bearer token get `401`.
- Requests with valid token reach the route handler.
- Request body is validated; malformed requests get `400`.
- Both routes return stub `200` responses.

**Verification commands:**
```bash
npm run test -- auth
curl -H "Authorization: Bearer wrong" http://localhost:3000/v1/chat/completions  # 401
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 05 — Provider router + circuit breaker [x]

**Scope:**
- Implement `RouterService` that selects the best provider for a given model slug.
- Implement in-memory circuit breaker with configurable cooldown.
- Ensure selection is deterministic.

**Key files/modules:**
- `src/services/routerService.ts`
- `src/services/circuitBreaker.ts`
- `src/services/__tests__/routerService.test.ts`
- `src/services/__tests__/circuitBreaker.test.ts`

**Acceptance criteria:**
- Given identical DB state, the same provider is always selected.
- Circuit-broken providers are excluded from selection.
- After cooldown expires, providers become candidates again.
- When all providers are exhausted, a clear error is returned.

**Verification commands:**
```bash
npm run test -- routerService
npm run test -- circuitBreaker
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 06 — Upstream caller + AI SDK integration [x]

**Scope:**
- Implement `UpstreamService` that calls providers via Vercel AI SDK.
- Support both `streamText` and `generateText` modes.
- Wire `onFinish` callback for usage extraction.

**Key files/modules:**
- `src/services/upstreamService.ts`
- `src/services/aiSdkFactory.ts` (create AI SDK provider instances)
- `src/services/__tests__/upstreamService.test.ts`

**Acceptance criteria:**
- Can call an OpenAI-compatible upstream and get a response.
- Can call an Anthropic-compatible upstream and get a response.
- `onFinish` correctly reports `promptTokens` and `completionTokens`.
- Streaming mode returns an async iterable of chunks.

**Verification commands:**
```bash
npm run test -- upstreamService
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 07 — Billing engine + usage logging [x]

**Scope:**
- Implement `BillingService` that calculates cost and writes usage logs.
- Write usage log entries to the database.
- Handle edge cases: zero-price models, missing usage data.

**Key files/modules:**
- `src/services/billingService.ts`
- `src/services/__tests__/billingService.test.ts`

**Acceptance criteria:**
- Cost calculation matches the formula: `(input/1M * inputPrice) + (output/1M * outputPrice)`.
- Provider balances remain unchanged by billing.
- Usage log row is inserted with all fields populated.
- Billing does not fail silently; errors are logged.

**Verification commands:**
```bash
npm run test -- billingService
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 08 — End-to-end request flow (non-streaming) [x]

**Scope:**
- Wire all components together: auth → route → router → upstream → billing → response.
- Implement the fallback loop (retry on quota/rate errors).
- Return properly formatted responses in the client's expected format.

**Key files/modules:**
- `src/services/gatewayService.ts` (orchestrator)
- `src/routes/openai.ts` (full implementation)
- `src/routes/anthropic.ts` (full implementation)
- `src/services/__tests__/gatewayService.test.ts`

**Acceptance criteria:**
- A complete non-streaming request returns a valid OpenAI-format response.
- A complete non-streaming request returns a valid Anthropic-format response.
- Failover works: if provider 1 returns 402, provider 2 is tried.
- Balance is deducted from the provider that served the request.

**Verification commands:**
```bash
npm run test -- gatewayService
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 09 — Streaming support (SSE relay) [x]

**Scope:**
- Implement SSE streaming for both OpenAI and Anthropic response formats.
- Ensure billing happens after stream completes (not per-chunk).
- Handle client disconnect gracefully.

**Key files/modules:**
- `src/services/streamRelay.ts`
- `src/routes/openai.ts` (streaming path)
- `src/routes/anthropic.ts` (streaming path)
- `src/services/__tests__/streamRelay.test.ts`

**Acceptance criteria:**
- OpenAI streaming returns `data: {...}\n\n` formatted SSE.
- Anthropic streaming returns `event: ...\ndata: {...}\n\n` formatted SSE.
- Stream terminates with `data: [DONE]` (OpenAI) or `event: message_stop` (Anthropic).
- Billing is invoked once after stream finishes.
- Failover works for streaming: if first provider fails before streaming starts, next is tried.

**Verification commands:**
```bash
npm run test -- streamRelay
curl -N -H "Authorization: Bearer $KEY" -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}],"stream":true}' http://localhost:3000/v1/chat/completions
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 10 — Protocol conversion layer [x]

**Scope:**
- Implement bidirectional conversion between OpenAI and Anthropic request/response formats.
- Handle tool/function calling schema differences.
- Ensure `system` message mapping works correctly.

**Key files/modules:**
- `src/services/protocolConverter.ts`
- `src/services/__tests__/protocolConverter.test.ts`

**Acceptance criteria:**
- An OpenAI-format request can be routed to an Anthropic upstream and return a correct OpenAI-format response.
- An Anthropic-format request can be routed to an OpenAI upstream and return a correct Anthropic-format response.
- Tool schemas are correctly translated between formats.
- System prompts are correctly positioned.
- Conversion is lossless for the supported parameter subset.

**Verification commands:**
```bash
npm run test -- protocolConverter
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 11 — Logging, error handling, and observability [x]

**Scope:**
- Add structured logging (request ID, provider, model, latency, status).
- Standardize error responses across both API formats.
- Add request timing and latency tracking in usage logs.

**Key files/modules:**
- `src/middleware/logger.ts`
- `src/middleware/errorHandler.ts`
- `src/utils/requestId.ts`

**Acceptance criteria:**
- Every request gets a unique `x-request-id` header.
- Errors return format-appropriate error objects (OpenAI error format or Anthropic error format).
- Latency is recorded in usage logs.
- Log level is configurable via `LOG_LEVEL`.

**Verification commands:**
```bash
npm run test
npm run lint && npm run typecheck
```

---

### Milestone 12 — Admin / management routes [x]

**Scope:**
- Add internal API routes for provider and model management.
- `GET /admin/providers` — list all providers (including balances for reference).
- `POST /admin/providers` — add a new provider.
- `PATCH /admin/providers/:id` — update provider (balance value, toggle active).
- `GET /admin/usage` — query usage logs with filters.

**Key files/modules:**
- `src/routes/admin.ts`
- `src/routes/__tests__/admin.test.ts`

**Acceptance criteria:**
- Admin routes are protected by the same `GATEWAY_API_KEY`.
- CRUD operations work correctly.
- Usage logs can be filtered by provider, model, and date range.

**Verification commands:**
```bash
npm run test -- admin
npm run lint && npm run typecheck && npm run test
```

---

### Milestone 13 — Integration tests + final verification [x]

**Scope:**
- Add comprehensive integration tests with mocked upstreams.
- Test the complete failover chain.
- Test streaming end-to-end.
- Validate all scripts work.
- Write/update `docs/documentation.md`.

**Key files/modules:**
- `src/__tests__/integration/` (test files)
- `docs/documentation.md`
- `README.md`

**Acceptance criteria:**
- Integration tests cover: happy path, failover, all-providers-down, streaming, billing accuracy.
- All scripts run successfully: `dev`, `build`, `test`, `lint`, `typecheck`, `db:migrate`, `db:seed`.
- Documentation is accurate and complete.

**Verification commands:**
```bash
npm run db:migrate
npm run db:seed
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
```

---

### Milestone 14 — Admin dashboard (Vue + Nuxt UI) [x]

**Scope:**
- Add a standalone Vue + Nuxt UI admin dashboard under `apps/admin`.
- Provide UI for provider management and usage queries.
- Proxy API calls in development via Vite so browser requests do not need direct CORS access.
- Store the API key locally in the browser and send it as a Bearer token.

**Key files/modules:**
- `apps/admin/src/App.vue` (layout shell)
- `apps/admin/src/pages/` (providers + usage pages)
- `apps/admin/src/composables/` (API access + API key storage)
- `apps/admin/vite.config.ts`

**Acceptance criteria:**
- Dashboard runs on `http://localhost:3001`.
- Providers page supports list, create, and update flows.
- Usage page supports filters and pagination.
- API key is required and sent as `Authorization: Bearer ...` for all requests.

**Verification commands:**
```bash
cd apps/admin
npm install
npm run dev
```

---

## Risk register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Streaming relay drops chunks** | Client receives incomplete response | Medium | Buffer validation; test with large streaming responses; integration tests with mock SSE upstream |
| **Quota thrash** | Repeated retries against out-of-credit providers | Medium | Open a longer circuit breaker on quota errors and rely on priority-based routing for healthy providers |
| **Protocol conversion edge cases** | Malformed requests to upstream | High | Extensive unit tests for tool schemas, system prompts, multi-turn conversations; AI SDK handles most heavy lifting |
| **Circuit breaker false positives** | Healthy provider excluded | Low | Short cooldown (60s default); configurable per-provider; manual override via admin API |
| **AI SDK version breaking changes** | Build failures | Low | Pin exact dependency versions; test against specific SDK version |
| **SQLite concurrent write contention** | Billing writes block under load | Medium | Use WAL mode; consider async billing queue for high-throughput scenarios (roadmap) |

---

## Verification checklist (kept up to date)

- [x] `npm install` succeeds
- [x] `npm run dev` starts server
- [x] `npm run build` compiles without errors
- [x] `npm run lint` passes
- [x] `npm run typecheck` passes
- [x] `npm run test` passes
- [x] `npm run db:migrate` creates tables
- [x] `npm run db:seed` populates demo data
- [x] `GET /health` returns 200
- [x] OpenAI-format non-streaming request works
- [x] OpenAI-format streaming request works
- [x] Anthropic-format non-streaming request works
- [x] Anthropic-format streaming request works
- [x] Failover works when primary provider returns 402
- [x] Billing records usage cost
- [x] Usage logs are written
- [x] Admin routes return correct data

---

## Implementation notes and decision log (updated as we go)

- Use the Vercel AI SDK as the unified upstream interface and convert client requests to a universal parameter shape before calling providers.
- Relay streaming responses by re-framing `text-delta` parts into OpenAI or Anthropic SSE events, and bill after the usage promise resolves at stream end.
- Apply circuit breaker cooldowns for rate limits (60s), quota exhaustion (5m), and upstream 5xx errors (30s); deactivate providers on auth failures.
- Standardize gateway errors as `gateway_error` for both API formats, while unhandled exceptions return `server_error` via the global error handler.
- Paginate admin usage queries with `limit` and `offset`, return results sorted by newest first, and include filters for provider, model, and date range.
