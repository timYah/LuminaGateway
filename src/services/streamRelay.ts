import type { TextStreamPart, ToolSet } from "ai";
import type {
  OpenAIChatCompletionChunk,
  OpenAIResponsesCompletedChunk,
  OpenAIResponsesCreatedChunk,
  OpenAIResponsesOutputItemAddedChunk,
  OpenAIResponsesOutputItemDoneChunk,
  OpenAIResponsesOutputTextDeltaChunk,
} from "../types/openai";
import type { UpstreamUsage } from "./upstreamService";

function createChunkId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildResponsesUsage(usage?: UpstreamUsage) {
  if (!usage) return undefined;
  return {
    input_tokens: usage.promptTokens,
    output_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens,
    input_tokens_details: {
      cached_tokens: 0,
    },
    output_tokens_details: {
      reasoning_tokens: 0,
    },
  };
}

export function relayAsOpenAIStream(
  aiSdkStream: AsyncIterable<TextStreamPart<ToolSet>>,
  modelSlug: string = "unknown"
) {
  const encoder = new TextEncoder();
  const chunkId = createChunkId("chatcmpl");
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

export function relayAsOpenAIResponsesStream(
  aiSdkStream: AsyncIterable<TextStreamPart<ToolSet>>,
  modelSlug: string = "unknown",
  usagePromise?: Promise<UpstreamUsage>
) {
  const encoder = new TextEncoder();
  const responseId = createChunkId("resp");
  const messageId = createChunkId("msg");
  const createdAt = Math.floor(Date.now() / 1000);
  let text = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const createdChunk: OpenAIResponsesCreatedChunk = {
        type: "response.created",
        response: {
          id: responseId,
          object: "response",
          created_at: createdAt,
          status: "in_progress",
          model: modelSlug,
        },
      };
      const addedChunk: OpenAIResponsesOutputItemAddedChunk = {
        type: "response.output_item.added",
        output_index: 0,
        item: {
          id: messageId,
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [],
        },
      };

      controller.enqueue(encoder.encode(`data: ${JSON.stringify(createdChunk)}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(addedChunk)}\n\n`));

      try {
        for await (const part of aiSdkStream) {
          if (part.type !== "text-delta" || !part.text) continue;
          text += part.text;
          const chunk: OpenAIResponsesOutputTextDeltaChunk = {
            type: "response.output_text.delta",
            item_id: messageId,
            output_index: 0,
            content_index: 0,
            delta: part.text,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
      } catch (error) {
        controller.error(error);
        return;
      }

      let usage: UpstreamUsage | undefined;
      try {
        usage = await usagePromise;
      } catch {
        usage = undefined;
      }

      const outputMessage = {
        id: messageId,
        type: "message" as const,
        role: "assistant" as const,
        status: "completed" as const,
        content: [
          {
            type: "output_text" as const,
            text,
            annotations: [],
          },
        ],
      };

      const outputDoneChunk: OpenAIResponsesOutputItemDoneChunk = {
        type: "response.output_item.done",
        output_index: 0,
        item: outputMessage,
      };
      const completedChunk: OpenAIResponsesCompletedChunk = {
        type: "response.completed",
        response: {
          id: responseId,
          object: "response",
          created_at: createdAt,
          status: "completed",
          model: modelSlug,
          error: null,
          incomplete_details: null,
          output: [outputMessage],
          output_text: text,
          usage: buildResponsesUsage(usage),
        },
      };

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(outputDoneChunk)}\n\n`)
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(completedChunk)}\n\n`)
      );
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
