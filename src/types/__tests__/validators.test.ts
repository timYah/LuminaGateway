import { describe, expect, it } from "vitest";
import {
  anthropicMessagesSchema,
  anthropicMessagesResponseSchema,
  geminiGenerateContentSchema,
  openaiChatCompletionSchema,
  openaiResponsesSchema,
  openaiResponsesResponseSchema,
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

  it("validates Codex CLI OpenAI Responses requests", () => {
    const result = openaiResponsesSchema.safeParse({
      model: "gpt-5.3-codex",
      instructions: "Be concise",
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: "Use tools when needed" }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
        },
      ],
      stream: true,
      tools: [
        {
          type: "function",
          name: "exec_command",
          description: "Run a shell command",
          strict: false,
          parameters: {
            type: "object",
            properties: {
              cmd: { type: "string" },
            },
            required: ["cmd"],
          },
        },
        {
          type: "custom",
          name: "apply_patch",
          description: "Patch files",
          format: {
            type: "grammar",
            syntax: "lark",
            definition: "start: /.+/",
          },
        },
        {
          type: "web_search",
          external_web_access: false,
        },
      ],
      tool_choice: { type: "custom", name: "apply_patch" },
      parallel_tool_calls: true,
      prompt_cache_key: "req_test",
      text: { format: { type: "text" } },
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

  it("validates Gemini generateContent request", () => {
    const result = geminiGenerateContentSchema.safeParse({
      contents: [
        {
          role: "user",
          parts: [{ text: "Hello" }],
        },
      ],
      generationConfig: { temperature: 0.7 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid Gemini generateContent request", () => {
    const result = geminiGenerateContentSchema.safeParse({
      contents: [{ role: "user" }],
    });
    expect(result.success).toBe(false);
  });

  it("validates OpenAI Responses response", () => {
    const result = openaiResponsesResponseSchema.safeParse({
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
    });
    expect(result.success).toBe(true);
  });

  it("validates Anthropic response", () => {
    const result = anthropicMessagesResponseSchema.safeParse({
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      model: "claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    expect(result.success).toBe(true);
  });
});
