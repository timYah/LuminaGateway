import { describe, expect, it } from "vitest";
import {
  convertToolSchemas,
  convertToolChoice,
  convertToolUseResults,
  type AnthropicToolChoice,
  type AnthropicToolUse,
  type OpenAIToolCall,
} from "../protocolConverter";
import type { OpenAIChatCompletionRequest } from "../../types/openai";
import type { AnthropicMessagesRequest } from "../../types/anthropic";

describe("protocolConverter (tools)", () => {
  it("converts tool schemas between OpenAI and Anthropic", () => {
    const openaiTools: OpenAIChatCompletionRequest["tools"] = [
      {
        type: "function",
        function: {
          name: "lookup",
          description: "Lookup",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ];

    const anthropic = convertToolSchemas(
      openaiTools,
      "openai",
      "anthropic"
    ) as AnthropicMessagesRequest["tools"];
    expect(anthropic?.[0]?.name).toBe("lookup");
    expect(anthropic?.[0]?.input_schema).toMatchObject({
      type: "object",
      properties: { q: { type: "string" } },
    });

    const openaiBack = convertToolSchemas(
      anthropic,
      "anthropic",
      "openai"
    ) as OpenAIChatCompletionRequest["tools"];
    expect(openaiBack?.[0]?.type).toBe("function");
    expect(openaiBack?.[0]?.function.name).toBe("lookup");
  });

  it("converts tool choice between formats", () => {
    expect(convertToolChoice("auto", "openai", "anthropic")).toEqual({
      type: "auto",
    });
    expect(convertToolChoice("none", "openai", "anthropic")).toEqual({
      type: "none",
    });
    expect(
      convertToolChoice(
        { type: "function", function: { name: "lookup" } },
        "openai",
        "anthropic"
      )
    ).toEqual({ type: "tool", name: "lookup" });

    const anthropicChoice: AnthropicToolChoice = { type: "tool", name: "search" };
    expect(convertToolChoice(anthropicChoice, "anthropic", "openai")).toEqual({
      type: "function",
      function: { name: "search" },
    });
  });

  it("converts tool use results between formats", () => {
    const openaiCalls: OpenAIToolCall[] = [
      {
        id: "call_1",
        type: "function",
        function: { name: "lookup", arguments: "{\"q\":\"test\"}" },
      },
    ];
    const anthropic = convertToolUseResults(
      openaiCalls,
      "openai",
      "anthropic"
    ) as AnthropicToolUse[];
    expect(anthropic[0].name).toBe("lookup");
    expect(anthropic[0].input).toMatchObject({ q: "test" });

    const openaiBack = convertToolUseResults(
      anthropic,
      "anthropic",
      "openai"
    ) as OpenAIToolCall[];
    expect(openaiBack[0].function.name).toBe("lookup");
    expect(openaiBack[0].function.arguments).toBe("{\"q\":\"test\"}");
  });
});
