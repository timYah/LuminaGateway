import { describe, expect, it } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import { relayAsOpenAIStream } from "../streamRelay";

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
  it("formats chunks and appends done marker", async () => {
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
});
