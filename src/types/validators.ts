import { z } from "zod";

const openaiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

const openaiToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.unknown()).optional(),
  }),
});

const openaiToolChoiceSchema = z.union([
  z.literal("auto"),
  z.literal("none"),
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
    }),
  }),
]);

export const openaiChatCompletionSchema = z.object({
  model: z.string(),
  messages: z.array(openaiMessageSchema),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().int().optional(),
  tools: z.array(openaiToolSchema).optional(),
  tool_choice: openaiToolChoiceSchema.optional(),
});

const anthropicMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const anthropicToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: z.record(z.unknown()).optional(),
});

export const anthropicMessagesSchema = z.object({
  model: z.string(),
  messages: z.array(anthropicMessageSchema),
  system: z.string().optional(),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().optional(),
  tools: z.array(anthropicToolSchema).optional(),
});
