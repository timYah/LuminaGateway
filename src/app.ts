import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { anthropicRoutes } from "./routes/anthropic";
import { openaiRoutes } from "./routes/openai";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/v1/*", authMiddleware());
  app.route("/", openaiRoutes);
  app.route("/", anthropicRoutes);

  return app;
}
