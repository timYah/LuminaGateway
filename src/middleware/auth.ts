import type { MiddlewareHandler } from "hono";

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ error: "Missing Authorization header" }, 400);
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    const expected = process.env.GATEWAY_API_KEY ?? "";

    if (!token || token !== expected) {
      return c.json({ error: { message: "Unauthorized" } }, 401);
    }

    await next();
  };
};
