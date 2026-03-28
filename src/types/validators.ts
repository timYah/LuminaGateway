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

const openaiResponsesOutputTextPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});

const openaiResponsesMessageOutputSchema = z.object({
  id: z.string(),
  type: z.literal("message"),
  role: z.literal("assistant"),
  status: z.literal("completed"),
  phase: z.enum(["commentary", "final_answer"]).nullable().optional(),
  content: z.array(openaiResponsesOutputTextPartSchema),
});

const openaiResponsesOutputItemSchema = z.union([
  openaiResponsesMessageOutputSchema,
  z
    .object({
      id: z.string(),
      type: z.literal("function_call"),
      call_id: z.string(),
      name: z.string(),
      arguments: z.string(),
      status: z.literal("completed"),
    })
    .passthrough(),
  z
    .object({
      id: z.string(),
      type: z.literal("custom_tool_call"),
      call_id: z.string(),
      name: z.string(),
      input: z.string(),
      status: z.literal("completed"),
    })
    .passthrough(),
]);

const openaiResponsesUsageSchema = z.object({
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  total_tokens: z.number().int(),
  input_tokens_details: z
    .object({
      cached_tokens: z.number().int().optional(),
    })
    .optional(),
  output_tokens_details: z
    .object({
      reasoning_tokens: z.number().int().optional(),
    })
    .optional(),
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

export const openaiResponsesResponseSchema = z
  .object({
    id: z.string(),
    object: z.literal("response"),
    created_at: z.number().int().optional(),
    status: z.string().optional(),
    model: z.string().optional(),
    error: z.null().optional(),
    incomplete_details: z.null().optional(),
    output: z.array(openaiResponsesOutputItemSchema).optional(),
    output_text: z.string(),
    usage: openaiResponsesUsageSchema.optional(),
  })
  .passthrough();

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

const anthropicContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

export const anthropicMessagesResponseSchema = z
  .object({
    id: z.string(),
    type: z.literal("message"),
    role: z.literal("assistant"),
    content: z.array(anthropicContentBlockSchema),
    model: z.string(),
    stop_reason: z.string().nullable().optional(),
    usage: z
      .object({
        input_tokens: z.number().int(),
        output_tokens: z.number().int(),
      })
      .optional(),
  })
  .passthrough();

const geminiPartSchema = z.object({
  text: z.string().optional(),
});

const geminiContentSchema = z
  .object({
    role: z.enum(["user", "model", "system"]).optional(),
    parts: z.array(geminiPartSchema),
  })
  .passthrough();

export const geminiGenerateContentSchema = z
  .object({
    contents: z.array(geminiContentSchema),
    systemInstruction: z
      .union([geminiContentSchema, z.object({ parts: z.array(geminiPartSchema) })])
      .optional(),
    tools: z.array(z.record(z.string(), z.unknown())).optional(),
    toolConfig: z.record(z.string(), z.unknown()).optional(),
    safetySettings: z.array(z.record(z.string(), z.unknown())).optional(),
    generationConfig: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const geminiCandidateSchema = z
  .object({
    content: geminiContentSchema,
    finishReason: z.string().optional(),
    index: z.number().int().optional(),
  })
  .passthrough();

export const geminiGenerateContentResponseSchema = z
  .object({
    candidates: z.array(geminiCandidateSchema),
    usageMetadata: z
      .object({
        promptTokenCount: z.number().int().optional(),
        candidatesTokenCount: z.number().int().optional(),
        totalTokenCount: z.number().int().optional(),
      })
      .optional(),
    modelVersion: z.string().optional(),
  })
  .passthrough();
