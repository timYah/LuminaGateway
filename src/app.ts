import { existsSync } from "node:fs";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { loggerMiddleware } from "./middleware/logger";
import { adminRoutes } from "./routes/admin";
import { anthropicRoutes } from "./routes/anthropic";
import { openaiRoutes } from "./routes/openai";
import { codexRoutes } from "./routes/codex";

function registerAdminUi(app: Hono) {
  const adminDistRoot = process.env.ADMIN_DIST_ROOT || "./apps/admin/dist";
  if (!existsSync(`${adminDistRoot}/index.html`)) {
    return;
  }

  app.use(
    "/assets/*",
    serveStatic({
      root: adminDistRoot,
      precompressed: true,
    })
  );

  const serveAdminIndex = serveStatic({
    root: adminDistRoot,
    path: "index.html",
    precompressed: true,
  });

  app.get("/", serveAdminIndex);
  app.get("/providers", serveAdminIndex);
  app.get("/usage", serveAdminIndex);
}

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
  app.use("/codex/*", cors(corsOptions));
  app.use("/admin/*", cors(corsOptions));
  app.use("/v1/*", authMiddleware());
  app.use("/codex/*", authMiddleware());
  app.use("/admin/*", authMiddleware());
  app.route("/", openaiRoutes);
  app.route("/", codexRoutes);
  app.route("/", anthropicRoutes);
  app.route("/", adminRoutes);
  registerAdminUi(app);

  app.onError(errorHandler);

  return app;
}
