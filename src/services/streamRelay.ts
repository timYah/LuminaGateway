import type { TextStreamPart, ToolSet } from "ai";
import type {
  OpenAIChatCompletionChunk,
  OpenAIResponsesCompletedChunk,
  OpenAIResponsesCreatedChunk,
  OpenAIResponsesCustomToolCallInputDeltaChunk,
  OpenAIResponsesFunctionCallArgumentsDeltaChunk,
  OpenAIResponsesOutputItem,
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

type ResponsesToolKind = "function" | "custom";

type ActiveResponsesMessage = {
  id: string;
  outputIndex: number;
  text: string;
};

type ActiveResponsesTool = {
  kind: ResponsesToolKind;
  itemId: string;
  outputIndex: number;
  toolName: string;
  toolCallId: string;
  input: string;
};

function normalizeToolInput(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

function buildResponsesToolCatalog(tools?: ToolSet) {
  const catalog: Record<string, ResponsesToolKind> = {};
  if (!tools) return catalog;

  for (const [name, tool] of Object.entries(tools)) {
    if (!tool || typeof tool !== "object") continue;
    if (tool.type === "provider" && tool.id === "openai.custom") {
      catalog[name] = "custom";
      continue;
    }
    catalog[name] = "function";
  }

  return catalog;
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
  usagePromise?: Promise<UpstreamUsage>,
  tools?: ToolSet
) {
  const encoder = new TextEncoder();
  const responseId = createChunkId("resp");
  const createdAt = Math.floor(Date.now() / 1000);
  const activeMessages = new Map<string, ActiveResponsesMessage>();
  const activeTools = new Map<string, ActiveResponsesTool>();
  const completedOutputItems: Array<{
    outputIndex: number;
    item: OpenAIResponsesOutputItem;
  }> = [];
  const toolCatalog = buildResponsesToolCatalog(tools);
  let nextOutputIndex = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitChunk = (chunk: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

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

      const ensureMessage = (textId: string) => {
        const existing = activeMessages.get(textId);
        if (existing) return existing;

        const message: ActiveResponsesMessage = {
          id: textId || createChunkId("msg"),
          outputIndex: nextOutputIndex++,
          text: "",
        };
        activeMessages.set(textId, message);

        const addedChunk: OpenAIResponsesOutputItemAddedChunk = {
          type: "response.output_item.added",
          output_index: message.outputIndex,
          item: {
            id: message.id,
            type: "message",
            role: "assistant",
            status: "in_progress",
            content: [],
          },
        };
        emitChunk(addedChunk);
        return message;
      };

      const completeMessage = (textId: string) => {
        const message = activeMessages.get(textId);
        if (!message) return;

        activeMessages.delete(textId);
        const outputItem: OpenAIResponsesOutputItem = {
          id: message.id,
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: message.text,
              annotations: [],
            },
          ],
        };
        completedOutputItems.push({
          outputIndex: message.outputIndex,
          item: outputItem,
        });

        const doneChunk: OpenAIResponsesOutputItemDoneChunk = {
          type: "response.output_item.done",
          output_index: message.outputIndex,
          item: outputItem,
        };
        emitChunk(doneChunk);
      };

      const ensureTool = (toolCallId: string, toolName: string) => {
        const existing = activeTools.get(toolCallId);
        if (existing) return existing;

        const kind = toolCatalog[toolName] ?? "function";
        const toolMeta: ActiveResponsesTool = {
          kind,
          itemId: createChunkId(kind === "custom" ? "custom" : "fc"),
          outputIndex: nextOutputIndex++,
          toolName,
          toolCallId,
          input: "",
        };
        activeTools.set(toolCallId, toolMeta);

        const addedChunk: OpenAIResponsesOutputItemAddedChunk = {
          type: "response.output_item.added",
          output_index: toolMeta.outputIndex,
          item:
            kind === "custom"
              ? {
                  id: toolMeta.itemId,
                  type: "custom_tool_call",
                  call_id: toolCallId,
                  name: toolName,
                  input: "",
                }
              : {
                  id: toolMeta.itemId,
                  type: "function_call",
                  call_id: toolCallId,
                  name: toolName,
                  arguments: "",
                },
        };
        emitChunk(addedChunk);
        return toolMeta;
      };

      const completeTool = (
        toolCallId: string,
        toolName: string,
        input: unknown
      ) => {
        const toolMeta = ensureTool(toolCallId, toolName);
        toolMeta.input = normalizeToolInput(input);
        activeTools.delete(toolCallId);

        const outputItem: OpenAIResponsesOutputItem =
          toolMeta.kind === "custom"
            ? {
                id: toolMeta.itemId,
                type: "custom_tool_call",
                call_id: toolMeta.toolCallId,
                name: toolMeta.toolName,
                input: toolMeta.input,
                status: "completed",
              }
            : {
                id: toolMeta.itemId,
                type: "function_call",
                call_id: toolMeta.toolCallId,
                name: toolMeta.toolName,
                arguments: toolMeta.input,
                status: "completed",
              };

        completedOutputItems.push({
          outputIndex: toolMeta.outputIndex,
          item: outputItem,
        });

        const doneChunk: OpenAIResponsesOutputItemDoneChunk = {
          type: "response.output_item.done",
          output_index: toolMeta.outputIndex,
          item: outputItem,
        };
        emitChunk(doneChunk);
      };

      emitChunk(createdChunk);

      try {
        for await (const part of aiSdkStream) {
          switch (part.type) {
            case "text-start":
              ensureMessage(part.id);
              break;
            case "text-delta": {
              if (!part.text) break;
              const message = ensureMessage(part.id);
              message.text += part.text;
              const chunk: OpenAIResponsesOutputTextDeltaChunk = {
                type: "response.output_text.delta",
                item_id: message.id,
                output_index: message.outputIndex,
                content_index: 0,
                delta: part.text,
              };
              emitChunk(chunk);
              break;
            }
            case "text-end":
              completeMessage(part.id);
              break;
            case "tool-input-start":
              if (!part.providerExecuted) {
                ensureTool(part.id, part.toolName);
              }
              break;
            case "tool-input-delta": {
              const toolMeta = activeTools.get(part.id);
              if (!toolMeta) break;
              toolMeta.input += part.delta;
              const chunk:
                | OpenAIResponsesFunctionCallArgumentsDeltaChunk
                | OpenAIResponsesCustomToolCallInputDeltaChunk =
                toolMeta.kind === "custom"
                  ? {
                      type: "response.custom_tool_call_input.delta",
                      item_id: toolMeta.itemId,
                      output_index: toolMeta.outputIndex,
                      delta: part.delta,
                    }
                  : {
                      type: "response.function_call_arguments.delta",
                      item_id: toolMeta.itemId,
                      output_index: toolMeta.outputIndex,
                      delta: part.delta,
                    };
              emitChunk(chunk);
              break;
            }
            case "tool-call":
              if (!part.providerExecuted) {
                const toolMeta = ensureTool(part.toolCallId, part.toolName);
                completeTool(
                  part.toolCallId,
                  part.toolName,
                  normalizeToolInput(part.input) || toolMeta.input
                );
              }
              break;
            default:
              break;
          }
        }
      } catch (error) {
        controller.error(error);
        return;
      }

      for (const textId of [...activeMessages.keys()]) {
        completeMessage(textId);
      }

      let usage: UpstreamUsage | undefined;
      try {
        usage = await usagePromise;
      } catch {
        usage = undefined;
      }

      const output = completedOutputItems
        .sort((left, right) => left.outputIndex - right.outputIndex)
        .map((entry) => entry.item);
      const outputText = output
        .flatMap((item) => {
          if (item.type !== "message") return [];
          return item.content.map((part) => part.text);
        })
        .join("");

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
          output,
          output_text: outputText,
          usage: buildResponsesUsage(usage),
        },
      };

      emitChunk(completedChunk);
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
