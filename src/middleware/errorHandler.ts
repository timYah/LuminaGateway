import type { Context } from "hono";

function isAnthropicPath(path: string) {
  return path.startsWith("/v1/messages");
}

export function errorHandler(err: Error, c: Context) {
  const message = err.message || "Internal Server Error";
  if (isAnthropicPath(c.req.path)) {
    return c.json(
      { type: "error", error: { type: "server_error", message } },
      500
    );
  }

  return c.json(
    { error: { message, type: "server_error", code: "server_error" } },
    500
  );
}
