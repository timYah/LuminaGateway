import { openaiChatCompletionSchema } from "../types/validators";
import { convertOpenAIToUniversal } from "../services/protocolConverter";
import { createProtocolRoute } from "./protocolRoute";

export const openaiRoutes = createProtocolRoute({
  path: "/v1/chat/completions",
  schema: openaiChatCompletionSchema,
  converter: convertOpenAIToUniversal,
  clientFormat: "openai",
});
