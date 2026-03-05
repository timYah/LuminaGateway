import { randomUUID } from "node:crypto";

export function generateRequestId() {
  return `req_${randomUUID()}`;
}
