import { describe, expect, it } from "vitest";
import {
  convertOpenAIResponsesToUniversal,
  convertOpenAIToUniversal,
  convertUniversalToOpenAIResponse,
  convertUniversalToOpenAIResponsesResponse,
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

  it("converts OpenAI Responses request to universal format", () => {
    const universal = convertOpenAIResponsesToUniversal({
      model: "gpt-5.2",
      instructions: "Be concise",
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: "Prefer bullet points" }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
        },
        {
          type: "function_call_output",
          call_id: "call_123",
          output: [{ type: "output_text", text: '{"ok":true}' }],
        },
      ],
      temperature: 0.2,
      max_output_tokens: 512,
      tools: [{ type: "function", function: { name: "lookup" } }],
      tool_choice: { type: "function", function: { name: "lookup" } },
    });

    expect(universal.model).toBe("gpt-5.2");
    expect(universal.system).toBe(`Be concise

Prefer bullet points`);
    expect(universal.temperature).toBe(0.2);
    expect(universal.maxOutputTokens).toBe(512);
    expect(universal.messages).toMatchObject([
      { role: "user", content: "hello" },
      { role: "tool", tool_call_id: "call_123", content: '{"ok":true}' },
    ]);
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

  it("converts universal response to OpenAI Responses format", () => {
    const response = convertUniversalToOpenAIResponsesResponse({
      model: "gpt-5.2",
      text: "Hello Responses",
      finishReason: "stop",
      usage: { promptTokens: 4, completionTokens: 6 },
    });

    expect(response.object).toBe("response");
    expect(response.model).toBe("gpt-5.2");
    expect(response.output_text).toBe("Hello Responses");
    expect(response.output[0]?.content[0]?.text).toBe("Hello Responses");
    expect(response.usage?.input_tokens).toBe(4);
    expect(response.usage?.output_tokens).toBe(6);
    expect(response.usage?.total_tokens).toBe(10);
  });
});
