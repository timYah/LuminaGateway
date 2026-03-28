import { describe, expect, it } from "vitest";
import {
  normalizeOpenAiCompatibleModelPayload,
  normalizeOpenAiCompatibleModelSlug,
  normalizeOptionalOpenAiCompatibleModelSlug,
} from "../modelSlug";

describe("modelSlug", () => {
  it("keeps bare model slugs unchanged", () => {
    expect(normalizeOpenAiCompatibleModelSlug("gpt-5.4")).toBe("gpt-5.4");
  });

  it("strips the openai prefix once", () => {
    expect(normalizeOpenAiCompatibleModelSlug("openai/gpt-5.4")).toBe("gpt-5.4");
    expect(normalizeOpenAiCompatibleModelSlug("openai/openai/gpt-5.4")).toBe(
      "openai/gpt-5.4"
    );
  });

  it("leaves non-openai provider prefixes unchanged", () => {
    expect(normalizeOpenAiCompatibleModelSlug("anthropic/claude-sonnet-4")).toBe(
      "anthropic/claude-sonnet-4"
    );
  });

  it("normalizes optional values and payload models", () => {
    expect(normalizeOptionalOpenAiCompatibleModelSlug(" openai/gpt-5.4 ")).toBe("gpt-5.4");
    expect(normalizeOptionalOpenAiCompatibleModelSlug("   ")).toBeNull();
    expect(
      normalizeOpenAiCompatibleModelPayload({
        model: "openai/gpt-5.4",
        temperature: 0.2,
      })
    ).toEqual({
      model: "gpt-5.4",
      temperature: 0.2,
    });
  });
});

