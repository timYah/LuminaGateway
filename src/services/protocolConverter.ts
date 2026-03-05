import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
} from "../types/openai";
import type { UpstreamRequestParams, UpstreamUsage } from "./upstreamService";

export type UniversalRequest = UpstreamRequestParams & {
  model: string;
};

export type UniversalResponse = {
  model: string;
  text: string;
  finishReason?: string | null;
  usage?: UpstreamUsage | null;
};

export function convertOpenAIToUniversal(
  request: OpenAIChatCompletionRequest
): UniversalRequest {
  return {
    model: request.model,
    messages: request.messages as unknown as UpstreamRequestParams["messages"],
    temperature: request.temperature,
    maxOutputTokens: request.max_tokens,
    tools: request.tools as unknown as UpstreamRequestParams["tools"],
    toolChoice: request.tool_choice as unknown as UpstreamRequestParams["toolChoice"],
  };
}

export function convertUniversalToOpenAIResponse(
  result: UniversalResponse
): OpenAIChatCompletionResponse {
  const created = Math.floor(Date.now() / 1000);
  const usage = result.usage
    ? {
        prompt_tokens: result.usage.promptTokens,
        completion_tokens: result.usage.completionTokens,
        total_tokens: result.usage.promptTokens + result.usage.completionTokens,
      }
    : undefined;

  return {
    id: `chatcmpl_${created}_${Math.random().toString(36).slice(2, 8)}`,
    object: "chat.completion",
    created,
    model: result.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: result.text },
        finish_reason: result.finishReason ?? null,
      },
    ],
    usage,
  };
}
