# Lumina Gateway

Lumina Gateway is a TypeScript LLM aggregation gateway that unifies multiple AI provider accounts behind a single API. It accepts OpenAI and Anthropic request formats, routes requests based on provider balance and health, and fails over when a provider is rate limited or out of quota.

## Features

- OpenAI-compatible chat completions endpoint.
- Anthropic-compatible messages endpoint.
- Streaming SSE relay for both formats.
- Balance-aware routing with automatic failover.
- Admin routes for provider management and usage queries.
- Vue + Nuxt UI admin dashboard for providers and usage.

## Quick start

Set `GATEWAY_API_KEY` before you start the server because `/v1/*` and `/admin/*` require Bearer auth. The gateway auto-loads `.env` at startup.

```bash
npm install
npm run db:migrate
npm run db:seed
cp .env.example .env
# edit .env and set GATEWAY_API_KEY
npm run dev
```

Verify the server is up:

Alternatively, export `GATEWAY_API_KEY` in your shell instead of using `.env`.

```bash
curl http://localhost:3000/health
```

`npm run dev` starts both the gateway and the admin dashboard. Use `npm run dev:gateway` or `npm run dev:admin` to start them separately.

To expose the dev servers on all interfaces, pass a host through the npm scripts:

```bash
HOST=0.0.0.0 npm run dev
npm run dev:gateway -- --host 0.0.0.0
npm run dev:admin -- --host 0.0.0.0
```

Send a request:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

### New API providers

When adding a new-api provider, set `protocol` to `new-api` and use the OpenAI-compatible base URL (for example `https://your-newapi-host/v1`).

## Admin dashboard

The admin dashboard is a standalone Vue + Nuxt UI app powered by Vite. It provides provider management and usage querying in a web UI.

```bash [Terminal]
cd apps/admin
npm install
npm run dev
```

The dashboard will run on `http://localhost:3001` and connect to the gateway at `http://localhost:3000` by default. Set `VITE_API_BASE_URL` to point at a different gateway URL.

## Deployment and usage

See `docs/deployment.md` for deployment steps, environment variables, Docker usage, Docker Compose persistence, and request examples. The Docker image build compiles both the gateway and the admin UI before packaging the runtime image.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — compile the gateway into `dist/`
- `npm run build:gateway` — compile the gateway into `dist/`
- `npm run build:admin` — build the admin UI bundle
- `npm run docker:build` — build the local Docker image (`lumina-gateway:local`)
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
| `DATABASE_URL` | `file:./.runtime/lumina.db` | Connection string. Required when `DATABASE_TYPE=postgres`. |
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
