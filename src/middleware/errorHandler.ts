import type { Context } from "hono";

export function errorHandler(err: Error, c: Context) {
  return c.json({ error: { message: err.message } }, 500);
}
