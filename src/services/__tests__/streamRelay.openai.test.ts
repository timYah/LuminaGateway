import { describe, expect, it } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import {
  relayAsOpenAIResponsesStream,
  relayAsOpenAIStream,
} from "../streamRelay";

async function readStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

describe("streamRelay (OpenAI)", () => {
  it("formats chat completion chunks and appends done marker", async () => {
    const input: AsyncIterable<TextStreamPart<ToolSet>> = (async function* () {
      yield { type: "text-delta", id: "1", text: "Hello" } as TextStreamPart<ToolSet>;
      yield { type: "text-delta", id: "1", text: " world" } as TextStreamPart<ToolSet>;
    })();

    const stream = relayAsOpenAIStream(input);
    const output = await readStream(stream);
    const parts = output.trim().split("\n\n");

    expect(parts.at(-1)).toBe("data: [DONE]");

    const firstChunk = JSON.parse(parts[0].replace(/^data: /, ""));
    expect(firstChunk.object).toBe("chat.completion.chunk");
    expect(firstChunk.choices[0].delta.content).toBe("Hello");

    const secondChunk = JSON.parse(parts[1].replace(/^data: /, ""));
    expect(secondChunk.choices[0].delta.content).toBe(" world");
  });

  it("formats Responses API text chunks without a done marker", async () => {
    const input: AsyncIterable<TextStreamPart<ToolSet>> = (async function* () {
      yield { type: "text-delta", id: "1", text: "Hello" } as TextStreamPart<ToolSet>;
      yield { type: "text-delta", id: "1", text: " world" } as TextStreamPart<ToolSet>;
    })();

    const stream = relayAsOpenAIResponsesStream(
      input,
      "gpt-5.2",
      Promise.resolve({ promptTokens: 2, completionTokens: 3 })
    );
    const output = await readStream(stream);
    const parts = output.trim().split("\n\n");
    const chunks = parts.map((part) => JSON.parse(part.replace(/^data: /, "")));

    expect(output).not.toContain("[DONE]");
    expect(chunks[0].type).toBe("response.created");
    expect(chunks[0].response.model).toBe("gpt-5.2");
    expect(chunks[1].type).toBe("response.output_item.added");
    expect(chunks[2].type).toBe("response.output_text.delta");
    expect(chunks[2].delta).toBe("Hello");

    const completedChunk = chunks.at(-1);
    expect(completedChunk?.type).toBe("response.completed");
    expect(completedChunk?.response.output_text).toBe("Hello world");
    expect(completedChunk?.response.usage.total_tokens).toBe(5);
  });

  it("relays Codex tool calls as Responses SSE chunks", async () => {
    const input: AsyncIterable<TextStreamPart<ToolSet>> = (async function* () {
      yield {
        type: "tool-input-start",
        id: "call_1",
        toolName: "exec_command",
      } as TextStreamPart<ToolSet>;
      yield {
        type: "tool-input-delta",
        id: "call_1",
        delta: '{"cmd":"pwd"}',
      } as TextStreamPart<ToolSet>;
      yield {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "exec_command",
        input: '{"cmd":"pwd"}',
      } as TextStreamPart<ToolSet>;
      yield {
        type: "tool-input-start",
        id: "call_2",
        toolName: "apply_patch",
      } as TextStreamPart<ToolSet>;
      yield {
        type: "tool-input-delta",
        id: "call_2",
        delta: "*** Begin Patch",
      } as TextStreamPart<ToolSet>;
      yield {
        type: "tool-call",
        toolCallId: "call_2",
        toolName: "apply_patch",
        input: "*** Begin Patch",
      } as TextStreamPart<ToolSet>;
    })();

    const stream = relayAsOpenAIResponsesStream(
      input,
      "gpt-5.3-codex",
      Promise.resolve({ promptTokens: 2, completionTokens: 3 }),
      {
        exec_command: {
          type: "function",
          description: "Run a shell command",
          inputSchema: { type: "object", properties: { cmd: { type: "string" } } },
        },
        apply_patch: {
          type: "provider",
          id: "openai.custom",
          inputSchema: { type: "object", properties: {} },
          args: {
            name: "apply_patch",
            format: { type: "grammar" },
          },
        },
      } as unknown as ToolSet
    );

    const output = await readStream(stream);
    const chunks = output
      .trim()
      .split("\n\n")
      .map((part) => JSON.parse(part.replace(/^data: /, "")));

    expect(chunks[1].item.type).toBe("function_call");
    expect(chunks[2].type).toBe("response.function_call_arguments.delta");
    expect(chunks[3].item.type).toBe("function_call");
    expect(chunks[3].item.arguments).toBe('{"cmd":"pwd"}');
    expect(chunks[4].item.type).toBe("custom_tool_call");
    expect(chunks[5].type).toBe("response.custom_tool_call_input.delta");
    expect(chunks[6].item.type).toBe("custom_tool_call");
    expect(chunks[6].item.input).toBe("*** Begin Patch");
    expect(chunks.at(-1)?.response.output).toHaveLength(2);
  });
});
