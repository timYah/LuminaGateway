# Lumina Gateway — Passthrough + Convert Routes Plan

## Architecture overview

- **Hono app** (`src/app.ts` + `src/index.ts`) provides HTTP routing with shared middleware (auth, rate limit, quota, logging, CORS).
- **Standardized routes** (`src/routes/openai.ts`, `src/routes/anthropic.ts`) use `createProtocolRoute` to convert requests into a universal request shape and dispatch via `gatewayService`.
- **Passthrough routes** (`src/routes/codex.ts`, `src/routes/claude.ts`) proxy raw JSON to upstream providers with failover before first byte.
- **New work** adds newapi-style passthrough routes, WebSocket proxying for Realtime, and `/convert` routes that validate and convert response formats using shared validators and a universal response representation.

## Milestones

### M1 — Repo baseline and existing gateway architecture (completed)
- **Scope**: Core app, Hono server, middleware, DB, and service layer.
- **Key files**: `src/app.ts`, `src/index.ts`, `src/services/*`, `src/middleware/*`, `src/db/*`
- **Acceptance criteria**: Server boots; existing middleware pipeline works.
- **Verification**: `npm run lint`, `npm run typecheck`, `npm run test`

### M2 — Standardized `/v1/*` protocol routes (completed)
- **Scope**: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages.
- **Key files**: `src/routes/openai.ts`, `src/routes/anthropic.ts`, `src/routes/protocolRoute.ts`
- **Acceptance criteria**: `/v1/chat/completions`, `/v1/responses`, `/v1/messages` functional.
- **Verification**: `npm run test`

### M3 — Existing passthrough routes (completed)
- **Scope**: `/codex/responses` and `/claude/v1/messages` passthrough.
- **Key files**: `src/routes/codex.ts`, `src/routes/claude.ts`
- **Acceptance criteria**: Passthrough routes preserve body/headers and failover pre-first-byte.
- **Verification**: `npm run test`

### M4 — Response schema validators for OpenAI Responses / Claude / Gemini (pending)
- **Scope**: Add Zod validators for response formats and Gemini types.
- **Key files**: `src/types/validators.ts`, `src/types/*`
- **Acceptance criteria**: Validators can detect valid target responses.
- **Verification**: `npm run test`

### M5 — Universal response conversions (pending)
- **Scope**: Convert response formats to/from a universal response shape.
- **Key files**: `src/services/protocolConverter.ts`, new converter helpers.
- **Acceptance criteria**: All three formats can convert to universal and back.
- **Verification**: `npm run test`

### M6 — OpenAI newapi passthrough route (pending)
- **Scope**: `POST /openai/v1/responses` passthrough.
- **Key files**: new route module or shared passthrough utility, `src/app.ts`.
- **Acceptance criteria**: Route forwards raw JSON to upstream `/responses`.
- **Verification**: `npm run test`

### M7 — Gemini passthrough route (pending)
- **Scope**: `POST /google/v1beta/models/{model}:generateContent` passthrough.
- **Key files**: new route module or shared passthrough utility, `src/app.ts`.
- **Acceptance criteria**: Route forwards raw JSON to upstream `v1beta/models/{model}:generateContent`.
- **Verification**: `npm run test`

### M8 — Convert HTTP routes (pending)
- **Scope**: `/convert/openai/v1/responses`, `/convert/claude/v1/messages`, `/convert/google/v1beta/models/{model}:generateContent`.
- **Key files**: new convert route module, shared conversion service.
- **Acceptance criteria**: Validate target format; convert when needed; `422` on failure.
- **Verification**: `npm run test`

### M9 — OpenAI Realtime WebSocket proxy (pending)
- **Scope**: `/openai/v1/realtime` and `/convert/openai/v1/realtime` passthrough.
- **Key files**: `src/index.ts` (upgrade handling), new WebSocket proxy service.
- **Acceptance criteria**: Upgrade request proxied; frames forwarded bidirectionally without transform.
- **Verification**: `npm run test` (unit tests + smoke validation)

### M10 — Middleware/CORS coverage for new prefixes (pending)
- **Scope**: Apply auth/rate-limit/quota/CORS to `/openai/*`, `/google/*`, `/convert/*`.
- **Key files**: `src/app.ts`
- **Acceptance criteria**: All new routes are protected and CORS-enabled.
- **Verification**: `npm run test`

### M11 — Tests for new converters/routes (pending)
- **Scope**: Unit tests for converters + route tests for passthrough/convert.
- **Key files**: `src/services/__tests__/*`, `src/routes/__tests__/*`
- **Acceptance criteria**: Tests cover conversion success/failure and passthrough routing.
- **Verification**: `npm run test`

### M12 — Documentation updates (pending)
- **Scope**: Update docs and API references with new routes.
- **Key files**: `docs/documentation.md`, `docs/swagger.yaml`, `README.md` (if needed)
- **Acceptance criteria**: New routes documented and examples added.
- **Verification**: `npm run lint`, `npm run typecheck`, `npm run test`

## Risk register

- **R1: Format detection ambiguity** — Misclassifying a response could produce incorrect conversions.
  - **Mitigation**: Validate against target schema first, then detect other formats in a strict priority order; return 422 on ambiguity.
- **R2: WebSocket proxy correctness** — Upgrade handling in Node server could bypass middleware or leak resources.
  - **Mitigation**: Perform auth/limit checks before upgrade and ensure close/error handlers clean up sockets.
- **R3: Passthrough header integrity** — Incorrect header filtering can break upstream responses.
  - **Mitigation**: Maintain a hop-by-hop allowlist and preserve content headers.
- **R4: Regression in existing routes** — New routing or middleware changes may affect `/v1/*`.
  - **Mitigation**: Keep new prefixes isolated; add regression tests.

## Decision log

- **2026-03-13**: Bootstrap plan created from `docs/prd.md`. No implementation decisions made yet.
- **2026-03-24**: Added Phase 31 for Amp compatibility. Scope is limited to `POST /amp/v1/responses` as an OpenAI Responses passthrough alias. Only this route injects the default model `gpt-5.4` when `model` is missing or blank; existing `/openai/*`, `/v1/*`, and `/convert/*` behavior remains unchanged.
- **2026-03-28**: Added Phase 32 for recovery probe error visibility. The fix is observability-only: preserve the current recovery data model, add explicit backend logs for scheduled recovery probe failures, and make the admin UI foreground `lastProbeMessage` when available. Root-cause fixes for specific upstream/provider mismatch errors remain out of scope for this phase.
- **2026-03-24**: Added Phase 31 for Amp compatibility. Scope is limited to `POST /amp/v1/responses` as an OpenAI Responses passthrough alias. Only this route injects the default model `gpt-5.4` when `model` is missing or blank; existing `/openai/*`, `/v1/*`, and `/convert/*` behavior remains unchanged.
- **2026-03-28**: Added Phase 33 for token usage statistics. Scope is limited to aggregating existing `usageLogs` token fields into the admin stats API and `/usage` dashboard so operators can see input/output/total token consumption without changing billing or quota enforcement behavior.
