import type { MiddlewareHandler } from "hono";

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ error: { message: "Unauthorized" } }, 401);
    }

    const normalizeKey = (raw: string | undefined) => {
      let value = (raw ?? "").trim();
      if (!value) return "";

      const lower = value.toLowerCase();
      if (lower.startsWith("authorization:")) {
        value = value.slice("authorization:".length).trim();
      }
      if (value.toLowerCase().startsWith("bearer ")) {
        value = value.slice("bearer ".length).trim();
      }

      const match = value.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/i);
      if (match && match[1].toUpperCase() === "GATEWAY_API_KEY") {
        value = match[2].trim();
      }

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1).trim();
      }

      return value;
    };

    const token = normalizeKey(authHeader);
    const expected = normalizeKey(process.env.GATEWAY_API_KEY);

    if (!token || token !== expected) {
      return c.json({ error: { message: "Unauthorized" } }, 401);
    }

    await next();
  };
};
