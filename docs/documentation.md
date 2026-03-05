# Lumina Gateway — Documentation

This document is updated continuously as milestones land so it reflects reality.

## What Lumina Gateway is

A high-performance LLM aggregation gateway that unifies multiple AI provider accounts behind a single API endpoint. It supports both OpenAI and Anthropic request formats, routes requests based on provider balance and health, and automatically fails over to backup providers when quota or rate limits are hit.

## Status

*(Updated as milestones are completed)*

- Milestone 01: pending
- Milestone 02: pending
- Milestone 03: pending
- Milestone 04: pending
- Milestone 05: pending
- Milestone 06: pending
- Milestone 07: pending
- Milestone 08: pending
- Milestone 09: pending
- Milestone 10: pending
- Milestone 11: pending
- Milestone 12: pending
- Milestone 13: pending

## Local setup

- Requires: Node LTS on macOS
- Install deps: `npm install`
- Set up database: `npm run db:migrate`
- Seed demo data: `npm run db:seed`
- Start dev server: `npm run dev`
- Server runs at: `http://localhost:3000`
- Health check: `GET http://localhost:3000/health`

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_TYPE` | `sqlite` | Database driver: `sqlite` or `postgres` |
| `DATABASE_URL` | `file:./lumina.db` | Database connection string |
| `GATEWAY_API_KEY` | *(required)* | Bearer token for API authentication |
| `PORT` | `3000` | Server listen port |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

## Verification commands

- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests: `npm run test`
- Build: `npm run build`
- Migrate: `npm run db:migrate`
- Seed: `npm run db:seed`

## API reference

### Health check

```
GET /health
Response: { "status": "ok" }
```

### OpenAI-compatible endpoint

```
POST /v1/chat/completions
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false,
  "temperature": 0.7,
  "max_tokens": 1000
}
```

### Anthropic-compatible endpoint

```
POST /v1/messages
Authorization: Bearer <GATEWAY_API_KEY>
Content-Type: application/json

{
  "model": "claude-sonnet-4-20250514",
  "messages": [{"role": "user", "content": "Hello"}],
  "system": "You are a helpful assistant.",
  "stream": false,
  "max_tokens": 1000
}
```

### Admin routes

```
GET    /admin/providers          — list all providers with balances
POST   /admin/providers          — add a new provider
PATCH  /admin/providers/:id      — update provider (balance, active status)
GET    /admin/usage              — query usage logs (filter by provider, model, date)
```

## Provider selection algorithm

1. Find all providers that serve the requested model slug.
2. Filter: `isActive = true`, `balance > 0`, not circuit-broken.
3. Sort by `balance` descending, then `priority` ascending.
4. Select the first candidate.
5. On failure (402/429/401/5xx): mark provider unhealthy, try next candidate.
6. If all candidates exhausted: return error to client.

## Billing calculation

```
inputCost  = (promptTokens / 1,000,000) × inputPrice
outputCost = (completionTokens / 1,000,000) × outputPrice
totalCost  = inputCost + outputCost
```

Prices are per-model and stored in the `models` table as USD per 1M tokens.

Example: GPT-4o with inputPrice=$2.50, outputPrice=$10.00
- 500 input tokens, 200 output tokens
- Cost = (500/1M × $2.50) + (200/1M × $10.00) = $0.00125 + $0.002 = $0.00325

## Error response format

**OpenAI format:**
```json
{
  "error": {
    "message": "All providers exhausted for model gpt-4o",
    "type": "server_error",
    "code": "no_available_provider"
  }
}
```

**Anthropic format:**
```json
{
  "type": "error",
  "error": {
    "type": "overloaded_error",
    "message": "All providers exhausted for model claude-sonnet-4-20250514"
  }
}
```

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
├── prompt.md                # project specification (this is the target)
├── plans.md                 # milestones + architecture + decisions
├── implement.md             # execution runbook
└── documentation.md         # this file (living documentation)
drizzle/                     # generated migration files
```

## Troubleshooting

- **Port 3000 already in use**: `lsof -i :3000 -t | xargs kill`
- **Database locked**: ensure no other process holds `lumina.db`; SQLite uses WAL mode for better concurrency
- **All providers exhausted**: check `GET /admin/providers` for balances and active status; top up via `PATCH /admin/providers/:id`
- **401 on requests**: verify `GATEWAY_API_KEY` env var matches the Bearer token in your request
- **Migration fails**: delete `lumina.db` and re-run `npm run db:migrate && npm run db:seed`

## Known issues / follow-ups

*(Tracked as they arise during implementation)*
