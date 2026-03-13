# Task List — Lumina Gateway Passthrough + Convert Routes

## Phase 01 — Baseline Gateway (completed)
- [x] T-01.0 Confirm core Hono gateway, middleware, and DB layers exist
- [x] T-01.1 Confirm lint/typecheck/test scripts exist
- [x] T-01.2 ✅ Baseline verification (pre-existing)

## Phase 02 — Standardized `/v1/*` Routes (completed)
- [x] T-02.0 Confirm OpenAI and Anthropic standardized routes
- [x] T-02.1 ✅ Verification for standardized routes (pre-existing)

## Phase 03 — Existing Passthrough Routes (completed)
- [x] T-03.0 Confirm `/codex/responses` and `/claude/v1/messages` passthrough routes
- [x] T-03.1 ✅ Verification for existing passthrough routes (pre-existing)

## Phase 04 — Response Validators
- [x] T-04.0 Add Gemini response/request types and validators
- [x] T-04.1 Add response validators for OpenAI Responses and Claude Messages
- [x] T-04.2 ✅ Run unit tests for validators

## Phase 05 — Universal Response Conversion
- [x] T-05.0 Implement response-to-universal conversions (OpenAI Responses / Claude / Gemini)
- [x] T-05.1 Implement universal-to-target conversions (including Gemini)
- [x] T-05.2 Add unit tests for conversion utilities
- [x] T-05.3 ✅ Run unit tests

## Phase 06 — OpenAI Passthrough Route
- [x] T-06.0 Implement `POST /openai/v1/responses` passthrough
- [x] T-06.1 Add route tests for OpenAI passthrough
- [x] T-06.2 ✅ Run route tests

## Phase 07 — Gemini Passthrough Route
- [x] T-07.0 Implement `POST /google/v1beta/models/:model:generateContent` passthrough
- [ ] T-07.1 Add route tests for Gemini passthrough
- [ ] T-07.2 ✅ Run route tests

## Phase 08 — Convert Routes (HTTP)
- [ ] T-08.0 Implement convert service (validate -> detect -> convert)
- [ ] T-08.1 Add convert routes for OpenAI / Claude / Gemini
- [ ] T-08.2 Add tests for convert behavior and 422 errors
- [ ] T-08.3 ✅ Run route tests

## Phase 09 — Realtime WebSocket Proxy
- [ ] T-09.0 Implement WebSocket proxy service and upgrade handling
- [ ] T-09.1 Add `/openai/v1/realtime` and `/convert/openai/v1/realtime` routes
- [ ] T-09.2 Add WebSocket proxy tests or smoke validation
- [ ] T-09.3 ✅ Run tests

## Phase 10 — Middleware and CORS Coverage
- [ ] T-10.0 Apply CORS/auth/rate-limit/quota to `/openai/*`, `/google/*`, `/convert/*`
- [ ] T-10.1 ✅ Run tests

## Phase 11 — Documentation + Final Verification
- [ ] T-11.0 Update docs (`docs/documentation.md`, `docs/swagger.yaml`, README if needed)
- [ ] T-11.1 ✅ Run `npm run lint && npm run typecheck && npm run test`
