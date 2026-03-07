import { Hono } from "hono";
import {
  convertOpenAIResponsesToUniversal,
  convertOpenAIToUniversal,
} from "../services/protocolConverter";
import {
  openaiChatCompletionSchema,
  openaiResponsesSchema,
} from "../types/validators";
import { createProtocolRoute } from "./protocolRoute";

const app = new Hono();

app.route(
  "/",
  createProtocolRoute({
    path: "/v1/chat/completions",
    schema: openaiChatCompletionSchema,
    converter: convertOpenAIToUniversal,
    clientFormat: "openai",
  })
);

app.route(
  "/",
  createProtocolRoute({
    path: "/v1/responses",
    schema: openaiResponsesSchema,
    converter: convertOpenAIResponsesToUniversal,
    clientFormat: "openai-responses",
  })
);

export const openaiRoutes = app;
