import type { ClientFormat } from "./gatewayService";

export type EstimatedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  text: string;
};

const decoder = new TextDecoder();

function parsePrice(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function estimateTokensFromText(text: string) {
  if (!text) return 0;
  return Math.max(0, Math.ceil(text.length / 4));
}

function extractStringParts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStringParts(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return [record.text];
  }
  return [];
}

function extractResponsesInputText(input: unknown) {
  if (typeof input === "string") return input;
  if (!Array.isArray(input)) return "";
  const parts: string[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.content === "string") {
      parts.push(record.content);
      continue;
    }
    if (Array.isArray(record.content)) {
      for (const part of record.content) {
        parts.push(...extractStringParts(part));
      }
      continue;
    }
    if (record.type === "function_call_output") {
      parts.push(...extractStringParts(record.output));
    }
  }
  return parts.join("\n");
}

function extractText(clientFormat: ClientFormat, payload: Record<string, unknown>) {
  if (clientFormat === "gemini") {
    const contents = Array.isArray(payload.contents) ? payload.contents : [];
    const contentText = contents
      .map((content) => (content as { parts?: unknown }).parts)
      .flatMap((parts) => extractStringParts(parts))
      .join("\n");
    const systemInstruction = payload.systemInstruction;
    const systemText = extractStringParts(
      typeof systemInstruction === "object" && systemInstruction !== null
        ? (systemInstruction as { parts?: unknown }).parts ?? systemInstruction
        : systemInstruction
    ).join("\n");
    return [systemText, contentText].filter(Boolean).join("\n");
  }
  if (clientFormat === "anthropic") {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const messageText = messages
      .map((message) => (message as { content?: unknown }).content)
      .flatMap((content) => extractStringParts(content))
      .join("\n");
    const system = typeof payload.system === "string" ? payload.system : "";
    return [system, messageText].filter(Boolean).join("\n");
  }
  if (clientFormat === "openai-responses") {
    const instructions = typeof payload.instructions === "string" ? payload.instructions : "";
    const inputText = extractResponsesInputText(payload.input);
    return [instructions, inputText].filter(Boolean).join("\n");
  }
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages
    .map((message) => (message as { content?: unknown }).content)
    .flatMap((content) => extractStringParts(content))
    .join("\n");
}

function extractOpenAIChatResponseText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  return choices
    .map((choice) => (choice as { message?: { content?: unknown } }).message?.content)
    .flatMap((content) => extractStringParts(content))
    .join("\n");
}

function extractOpenAIResponsesResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .map((item) => (item as { content?: unknown }).content)
    .flatMap((content) => extractStringParts(content))
    .join("\n");
}

function extractAnthropicResponseText(payload: Record<string, unknown>) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .map((block) => (block as { text?: unknown }).text)
    .flatMap((text) => extractStringParts(text))
    .join("\n");
}

function extractGeminiResponseText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates
    .map((candidate) => (candidate as { content?: { parts?: unknown } }).content?.parts)
    .flatMap((parts) => extractStringParts(parts))
    .join("\n");
}

function extractResponseText(clientFormat: ClientFormat, payload: Record<string, unknown>) {
  if (clientFormat === "openai-responses") {
    return extractOpenAIResponsesResponseText(payload);
  }
  if (clientFormat === "anthropic") {
    return extractAnthropicResponseText(payload);
  }
  if (clientFormat === "gemini") {
    return extractGeminiResponseText(payload);
  }
  return extractOpenAIChatResponseText(payload);
}

function extractCompletionTokens(value: unknown, depth = 0): number | null {
  if (depth > 4 || !value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidateKeys = [
    "output_tokens",
    "completion_tokens",
    "candidatesTokenCount",
    "outputTokens",
    "completionTokens",
  ] as const;

  for (const key of candidateKeys) {
    const tokenValue = record[key];
    if (typeof tokenValue === "number" && Number.isFinite(tokenValue)) {
      return Math.max(0, tokenValue);
    }
  }

  for (const item of Object.values(record)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const nested = extractCompletionTokens(child, depth + 1);
        if (nested !== null) return nested;
      }
      continue;
    }
    const nested = extractCompletionTokens(item, depth + 1);
    if (nested !== null) return nested;
  }

  return null;
}

