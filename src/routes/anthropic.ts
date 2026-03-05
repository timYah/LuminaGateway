import { Hono } from "hono";
import { anthropicMessagesSchema } from "../types/validators";

export const anthropicRoutes = new Hono();

anthropicRoutes.post("/v1/messages", async (c) => {
  const body = await c.req.json();
  const parsed = anthropicMessagesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  return c.json({
    id: "msg_stub",
    type: "message",
    role: "assistant",
    content: [],
    model: parsed.data.model,
  });
});
