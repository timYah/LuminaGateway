# Lumina Gateway

Lumina Gateway is a TypeScript LLM aggregation gateway that unifies multiple AI provider accounts behind a single API. It accepts OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, plus dedicated Claude, OpenAI, and Gemini passthrough entrypoints along with convert routes and an OpenAI Realtime WebSocket proxy. It routes requests by provider priority and health, then fails over when a provider is rate limited or out of quota.

## Features

- OpenAI-compatible chat completions endpoint.
- OpenAI-compatible responses endpoint.
- Anthropic-compatible messages endpoint.
- Streaming SSE relay for all supported client formats.
- Priority-based routing with automatic failover.
- Model-level provider priorities when using priority routing.
- Dedicated `/claude/v1/messages` passthrough for raw Anthropic Messages traffic.
- Dedicated `/openai/v1/responses` passthrough for raw OpenAI Responses traffic.
- Dedicated `/google/v1beta/models/{model}:generateContent` passthrough for Gemini traffic.
- `/convert/*` routes that normalize upstream JSON responses into target formats.
- `/openai/v1/realtime` WebSocket proxy for OpenAI Realtime.
- Admin routes for provider management and usage queries.
- Vue + Nuxt UI admin dashboard for providers and usage.

## Quick start

Set `GATEWAY_API_KEY` before you start the server because `/v1/*`, `/claude/*`, `/openai/*`, `/google/*`, `/convert/*`, and `/admin/*` require Bearer auth. The gateway auto-loads `.env` at startup.

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

For Codex CLI, point the provider base URL at `/openai`:

```bash
codex exec \
  -c model_provider='gateway' \
  -c model='gpt-5.3-codex' \
  -c 'model_providers.gateway={name="gateway",base_url="http://localhost:3000/openai",wire_api="responses",requires_openai_auth=true}' \
  'Say hello in one word.'
```

`POST /openai/v1/responses` forwards the raw JSON body to the selected upstream `/responses` endpoint and returns the upstream response body unchanged. The gateway only fails over before the first byte reaches the client.

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
| `GATEWAY_API_KEY` | *(required)* | Bearer token used by `/v1/*`, `/claude/*`, `/openai/*`, `/google/*`, `/convert/*`, and `/admin/*` routes. |
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
| `CODEX_UPSTREAM_TIMEOUT_MS` | *(optional)* | Timeout in milliseconds for passthrough `/openai/v1/responses` + `/google/v1beta/models/{model}:generateContent` upstream requests before failover (also used by convert routes). |
| `DEFAULT_INPUT_PRICE` | *(optional)* | Global input price fallback (USD per 1M tokens). |
| `DEFAULT_OUTPUT_PRICE` | *(optional)* | Global output price fallback (USD per 1M tokens). |
| `PORT` | `3000` | Server listen port. |
| `LOG_LEVEL` | `info` | Logging threshold: `debug`, `info`, `warn`, `error`. |

## API overview

- `POST /v1/chat/completions` — OpenAI-compatible chat completions endpoint
- `POST /v1/responses` — OpenAI-compatible responses endpoint
- `POST /v1/messages` — Anthropic-compatible endpoint
- `POST /claude/v1/messages` — raw Anthropic passthrough
- `POST /openai/v1/responses` — raw OpenAI passthrough
- `POST /google/v1beta/models/{model}:generateContent` — raw Gemini passthrough
- `POST /convert/openai/v1/responses` — convert to OpenAI Responses format
- `POST /convert/claude/v1/messages` — convert to Anthropic Messages format
- `POST /convert/google/v1beta/models/{model}:generateContent` — convert to Gemini generateContent format
- `GET /openai/v1/realtime` — OpenAI Realtime WebSocket proxy
- `GET /admin/providers` — list providers
- `POST /admin/providers` — create provider (`codexTransform` defaults to `false`)
- `PATCH /admin/providers/:id` — update provider, including the Codex transform flag
- `POST /admin/providers/:id/reset` — reset circuit breaker state
- `GET /admin/circuit-breakers` — list open circuit breakers
- `GET /admin/usage` — usage query
- `GET /admin/usage/summary` — usage + cost summary by API key and route
- `GET /metrics` — Prometheus-compatible metrics

For full details, see `docs/documentation.md`.
