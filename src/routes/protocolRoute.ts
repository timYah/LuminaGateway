import { Hono } from "hono";
import type { z } from "zod";
import {
  handleRequest,
  handleStreamingRequest,
  type ClientFormat,
  type GatewayRequestParams,
} from "../services/gatewayService";

type ProtocolRouteOptions<T extends z.ZodTypeAny> = {
  path: string;
  schema: T;
  converter: (data: z.infer<T>) => GatewayRequestParams;
  clientFormat: ClientFormat;
};

export function createProtocolRoute<T extends z.ZodTypeAny>(
  options: ProtocolRouteOptions<T>
) {
  const app = new Hono();

  app.post(options.path, async (c) => {
    const body = await c.req.json();
    const parsed = options.schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { message: "Invalid request" } }, 400);
    }

    if ((parsed.data as { stream?: boolean }).stream) {
      const response = await handleStreamingRequest(
        options.converter(parsed.data),
        options.clientFormat
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
      options.converter(parsed.data),
      options.clientFormat
    );
    return c.json(response.body, response.status);
  });

  return app;
}
