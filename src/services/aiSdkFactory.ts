import type { ProviderV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import type { Provider } from "../db/schema/providers";

const decoder = new TextDecoder();

export const normalizeOpenAiBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

const decodeBody = (body: unknown) => {
  if (typeof body === "string") return body;
  if (body instanceof ArrayBuffer) return decoder.decode(body);
  if (ArrayBuffer.isView(body)) return decoder.decode(body);
  return null;
};

const normalizeResponsesBody = (bodyText: string) => {
  try {
    const payload = JSON.parse(bodyText) as Record<string, unknown>;
    const input = payload.input;
    if (!Array.isArray(input)) return null;
    let updated = false;
    const nextInput = input.map((item) => {
      if (!item || typeof item !== "object") return item;
      if ("type" in item) return item;
      if (!("role" in item) || !("content" in item)) return item;
      updated = true;
      return { ...(item as Record<string, unknown>), type: "message" };
    });
    if (!updated) return null;
    return JSON.stringify({ ...payload, input: nextInput });
  } catch {
    return null;
  }
};

export const wrapNewApiFetch = (baseFetch?: FetchFunction): FetchFunction => {
  const fetchImpl = baseFetch ?? fetch;
  return async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : "url" in input
            ? input.url
            : "";
    if (!url.includes("/responses") || !init?.body) {
      return fetchImpl(input, init);
    }
    const bodyText = decodeBody(init.body);
    if (!bodyText) return fetchImpl(input, init);
    const normalized = normalizeResponsesBody(bodyText);
    if (!normalized) return fetchImpl(input, init);
    return fetchImpl(input, { ...init, body: normalized });
  };
};

export function createAIProvider(provider: Provider): ProviderV3 {
  switch (provider.protocol) {
    case "openai":
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL: normalizeOpenAiBaseUrl(provider.baseUrl),
      });
    case "new-api":
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL: normalizeOpenAiBaseUrl(provider.baseUrl),
        fetch: wrapNewApiFetch(),
      });
    case "anthropic":
      return createAnthropic({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });
    case "google":
      return createGoogleGenerativeAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });
    default:
      throw new Error(`Unsupported provider protocol: ${provider.protocol}`);
  }
}
