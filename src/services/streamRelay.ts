import type { TextStreamPart, ToolSet } from "ai";
import type { OpenAIChatCompletionChunk } from "../types/openai";

function createChunkId() {
  return `chatcmpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function relayAsOpenAIStream(
  aiSdkStream: AsyncIterable<TextStreamPart<ToolSet>>,
  modelSlug: string = "unknown"
) {
  const encoder = new TextEncoder();
  const chunkId = createChunkId();
  const created = Math.floor(Date.now() / 1000);
  let sentRole = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of aiSdkStream) {
          if (part.type !== "text-delta") continue;
          const delta: OpenAIChatCompletionChunk["choices"][0]["delta"] = {};
          if (!sentRole) {
            delta.role = "assistant";
            sentRole = true;
          }
          if (part.text) {
            delta.content = part.text;
          }
          const chunk: OpenAIChatCompletionChunk = {
            id: chunkId,
            object: "chat.completion.chunk",
            created,
            model: modelSlug,
            choices: [
              {
                index: 0,
                delta,
                finish_reason: null,
              },
            ],
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }
      } catch (error) {
        controller.error(error);
        return;
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

export function relayAsAnthropicStream(
  aiSdkStream: AsyncIterable<TextStreamPart<ToolSet>>
) {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of aiSdkStream) {
          if (part.type !== "text-delta") continue;
          const event = {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: part.text },
          };
          controller.enqueue(
            encoder.encode(
              `event: content_block_delta\ndata: ${JSON.stringify(event)}\n\n`
            )
          );
        }
      } catch (error) {
        controller.error(error);
        return;
      }
      const stopEvent = { type: "message_stop" };
      controller.enqueue(
        encoder.encode(
          `event: message_stop\ndata: ${JSON.stringify(stopEvent)}\n\n`
        )
      );
      controller.close();
    },
  });
}
