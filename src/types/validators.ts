import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

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
    parameters: jsonObjectSchema.optional(),
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

const openaiResponsesFunctionToolSchema = z
  .object({
    type: z.literal("function"),
    name: z.string(),
    description: z.string().optional(),
    parameters: jsonObjectSchema.optional(),
    strict: z.boolean().optional(),
  })
  .passthrough();

const openaiResponsesCustomToolSchema = z
  .object({
    type: z.literal("custom"),
    name: z.string(),
    description: z.string().optional(),
    format: jsonObjectSchema,
  })
  .passthrough();

const openaiResponsesWebSearchToolSchema = z
  .object({
    type: z.literal("web_search"),
    external_web_access: z.boolean().optional(),
    filters: z
      .object({
        allowed_domains: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    search_context_size: z.string().optional(),
    user_location: jsonObjectSchema.optional(),
  })
  .passthrough();

const openaiResponsesWebSearchPreviewToolSchema = z
  .object({
    type: z.literal("web_search_preview"),
    search_context_size: z.string().optional(),
    user_location: jsonObjectSchema.optional(),
  })
  .passthrough();

const openaiResponsesApplyPatchToolSchema = z
  .object({
    type: z.literal("apply_patch"),
  })
  .passthrough();

const openaiResponsesToolSchema = z.union([
  openaiToolSchema,
  openaiResponsesFunctionToolSchema,
  openaiResponsesCustomToolSchema,
  openaiResponsesWebSearchToolSchema,
  openaiResponsesWebSearchPreviewToolSchema,
  openaiResponsesApplyPatchToolSchema,
]);

const openaiResponsesToolChoiceSchema = z.union([
  z.literal("auto"),
  z.literal("none"),
  z.literal("required"),
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
    }),
  }),
  z.object({
    type: z.literal("function"),
    name: z.string(),
  }),
  z.object({
    type: z.literal("custom"),
    name: z.string(),
  }),
  z.object({
    type: z.literal("web_search"),
  }),
  z.object({
    type: z.literal("web_search_preview"),
  }),
  z.object({
    type: z.literal("apply_patch"),
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
  tools: z.array(openaiResponsesToolSchema).optional(),
  tool_choice: openaiResponsesToolChoiceSchema.optional(),
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
