const OPENAI_MODEL_PREFIX = "openai/";

export function normalizeOpenAiCompatibleModelSlug(
  modelSlug: string | null | undefined
) {
  const trimmed = modelSlug?.trim() ?? "";
  if (!trimmed) return "";
  if (!trimmed.startsWith(OPENAI_MODEL_PREFIX)) {
    return trimmed;
  }
  return trimmed.slice(OPENAI_MODEL_PREFIX.length).trim();
}

export function normalizeOptionalOpenAiCompatibleModelSlug(
  modelSlug: string | null | undefined
) {
  const normalized = normalizeOpenAiCompatibleModelSlug(modelSlug);
  return normalized || null;
}

export function normalizeOpenAiCompatibleModelPayload<T extends Record<string, unknown>>(
  payload: T
) {
  if (typeof payload.model !== "string") {
    return payload;
  }

  const normalizedModel = normalizeOpenAiCompatibleModelSlug(payload.model);
  if (!normalizedModel || normalizedModel === payload.model) {
    return payload;
  }

  return {
    ...payload,
    model: normalizedModel,
  } as T;
}