function extractStreamingDeltaText(clientFormat: ClientFormat, payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;

  if (clientFormat === "openai-responses") {
    return typeof record.delta === "string" ? record.delta : "";
  }

  if (clientFormat === "anthropic") {
    const delta = record.delta;
    if (delta && typeof delta === "object") {
      const text = (delta as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    }
    return "";
  }

  if (clientFormat === "openai") {
    const choices = Array.isArray(record.choices) ? record.choices : [];
    return choices
      .map((choice) => (choice as { delta?: { content?: unknown } }).delta?.content)
      .flatMap((content) => extractStringParts(content))
      .join("\n");
  }

  return "";
}

function estimateOutputTokensFromPayload(clientFormat: ClientFormat, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return 0;
  }

  const completionTokens = extractCompletionTokens(payload);
  if (completionTokens !== null && completionTokens > 0) {
    return completionTokens;
  }

  return estimateTokensFromText(
    extractResponseText(clientFormat, payload as Record<string, unknown>)
  );
}

function estimateOutputTokensFromSse(clientFormat: ClientFormat, bodyText: string) {
  let completionTokens: number | null = null;
  let deltaText = "";

  for (const rawLine of bodyText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;

    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;

    try {
      const payload = JSON.parse(data) as unknown;
      const chunkCompletionTokens = extractCompletionTokens(payload);
      if (chunkCompletionTokens !== null && chunkCompletionTokens > 0) {
        completionTokens = chunkCompletionTokens;
      }
      deltaText += extractStreamingDeltaText(clientFormat, payload);
    } catch {
      // Ignore non-JSON SSE frames.
    }
  }

  if (completionTokens !== null) {
    return completionTokens;
  }

  return estimateTokensFromText(deltaText);
}

function extractMaxTokens(clientFormat: ClientFormat, payload: Record<string, unknown>) {
  if (clientFormat === "gemini") {
    const config = payload.generationConfig;
    if (config && typeof config === "object") {
      const record = config as Record<string, unknown>;
      const value =
        record.maxOutputTokens ?? record.max_output_tokens ?? record.maxTokens;
      return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    return 0;
  }
  if (clientFormat === "openai-responses") {
    const value = payload.max_output_tokens;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  if (clientFormat === "anthropic") {
    const value = payload.max_tokens;
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  const value = payload.max_tokens;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function estimateUsage(clientFormat: ClientFormat, payload: Record<string, unknown>): EstimatedUsage {
  const text = extractText(clientFormat, payload);
  const inputTokens = estimateTokensFromText(text);
  const outputTokens = extractMaxTokens(clientFormat, payload);
  const totalTokens = inputTokens + outputTokens;

  const inputPrice = parsePrice(process.env.DEFAULT_INPUT_PRICE);
  const outputPrice = parsePrice(process.env.DEFAULT_OUTPUT_PRICE);
  const estimatedCostUsd =
    (inputPrice ? (inputTokens / 1_000_000) * inputPrice : 0) +
    (outputPrice ? (outputTokens / 1_000_000) * outputPrice : 0);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    text,
  };
}

export function estimateOutputTokensFromResponseBody(
  clientFormat: ClientFormat,
  bodyText: string,
  contentType?: string | null
) {
  if (!bodyText) return 0;

  const normalizedContentType = contentType?.toLowerCase() ?? "";
  if (normalizedContentType.includes("text/event-stream")) {
    return estimateOutputTokensFromSse(clientFormat, bodyText);
  }

  try {
    const payload = JSON.parse(bodyText) as unknown;
    return estimateOutputTokensFromPayload(clientFormat, payload);
  } catch {
    return estimateTokensFromText(bodyText);
  }
}

export async function collectEstimatedOutputTokensFromStream(
  clientFormat: ClientFormat,
  stream: ReadableStream<Uint8Array>,
  contentType?: string | null
) {
  let bodyText = "";
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bodyText += decoder.decode(value, { stream: true });
      }
    }
    bodyText += decoder.decode();
  } catch {
    return 0;
  }

  return estimateOutputTokensFromResponseBody(clientFormat, bodyText, contentType);
}
