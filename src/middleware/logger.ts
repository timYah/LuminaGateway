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

    console.info(entry);
  };
};
