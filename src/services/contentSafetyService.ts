let cachedRaw: string | undefined;
let cachedTerms: string[] = [];

function parseBlocklist(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

function resolveTerms() {
  const raw = process.env.CONTENT_BLOCKLIST;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedTerms = parseBlocklist(raw);
  }
  return cachedTerms;
}

export function isContentBlocked(text: string) {
  const terms = resolveTerms();
  if (!terms.length) return false;
  if (!text) return false;
  const lowered = text.toLowerCase();
  return terms.some((term) => lowered.includes(term));
}
