import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIToolChoice,
} from "../types/openai";
import type { AnthropicMessagesRequest, AnthropicMessagesResponse } from "../types/anthropic";
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

export function convertAnthropicToUniversal(
  request: AnthropicMessagesRequest
): UniversalRequest {
  return {
    model: request.model,
    messages: request.messages as unknown as UpstreamRequestParams["messages"],
    system: request.system,
    maxOutputTokens: request.max_tokens,
    tools: request.tools as unknown as UpstreamRequestParams["tools"],
  };
}

export function convertUniversalToAnthropicResponse(
  result: UniversalResponse
): AnthropicMessagesResponse {
  return {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: result.text }],
    model: result.model,
    stop_reason: result.finishReason ?? null,
    usage: result.usage
      ? {
          input_tokens: result.usage.promptTokens,
          output_tokens: result.usage.completionTokens,
        }
      : undefined,
  };
}

export type ToolFormat = "openai" | "anthropic";

export type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "none" }
  | { type: "tool"; name: string };

export type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AnthropicToolUse = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export function convertToolSchemas(
  tools:
    | OpenAIChatCompletionRequest["tools"]
    | AnthropicMessagesRequest["tools"]
    | undefined,
  fromFormat: ToolFormat,
  toFormat: ToolFormat
) {
  if (!tools || fromFormat === toFormat) return tools;

  if (fromFormat === "openai" && toFormat === "anthropic") {
    return (tools as OpenAIChatCompletionRequest["tools"])?.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }

  if (fromFormat === "anthropic" && toFormat === "openai") {
    return (tools as AnthropicMessagesRequest["tools"])?.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  return tools;
}

export function convertToolChoice(
  toolChoice: OpenAIToolChoice | AnthropicToolChoice | undefined,
  fromFormat: ToolFormat,
  toFormat: ToolFormat
): OpenAIToolChoice | AnthropicToolChoice | undefined {
  if (!toolChoice || fromFormat === toFormat) return toolChoice;

  if (fromFormat === "openai" && toFormat === "anthropic") {
    if (toolChoice === "auto") return { type: "auto" };
    if (toolChoice === "none") return { type: "none" };
    if (typeof toolChoice === "object" && "type" in toolChoice) {
      const choice = toolChoice as {
        type: "function";
        function: { name: string };
      };
      if (choice.type === "function") {
        return { type: "tool", name: choice.function.name };
      }
    }
  }

  if (fromFormat === "anthropic" && toFormat === "openai") {
    const choice = toolChoice as AnthropicToolChoice;
    if (choice.type === "auto") return "auto";
    if (choice.type === "none") return "none";
    if (choice.type === "tool") {
      return { type: "function", function: { name: choice.name } };
    }
  }

  return toolChoice;
}

function safeParseArguments(value: string) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function convertToolUseResults(
  toolCalls: OpenAIToolCall[] | AnthropicToolUse[] | undefined,
  fromFormat: ToolFormat,
  toFormat: ToolFormat
): OpenAIToolCall[] | AnthropicToolUse[] | undefined {
  if (!toolCalls || fromFormat === toFormat) return toolCalls;

  if (fromFormat === "openai" && toFormat === "anthropic") {
    return (toolCalls as OpenAIToolCall[]).map((call) => ({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input: safeParseArguments(call.function.arguments),
    }));
  }

  if (fromFormat === "anthropic" && toFormat === "openai") {
    return (toolCalls as AnthropicToolUse[]).map((call) => ({
      id: call.id,
      type: "function",
      function: {
        name: call.name,
        arguments: JSON.stringify(call.input ?? {}),
      },
    }));
  }

  return toolCalls;
}
