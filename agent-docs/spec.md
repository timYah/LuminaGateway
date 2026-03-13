# Lumina Gateway — Passthrough + Convert Routes Project Specification

You are acting as a senior engineer and system architect. Build **Lumina Gateway — Passthrough + Convert Routes**.

## Core goals

- Add newapi-style passthrough routes for OpenAI Responses, OpenAI Realtime (WebSocket), Claude Messages, and Gemini generateContent.
- Add matching `/convert` routes that validate non-streaming JSON responses and convert them to the target format when needed.
- Preserve all existing `/v1/*`, `/codex/*`, and `/claude/*` behavior with no regressions.
- Reuse the existing auth, rate limiting, quota, failover, and observability pipelines.
- Keep response headers/body intact for passthrough routes except for hop-by-hop headers.

## Non-goals

- No changes to existing standardized `/v1/*` endpoints.
- No WebSocket frame conversion or protocol translation for Realtime.
- No SSE/streaming conversion for `/convert` routes.
- No admin UI changes.

## Hard requirements

- **Tech stack**: TypeScript (ESM), Node.js 18+, Hono, Zod, Vitest, ESLint.
- **Routing**: New routes must be mounted with the same middleware pipeline (auth, rate limit, quota, failover) as existing protected routes.
- **Passthrough**: Forward request/response bodies and headers unchanged except for hop-by-hop headers; no schema coercion.
- **Convert**: Only operate on non-streaming JSON responses; validate target schema first; if invalid, attempt format detection and conversion.
- **Errors**: If conversion fails or format cannot be detected, return `422` with `gateway_error` shape.
- **Quality**: `npm run lint`, `npm run typecheck`, `npm run test` must pass.

## Hard constraints

- Existing `/v1/*`, `/codex/*`, `/claude/*` routes must not change behavior.
- Convert routes must not alter WebSocket traffic (Realtime convert is passthrough only).
- Failover is only allowed before the first response byte is sent.
- CORS must cover the new route prefixes.

## Deliverables

A repo that contains:

- New passthrough routes:
  - `POST /openai/v1/responses`
  - `GET /openai/v1/realtime` (WebSocket proxy)
  - `POST /claude/v1/messages`
  - `POST /google/v1beta/models/{model}:generateContent`
- New convert routes:
  - `POST /convert/openai/v1/responses`
  - `GET /convert/openai/v1/realtime` (WebSocket proxy)
  - `POST /convert/claude/v1/messages`
  - `POST /convert/google/v1beta/models/{model}:generateContent`
- Response format detection + conversion utilities for OpenAI Responses, Claude Messages, and Gemini generateContent.
- Updated middleware/CORS registration for the new route prefixes.
- Tests for conversion and routing behavior.
- Updated docs and API reference entries where applicable.
- `agent-docs/plan.md` capturing the execution plan.

## Product spec (build this)

### Current state
- Standardized `/v1/*` routes for OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages are implemented.
- Passthrough routes exist for `/codex/responses` and `/claude/v1/messages`.
- Failover, rate limiting, quota, logging, and metrics are already present.

### Passthrough routes (newapi style)
- **OpenAI Responses**: `POST /openai/v1/responses`
  - Forwards request to upstream `/responses` using provider selection rules.
  - Returns upstream response body and headers unchanged (minus hop-by-hop headers).
- **OpenAI Realtime**: `GET /openai/v1/realtime`
  - WebSocket proxy that forwards frames bidirectionally without modification.
  - Uses provider selection and applies auth/quota/rate-limit checks before upgrade.
- **Claude Messages**: `POST /claude/v1/messages`
  - Already exists; must remain functional and included in the middleware pipeline.
- **Gemini generateContent**: `POST /google/v1beta/models/{model}:generateContent`
  - Forwards request to provider base URL + `v1beta/models/{model}:generateContent`.
  - Returns upstream response body and headers unchanged (minus hop-by-hop headers).

### Convert routes
- Paths are `/convert` + original path.
- Convert routes validate responses against the target format:
  - If the response matches the target schema, return as-is.
  - If it does not match and the response is JSON, attempt to detect source format and convert.
  - If detection or conversion fails, return `422` + `gateway_error`.
- Convert routes **do not** handle SSE or streaming conversion.

### Response format detection and conversion
- Supported formats:
  - OpenAI Responses
  - Claude Messages
  - Gemini generateContent
- Use Zod validators for format detection.
- Conversion should go through a universal response shape to minimize edge cases.
- Preserve key fields (model, text/content, finish reason, usage) when available.

### Middleware and observability
- All new routes must be protected by existing auth, rate limit, quota, and failover logic.
- Request/usage logging must continue to work for new routes.
- CORS must allow new route prefixes.

### Error handling
- Validation errors return `400` with a `gateway_error` payload.
- Conversion failures return `422` with a `gateway_error` payload.
- Upstream failures follow existing failover and circuit breaker behavior.

## Configuration and environment

No new environment variables are required. The new routes use existing configuration:

```
GATEWAY_API_KEY=...
GATEWAY_API_KEYS=...
JWT_SECRET=...
RATE_LIMIT_RPM=...
TOKEN_RATE_LIMIT_TPM=...
ROUTING_STRATEGY=...
```

## Quality and engineering

- Strong typing for request/response schemas with Zod validators.
- Unit tests for response detection and conversion utilities.
- Integration tests for new routes (non-streaming JSON).
- Zero regressions in existing routes.
