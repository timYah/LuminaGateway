# Lumina Gateway — Documentation

Lumina Gateway is a TypeScript LLM aggregation gateway that unifies multiple provider accounts behind a single API. It accepts OpenAI and Anthropic request formats, routes requests based on provider priority and health, and fails over when providers are rate limited or out of quota.

## What Lumina Gateway is

The gateway exposes two client-facing APIs: an OpenAI-compatible chat completions endpoint and an Anthropic-compatible messages endpoint. Each request is validated, converted to a universal AI SDK request format, and executed against the selected upstream provider.

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
| `DATABASE_URL` | `file:./lumina.db` | Connection string. Required when `DATABASE_TYPE=postgres`. |
| `GATEWAY_API_KEY` | *(required)* | Bearer token used by `/v1/*` and `/admin/*` routes. |
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

All `/v1/*` and `/admin/*` routes require `Authorization: Bearer <GATEWAY_API_KEY>`. Missing or invalid tokens return `401` with `{ "error": { "message": "Unauthorized" } }`.

### Health check

```http [Response]
GET /health
{ "status": "ok" }
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

### Streaming responses

OpenAI streaming returns `text/event-stream` with chat completion chunks followed by `[DONE]`.

```text [SSE]
data: {"id":"chatcmpl_...","object":"chat.completion.chunk","created":...,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"},"finish_reason":null}]}
data: [DONE]
```

Anthropic streaming returns `text/event-stream` events for `content_block_delta` and a final `message_stop` event.

```text [SSE]
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
event: message_stop
data: {"type":"message_stop"}
```

### Admin routes

```
GET    /admin/providers          — list all providers
POST   /admin/providers          — create a provider
PATCH  /admin/providers/:id      — update provider fields
POST   /admin/providers/:id/test — test provider connectivity
DELETE /admin/providers/:id      — delete provider (also removes usage logs)
POST   /admin/providers/health   — run a health check for all providers
GET    /admin/failure-stats      — get error type distribution for recent requests
GET    /admin/usage              — query usage logs
GET    /admin/usage/stats        — trend + provider/model distribution
GET    /admin/request-logs       — query request-level logs
GET    /admin/config/export      — export providers + settings
POST   /admin/config/import      — import providers + settings
```

`POST /admin/providers` accepts `name`, `protocol`, `baseUrl`, `apiKey`, optional `apiMode`, plus optional `balance`, `inputPrice`, `outputPrice`, `isActive`, `priority`. `protocol` supports `openai`, `anthropic`, `google`, and `new-api`. For OpenAI-compatible providers, set `apiMode` to `responses` (default) or `chat` (Chat Completions). `balance` is informational only and does not affect routing. `inputPrice` and `outputPrice` are USD per 1M tokens and fall back to `DEFAULT_INPUT_PRICE` / `DEFAULT_OUTPUT_PRICE` when omitted.

`POST /admin/providers/:id/test` accepts an optional `model` query parameter (for example `?model=gpt-4o`) and returns the measured latency plus the selected model slug.

`POST /admin/providers/health` accepts an optional `model` query parameter and returns the health results for each provider. `GET /admin/failure-stats` aggregates recent request failures by error type.

For `new-api`, use the OpenAI-compatible base URL (for example `https://your-newapi-host/v1`) and the `new-api` API key as the Bearer token.

`GET /admin/usage` supports `providerId`, `modelSlug`, `startDate`, `endDate`, `limit`, and `offset`. The response includes `{ usage, limit, offset }` sorted by `createdAt` descending.

`GET /admin/usage/stats` returns `{ trend, byProvider, byModel }` for the selected date range. `GET /admin/request-logs` supports `providerId`, `modelSlug`, `startDate`, `endDate`, `errorType`, `limit`, and `offset`, and returns `{ requests, limit, offset }` sorted by newest first.

`GET /admin/config/export` returns `{ providers, models, settings }`. `POST /admin/config/import` accepts `{ providers, models?, settings?, mode? }`, where `mode` is `replace` or `merge`.

### Admin dashboard

The admin dashboard provides a web UI for provider management and usage visibility. It is a standalone Vue + Nuxt UI app powered by Vite that talks to the existing `/admin/*` APIs.

**Capabilities**

- Providers list with create and update flows.
- Usage log querying with filters and pagination.
- API key injected from `.env` when available, otherwise stored in the browser and sent as `Authorization: Bearer ...` on every request.
- Provider connectivity tests can target a custom model slug from the UI.
- Health status and failure mix visibility for providers.
- Usage trends and request log visibility.
- Config export/import for provider portability.

**Setup**

```bash [Terminal]
cd apps/admin
npm install
npm run dev
```

The dashboard will run on `http://localhost:3001` and connect to the gateway at `http://localhost:3000` by default.

Set `GATEWAY_API_KEY` or `VITE_GATEWAY_API_KEY` to inject the admin API key at build time. Set `GATEWAY_BASE_URL` or `VITE_API_BASE_URL` to target a different gateway URL.

**UI optimization plan**

- Radius system: target 4–8px (panel 8px, control 6px, soft states 4px). Keep pill elements but tighten padding.
- Layout: move section titles out of cards, reduce card stacking, use borders/dividers with whitespace for hierarchy.
- Density: tighten `space-y`, `gap`, and table row height to a balanced density (clear, not crowded).
- Sidebar: lighten the intro block and tighten navigation spacing.

## Provider selection and failover

The gateway loads all active providers and sorts by `priority` ascending (lower is preferred), then by `id` for deterministic tie-breaking. It skips providers that are currently circuit-broken and forwards the requested model slug directly to the upstream provider.

On upstream failures, the gateway reacts to the classified error type. Quota exhaustion opens a 5-minute circuit breaker, rate limits open a 60-second circuit breaker, and 5xx server errors open a 30-second circuit breaker before retrying the next provider. Authentication errors deactivate the provider immediately, model-not-found errors skip to the next provider, and unknown errors return a `500` without failover.

## Billing and usage

Billing uses usage numbers from the Vercel AI SDK. Missing token counts are normalized to `0` before billing.

```text [Formula]
inputCost  = (promptTokens / 1,000,000) × inputPrice
outputCost = (completionTokens / 1,000,000) × outputPrice
totalCost  = inputCost + outputCost
```

Pricing resolves per provider. If `inputPrice` or `outputPrice` is missing, the gateway falls back to `DEFAULT_INPUT_PRICE` and `DEFAULT_OUTPUT_PRICE`. If both are unset, the cost is recorded as `0`.

Streaming requests bill after the stream finishes and usage is resolved. Non-streaming requests bill immediately after the provider response completes. Billing records the computed cost in `usageLogs` without deducting provider balances.

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
│   ├── openai.ts            # /v1/chat/completions handler
│   ├── anthropic.ts         # /v1/messages handler
│   └── admin.ts             # /admin/* management routes
├── services/
│   ├── routerService.ts     # provider selection algorithm
│   ├── upstreamService.ts   # AI SDK call wrapper
│   ├── billingService.ts    # cost calculation + usage logging
│   ├── gatewayService.ts    # orchestrator (route → call → bill → respond)
│   ├── circuitBreaker.ts    # per-provider health tracking
│   ├── protocolConverter.ts # OpenAI ↔ Anthropic format conversion
│   └── streamRelay.ts       # SSE stream re-framing
├── middleware/
│   ├── auth.ts              # Bearer token verification
│   ├── logger.ts            # structured request logging
│   └── errorHandler.ts      # standardized error responses
├── types/
│   ├── openai.ts            # OpenAI request/response types
│   └── anthropic.ts         # Anthropic request/response types
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
- **Database locked**: ensure no other process holds `lumina.db`; SQLite uses WAL mode for concurrency
- **No provider available**: check `GET /admin/providers` for active status, priorities, and circuit breaker state
- **401 on requests**: verify `GATEWAY_API_KEY` matches the Bearer token
- **Migration fails**: delete `lumina.db`, then run `npm run db:migrate && npm run db:seed`

## Known issues / follow-ups

*(Tracked as they arise during implementation.)*
