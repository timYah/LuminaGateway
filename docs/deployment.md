# Deployment and Usage

This guide explains how to deploy Lumina Gateway and operate the admin dashboard. It covers required environment variables, database setup, and request examples.

## Prerequisites

Lumina Gateway runs on Node.js LTS and supports SQLite or PostgreSQL. Use persistent storage for the database file when you deploy with SQLite.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_TYPE` | `sqlite` | Database driver: `sqlite` or `postgres`. |
| `DATABASE_URL` | `file:./.runtime/lumina.db` | Connection string. Required when `DATABASE_TYPE=postgres`. |
| `GATEWAY_API_KEY` | *(required)* | Bearer token used by `/v1/*`, `/codex/*`, and `/admin/*` routes. |
| `GATEWAY_API_KEYS` | *(optional)* | Comma-separated list of additional gateway API keys. |
| `MODEL_ALLOWLIST` | *(optional)* | Comma/newline-separated list of allowed model slugs. |
| `MODEL_BLOCKLIST` | *(optional)* | Comma/newline-separated list of blocked model slugs. |
| `CONTENT_BLOCKLIST` | *(optional)* | Comma/newline-separated list of blocked content keywords (case-insensitive). |
| `RATE_LIMIT_RPM` | *(optional)* | Per-API-key requests-per-minute limit (enables rate limiting). |
| `RATE_LIMIT_BURST` | *(optional)* | Burst capacity for rate limiting (defaults to `RATE_LIMIT_RPM`). |
| `RATE_LIMIT_OVERRIDES` | *(optional)* | JSON map of per-key limits. |
| `TOKEN_RATE_LIMIT_TPM` | *(optional)* | Per-API-key token-per-minute limit (enables token-based throttling). |
| `TOKEN_RATE_LIMIT_BURST` | *(optional)* | Burst token capacity (defaults to `TOKEN_RATE_LIMIT_TPM`). |
| `TOKEN_RATE_LIMIT_OVERRIDES` | *(optional)* | JSON map of per-key token limits. |
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
| `PROVIDER_WEIGHTS` | *(optional)* | JSON map of provider weights for weighted routing. |
| `PROVIDER_MAX_INFLIGHT` | *(optional)* | Max concurrent requests per provider. |
| `PROVIDER_MAX_INFLIGHT_OVERRIDES` | *(optional)* | JSON map of per-provider inflight limits. |
| `CACHE_TTL_MS` | *(optional)* | Cache TTL for non-streaming `/v1/*` responses; override with `x-cache-ttl-ms`. |
| `UPSTREAM_RETRY_ATTEMPTS` | *(optional)* | Number of retry attempts for retryable upstream errors. |
| `UPSTREAM_RETRY_BASE_MS` | `200` | Base backoff delay (ms) for upstream retries. |
| `CODEX_UPSTREAM_TIMEOUT_MS` | *(optional)* | Timeout in milliseconds for `/codex/responses` upstream requests before failover. |
| `GATEWAY_BASE_URL` | *(optional)* | Gateway base URL used by the admin dev server proxy. |
| `PORT` | `3000` | Server listen port. |
| `HOST` | `127.0.0.1` | Dev host binding for gateway/admin startup. Set `0.0.0.0` to expose on LAN or Docker host networking. |
| `DEFAULT_INPUT_PRICE` | *(optional)* | Global input price fallback (USD per 1M tokens). |
| `DEFAULT_OUTPUT_PRICE` | *(optional)* | Global output price fallback (USD per 1M tokens). |
| `LOG_LEVEL` | `info` | Logging threshold: `debug`, `info`, `warn`, `error`. |

## Database setup

Run migrations before starting the gateway. Seed data is optional and intended for demo environments.

```bash [Terminal]
npm install
# root install uses npm workspaces to install both the gateway and apps/admin dependencies
npm run db:migrate
npm run db:seed
```

## Run the stack

Use `npm run dev` for local development to start both the gateway and the admin dashboard together. The repository root is the workspace root, so a single `npm install` prepares both apps. In production, you can run the gateway directly or ship a single Docker image that also serves the built admin dashboard. The Docker build compiles both the gateway and the admin UI before producing the runtime image.

```bash [Terminal]
# Development (gateway + admin)
npm run dev
```

```bash [Terminal]
# Development with public host binding (equivalent to setting `HOST=0.0.0.0` in `.env`)
HOST=0.0.0.0 npm run dev
npm run dev:gateway -- --host 0.0.0.0
npm run dev:admin -- --host 0.0.0.0
```

```bash [Terminal]
# Build and run the Docker image (gateway + admin UI)
# Default build mirrors: Nanjing University for apt, mainland npm mirror for packages
npm run docker:build
docker run --rm -p 3000:3000 \
  -e GATEWAY_API_KEY=dev-token \
  -e DATABASE_TYPE=sqlite \
  -e DATABASE_URL=file:./.runtime/lumina.db \
  lumina-gateway:local
```

During validation, the NJU npm proxy did not provide `@tiptap/suggestion@3.20.1`, so the Dockerfile keeps the npm registry as a separate mainland mirror while still exposing it as an override.

Override the mirrors when needed:

```bash [Terminal]
docker build \
  --build-arg APT_DEBIAN_MIRROR=https://deb.debian.org/debian \
  --build-arg APT_SECURITY_MIRROR=https://security.debian.org/debian-security \
  --build-arg NPM_REGISTRY=https://registry.npmjs.org/ \
  -t lumina-gateway:local \
  .
```

```bash [Terminal]
# Or start with docker compose and persist SQLite under ./.runtime/docker
docker compose up --build -d
```

The Docker image serves the admin dashboard from the same origin as the gateway. After the container starts, open `http://localhost:3000/` for the UI and use `http://localhost:3000/v1/*` / `http://localhost:3000/admin/*` for the APIs. The compose file bind-mounts `./.runtime/docker` to `/app/.runtime`, so SQLite data survives container restarts.

Verify the service:

```bash [Terminal]
curl http://localhost:3000/health
```

Start only the gateway or admin if needed:

```bash [Terminal]
npm run dev:gateway
npm run dev:admin
npm run build:gateway
npm run build:admin
```

## Admin dashboard

The admin dashboard lives in `apps/admin`. It is a Vue + Nuxt UI app powered by Vite, connects to the gateway through the `/admin/*` APIs, and in the Docker image is served directly by the gateway on `/`, `/providers`, and `/usage`. Start it from the repository root so npm resolves the workspace correctly.

```bash
npm install
npm run dev:admin
```

Set `VITE_API_BASE_URL` to point to a non-default gateway URL. If the dashboard is hosted on a different origin, ensure the gateway allows CORS or place both behind the same reverse proxy.

The admin UI can load credentials from the root `.env` file. Set `GATEWAY_API_KEY` (or `VITE_GATEWAY_API_KEY` for a build-time override) to avoid manual entry. Set `GATEWAY_BASE_URL` (or `VITE_API_BASE_URL`) when the gateway is not on `http://localhost:3000`.

## Usage examples

All `/v1/*`, `/codex/*`, and `/admin/*` routes require `Authorization: Bearer <GATEWAY_API_KEY>`. Set `JWT_SECRET` to require a user JWT in the header defined by `JWT_HEADER` (default `X-User-Token`).

The `/metrics` endpoint exposes Prometheus-compatible counters for request volume and latency.

```bash [Terminal]
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

```bash [Terminal]
curl http://localhost:3000/v1/responses \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.2","input":"Hello"}'
```

```bash [Terminal]
codex exec \
  -c model_provider='gateway' \
  -c model='gpt-5.3-codex' \
  -c 'model_providers.gateway={name="gateway",base_url="http://localhost:3000/codex",wire_api="responses",requires_openai_auth=true}' \
  'Say hello in one word.'
```

Keep `Codex transform` disabled on the target provider when you want `/codex/responses` to proxy the request body and response body without conversion. The gateway only retries another provider before the first byte is sent back to the client.

```bash [Terminal]
curl http://localhost:3000/admin/providers \
  -H "Authorization: Bearer dev-token"
```

Health and observability endpoints:

```bash [Terminal]
curl -X POST "http://localhost:3000/admin/providers/health?model=gpt-4o" \
  -H "Authorization: Bearer dev-token"
```

```bash [Terminal]
curl "http://localhost:3000/admin/failure-stats" \
  -H "Authorization: Bearer dev-token"
```

```bash [Terminal]
curl "http://localhost:3000/admin/circuit-breakers" \
  -H "Authorization: Bearer dev-token"
```

Response entries are model-scoped and include the model slug:

```json
{
  "breakers": [
    {
      "providerId": 1,
      "name": "OpenAI Main",
      "protocol": "openai",
      "modelSlug": "gpt-4o",
      "state": "cooldown",
      "remainingMs": 42000
    }
  ]
}
```

```bash [Terminal]
curl "http://localhost:3000/admin/usage/summary" \
  -H "Authorization: Bearer dev-token"
```

```bash [Terminal]
curl "http://localhost:3000/admin/usage/stats?startDate=2025-01-01" \
  -H "Authorization: Bearer dev-token"
```

```bash [Terminal]
curl "http://localhost:3000/admin/request-logs?errorType=rate_limit&limit=20" \
  -H "Authorization: Bearer dev-token"
```

```bash [Terminal]
curl "http://localhost:3000/admin/config/export" \
  -H "Authorization: Bearer dev-token"
```

```bash [Terminal]
curl -X POST "http://localhost:3000/admin/config/import" \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"mode":"replace","providers":[{"name":"Primary","protocol":"openai","baseUrl":"https://api.openai.com/v1","apiKey":"sk-...","priority":1,"codexTransform":false}]}'
```

## Operations

Set `LOG_LEVEL=debug` to troubleshoot routing or upstream behavior. Monitor `/health` from your load balancer and keep the database file backed up when running SQLite.
