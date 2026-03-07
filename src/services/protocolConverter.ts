import { jsonSchema } from "ai";
import type {
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIResponsesInputItem,
  OpenAIResponsesRequest,
  OpenAIResponsesResponse,
  OpenAIResponsesToolChoice,
  OpenAIResponsesToolDefinition,
  OpenAIToolChoice,
  OpenAIToolDefinition,
} from "../types/openai";
import type {
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
} from "../types/anthropic";
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

type UniversalMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
};

type UpstreamToolSet = NonNullable<UpstreamRequestParams["tools"]>;
type UpstreamToolChoice = UpstreamRequestParams["toolChoice"];

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildDefaultToolInputSchemaDefinition() {
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  } as const;
}

function compactRecord<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function toUpstreamInputSchema(schema?: Record<string, unknown>) {
  return jsonSchema(
    (schema ?? buildDefaultToolInputSchemaDefinition()) as Record<string, unknown>
  );
}

function normalizeResponsesText(
  value: string | Array<{ text: string }> | undefined
) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      if ("text" in item && typeof item.text === "string") {
        return [item.text];
      }
      return [];
    })
    .join("\n");
}

function mergeSystemInstructions(...segments: Array<string | undefined>) {
  const normalized = segments
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment));
  return normalized.length > 0 ? normalized.join("\n\n") : undefined;
}

function convertResponsesInputItemsToMessages(input: OpenAIResponsesInputItem[]) {
  const messages: UniversalMessage[] = [];
  const systemSegments: string[] = [];

  for (const item of input) {
    if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: normalizeResponsesText(item.output),
      });
      continue;
    }

    const content = normalizeResponsesText(item.content);
    if (item.role === "system" || item.role === "developer") {
      if (content) {
        systemSegments.push(content);
      }
      continue;
    }

    messages.push({
      role: item.role,
      content,
    });
  }

  return {
    messages,
    system: mergeSystemInstructions(...systemSegments),
  };
}

function convertOpenAIToolsToUpstream(
  tools: Array<OpenAIToolDefinition | OpenAIResponsesToolDefinition> | undefined
): UpstreamRequestParams["tools"] {
  if (!tools || tools.length === 0) return undefined;

  const entries = tools.map((tool): [string, Record<string, unknown>] => {
    if ("function" in tool) {
      return [
        tool.function.name,
        compactRecord({
          type: "function",
          description: tool.function.description,
          inputSchema: toUpstreamInputSchema(tool.function.parameters),
        }),
      ];
    }

    switch (tool.type) {
      case "function":
        return [
          tool.name,
          compactRecord({
            type: "function",
            description: tool.description,
            inputSchema: toUpstreamInputSchema(tool.parameters),
            strict: tool.strict,
          }),
        ];
      case "custom":
        return [
          tool.name,
          {
            type: "provider",
            id: "openai.custom",
            inputSchema: toUpstreamInputSchema(),
            args: compactRecord({
              name: tool.name,
              description: tool.description,
              format: tool.format,
            }),
          },
        ];
      case "web_search":
        return [
          "web_search",
          {
            type: "provider",
            id: "openai.web_search",
            inputSchema: toUpstreamInputSchema(),
            args: compactRecord({
              externalWebAccess: tool.external_web_access,
              filters: tool.filters
                ? compactRecord({
                    allowedDomains: tool.filters.allowed_domains,
                  })
                : undefined,
              searchContextSize: tool.search_context_size,
              userLocation: tool.user_location,
            }),
          },
        ];
      case "web_search_preview":
        return [
          "web_search_preview",
          {
            type: "provider",
            id: "openai.web_search_preview",
            inputSchema: toUpstreamInputSchema(),
            args: compactRecord({
              searchContextSize: tool.search_context_size,
              userLocation: tool.user_location,
            }),
          },
        ];
      case "apply_patch":
        return [
          "apply_patch",
          {
            type: "provider",
            id: "openai.apply_patch",
            inputSchema: toUpstreamInputSchema(),
            args: {},
          },
        ];
    }
  });

  return Object.fromEntries(entries) as UpstreamToolSet;
}

