import { describe, expect, it } from "vitest";
import type { TextStreamPart, ToolSet } from "ai";
import { relayAsAnthropicStream } from "../streamRelay";

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

describe("streamRelay (Anthropic)", () => {
  it("formats content_block_delta events and message_stop", async () => {
    const input: AsyncIterable<TextStreamPart<ToolSet>> = (async function* () {
      yield { type: "text-delta", id: "1", text: "Hello" } as TextStreamPart<ToolSet>;
      yield { type: "text-delta", id: "1", text: " there" } as TextStreamPart<ToolSet>;
    })();

    const stream = relayAsAnthropicStream(input);
    const output = await readStream(stream);
    const parts = output.trim().split("\n\n");

    expect(parts[0].startsWith("event: content_block_delta")).toBe(true);
    const firstData = parts[0].split("\n").find((line) => line.startsWith("data: "));
    expect(firstData).toBeDefined();
    const payload = JSON.parse(firstData!.replace(/^data: /, ""));
    expect(payload.delta.text).toBe("Hello");

    const lastPart = parts.at(-1);
    expect(lastPart?.startsWith("event: message_stop")).toBe(true);
  });
});
