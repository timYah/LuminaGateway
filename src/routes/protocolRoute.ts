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

function parseEnvList(value: string | undefined) {
  if (!value) return null;
  const entries = value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return null;
  return new Set(entries);
}

function isModelAllowed(model: string) {
  const allowlist = parseEnvList(process.env.MODEL_ALLOWLIST);
  if (allowlist && !allowlist.has(model)) {
    return false;
  }
  const blocklist = parseEnvList(process.env.MODEL_BLOCKLIST);
  if (blocklist && blocklist.has(model)) {
    return false;
  }
  return true;
}

let cachedDefaultsRaw: string | undefined;
let cachedDefaults: Record<string, unknown> | null = null;

function resolveDefaultRequestParams() {
  const raw = process.env.DEFAULT_REQUEST_PARAMS;
  if (!raw) return null;
  if (raw === cachedDefaultsRaw) return cachedDefaults;
  cachedDefaultsRaw = raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      cachedDefaults = parsed as Record<string, unknown>;
      return cachedDefaults;
    }
  } catch (error) {
    console.warn("[gateway] invalid DEFAULT_REQUEST_PARAMS", error);
  }
  cachedDefaults = null;
  return null;
}

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

    const defaults = resolveDefaultRequestParams();
    const payload = parsed.data as Record<string, unknown>;
    const merged = defaults
      ? ({ ...defaults, ...payload } as z.infer<T>)
      : parsed.data;

    const modelValue = (merged as { model?: unknown }).model;
    const modelSlug = typeof modelValue === "string" ? modelValue.trim() : "";
    if (modelSlug && !isModelAllowed(modelSlug)) {
      return c.json({ error: { message: "Model not allowed" } }, 403);
    }

    if ((merged as { stream?: boolean }).stream) {
      const response = await handleStreamingRequest(
        options.converter(merged),
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
      options.converter(merged),
      options.clientFormat
    );
    return c.json(response.body, response.status);
  });

  return app;
}
