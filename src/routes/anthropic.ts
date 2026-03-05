import { Hono } from "hono";
import { anthropicMessagesSchema } from "../types/validators";
import { handleRequest } from "../services/gatewayService";
import type { UpstreamRequestParams } from "../services/upstreamService";

export const anthropicRoutes = new Hono();

anthropicRoutes.post("/v1/messages", async (c) => {
  const body = await c.req.json();
  const parsed = anthropicMessagesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  if (parsed.data.stream) {
    return c.json({ error: { message: "Streaming not supported yet" } }, 400);
  }

  const response = await handleRequest(
    {
      model: parsed.data.model,
      messages:
        parsed.data.messages as unknown as UpstreamRequestParams["messages"],
      system: parsed.data.system,
      maxOutputTokens: parsed.data.max_tokens,
    },
    "anthropic"
  );
  return c.json(response.body, response.status);
});
