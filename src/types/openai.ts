export type OpenAIRole = "system" | "user" | "assistant" | "tool";

export interface OpenAIChatMessage {
  role: OpenAIRole;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export type OpenAIToolChoice =
  | "auto"
  | "none"
  | {
      type: "function";
      function: {
        name: string;
      };
    };

export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAIToolDefinition[];
  tool_choice?: OpenAIToolChoice;
}

export interface OpenAIChatCompletionChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: string | null;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChatCompletionChoice[];
  usage?: OpenAIUsage;
}
