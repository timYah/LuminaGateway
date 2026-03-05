import { Hono } from "hono";
import { anthropicMessagesSchema } from "../types/validators";
import { handleRequest, handleStreamingRequest } from "../services/gatewayService";
import { convertAnthropicToUniversal } from "../services/protocolConverter";

export const anthropicRoutes = new Hono();

anthropicRoutes.post("/v1/messages", async (c) => {
  const body = await c.req.json();
  const parsed = anthropicMessagesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  if (parsed.data.stream) {
    const response = await handleStreamingRequest(
      convertAnthropicToUniversal(parsed.data),
      "anthropic"
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
    convertAnthropicToUniversal(parsed.data),
    "anthropic"
  );
  return c.json(response.body, response.status);
});
