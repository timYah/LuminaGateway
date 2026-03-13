import type { z } from "zod";
import {
  anthropicMessagesResponseSchema,
  geminiGenerateContentResponseSchema,
  openaiResponsesResponseSchema,
} from "../types/validators";
import {
  convertAnthropicResponseToUniversal,
  convertGeminiResponseToUniversal,
  convertOpenAIResponsesResponseToUniversal,
  convertUniversalToAnthropicResponse,
  convertUniversalToGeminiResponse,
  convertUniversalToOpenAIResponsesResponse,
} from "./protocolConverter";
import type { AnthropicMessagesResponse } from "../types/anthropic";
import type { GeminiGenerateContentResponse } from "../types/gemini";
import type { OpenAIResponsesResponse } from "../types/openai";

export type TargetResponseFormat = "openai-responses" | "anthropic" | "gemini";

type ResponseSchemaMap = {
  "openai-responses": typeof openaiResponsesResponseSchema;
  anthropic: typeof anthropicMessagesResponseSchema;
  gemini: typeof geminiGenerateContentResponseSchema;
};

type ParseResult<T extends z.ZodTypeAny> =
  | { ok: true; data: z.infer<T> }
  | { ok: false; error: string };

type ConvertResult = { ok: true; body: unknown } | { ok: false; error: string };

const responseSchemas: ResponseSchemaMap = {
  "openai-responses": openaiResponsesResponseSchema,
  anthropic: anthropicMessagesResponseSchema,
  gemini: geminiGenerateContentResponseSchema,
};

const formatPriority: TargetResponseFormat[] = [
  "openai-responses",
  "anthropic",
  "gemini",
];

function parseResponse<T extends z.ZodTypeAny>(schema: T, payload: unknown): ParseResult<T> {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  return { ok: false, error: "Invalid response payload" };
}

function detectResponseFormat(payload: unknown): TargetResponseFormat | null {
  for (const format of formatPriority) {
    if (responseSchemas[format].safeParse(payload).success) {
      return format;
    }
  }
  return null;
}

export function convertResponseToTarget(
  payload: unknown,
  targetFormat: TargetResponseFormat
): ConvertResult {
  const targetParsed = parseResponse(responseSchemas[targetFormat], payload);
  if (targetParsed.ok) {
    return { ok: true, body: targetParsed.data };
  }

  const sourceFormat = detectResponseFormat(payload);
  if (!sourceFormat) {
    return { ok: false, error: "Unrecognized response format" };
  }

  const sourceParsed = parseResponse(responseSchemas[sourceFormat], payload);
  if (!sourceParsed.ok) {
    return { ok: false, error: "Unrecognized response format" };
  }

  const universal =
    sourceFormat === "openai-responses"
      ? convertOpenAIResponsesResponseToUniversal(
          sourceParsed.data as OpenAIResponsesResponse
        )
      : sourceFormat === "anthropic"
        ? convertAnthropicResponseToUniversal(
            sourceParsed.data as AnthropicMessagesResponse
          )
        : convertGeminiResponseToUniversal(
            sourceParsed.data as GeminiGenerateContentResponse
          );

  const converted =
    targetFormat === "openai-responses"
      ? convertUniversalToOpenAIResponsesResponse(universal)
      : targetFormat === "anthropic"
        ? convertUniversalToAnthropicResponse(universal)
        : convertUniversalToGeminiResponse(universal);

  return { ok: true, body: converted };
}
