import { describe, expect, it } from "vitest";
import {
  convertAnthropicToUniversal,
  convertUniversalToAnthropicResponse,
} from "../protocolConverter";

describe("protocolConverter (Anthropic)", () => {
  it("converts Anthropic request to universal format", () => {
    const universal = convertAnthropicToUniversal({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "hi" }],
      system: "You are helpful",
      max_tokens: 128,
    });

    expect(universal.model).toBe("claude-sonnet-4-20250514");
    expect(universal.system).toBe("You are helpful");
    expect(universal.maxOutputTokens).toBe(128);
    expect(universal.messages).toHaveLength(1);
  });

  it("converts universal response to Anthropic response", () => {
    const response = convertUniversalToAnthropicResponse({
      model: "claude-sonnet-4-20250514",
      text: "Hello",
      finishReason: "stop",
      usage: { promptTokens: 2, completionTokens: 1 },
    });

    expect(response.type).toBe("message");
    expect(response.model).toBe("claude-sonnet-4-20250514");
    expect(response.content[0].text).toBe("Hello");
    expect(response.usage?.input_tokens).toBe(2);
    expect(response.usage?.output_tokens).toBe(1);
  });
});
