import "./env.js";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;
const app = createApp();

serve({
  fetch: app.fetch,
  port,
});

console.log(`Lumina Gateway listening on http://localhost:${port}`);
