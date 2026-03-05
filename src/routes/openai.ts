import { Hono } from "hono";
import { openaiChatCompletionSchema } from "../types/validators";

export const openaiRoutes = new Hono();

openaiRoutes.post("/v1/chat/completions", async (c) => {
  const body = await c.req.json();
  const parsed = openaiChatCompletionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  return c.json({
    id: "chatcmpl_stub",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: parsed.data.model,
    choices: [],
  });
});
