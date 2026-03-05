# Lumina Gateway

Lumina Gateway is a TypeScript LLM aggregation gateway that unifies multiple AI provider accounts behind a single API. It accepts OpenAI and Anthropic request formats, routes requests based on provider balance and health, and fails over when a provider is rate limited or out of quota.

## Features

- OpenAI-compatible chat completions endpoint.
- Anthropic-compatible messages endpoint.
- Streaming SSE relay for both formats.
- Balance-aware routing with automatic failover.
- Admin routes for provider management and usage queries.

## Quick start

Set `GATEWAY_API_KEY` before you start the server because `/v1/*` and `/admin/*` require Bearer auth.

```bash
npm install
npm run db:migrate
npm run db:seed
export GATEWAY_API_KEY="dev-token"
npm run dev
```

Verify the server is up:

```bash
curl http://localhost:3000/health
```

Send a request:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — compile TypeScript
- `npm run lint` — run ESLint
- `npm run typecheck` — run `tsc` without emitting
- `npm run test` — run Vitest
- `npm run db:generate` — generate Drizzle migrations
- `npm run db:migrate` — run migrations
- `npm run db:seed` — seed demo data

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_TYPE` | `sqlite` | Database driver: `sqlite` or `postgres`. |
| `DATABASE_URL` | `file:./lumina.db` | Connection string. Required when `DATABASE_TYPE=postgres`. |
| `GATEWAY_API_KEY` | *(required)* | Bearer token used by `/v1/*` and `/admin/*` routes. |
| `PORT` | `3000` | Server listen port. |
| `LOG_LEVEL` | `info` | Logging threshold: `debug`, `info`, `warn`, `error`. |

## API overview

- `POST /v1/chat/completions` — OpenAI-compatible endpoint
- `POST /v1/messages` — Anthropic-compatible endpoint
- `GET /admin/providers` — list providers
- `POST /admin/providers` — create provider
- `PATCH /admin/providers/:id` — update provider
- `GET /admin/usage` — usage query

For full details, see `docs/documentation.md`.
