import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { loggerMiddleware } from "../logger";

const originalLevel = process.env.LOG_LEVEL;

describe("loggerMiddleware", () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = "info";
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalLevel;
    vi.restoreAllMocks();
  });

  it("adds x-request-id header and logs info", async () => {
    const app = new Hono();
    app.use("*", loggerMiddleware());
    app.get("/ok", (c) => c.text("ok"));

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await app.request("/ok");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it("respects log level filtering", async () => {
    process.env.LOG_LEVEL = "error";
    const app = new Hono();
    app.use("*", loggerMiddleware());
    app.get("/ok", (c) => c.text("ok"));

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await app.request("/ok");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("logs errors for 5xx responses", async () => {
    process.env.LOG_LEVEL = "error";
    const app = new Hono();
    app.use("*", loggerMiddleware());
    app.get("/fail", (c) => c.text("fail", 500));

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await app.request("/fail");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
