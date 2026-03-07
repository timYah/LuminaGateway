export type OpenAIRole = "system" | "user" | "assistant" | "tool";
export type OpenAIResponsesMessageRole = "system" | "developer" | "user" | "assistant";

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

export interface OpenAIChatCompletionDelta {
  role?: OpenAIRole;
  content?: string;
  tool_calls?: unknown;
}

export interface OpenAIChatCompletionChunkChoice {
  index: number;
  delta: OpenAIChatCompletionDelta;
  finish_reason?: string | null;
}

export interface OpenAIChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIChatCompletionChunkChoice[];
}

export interface OpenAIResponsesInputTextPart {
  type: "input_text";
  text: string;
}

export interface OpenAIResponsesOutputTextPart {
  type: "output_text";
  text: string;
  annotations?: unknown[];
}

export type OpenAIResponsesTextPart =
  | OpenAIResponsesInputTextPart
  | OpenAIResponsesOutputTextPart;

export interface OpenAIResponsesMessageInput {
  type?: "message";
  role: OpenAIResponsesMessageRole;
  content: string | OpenAIResponsesTextPart[];
  id?: string;
  phase?: "commentary" | "final_answer" | null;
}

export interface OpenAIResponsesFunctionCallOutputInput {
  type: "function_call_output";
  call_id: string;
  output: string | OpenAIResponsesTextPart[];
}

export type OpenAIResponsesInputItem =
  | OpenAIResponsesMessageInput
  | OpenAIResponsesFunctionCallOutputInput;

export interface OpenAIResponsesRequest {
  model: string;
  input: string | OpenAIResponsesInputItem[];
  instructions?: string;
  stream?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  tools?: OpenAIToolDefinition[];
  tool_choice?: OpenAIToolChoice;
}

export interface OpenAIResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface OpenAIResponsesMessageOutput {
  id: string;
  type: "message";
  role: "assistant";
  status: "completed";
  content: Array<OpenAIResponsesOutputTextPart & { annotations: unknown[] }>;
}

export interface OpenAIResponsesResponse {
  id: string;
  object: "response";
  created_at: number;
  status: "completed";
  model: string;
  error: null;
  incomplete_details: null;
  output: OpenAIResponsesMessageOutput[];
  output_text: string;
  usage?: OpenAIResponsesUsage;
}

export interface OpenAIResponsesCreatedChunk {
  type: "response.created";
  response: {
    id: string;
    object: "response";
    created_at: number;
    status: "in_progress";
    model: string;
  };
}

export interface OpenAIResponsesOutputItemAddedChunk {
  type: "response.output_item.added";
  output_index: number;
  item: {
    id: string;
    type: "message";
    role: "assistant";
    status: "in_progress";
    content: [];
  };
}

export interface OpenAIResponsesOutputTextDeltaChunk {
  type: "response.output_text.delta";
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface OpenAIResponsesOutputItemDoneChunk {
  type: "response.output_item.done";
  output_index: number;
  item: OpenAIResponsesMessageOutput;
}

export interface OpenAIResponsesCompletedChunk {
  type: "response.completed";
  response: OpenAIResponsesResponse;
}
