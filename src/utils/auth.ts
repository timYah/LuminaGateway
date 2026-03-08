export function normalizeAuthToken(raw: string | undefined) {
  let value = (raw ?? "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower.startsWith("authorization:")) {
    value = value.slice("authorization:".length).trim();
  }
  if (value.toLowerCase().startsWith("bearer ")) {
    value = value.slice("bearer ".length).trim();
  }

  const match = value.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/i);
  if (match && match[1].toUpperCase() === "GATEWAY_API_KEY") {
    value = match[2].trim();
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

export function parseKeyList(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((value) => normalizeAuthToken(value))
    .filter((value) => value.length > 0);
}
