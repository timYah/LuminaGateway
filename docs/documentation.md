# Lumina Gateway — Documentation

Lumina Gateway is a TypeScript LLM aggregation gateway that unifies multiple provider accounts behind a single API. It accepts OpenAI and Anthropic request formats, routes requests based on balance and health, and fails over when providers are rate limited or out of quota.

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
  "max_tokens": 1000,
  "tools": []
}
```

Supported fields match the Anthropic subset used by the validators: `model`, `messages`, `system`, `stream`, `max_tokens`, and `tools`.

### Streaming responses

OpenAI streaming returns `text/event-stream` with chat completion chunks followed by `[DONE]`.

```text [SSE]
data: {"id":"chatcmpl_...","object":"chat.completion.chunk","created":...,"model":"unknown","choices":[{"index":0,"delta":{"role":"assistant","content":"Hi"},"finish_reason":null}]}
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
GET    /admin/usage              — query usage logs
```

`POST /admin/providers` accepts `name`, `protocol`, `baseUrl`, `apiKey`, and optional `balance`, `isActive`, `priority`. `protocol` supports `openai`, `anthropic`, `google`, and `new-api`.

For `new-api`, use the OpenAI-compatible base URL (for example `https://your-newapi-host/v1`) and the `new-api` API key as the Bearer token.

`GET /admin/usage` supports `providerId`, `modelSlug`, `startDate`, `endDate`, `limit`, and `offset`. The response includes `{ usage, limit, offset }` sorted by `createdAt` descending.

### Admin dashboard

The admin dashboard provides a web UI for provider management and usage visibility. It is a standalone Vue + Nuxt UI app powered by Vite that talks to the existing `/admin/*` APIs.

**Capabilities**

- Providers list with create and update flows.
- Usage log querying with filters and pagination.
- API key input stored in the browser and sent as `Authorization: Bearer ...` on every request.

**Setup**

```bash [Terminal]
cd apps/admin
npm install
npm run dev
```

The dashboard will run on `http://localhost:3001` and connect to the gateway at `http://localhost:3000` by default.

Set `VITE_API_BASE_URL` before starting the dashboard to target a different gateway URL.

**UI optimization plan**

- Radius system: target 4–8px (panel 8px, control 6px, soft states 4px). Keep pill elements but tighten padding.
- Layout: move section titles out of cards, reduce card stacking, use borders/dividers with whitespace for hierarchy.
- Density: tighten `space-y`, `gap`, and table row height to a balanced density (clear, not crowded).
- Sidebar: lighten the intro block and tighten navigation spacing.

## Provider selection and failover

The gateway loads all providers that match the requested model slug, are active, and have a positive balance. It sorts by `balance` descending and `priority` ascending, then skips providers that are currently circuit-broken.

On upstream failures, the gateway reacts to the classified error type. Quota exhaustion sets the provider balance to `0`, rate limits open a 60-second circuit breaker, and 5xx server errors open a 30-second circuit breaker before retrying the next provider. Authentication errors deactivate the provider immediately, while unknown errors return a `500` without failover.

## Billing and usage

Billing uses usage numbers from the Vercel AI SDK. Missing token counts are normalized to `0` before billing.

```text [Formula]
inputCost  = (promptTokens / 1,000,000) × inputPrice
outputCost = (completionTokens / 1,000,000) × outputPrice
totalCost  = inputCost + outputCost
```

Streaming requests bill after the stream finishes and usage is resolved. Non-streaming requests bill immediately after the provider response completes.

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
│   ├── billingService.ts    # cost calculation + balance deduction
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
- **No provider available**: check `GET /admin/providers` for balances and active status
- **401 on requests**: verify `GATEWAY_API_KEY` matches the Bearer token
- **Migration fails**: delete `lumina.db`, then run `npm run db:migrate && npm run db:seed`

## Known issues / follow-ups

*(Tracked as they arise during implementation.)*
