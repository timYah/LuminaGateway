# Deployment and Usage

This guide explains how to deploy Lumina Gateway and operate the admin dashboard. It covers required environment variables, database setup, and request examples.

## Prerequisites

Lumina Gateway runs on Node.js LTS and supports SQLite or PostgreSQL. Use persistent storage for the database file when you deploy with SQLite.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_TYPE` | `sqlite` | Database driver: `sqlite` or `postgres`. |
| `DATABASE_URL` | `file:./lumina.db` | Connection string. Required when `DATABASE_TYPE=postgres`. |
| `GATEWAY_API_KEY` | *(required)* | Bearer token used by `/v1/*` and `/admin/*` routes. |
| `PORT` | `3000` | Server listen port. |
| `LOG_LEVEL` | `info` | Logging threshold: `debug`, `info`, `warn`, `error`. |

## Database setup

Run migrations before starting the gateway. Seed data is optional and intended for demo environments.

```bash [Terminal]
npm install
npm run db:migrate
npm run db:seed
```

## Run the stack

Use `npm run dev` for local development to start both the gateway and the admin dashboard together. In production, run each service under your process manager.

```bash [Terminal]
# Development (gateway + admin)
npm run dev
```

```bash [Terminal]
# Production example
node --import tsx src/index.ts
```

Verify the service:

```bash [Terminal]
curl http://localhost:3000/health
```

Start only the gateway or admin if needed:

```bash [Terminal]
npm run dev:gateway
npm run dev:admin
```

## Admin dashboard

The admin dashboard lives in `apps/admin`. It is a Vue + Nuxt UI app powered by Vite, connects to the gateway through the `/admin/*` APIs, and stores the API key locally in the browser.

```bash [Terminal]
cd apps/admin
npm install
npm run dev
```

Set `VITE_API_BASE_URL` to point to a non-default gateway URL. If the dashboard is hosted on a different origin, ensure the gateway allows CORS or place both behind the same reverse proxy.

## Usage examples

All `/v1/*` and `/admin/*` routes require `Authorization: Bearer <GATEWAY_API_KEY>`.

```bash [Terminal]
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

```bash [Terminal]
curl http://localhost:3000/admin/providers \
  -H "Authorization: Bearer dev-token"
```

## Operations

Set `LOG_LEVEL=debug` to troubleshoot routing or upstream behavior. Monitor `/health` from your load balancer and keep the database file backed up when running SQLite.
