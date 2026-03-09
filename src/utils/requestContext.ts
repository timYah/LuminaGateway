import type { Context } from "hono";
import { generateRequestId } from "./requestId";

export function resolveRequestId(c: Context) {
  const requestId = c.get("requestId");
  return typeof requestId === "string" && requestId.length > 0
    ? requestId
    : generateRequestId();
}
