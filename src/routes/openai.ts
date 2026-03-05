import { Hono } from "hono";
import { openaiChatCompletionSchema } from "../types/validators";
import { handleRequest, handleStreamingRequest } from "../services/gatewayService";
import type { UpstreamRequestParams } from "../services/upstreamService";

export const openaiRoutes = new Hono();

openaiRoutes.post("/v1/chat/completions", async (c) => {
  const body = await c.req.json();
  const parsed = openaiChatCompletionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  if (parsed.data.stream) {
    const response = await handleStreamingRequest(
      {
        model: parsed.data.model,
        messages:
          parsed.data.messages as unknown as UpstreamRequestParams["messages"],
        temperature: parsed.data.temperature,
        maxOutputTokens: parsed.data.max_tokens,
      },
      "openai"
    );
    if ("stream" in response) {
      return new Response(response.stream, {
        status: response.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
    return c.json(response.body, response.status);
  }

  const response = await handleRequest(
    {
      model: parsed.data.model,
      messages:
        parsed.data.messages as unknown as UpstreamRequestParams["messages"],
      temperature: parsed.data.temperature,
      maxOutputTokens: parsed.data.max_tokens,
    },
    "openai"
  );
  return c.json(response.body, response.status);
});
