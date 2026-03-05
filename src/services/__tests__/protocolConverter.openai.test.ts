import { describe, expect, it } from "vitest";
import {
  convertOpenAIToUniversal,
  convertUniversalToOpenAIResponse,
} from "../protocolConverter";

describe("protocolConverter (OpenAI)", () => {
  it("converts OpenAI request to universal format", () => {
    const universal = convertOpenAIToUniversal({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.3,
      max_tokens: 256,
      tools: [{ type: "function", function: { name: "test" } }],
      tool_choice: "auto",
    });

    expect(universal.model).toBe("gpt-4o");
    expect(universal.temperature).toBe(0.3);
    expect(universal.maxOutputTokens).toBe(256);
    expect(universal.messages).toHaveLength(1);
  });

  it("converts universal response to OpenAI response", () => {
    const response = convertUniversalToOpenAIResponse({
      model: "gpt-4o",
      text: "Hello",
      finishReason: "stop",
      usage: { promptTokens: 2, completionTokens: 3 },
    });

    expect(response.object).toBe("chat.completion");
    expect(response.model).toBe("gpt-4o");
    expect(response.choices[0].message.content).toBe("Hello");
    expect(response.usage?.prompt_tokens).toBe(2);
    expect(response.usage?.completion_tokens).toBe(3);
    expect(response.usage?.total_tokens).toBe(5);
  });
});