function convertOpenAIToolChoiceToUpstream(
  toolChoice: OpenAIToolChoice | OpenAIResponsesToolChoice | undefined
): UpstreamToolChoice {
  if (!toolChoice) return undefined;

  if (typeof toolChoice === "string") {
    return toolChoice;
  }

  if ("function" in toolChoice) {
    return {
      type: "tool",
      toolName: toolChoice.function.name,
    };
  }

  switch (toolChoice.type) {
    case "function":
    case "custom":
      return {
        type: "tool",
        toolName: toolChoice.name,
      };
    case "web_search":
    case "web_search_preview":
    case "apply_patch":
      return {
        type: "tool",
        toolName: toolChoice.type,
      };
  }
}

function convertUsageToOpenAIUsage(usage: UpstreamUsage | null | undefined) {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens,
  };
}

function convertUsageToOpenAIResponsesUsage(
  usage: UpstreamUsage | null | undefined
) {
  if (!usage) return undefined;
  return {
    input_tokens: usage.promptTokens,
    output_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens,
    input_tokens_details: {
      cached_tokens: 0,
    },
    output_tokens_details: {
      reasoning_tokens: 0,
    },
  };
}

export function convertOpenAIToUniversal(
  request: OpenAIChatCompletionRequest
): UniversalRequest {
  return {
    model: request.model,
    messages: request.messages as unknown as UpstreamRequestParams["messages"],
    temperature: request.temperature,
    maxOutputTokens: request.max_tokens,
    tools: convertOpenAIToolsToUpstream(request.tools),
    toolChoice: convertOpenAIToolChoiceToUpstream(request.tool_choice),
  };
}

export function convertOpenAIResponsesToUniversal(
  request: OpenAIResponsesRequest
): UniversalRequest {
  const baseRequest = {
    model: request.model,
    temperature: request.temperature,
    maxOutputTokens: request.max_output_tokens,
    tools: convertOpenAIToolsToUpstream(request.tools),
    toolChoice: convertOpenAIToolChoiceToUpstream(request.tool_choice),
  };

  if (typeof request.input === "string") {
    return {
      ...baseRequest,
      system: request.instructions,
      prompt: request.input,
    };
  }

  const converted = convertResponsesInputItemsToMessages(request.input);

  return {
    ...baseRequest,
    system: mergeSystemInstructions(request.instructions, converted.system),
    messages: converted.messages as unknown as UpstreamRequestParams["messages"],
  };
}

export function convertUniversalToOpenAIResponse(
  result: UniversalResponse
): OpenAIChatCompletionResponse {
  const created = Math.floor(Date.now() / 1000);
  const usage = convertUsageToOpenAIUsage(result.usage);

  return {
    id: createId("chatcmpl"),
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

export function convertUniversalToOpenAIResponsesResponse(
  result: UniversalResponse
): OpenAIResponsesResponse {
  const createdAt = Math.floor(Date.now() / 1000);
  const message = {
    id: createId("msg"),
    type: "message" as const,
    role: "assistant" as const,
    status: "completed" as const,
    content: [
      {
        type: "output_text" as const,
        text: result.text,
        annotations: [],
      },
    ],
  };

  return {
    id: createId("resp"),
    object: "response",
    created_at: createdAt,
    status: "completed",
    model: result.model,
    error: null,
    incomplete_details: null,
    output: [message],
    output_text: result.text,
    usage: convertUsageToOpenAIResponsesUsage(result.usage),
  };
}

export function convertAnthropicToUniversal(
  request: AnthropicMessagesRequest
): UniversalRequest {
  return {
    model: request.model,
    messages: request.messages as unknown as UpstreamRequestParams["messages"],
    system: request.system,
    temperature: request.temperature,
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
