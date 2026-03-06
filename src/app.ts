import { Hono } from "hono";
import { cors } from "hono/cors";
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

  const corsOptions = {
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  };

  app.use("/v1/*", cors(corsOptions));
  app.use("/admin/*", cors(corsOptions));
  app.use("/v1/*", authMiddleware());
  app.use("/admin/*", authMiddleware());
  app.route("/", openaiRoutes);
  app.route("/", anthropicRoutes);
  app.route("/", adminRoutes);

  app.onError(errorHandler);

  return app;
}
