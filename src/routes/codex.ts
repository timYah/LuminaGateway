import { createProtocolRoute } from "./protocolRoute";
import { convertOpenAIResponsesToUniversal } from "../services/protocolConverter";
import { openaiResponsesSchema } from "../types/validators";

export const codexRoutes = createProtocolRoute({
  path: "/codex/responses",
  schema: openaiResponsesSchema,
  converter: convertOpenAIResponsesToUniversal,
  clientFormat: "openai-responses",
});
