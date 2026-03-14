# Lumina Gateway — Documentation

Lumina Gateway is a TypeScript LLM aggregation gateway that unifies multiple provider accounts behind a single API. It accepts OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, plus dedicated passthrough routes for Codex and Claude traffic. It routes traffic by provider priority and health, and fails over when providers are rate limited or out of quota.

## What Lumina Gateway is

The gateway exposes the standard `/v1/*` routes plus raw passthrough endpoints for `POST /codex/responses`, `POST /claude/v1/messages`, `POST /openai/v1/responses`, and `POST /google/v1beta/models/{model}:generateContent`. It also includes convert endpoints under `/convert/*` that normalize upstream JSON responses to a target format, and a WebSocket proxy for the OpenAI Realtime API at `/openai/v1/realtime` (plus `/convert/openai/v1/realtime` as an alias). The standard `/v1/*` routes are validated, converted to a universal AI SDK request format, and executed through the shared gateway orchestration layer. The passthrough routes keep request and response bodies intact and proxy them straight to the selected upstream endpoint.

## Status

Core gateway milestones are complete. The Vue + Nuxt UI admin dashboard described below is implemented.

## Local setup

The gateway runs on Node.js LTS and uses SQLite by default. Follow these steps to get a local instance running.

- Install dependencies: `npm install`
- Run migrations: `npm run db:migrate`
- Seed demo data: `npm run db:seed`
- Start the dev server: `npm run dev` (starts gateway + admin)
- Health check: `GET http://localhost:3000/health`

## Deployment and usage

