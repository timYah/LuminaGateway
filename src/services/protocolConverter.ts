import type { OpenAIChatCompletionRequest } from "../types/openai";
import type { UpstreamRequestParams } from "./upstreamService";

export type UniversalRequest = UpstreamRequestParams & {
  model: string;
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
