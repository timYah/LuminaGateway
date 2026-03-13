export interface GeminiPart {
  text?: string;
  [key: string]: unknown;
}

export interface GeminiContent {
  role?: "user" | "model" | "system";
  parts: GeminiPart[];
  [key: string]: unknown;
}

export interface GeminiTool {
  [key: string]: unknown;
}

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent | { parts: GeminiPart[] };
  tools?: GeminiTool[];
  toolConfig?: Record<string, unknown>;
  safetySettings?: Array<Record<string, unknown>>;
  generationConfig?: Record<string, unknown>;
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
  index?: number;
  [key: string]: unknown;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  [key: string]: unknown;
}
