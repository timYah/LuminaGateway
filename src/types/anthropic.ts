export type AnthropicRole = "user" | "assistant";

export interface AnthropicMessage {
  role: AnthropicRole;
  content: string;
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

export interface AnthropicMessagesRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  tools?: AnthropicToolDefinition[];
}

export interface AnthropicContentBlock {
  type: string;
  text?: string;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicMessagesResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason?: string | null;
  usage?: AnthropicUsage;
}

export interface AnthropicMessageStartEvent {
  type: "message_start";
  message: AnthropicMessagesResponse;
}

export interface AnthropicContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: {
    type: "text_delta";
    text: string;
  };
}

export interface AnthropicMessageStopEvent {
  type: "message_stop";
}

export type AnthropicStreamEvent =
  | AnthropicMessageStartEvent
  | AnthropicContentBlockDeltaEvent
  | AnthropicMessageStopEvent;