See `docs/deployment.md` for production deployment steps, admin dashboard setup, and request examples.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_TYPE` | `sqlite` | Database driver: `sqlite` or `postgres`. |
| `DATABASE_URL` | `file:./.runtime/lumina.db` | Connection string. Required when `DATABASE_TYPE=postgres`. |
| `GATEWAY_API_KEY` | *(required)* | Bearer token used by `/v1/*`, `/codex/*`, `/claude/*`, `/openai/*`, `/google/*`, `/convert/*`, and `/admin/*` routes (including realtime WS upgrades). |
| `GATEWAY_API_KEYS` | *(optional)* | Comma-separated list of additional gateway API keys. |
| `MODEL_ALLOWLIST` | *(optional)* | Comma/newline-separated list of allowed model slugs. When set, only these models are accepted. |
| `MODEL_BLOCKLIST` | *(optional)* | Comma/newline-separated list of blocked model slugs. |
| `CONTENT_BLOCKLIST` | *(optional)* | Comma/newline-separated list of blocked content keywords (case-insensitive). |
| `RATE_LIMIT_RPM` | *(optional)* | Per-API-key requests-per-minute limit (enables rate limiting). |
| `RATE_LIMIT_BURST` | *(optional)* | Burst capacity for rate limiting (defaults to `RATE_LIMIT_RPM`). |
| `RATE_LIMIT_OVERRIDES` | *(optional)* | JSON map of per-key limits, e.g. `{"key-1":{"rpm":120,"burst":30}}`. |
| `TOKEN_RATE_LIMIT_TPM` | *(optional)* | Per-API-key token-per-minute limit (enables token-based throttling). |
| `TOKEN_RATE_LIMIT_BURST` | *(optional)* | Burst token capacity (defaults to `TOKEN_RATE_LIMIT_TPM`). |
| `TOKEN_RATE_LIMIT_OVERRIDES` | *(optional)* | JSON map of per-key token limits, e.g. `{"key-1":{"tpm":12000,"burst":4000}}`. |
| `KEY_DAILY_TOKENS` | *(optional)* | Daily token quota per API key. |
| `KEY_MONTHLY_TOKENS` | *(optional)* | Monthly token quota per API key. |
| `KEY_DAILY_BUDGET_USD` | *(optional)* | Daily budget (USD) per API key. |
| `KEY_MONTHLY_BUDGET_USD` | *(optional)* | Monthly budget (USD) per API key. |
| `KEY_QUOTA_OVERRIDES` | *(optional)* | JSON map of per-key quota overrides. |
| `JWT_SECRET` | *(optional)* | Enables JWT auth when set (HS256). Missing or invalid tokens return `401`. |
| `JWT_HEADER` | `X-User-Token` | Header name used to receive JWTs. |
| `JWT_USER_CLAIM` | `sub` | JWT claim used for user identity. |
| `JWT_GROUP_CLAIM` | `groups` | JWT claim used for group identity. |
| `USER_DAILY_TOKENS` | *(optional)* | Daily token quota per user (JWT). |
| `USER_MONTHLY_TOKENS` | *(optional)* | Monthly token quota per user (JWT). |
| `USER_DAILY_BUDGET_USD` | *(optional)* | Daily budget (USD) per user (JWT). |
| `USER_MONTHLY_BUDGET_USD` | *(optional)* | Monthly budget (USD) per user (JWT). |
| `USER_QUOTA_OVERRIDES` | *(optional)* | JSON map of per-user quota overrides. |
| `GROUP_DAILY_TOKENS` | *(optional)* | Daily token quota per group (JWT). |
| `GROUP_MONTHLY_TOKENS` | *(optional)* | Monthly token quota per group (JWT). |
| `GROUP_DAILY_BUDGET_USD` | *(optional)* | Daily budget (USD) per group (JWT). |
| `GROUP_MONTHLY_BUDGET_USD` | *(optional)* | Monthly budget (USD) per group (JWT). |
| `GROUP_QUOTA_OVERRIDES` | *(optional)* | JSON map of per-group quota overrides. |
| `DEFAULT_REQUEST_PARAMS` | *(optional)* | JSON object merged into each `/v1/*` request when fields are missing. |
| `ROUTING_STRATEGY` | `priority` | Routing strategy: `priority`, `round_robin`, or `weighted`. |
| `PROVIDER_WEIGHTS` | *(optional)* | JSON map of provider weights for weighted routing (by id or name). |
| `PROVIDER_MAX_INFLIGHT` | *(optional)* | Max concurrent requests per provider (skips providers at capacity). |
| `PROVIDER_MAX_INFLIGHT_OVERRIDES` | *(optional)* | JSON map of per-provider inflight limits (by id or name). |
| `CACHE_TTL_MS` | *(optional)* | Cache TTL for non-streaming `/v1/*` responses; override with `x-cache-ttl-ms`. |
| `UPSTREAM_RETRY_ATTEMPTS` | *(optional)* | Number of retry attempts for retryable upstream errors. |
| `UPSTREAM_RETRY_BASE_MS` | `200` | Base backoff delay (ms) for upstream retries. |
| `CODEX_UPSTREAM_TIMEOUT_MS` | *(optional)* | Timeout in milliseconds for `/codex/responses` upstream requests before failover. |
| `CLAUDE_UPSTREAM_TIMEOUT_MS` | *(optional)* | Timeout in milliseconds for `/claude/v1/messages` upstream requests before failover. |
| `PROVIDER_RECOVERY_CHECK_INTERVAL_MS` | `300000` | Base interval (ms) for automatic recovery probes after recoverable provider failures; each run adds a random `1-10s` jitter. |
| `PORT` | `3000` | Server listen port. |
| `DEFAULT_INPUT_PRICE` | *(optional)* | Global input price fallback (USD per 1M tokens). |
| `DEFAULT_OUTPUT_PRICE` | *(optional)* | Global output price fallback (USD per 1M tokens). |
| `LOG_LEVEL` | `info` | Logging threshold: `debug`, `info`, `warn`, `error`. |

## Verification commands

- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests: `npm run test`
- Build: `npm run build`
- Migrate: `npm run db:migrate`
- Seed: `npm run db:seed`

## API reference

### Authentication

All `/v1/*`, `/codex/*`, `/claude/*`, `/openai/*`, `/google/*`, `/convert/*`, and `/admin/*` routes require `Authorization: Bearer <GATEWAY_API_KEY>`. Missing or invalid tokens return `401` with `{ "error": { "message": "Unauthorized" } }`. For WebSocket upgrades, the `Authorization` header must be included in the upgrade request.

Set `JWT_SECRET` to enable per-user authentication. When it is set, the gateway also requires a JWT in the header defined by `JWT_HEADER` (default `X-User-Token`). The gateway reads the user and group claims from `JWT_USER_CLAIM` and `JWT_GROUP_CLAIM` and enforces any configured user or group quotas.

### Throttling and quotas

Set `RATE_LIMIT_*` to throttle requests per minute and `TOKEN_RATE_LIMIT_*` to throttle token volume per minute. Configure API key budgets with `KEY_*` and configure per-user or per-group budgets with `USER_*` and `GROUP_*` when JWT auth is enabled. Set `CONTENT_BLOCKLIST` to reject requests that contain blocked keywords.

### Health check

```http [Response]
GET /health
{ "status": "ok" }
```

### Metrics

```http [Response]
GET /metrics
# Prometheus metrics
gateway_requests_total{method="GET",path="/health",status="200"} 1
```

### OpenAI-compatible endpoint

```http [Request]
POST /v1/chat/completions
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000,
  "tools": [],
  "tool_choice": "auto"
}
```

Supported fields match the OpenAI subset used by the validators: `model`, `messages`, `stream`, `temperature`, `max_tokens`, `tools`, and `tool_choice`.

### OpenAI Responses-compatible endpoint

```http [Request]
POST /v1/responses
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json

{
  "model": "gpt-5.2",
  "instructions": "You are a helpful assistant.",
  "input": [
    {
      "role": "user",
      "content": [{"type": "input_text", "text": "Hello"}]
    }
  ],
  "stream": false,
  "temperature": 0.7,
  "max_output_tokens": 1000,
  "tools": [],
  "tool_choice": "auto"
}
```

Supported fields match the OpenAI Responses subset used by the validators: `model`, `input` (string or an array of `message` / `function_call_output` items), `instructions`, `stream`, `temperature`, `max_output_tokens`, `tools`, and `tool_choice`. `message.role` accepts `system`, `developer`, `user`, and `assistant`; `developer` and `system` inputs are merged into the upstream system prompt for cross-provider compatibility.

Codex CLI can use either `POST /v1/responses` or the dedicated `POST /codex/responses` alias. For a dedicated Codex base URL, set `base_url` to `http://<host>:<port>/codex` and keep `wire_api="responses"`.

`POST /codex/responses` requires a JSON request body with a string `model`. The gateway forwards the raw request body to the selected upstream `/responses` endpoint, preserves the upstream response body and headers, and only retries another provider before the first byte is returned to the client. Once streaming starts, the gateway never replays the request to a second provider.

### OpenAI passthrough endpoint

```http [Request]
POST /openai/v1/responses
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json

{
  "model": "gpt-5.2",
  "input": "Hello",
  "stream": false
}
```

`POST /openai/v1/responses` forwards the raw JSON body to the selected upstream `/responses` endpoint (OpenAI or OpenAI-compatible providers). It preserves the upstream response body and headers, and only fails over to another provider before the first byte reaches the client.

### Caching

Set `CACHE_TTL_MS` to enable in-memory caching for non-streaming `/v1/*` responses. You can override (or disable) caching per request with the `x-cache-ttl-ms` header. A value of `0` disables caching for that request.

### Anthropic-compatible endpoint

```http [Request]
POST /v1/messages
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json

{
  "model": "claude-sonnet-4-20250514",
  "messages": [{"role": "user", "content": "Hello"}],
  "system": "You are a helpful assistant.",
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000,
  "tools": []
}
```

Supported fields match the Anthropic subset used by the validators: `model`, `messages`, `system`, `stream`, `temperature`, `max_tokens`, and `tools`.

### Claude passthrough endpoint

```http [Request]
POST /claude/v1/messages
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json
Anthropic-Version: 2023-06-01

{
  "model": "claude-sonnet-4-20250514",
  "messages": [{"role": "user", "content": "Hello"}],
  "system": "You are a helpful assistant.",
  "stream": true,
  "max_tokens": 1000
}
```

`POST /claude/v1/messages` forwards the raw JSON body to the selected upstream `/v1/messages` endpoint and returns the upstream response body unchanged. The gateway only selects providers with `protocol=anthropic`, and it only fails over to another provider before the first byte reaches the client. Once streaming starts, the gateway never replays the request to a second provider.

If your client builds the path as `POST /messages` relative to its configured base URL, you can use the alias `POST /claude/messages`.

### Gemini passthrough endpoint

```http [Request]
POST /google/v1beta/models/gemini-2.5-pro:generateContent
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json

{
  "contents": [{"role": "user", "parts": [{"text": "Hello"}]}]
}
```

`POST /google/v1beta/models/{model}:generateContent` forwards the raw JSON body to the selected Google provider and preserves the upstream response body and headers. It only fails over before the first byte is returned to the client.

### Convert endpoints

The convert routes proxy the request to the selected provider and normalize JSON responses into the target format. Requests use the same payloads as the corresponding provider APIs, while non-JSON responses and streaming responses are passed through unchanged.

- `POST /convert/openai/v1/responses`
- `POST /convert/claude/v1/messages`
- `POST /convert/google/v1beta/models/{model}:generateContent`

### Streaming responses

OpenAI Chat Completions streaming returns `text/event-stream` with chat completion chunks followed by `[DONE]`.

```text [SSE]
data: {"id":"chatcmpl_...","object":"chat.completion.chunk","created":...,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"},"finish_reason":null}]}
data: [DONE]
```

OpenAI Responses streaming returns `text/event-stream` JSON payloads without a `[DONE]` marker. The gateway emits `response.created`, `response.output_item.added`, `response.output_text.delta`, `response.output_item.done`, and `response.completed` events.

```text [SSE]
data: {"type":"response.created","response":{"id":"resp_...","object":"response","created_at":...,"status":"in_progress","model":"gpt-5.2"}}

data: {"type":"response.output_text.delta","item_id":"msg_...","output_index":0,"content_index":0,"delta":"Hi"}

data: {"type":"response.completed","response":{"id":"resp_...","object":"response","created_at":...,"status":"completed","model":"gpt-5.2","error":null,"incomplete_details":null,"output":[...],"output_text":"Hi"}}
```

Anthropic streaming returns `text/event-stream` events for `content_block_delta` and a final `message_stop` event.

```text [SSE]
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
event: message_stop
data: {"type":"message_stop"}
```

Convert endpoints only transform non-streaming JSON responses. If an upstream response is streaming or not JSON, the gateway streams it back to the client without conversion.

### Realtime WebSocket proxy

Connect to `/openai/v1/realtime` (or `/convert/openai/v1/realtime`) with a standard WebSocket client and include `Authorization: Bearer <GATEWAY_API_KEY>` in the upgrade request. The gateway proxies frames to a selected OpenAI-compatible provider and does not rewrite the payload.

### Admin routes

```
GET    /admin/providers          — list all providers
POST   /admin/providers          — create a provider
PATCH  /admin/providers/:id      — update provider fields
POST   /admin/providers/:id/test — test provider connectivity
POST   /admin/providers/:id/reset — reset circuit breaker state (all models)
DELETE /admin/providers/:id      — delete provider (also removes usage logs)
GET    /admin/model-priorities   — list model-level provider priorities
POST   /admin/model-priorities   — create model-level provider priority
PATCH  /admin/model-priorities/:id — update model-level provider priority
DELETE /admin/model-priorities/:id — delete model-level provider priority
POST   /admin/providers/health   — run a health check for all providers
GET    /admin/failure-stats      — get error type distribution for recent requests
GET    /admin/circuit-breakers   — list open circuit breakers (per model)
GET    /admin/usage              — query usage logs
GET    /admin/usage/summary      — usage + cost summary by API key and route
GET    /admin/usage/stats        — trend + provider/model distribution
GET    /admin/request-logs       — query request-level logs
GET    /admin/active-requests     — inspect current in-flight requests
GET    /admin/config/export      — export providers + settings
POST   /admin/config/import      — import providers + settings
```

`POST /admin/providers` accepts `name`, `protocol`, `baseUrl`, `apiKey`, optional `apiMode`, optional `codexTransform`, plus optional `balance`, `inputPrice`, `outputPrice`, `isActive`, `priority`. `protocol` supports `openai`, `anthropic`, `google`, and `new-api`. For OpenAI-compatible providers, set `apiMode` to `responses` (default) or `chat` (Chat Completions). `codexTransform` defaults to `false`. When it stays `false`, the provider remains eligible for raw `/codex/responses` passthrough routing. When it is `true`, the provider is reserved for a future transformed Codex flow and is excluded from `/codex/*` routing for now. `balance` is informational only and does not affect routing. `inputPrice` and `outputPrice` are USD per 1M tokens and fall back to `DEFAULT_INPUT_PRICE` / `DEFAULT_OUTPUT_PRICE` when omitted.

`POST /admin/providers/:id/test` accepts an optional `model` query parameter (for example `?model=gpt-4o`) and returns the measured latency plus the selected model slug. If the provider is recovering, a successful manual test also clears the model-scoped recovery gate and circuit breaker so the provider can re-enter routing immediately for that model.

`POST /admin/providers/:id/reset` clears all in-memory circuit breaker and recovery entries for the provider so it can re-enter routing immediately for every model. `GET /admin/circuit-breakers` returns model-scoped entries currently cooling down and/or recovering, including `modelSlug`, `state`, `remainingMs`, and recovery probe metadata when available.

`POST /admin/providers/health` accepts an optional `model` query parameter and returns the health results for each provider. A successful probe also restores any recovering provider to routing immediately. `GET /admin/failure-stats` aggregates recent request failures by error type.

When a provider hits a recoverable upstream failure (`quota`, `rate_limit`, `network`, or `server`), Lumina Gateway keeps that provider-model pair out of routing until a recovery probe succeeds. Automatic probes run every `PROVIDER_RECOVERY_CHECK_INTERVAL_MS` (or 60 seconds for model-scoped failures) plus a random `1-10s` delay to avoid fixed-interval patterns. `GET /admin/providers` includes a `recovery` object for providers currently in this state, with the trigger error type, probe model, next probe time, and the latest failed probe details.

For `new-api`, use the OpenAI-compatible base URL (for example `https://your-newapi-host/v1`) and the `new-api` API key as the Bearer token.

`GET /admin/usage` supports `providerId`, `modelSlug`, `startDate`, `endDate`, `limit`, and `offset`. The response includes `{ usage, limit, offset }` sorted by `createdAt` descending.

`GET /admin/usage/summary` returns aggregated usage and estimated cost grouped by API key and route. The estimate uses `DEFAULT_INPUT_PRICE` and `DEFAULT_OUTPUT_PRICE` when they are set.

`GET /admin/usage/stats` returns `{ trend, byProvider, byModel }` for the selected date range. `GET /admin/request-logs` supports `providerId`, `modelSlug`, `startDate`, `endDate`, `errorType`, `limit`, and `offset`, and returns `{ requests, limit, offset }` sorted by newest first. `GET /admin/active-requests` returns `{ activeRequests }` for the requests currently in flight, including the active provider and failover attempt details for each request. Historical request logs now also include `requestId` so current in-flight requests can be correlated with completed provider-attempt logs.

`GET /admin/config/export` returns `{ providers, models, settings }` and includes `codexTransform` in each provider entry. The `models` array contains `{ providerId, providerName, modelSlug, priority }`. `POST /admin/config/import` accepts `{ providers, models?, settings?, mode? }`, where each model entry may use `providerId` or `providerName`. `mode` is `replace` or `merge`.

### Admin dashboard

The admin dashboard provides a web UI for provider management and usage visibility. It is a standalone Vue + Nuxt UI app powered by Vite that talks to the existing `/admin/*` APIs.

**Capabilities**

- Providers list with create and update flows.
- Codex transform switch with explicit passthrough status badges in the provider roster.
- Usage log querying with filters and pagination.
- API key injected from `.env` when available, otherwise stored in the browser and sent as `Authorization: Bearer ...` on every request.
- Provider connectivity tests can target a custom model slug from the UI.
- Health status and failure mix visibility for providers.
- Usage trends, current in-flight request visibility, and request log visibility.
- Config export/import for provider portability.

**Setup**

```bash [Terminal]
cd apps/admin
npm install
npm run dev
```

The dashboard will run on `http://localhost:3001` and connect to the gateway at `http://localhost:3000` by default.

Set `GATEWAY_API_KEY` or `VITE_GATEWAY_API_KEY` to inject the admin API key at build time. Set `GATEWAY_BASE_URL` or `VITE_API_BASE_URL` to target a different gateway URL.

**Current structure**

- Shell: compact sidebar, tighter navigation, smaller decorative background, and denser spacing for an operations-first layout.
- Providers: compact page header, provider roster summary strip, inline health actions, denser table rows, and mobile-safe row summaries when secondary columns are hidden.
- Usage: dashboard summary cards, filter toolbars, an active-request table for in-flight traffic, a usage log table, and a request log table arranged as a single reporting flow.
- Responsive behavior: mobile layouts hide secondary table columns, move key metadata into the primary cell, and keep action buttons visible without horizontal clipping.

**Verification**

- Run `npm run dev` and validate `/providers` and `/usage` with the `agent-browser` skill before completing UI tasks.
- Capture desktop and mobile screenshots during verification so layout, toolbar wrapping, table density, and modal spacing can be checked before commit.

## Provider selection and failover

For the standard `/v1/*` routes, the gateway loads all active providers and sorts by `priority` descending (higher is preferred), then by `id` for deterministic tie-breaking. When `ROUTING_STRATEGY=priority` and model-level priorities are configured, the router uses the model priority for the requested model and falls back to the provider priority when a model priority is missing. Other strategies ignore model-level priorities. It skips providers that are circuit-broken for the requested model and forwards the requested model slug directly to the upstream provider.

For `POST /codex/responses`, the gateway uses only `openai` and `new-api` providers with `codexTransform = false`. It forwards the raw request body to upstream `/responses`, preserves the upstream response as-is, and can fail over only before the first byte reaches the client. The same "fail over before first byte" behavior applies to `/openai/v1/responses`, `/google/v1beta/models/{model}:generateContent`, and the `/convert/*` HTTP routes. Realtime WebSocket sessions stay pinned to a single provider and are not replayed.

On upstream failures, the gateway reacts to the classified error type. Quota exhaustion, rate limits, network failures, server errors, and model-not-found errors open a 60-second circuit breaker for that model before retrying the next provider. Authentication errors deactivate the provider immediately, and unknown errors return a `500` without failover. Codex passthrough follows the same classification rules, but if every retryable upstream attempt fails before the first byte, it returns the last upstream error response instead of synthesizing a converted payload.

## Billing and usage

Billing uses usage numbers from the Vercel AI SDK for `/v1/*` routes. Passthrough and convert routes (except `/codex/responses`) use request-based estimates for usage and cost because upstream responses may not include billing metadata. Missing token counts are normalized to `0` before billing.

```text [Formula]
inputCost  = (promptTokens / 1,000,000) × inputPrice
outputCost = (completionTokens / 1,000,000) × outputPrice
totalCost  = inputCost + outputCost
```

Pricing resolves per provider. If `inputPrice` or `outputPrice` is missing, the gateway falls back to `DEFAULT_INPUT_PRICE` and `DEFAULT_OUTPUT_PRICE`. If both are unset, the cost is recorded as `0`.

Streaming requests bill after the stream finishes and usage is resolved. Non-streaming requests bill immediately after the provider response completes. Billing records the computed cost in `usageLogs` without deducting provider balances.

Codex passthrough requests do not write `usageLogs` and do not call the billing layer. They still write request logs and failure statistics so provider failover and health decisions remain observable.

## Error response format

Gateway-level errors use `gateway_error` for both OpenAI and Anthropic shapes.

```json [OpenAI Error]
{
  "error": {
    "message": "No provider available",
    "type": "gateway_error",
    "code": "gateway_error"
  }
}
```

```json [Anthropic Error]
{
  "type": "error",
  "error": {
    "type": "gateway_error",
    "message": "No provider available"
  }
}
```

Unhandled exceptions use `server_error` and return HTTP 500. Validation errors return HTTP 400 with `{ "error": { "message": "Invalid request" } }`.

## Observability

Every response includes `x-request-id`, and requests are logged with timing and status. `LOG_LEVEL` controls the minimum severity that is emitted.

## Repo structure overview

```
src/
├── index.ts                 # entry point
├── app.ts                   # Hono app factory
├── db/
│   ├── index.ts             # database factory (SQLite/PostgreSQL)
│   ├── schema/              # Drizzle table definitions
│   ├── migrate.ts           # migration runner
│   └── seed.ts              # demo data seeder
├── routes/
│   ├── openai.ts            # /v1/chat/completions + /v1/responses handlers
│   ├── codex.ts             # /codex/responses raw passthrough handler
│   ├── claude.ts            # /claude/v1/messages raw passthrough handler
│   ├── openaiPassthrough.ts # /openai/v1/responses raw passthrough handler
│   ├── geminiPassthrough.ts # /google/v1beta/models/* raw passthrough handler
│   ├── convert.ts           # /convert/* response normalization handlers
│   ├── anthropic.ts         # /v1/messages handler
│   └── admin.ts             # /admin/* management routes
├── services/
│   ├── routerService.ts     # provider selection algorithm
│   ├── upstreamService.ts   # AI SDK call wrapper
│   ├── billingService.ts    # cost calculation + usage logging
│   ├── gatewayService.ts    # orchestrator (route → call → bill → respond)
│   ├── circuitBreaker.ts    # per-provider health tracking
│   ├── protocolConverter.ts # OpenAI ↔ Anthropic format conversion
│   ├── convertService.ts    # detect + convert response payloads
│   ├── realtimeProxy.ts     # OpenAI Realtime WS proxy
│   └── streamRelay.ts       # SSE stream re-framing
├── middleware/
│   ├── auth.ts              # Bearer token verification
│   ├── logger.ts            # structured request logging
│   └── errorHandler.ts      # standardized error responses
├── types/
│   ├── openai.ts            # OpenAI request/response types
│   ├── anthropic.ts         # Anthropic request/response types
│   └── gemini.ts            # Gemini request/response types
└── utils/
    └── requestId.ts         # unique request ID generation
docs/
├── prompt.md                # project specification (target)
├── plans.md                 # milestones + architecture + decisions
├── implement.md             # execution runbook
└── documentation.md         # this file (living documentation)
drizzle/                     # generated migration files
```

## Troubleshooting

- **Port 3000 already in use**: `lsof -i :3000 -t | xargs kill`
- **Database locked**: ensure no other process holds `.runtime/lumina.db`; SQLite uses WAL mode for concurrency
- **No provider available**: check `GET /admin/providers` for active status, priorities, and circuit breaker state
- **401 on requests**: verify `GATEWAY_API_KEY` matches the Bearer token
- **Migration fails**: delete `.runtime/lumina.db` (and its `-shm` / `-wal` companions), then run `npm run db:migrate && npm run db:seed`

## Known issues / follow-ups

*(Tracked as they arise during implementation.)*
