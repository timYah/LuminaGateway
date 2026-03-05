import type { MiddlewareHandler } from "hono";
import { generateRequestId } from "../utils/requestId";

export const loggerMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const requestId = generateRequestId();
    const start = Date.now();

    await next();

    const durationMs = Date.now() - start;
    const entry = {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    };
    const level =
      (process.env.LOG_LEVEL?.toLowerCase() as
        | "debug"
        | "info"
        | "warn"
        | "error"
        | undefined) ?? "info";
    const order = { debug: 0, info: 1, warn: 2, error: 3 };
    const entryLevel =
      entry.status >= 500 ? "error" : entry.status >= 400 ? "warn" : "info";

    if (order[entryLevel] < order[level]) {
      return;
    }

    if (entryLevel === "error") {
      console.error(entry);
      return;
    }
    if (entryLevel === "warn") {
      console.warn(entry);
      return;
    }
    if (level === "debug") {
      console.debug(entry);
      return;
    }
    console.info(entry);
  };
};
