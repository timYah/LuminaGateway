import { describe, expect, it } from "vitest";
import { convertResponseToTarget } from "../convertService";

describe("convertService", () => {
  const openaiResponse = {
    id: "resp_1",
    object: "response",
    created_at: 123,
    status: "completed",
    model: "gpt-5.2",
    error: null,
    incomplete_details: null,
    output_text: "Hello",
    output: [
      {
        id: "msg_1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Hello", annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 1,
      output_tokens: 2,
      total_tokens: 3,
    },
  };

  const anthropicResponse = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Hello" }],
    model: "claude-3",
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 2 },
  };

  const geminiResponse = {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ text: "Hello" }],
        },
        finishReason: "stop",
      },
    ],
    usageMetadata: {
      promptTokenCount: 1,
      candidatesTokenCount: 2,
      totalTokenCount: 3,
    },
    modelVersion: "gemini-1.5-pro",
  };

  it("converts anthropic to openai responses", () => {
    const result = convertResponseToTarget(anthropicResponse, "openai-responses");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.body as { output_text: string }).output_text).toBe("Hello");
    }
  });

  it("converts openai responses to anthropic", () => {
    const result = convertResponseToTarget(openaiResponse, "anthropic");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const body = result.body as { content: Array<{ text?: string }> };
      expect(body.content[0]?.text).toBe("Hello");
    }
  });

  it("converts openai responses to gemini", () => {
    const result = convertResponseToTarget(openaiResponse, "gemini");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const body = result.body as {
        candidates: Array<{ content: { parts: Array<{ text?: string }> } }>;
      };
      expect(body.candidates[0]?.content.parts[0]?.text).toBe("Hello");
    }
  });

  it("accepts gemini response in target format", () => {
    const result = convertResponseToTarget(geminiResponse, "gemini");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.body as { modelVersion?: string }).modelVersion).toBe(
        "gemini-1.5-pro"
      );
    }
  });

  it("returns error for unrecognized formats", () => {
    const result = convertResponseToTarget({ foo: "bar" }, "openai-responses");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unrecognized response format");
    }
  });
});
