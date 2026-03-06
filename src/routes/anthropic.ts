import { anthropicMessagesSchema } from "../types/validators";
import { convertAnthropicToUniversal } from "../services/protocolConverter";
import { createProtocolRoute } from "./protocolRoute";

export const anthropicRoutes = createProtocolRoute({
  path: "/v1/messages",
  schema: anthropicMessagesSchema,
  converter: convertAnthropicToUniversal,
  clientFormat: "anthropic",
});
