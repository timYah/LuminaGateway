import "./env.js";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { runMigrations } from "./db/runMigrations.js";

const port = Number(process.env.PORT) || 3000;
const host = process.env.GATEWAY_HOST || process.env.HOST || "127.0.0.1";

await runMigrations();

const app = createApp();

serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

console.log(`Lumina Gateway listening on http://${host}:${port}`);
