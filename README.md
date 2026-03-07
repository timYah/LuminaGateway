# Lumina Gateway

Lumina Gateway is a TypeScript LLM aggregation gateway that unifies multiple AI provider accounts behind a single API. It accepts OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, and a dedicated Codex passthrough entrypoint. It routes requests by provider priority and health, then fails over when a provider is rate limited or out of quota.

## Features

- OpenAI-compatible chat completions endpoint.
- OpenAI-compatible responses endpoint.
- Anthropic-compatible messages endpoint.
- Streaming SSE relay for all supported client formats.
- Priority-based routing with automatic failover.
- Dedicated `/codex/responses` passthrough for Codex-style Responses traffic.
- Admin routes for provider management and usage queries.
- Vue + Nuxt UI admin dashboard for providers and usage.

## Quick start

Set `GATEWAY_API_KEY` before you start the server because `/v1/*`, `/codex/*`, and `/admin/*` require Bearer auth. The gateway auto-loads `.env` at startup.

```bash
npm install
# root install now also installs apps/admin dependencies
# admin install intentionally resolves platform-specific optional modules per machine
npm run db:migrate
npm run db:seed
cp .env.example .env
# edit .env and set GATEWAY_API_KEY (optionally set HOST=0.0.0.0)
npm run dev
```

Verify the server is up:

Alternatively, export `GATEWAY_API_KEY` in your shell instead of using `.env`.

```bash
curl http://localhost:3000/health
```

`npm run dev` starts both the gateway and the admin dashboard. The root `npm install` uses npm workspaces to prepare the gateway and `apps/admin` together. Use `npm run dev:gateway` or `npm run dev:admin` to start them separately.

To expose the dev servers on all interfaces, set `HOST=0.0.0.0` in `.env` or pass a host through the npm scripts:

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

```bash
curl http://localhost:3000/v1/responses \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.2","input":"Hello"}'
```

For Codex CLI, point the provider base URL at `/codex`:

```bash
codex exec \
  -c model_provider='gateway' \
  -c model='gpt-5.3-codex' \
  -c 'model_providers.gateway={name="gateway",base_url="http://localhost:3000/codex",wire_api="responses",requires_openai_auth=true}' \
  'Say hello in one word.'
```

`POST /codex/responses` forwards the raw JSON body to the selected upstream `/responses` endpoint and returns the upstream response body unchanged. The gateway only fails over before the first byte reaches the client. In the admin UI, leave `Codex transform` off to keep a provider eligible for this passthrough path.

### New API providers

When adding a new-api provider, set `protocol` to `new-api` and use the OpenAI-compatible base URL (for example `https://your-newapi-host/v1`).

## Admin dashboard

The admin dashboard is a standalone Vue + Nuxt UI app powered by Vite. It provides provider management and usage querying in a web UI. Install dependencies once from the repository root, then start the admin workspace from the root as well.

```bash
npm install
npm run dev:admin
```

The dashboard will run on `http://localhost:3001` and connect to the gateway at `http://localhost:3000` by default. Set `VITE_API_BASE_URL` to point at a different gateway URL.

## Deployment and usage

See `docs/deployment.md` for deployment steps, environment variables, Docker usage, Docker Compose persistence, and request examples. The Docker image build compiles both the gateway and the admin UI before packaging the runtime image.

The Docker build now defaults to the Nanjing University Debian mirror for `apt`, plus a mainland npm mirror for package installs. During validation, the NJU npm proxy was missing `@tiptap/suggestion@3.20.1`, so the npm registry remains independently overridable via `--build-arg NPM_REGISTRY=...`.

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
| `GATEWAY_API_KEY` | *(required)* | Bearer token used by `/v1/*`, `/codex/*`, and `/admin/*` routes. |
| `CODEX_UPSTREAM_TIMEOUT_MS` | *(optional)* | Timeout in milliseconds for `/codex/responses` upstream requests before failover. |
| `PORT` | `3000` | Server listen port. |
| `LOG_LEVEL` | `info` | Logging threshold: `debug`, `info`, `warn`, `error`. |

## API overview

- `POST /v1/chat/completions` — OpenAI-compatible chat completions endpoint
- `POST /v1/responses` — OpenAI-compatible responses endpoint
- `POST /v1/messages` — Anthropic-compatible endpoint
- `POST /codex/responses` — raw Codex passthrough to upstream `/responses`
- `GET /admin/providers` — list providers
- `POST /admin/providers` — create provider (`codexTransform` defaults to `false`)
- `PATCH /admin/providers/:id` — update provider, including the Codex transform flag
- `POST /admin/providers/:id/reset` — reset circuit breaker state
- `GET /admin/circuit-breakers` — list open circuit breakers
- `GET /admin/usage` — usage query

For full details, see `docs/documentation.md`.
