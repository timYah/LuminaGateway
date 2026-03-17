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
- [x] T-07.1 Add route tests for Gemini passthrough
- [x] T-07.2 ✅ Run route tests

## Phase 08 — Convert Routes (HTTP)
- [x] T-08.0 Implement convert service (validate -> detect -> convert)
- [x] T-08.1 Add convert routes for OpenAI / Claude / Gemini
- [x] T-08.2 Add tests for convert behavior and 422 errors
- [x] T-08.3 ✅ Run route tests

## Phase 09 — Realtime WebSocket Proxy
- [x] T-09.0 Implement WebSocket proxy service and upgrade handling
- [x] T-09.1 Add `/openai/v1/realtime` and `/convert/openai/v1/realtime` routes
- [x] T-09.2 Add WebSocket proxy tests or smoke validation
- [x] T-09.3 ✅ Run tests

## Phase 10 — Middleware and CORS Coverage
- [x] T-10.0 Apply CORS/auth/rate-limit/quota to `/openai/*`, `/google/*`, `/convert/*`
- [x] T-10.1 ✅ Run tests

## Phase 11 — Documentation + Final Verification
- [x] T-11.0 Update docs (`docs/documentation.md`, `docs/swagger.yaml`, README if needed)
- [x] T-11.1 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 12 — Model-Level Provider Priority
- [x] T-12.0 Update task list and documentation
- [x] T-12.1 Add model priority schema + migration
- [x] T-12.2 Apply model priority ordering in model/router services
- [x] T-12.3 Add admin CRUD + config import/export for model priorities
- [x] T-12.4 Update docs for model priorities
- [x] T-12.5 Add tests for model priority routing and admin endpoints
- [x] T-12.6 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 13 — Admin UI Model Priorities + Import Override
- [x] T-13.0 Update task list and documentation
- [x] T-13.1 Add model priority import conflict policy (overwrite) on backend
- [x] T-13.2 Build Admin UI model priorities management page
- [x] T-13.3 Extend config import UI for model priorities override
- [x] T-13.4 Update docs/i18n for model priority UI + import policy
- [x] T-13.5 Add tests for model priority import overwrite
- [x] T-13.6 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 14 — Fix Model Priorities Load Error
- [x] T-14.0 Update task list and documentation
- [x] T-14.1 Handle missing model_priorities table in admin routes
- [x] T-14.2 Add tests or coverage for graceful model priorities load
- [x] T-14.3 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 15 — Fix Model Priority Create Error
- [x] T-15.0 Update task list and documentation
- [x] T-15.1 Improve admin model priorities error handling (missing table)
- [x] T-15.2 Improve UI error messaging for model priorities actions
- [x] T-15.3 Add tests for missing table create error response
- [x] T-15.4 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 16 — Fix Model Priority Create Failures (Duplicates/Postgres)
- [x] T-16.0 Update task list and documentation
- [x] T-16.1 Improve model priority error mapping for missing table/duplicates
- [x] T-16.2 Add tests for duplicate model priority creation
- [x] T-16.3 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 17 — Model Priority Wildcards
- [x] T-17.0 Update task list and documentation
- [x] T-17.1 Support wildcard matching for model priorities
- [x] T-17.2 Add tests for wildcard model priorities
- [x] T-17.3 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 18 — Remove Codex Endpoint
- [x] T-18.0 Update task list and documentation
- [x] T-18.1 Remove /codex routes and middleware
- [x] T-18.2 Update docs and admin UI copy for removed /codex
- [x] T-18.3 Remove /codex tests and update references
- [x] T-18.4 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 19 — Model Priority UI Layout Refresh
- [x] T-19.0 Update task list and documentation
- [x] T-19.1 Redesign model priority create/edit layout for provider selector
- [x] T-19.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 20 — Provider Pricing Foldout
- [x] T-20.0 Update task list and documentation
- [x] T-20.1 Fold balance + health check model into pricing sections (create/edit)
- [x] T-20.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 21 — Provider Pricing Always Visible
- [x] T-21.0 Update task list and documentation
- [x] T-21.1 Keep pricing inputs always visible in provider forms
- [x] T-21.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 22 — Provider Forms Layout Audit
- [x] T-22.0 Update task list and documentation
- [x] T-22.1 Audit add/edit provider layout (create/edit forms)
- [x] T-22.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 23 — Provider Forms Layout Normalization
- [x] T-23.0 Update task list and documentation
- [x] T-23.1 Normalize add/edit provider pricing + priority layout
- [x] T-23.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 24 — Provider Pricing Panel Default Collapse
- [x] T-24.0 Update task list and documentation
- [x] T-24.1 Default-collapse pricing + priority panel in provider forms
- [x] T-24.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 25 — Requests Provider Visibility Fix
- [x] T-25.0 Update task list and documentation
- [x] T-25.1 Ensure providers refresh and fallback labels in /requests
- [x] T-25.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 26 — Provider Health Check Model Test Fix
- [x] T-26.0 Update task list and documentation
- [x] T-26.1 Ensure provider test uses configured health check model
- [x] T-26.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 27 — Manual Test Restores Health Status
- [x] T-27.0 Update task list and documentation
- [x] T-27.1 Refresh provider health status after manual test success
- [x] T-27.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 28 — OpenAI Passthrough Base URL Normalization
- [x] T-28.0 Update task list and documentation
- [x] T-28.1 Normalize OpenAI base URLs that include endpoint suffixes
- [x] T-28.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 29 — Recent Request Details Panel
- [x] T-29.0 Update task list and documentation
- [x] T-29.1 Show last 3 request details instead of active requests
- [x] T-29.2 ✅ Run `npm run lint && npm run typecheck && npm run test`

## Phase 30 — Provider Priority Restore After Health
- [x] T-30.0 Update task list and documentation
- [x] T-30.1 Restore provider routing eligibility after successful health checks
- [x] T-30.2 ✅ Run `npm run lint && npm run typecheck && npm run test`
