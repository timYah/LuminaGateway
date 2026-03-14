import { existsSync, readFileSync } from "node:fs";
import { Hono, type Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { loggerMiddleware } from "./middleware/logger";
import { rateLimitMiddleware } from "./middleware/rateLimit";
import { adminRoutes } from "./routes/admin";
import { anthropicRoutes } from "./routes/anthropic";
import { openaiRoutes } from "./routes/openai";
import { openaiPassthroughRoutes } from "./routes/openaiPassthrough";
import { claudeRoutes } from "./routes/claude";
import { renderMetrics } from "./services/metricsService";
import { geminiPassthroughRoutes } from "./routes/geminiPassthrough";
import { convertRoutes } from "./routes/convert";

function registerAdminUi(app: Hono) {
  const adminDistRoot = process.env.ADMIN_DIST_ROOT || "./apps/admin/dist";
  const adminIndexPath = `${adminDistRoot}/index.html`;
  if (!existsSync(adminIndexPath)) {
    return;
  }
  const rawAdminIndexHtml = readFileSync(adminIndexPath, "utf8");
  const runtimeKey =
    (process.env.GATEWAY_API_KEY ?? "").trim() ||
    (process.env.GATEWAY_API_KEYS ?? "")
      .split(/[,\n]/)
      .map((value) => value.trim())
      .find((value) => value.length > 0) ||
    "";
  const runtimeBaseUrl = process.env.GATEWAY_BASE_URL ?? "";
  const runtimeScript = `<script>window.__GATEWAY_RUNTIME__=${JSON.stringify({
    apiKey: runtimeKey,
    baseUrl: runtimeBaseUrl,
  })};</script>`;
  const adminIndexHtml = rawAdminIndexHtml.includes("</head>")
    ? rawAdminIndexHtml.replace("</head>", `${runtimeScript}</head>`)
    : `${runtimeScript}${rawAdminIndexHtml}`;

  app.use(
    "/assets/*",
    serveStatic({
      root: adminDistRoot,
      precompressed: true,
    })
  );

  const serveAdminIndex = (c: Context) => c.html(adminIndexHtml);

  app.get("/", serveAdminIndex);
  app.get("/providers", serveAdminIndex);
  app.get("/model-priorities", serveAdminIndex);
  app.get("/usage", serveAdminIndex);
  app.notFound((c) => {
    const accept = c.req.header("accept") || "";
    if (accept.includes("text/html")) {
      return serveAdminIndex(c);
    }
    return c.json({ error: { message: "Not Found" } }, 404);
  });
}

export function createApp() {
  const app = new Hono();

  app.use("*", loggerMiddleware());
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/metrics", (c) => {
    c.header("Content-Type", "text/plain; version=0.0.4");
    return c.text(renderMetrics());
  });

  const jwtHeader = (process.env.JWT_HEADER ?? "X-User-Token").trim() || "X-User-Token";
  const allowHeaders = Array.from(new Set(["Authorization", "Content-Type", jwtHeader]));
  const corsOptions = {
    origin: "*",
    allowHeaders,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  };

  app.use("/v1/*", cors(corsOptions));
  app.use("/claude/*", cors(corsOptions));
  app.use("/openai/*", cors(corsOptions));
  app.use("/google/*", cors(corsOptions));
  app.use("/convert/*", cors(corsOptions));
  app.use("/admin/*", cors(corsOptions));
  app.use("/v1/*", rateLimitMiddleware());
  app.use("/claude/*", rateLimitMiddleware());
  app.use("/openai/*", rateLimitMiddleware());
  app.use("/google/*", rateLimitMiddleware());
  app.use("/convert/*", rateLimitMiddleware());
  app.use("/admin/*", rateLimitMiddleware());
  app.use("/v1/*", authMiddleware());
  app.use("/claude/*", authMiddleware());
  app.use("/openai/*", authMiddleware());
  app.use("/google/*", authMiddleware());
  app.use("/convert/*", authMiddleware());
  app.use("/admin/*", authMiddleware());
  app.route("/", openaiRoutes);
  app.route("/", openaiPassthroughRoutes);
  app.route("/", claudeRoutes);
  app.route("/", geminiPassthroughRoutes);
  app.route("/", convertRoutes);
  app.route("/", anthropicRoutes);
  app.route("/", adminRoutes);
  registerAdminUi(app);

  app.onError(errorHandler);

  return app;
}
