import { Hono } from "hono";
import { openaiChatCompletionSchema } from "../types/validators";
import { handleRequest } from "../services/gatewayService";

export const openaiRoutes = new Hono();

openaiRoutes.post("/v1/chat/completions", async (c) => {
  const body = await c.req.json();
  const parsed = openaiChatCompletionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  if (parsed.data.stream) {
    return c.json({ error: { message: "Streaming not supported yet" } }, 400);
  }

  const response = await handleRequest(
    {
      model: parsed.data.model,
      messages: parsed.data.messages,
      temperature: parsed.data.temperature,
      maxOutputTokens: parsed.data.max_tokens,
    },
    "openai"
  );
  return c.json(response.body, response.status);
});
