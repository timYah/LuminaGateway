import { asSchema } from "ai";
import { describe, expect, it } from "vitest";
import {
  convertOpenAIResponsesToUniversal,
  convertOpenAIResponsesResponseToUniversal,
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
      tools: [
        {
          type: "function",
          function: {
            name: "test",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        },
      ],
      tool_choice: "auto",
    });

    expect(universal.model).toBe("gpt-4o");
    expect(universal.temperature).toBe(0.3);
    expect(universal.maxOutputTokens).toBe(256);
    expect(universal.messages).toHaveLength(1);
    expect(universal.tools).toMatchObject({
      test: {
        type: "function",
      },
    });
    expect(asSchema(universal.tools?.test?.inputSchema).jsonSchema).toMatchObject({
      type: "object",
      properties: {},
    });
    expect(universal.toolChoice).toBe("auto");
  });

  it("converts Codex CLI OpenAI Responses requests to universal format", () => {
    const universal = convertOpenAIResponsesToUniversal({
      model: "gpt-5.3-codex",
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
    });

    expect(universal.model).toBe("gpt-5.3-codex");
    expect(universal.system).toBe(`Be concise

Prefer bullet points`);
    expect(universal.temperature).toBe(0.2);
    expect(universal.maxOutputTokens).toBe(512);
    expect(universal.messages).toMatchObject([
      { role: "user", content: "hello" },
      { role: "tool", tool_call_id: "call_123", content: '{"ok":true}' },
    ]);
    expect(universal.tools).toMatchObject({
      exec_command: {
        type: "function",
        description: "Run a shell command",
        strict: false,
      },
      apply_patch: {
        type: "provider",
        id: "openai.custom",
        args: {
          name: "apply_patch",
          description: "Patch files",
          format: {
            type: "grammar",
            syntax: "lark",
            definition: "start: /.+/",
          },
        },
      },
      web_search: {
        type: "provider",
        id: "openai.web_search",
        args: {
          externalWebAccess: false,
        },
      },
    });
    expect(asSchema(universal.tools?.exec_command?.inputSchema).jsonSchema).toMatchObject({
      type: "object",
      properties: {
        cmd: { type: "string" },
      },
      required: ["cmd"],
    });
    expect(universal.toolChoice).toEqual({
      type: "tool",
      toolName: "apply_patch",
    });
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
    const firstOutput = response.output[0];
    expect(firstOutput?.type).toBe("message");
    if (firstOutput?.type === "message") {
      expect(firstOutput.content[0]?.text).toBe("Hello Responses");
    }
    expect(response.usage?.input_tokens).toBe(4);
    expect(response.usage?.output_tokens).toBe(6);
    expect(response.usage?.total_tokens).toBe(10);
  });

  it("converts OpenAI Responses response to universal format", () => {
    const universal = convertOpenAIResponsesResponseToUniversal({
      id: "resp_1",
      object: "response",
      created_at: 123,
      status: "completed",
      model: "gpt-5.2",
      error: null,
      incomplete_details: null,
      output: [],
      output_text: "Hello",
      usage: {
        input_tokens: 5,
        output_tokens: 7,
        total_tokens: 12,
      },
    });

    expect(universal.model).toBe("gpt-5.2");
    expect(universal.text).toBe("Hello");
    expect(universal.usage?.promptTokens).toBe(5);
    expect(universal.usage?.completionTokens).toBe(7);
  });
});
