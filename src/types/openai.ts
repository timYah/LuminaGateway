export type OpenAIRole = "system" | "user" | "assistant" | "tool";
export type OpenAIResponsesMessageRole =
  | "system"
  | "developer"
  | "user"
  | "assistant";

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

export interface OpenAIResponsesFunctionToolDefinition {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

export interface OpenAIResponsesCustomToolDefinition {
  type: "custom";
  name: string;
  description?: string;
  format: Record<string, unknown>;
}

export interface OpenAIResponsesWebSearchToolDefinition {
  type: "web_search";
  external_web_access?: boolean;
  filters?: {
    allowed_domains?: string[];
  };
  search_context_size?: string;
  user_location?: Record<string, unknown>;
}

export interface OpenAIResponsesWebSearchPreviewToolDefinition {
  type: "web_search_preview";
  search_context_size?: string;
  user_location?: Record<string, unknown>;
}

export interface OpenAIResponsesApplyPatchToolDefinition {
  type: "apply_patch";
}

export type OpenAIResponsesToolDefinition =
  | OpenAIToolDefinition
  | OpenAIResponsesFunctionToolDefinition
  | OpenAIResponsesCustomToolDefinition
  | OpenAIResponsesWebSearchToolDefinition
  | OpenAIResponsesWebSearchPreviewToolDefinition
  | OpenAIResponsesApplyPatchToolDefinition;

export type OpenAIResponsesToolChoice =
  | OpenAIToolChoice
  | "required"
  | {
      type: "function";
      name: string;
    }
  | {
      type: "custom";
      name: string;
    }
  | {
      type: "web_search";
    }
  | {
      type: "web_search_preview";
    }
  | {
      type: "apply_patch";
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
  tools?: OpenAIResponsesToolDefinition[];
  tool_choice?: OpenAIResponsesToolChoice;
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

export interface OpenAIResponsesMessageAddedItem {
  id: string;
  type: "message";
  role: "assistant";
  status: "in_progress";
  phase?: "commentary" | "final_answer" | null;
  content: [];
}

export interface OpenAIResponsesMessageOutput {
  id: string;
  type: "message";
  role: "assistant";
  status: "completed";
  phase?: "commentary" | "final_answer" | null;
  content: Array<OpenAIResponsesOutputTextPart & { annotations: unknown[] }>;
}

export interface OpenAIResponsesFunctionCallAddedItem {
  id: string;
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

export interface OpenAIResponsesFunctionCallOutput {
  id: string;
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
  status: "completed";
}

export interface OpenAIResponsesCustomToolCallAddedItem {
  id: string;
  type: "custom_tool_call";
  call_id: string;
  name: string;
  input: string;
}

export interface OpenAIResponsesCustomToolCallOutput {
  id: string;
  type: "custom_tool_call";
  call_id: string;
  name: string;
  input: string;
  status: "completed";
}

export type OpenAIResponsesOutputItemAdded =
  | OpenAIResponsesMessageAddedItem
  | OpenAIResponsesFunctionCallAddedItem
  | OpenAIResponsesCustomToolCallAddedItem;

export type OpenAIResponsesOutputItem =
  | OpenAIResponsesMessageOutput
  | OpenAIResponsesFunctionCallOutput
  | OpenAIResponsesCustomToolCallOutput;

export interface OpenAIResponsesResponse {
  id: string;
  object: "response";
  created_at: number;
  status: "completed";
  model: string;
  error: null;
  incomplete_details: null;
  output: OpenAIResponsesOutputItem[];
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
  item: OpenAIResponsesOutputItemAdded;
}

export interface OpenAIResponsesOutputTextDeltaChunk {
  type: "response.output_text.delta";
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface OpenAIResponsesFunctionCallArgumentsDeltaChunk {
  type: "response.function_call_arguments.delta";
  item_id: string;
  output_index: number;
  delta: string;
}

export interface OpenAIResponsesCustomToolCallInputDeltaChunk {
  type: "response.custom_tool_call_input.delta";
  item_id: string;
  output_index: number;
  delta: string;
}

export interface OpenAIResponsesOutputItemDoneChunk {
  type: "response.output_item.done";
  output_index: number;
  item: OpenAIResponsesOutputItem;
}

export interface OpenAIResponsesCompletedChunk {
  type: "response.completed";
  response: OpenAIResponsesResponse;
}
