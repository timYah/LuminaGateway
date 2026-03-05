import { Hono } from "hono";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { loggerMiddleware } from "./middleware/logger";
import { adminRoutes } from "./routes/admin";
import { anthropicRoutes } from "./routes/anthropic";
import { openaiRoutes } from "./routes/openai";

export function createApp() {
  const app = new Hono();

  app.use("*", loggerMiddleware());
  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/v1/*", authMiddleware());
  app.use("/admin/*", authMiddleware());
  app.route("/", openaiRoutes);
  app.route("/", anthropicRoutes);
  app.route("/", adminRoutes);

  app.onError(errorHandler);

  return app;
}
