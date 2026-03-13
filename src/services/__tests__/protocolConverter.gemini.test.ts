import { describe, expect, it } from "vitest";
import {
  convertGeminiResponseToUniversal,
  convertUniversalToGeminiResponse,
} from "../protocolConverter";

describe("protocolConverter (Gemini)", () => {
  it("converts Gemini response to universal format", () => {
    const universal = convertGeminiResponseToUniversal({
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
        promptTokenCount: 2,
        candidatesTokenCount: 3,
        totalTokenCount: 5,
      },
      modelVersion: "gemini-1.5-pro",
    });

    expect(universal.model).toBe("gemini-1.5-pro");
    expect(universal.text).toBe("Hello");
    expect(universal.finishReason).toBe("stop");
    expect(universal.usage?.promptTokens).toBe(2);
    expect(universal.usage?.completionTokens).toBe(3);
  });

  it("converts universal response to Gemini response", () => {
    const response = convertUniversalToGeminiResponse({
      model: "gemini-1.5-pro",
      text: "Hello",
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 2 },
    });

    expect(response.candidates[0]?.content.parts[0]?.text).toBe("Hello");
    expect(response.usageMetadata?.promptTokenCount).toBe(1);
    expect(response.usageMetadata?.candidatesTokenCount).toBe(2);
    expect(response.usageMetadata?.totalTokenCount).toBe(3);
    expect(response.modelVersion).toBe("gemini-1.5-pro");
  });
});
