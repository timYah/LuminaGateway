import { describe, expect, it } from "vitest";
import { anthropicMessagesSchema, openaiChatCompletionSchema } from "../validators";

describe("validators", () => {
  it("validates OpenAI request", () => {
    const result = openaiChatCompletionSchema.safeParse({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.7,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid OpenAI request", () => {
    const result = openaiChatCompletionSchema.safeParse({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.success).toBe(false);
  });

  it("validates Anthropic request", () => {
    const result = anthropicMessagesSchema.safeParse({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 64,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid Anthropic request", () => {
    const result = anthropicMessagesSchema.safeParse({
      model: "claude-sonnet-4-20250514",
    });
    expect(result.success).toBe(false);
  });
});
