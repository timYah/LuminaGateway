import { describe, expect, it, vi } from "vitest";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { normalizeOpenAiBaseUrl, wrapNewApiFetch } from "../aiSdkFactory";

const buildFetch = () =>
  vi.fn(async () => {
    return { ok: true } as Response;
  });

describe("wrapNewApiFetch", () => {
  it("injects message type for responses input items missing type", async () => {
    const baseFetch = buildFetch();
    const wrapped = wrapNewApiFetch(baseFetch as unknown as FetchFunction);
    const body = JSON.stringify({
      model: "gpt-5.2",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "hi" }],
        },
      ],
    });

    await wrapped("https://right.codes/openai/v1/responses", { method: "POST", body });

    const calls = baseFetch.mock.calls as unknown as Array<
      [unknown, { body?: string }?]
    >;
    const sentInit = calls[0]?.[1];
    const sentBody = sentInit?.body as string;
    const parsed = JSON.parse(sentBody);
    expect(parsed.input[0].type).toBe("message");
  });

  it("does not modify responses input when type is present", async () => {
    const baseFetch = buildFetch();
    const wrapped = wrapNewApiFetch(baseFetch as unknown as FetchFunction);
    const body = JSON.stringify({
      model: "gpt-5.2",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hi" }],
        },
      ],
    });

    await wrapped("https://right.codes/openai/v1/responses", { method: "POST", body });

    const calls = baseFetch.mock.calls as unknown as Array<
      [unknown, { body?: string }?]
    >;
    const sentInit = calls[0]?.[1];
    const sentBody = sentInit?.body as string;
    expect(sentBody).toBe(body);
  });

  it("ignores non-responses requests", async () => {
    const baseFetch = buildFetch();
    const wrapped = wrapNewApiFetch(baseFetch as unknown as FetchFunction);
    const body = JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });

    await wrapped("https://example.com/v1/chat/completions", { method: "POST", body });

    const calls = baseFetch.mock.calls as unknown as Array<
      [unknown, { body?: string }?]
    >;
    const sentInit = calls[0]?.[1];
    const sentBody = sentInit?.body as string;
    expect(sentBody).toBe(body);
  });
});

describe("normalizeOpenAiBaseUrl", () => {
  it("appends /v1 when missing", () => {
    expect(normalizeOpenAiBaseUrl("https://api.openai.com")).toBe(
      "https://api.openai.com/v1"
    );
  });

  it("preserves /v1 and strips endpoint suffixes", () => {
    expect(normalizeOpenAiBaseUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1"
    );
    expect(normalizeOpenAiBaseUrl("https://api.openai.com/v1/responses")).toBe(
      "https://api.openai.com/v1"
    );
    expect(normalizeOpenAiBaseUrl("https://api.openai.com/openai/v1/chat/completions")).toBe(
      "https://api.openai.com/openai/v1"
    );
  });
});
