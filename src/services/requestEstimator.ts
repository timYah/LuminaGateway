import type { ClientFormat } from "./gatewayService";

type EstimatedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  text: string;
};

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
