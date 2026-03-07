import { describe, expect, it } from "vitest";
import {
  anthropicMessagesSchema,
  openaiChatCompletionSchema,
  openaiResponsesSchema,
} from "../validators";

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

  it("validates OpenAI Responses request", () => {
    const result = openaiResponsesSchema.safeParse({
      model: "gpt-5.2",
      instructions: "Be concise",
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: "hi" }],
        },
      ],
      max_output_tokens: 128,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid OpenAI Responses request", () => {
    const result = openaiResponsesSchema.safeParse({
      model: "gpt-5.2",
      input: [{ role: "user", content: [{ type: "input_image", text: "hi" }] }],
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
