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
    parameters: z.record(z.string(), z.unknown()).optional(),
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

const openaiResponsesTextPartSchema = z.object({
  type: z.enum(["input_text", "output_text"]),
  text: z.string(),
});

const openaiResponsesMessageSchema = z.object({
  type: z.literal("message").optional(),
  role: z.enum(["system", "developer", "user", "assistant"]),
  content: z.union([z.string(), z.array(openaiResponsesTextPartSchema)]),
  id: z.string().optional(),
  phase: z.enum(["commentary", "final_answer"]).nullable().optional(),
});

const openaiResponsesFunctionCallOutputSchema = z.object({
  type: z.literal("function_call_output"),
  call_id: z.string(),
  output: z.union([z.string(), z.array(openaiResponsesTextPartSchema)]),
});

export const openaiChatCompletionSchema = z.object({
  model: z.string(),
  messages: z.array(openaiMessageSchema),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().int().optional(),
  tools: z.array(openaiToolSchema).optional(),
  tool_choice: openaiToolChoiceSchema.optional(),
});

export const openaiResponsesSchema = z.object({
  model: z.string(),
  input: z.union([
    z.string(),
    z.array(
      z.union([
        openaiResponsesMessageSchema,
        openaiResponsesFunctionCallOutputSchema,
      ])
    ),
  ]),
  instructions: z.string().optional(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  max_output_tokens: z.number().int().optional(),
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
  input_schema: z.record(z.string(), z.unknown()).optional(),
});

export const anthropicMessagesSchema = z.object({
  model: z.string(),
  messages: z.array(anthropicMessageSchema),
  system: z.string().optional(),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().optional(),
  temperature: z.number().optional(),
  tools: z.array(anthropicToolSchema).optional(),
});
