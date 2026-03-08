import { createHmac, timingSafeEqual } from "node:crypto";

type JwtPayload = Record<string, unknown>;

type JwtConfig = {
  enabled: boolean;
  secret: string;
  header: string;
  userClaim: string;
  groupClaim: string;
};

export type JwtIdentity = {
  userId: string;
  groups: string[];
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function parseJsonSegment(segment: string) {
  try {
    return JSON.parse(decodeBase64Url(segment)) as unknown;
  } catch {
    return null;
  }
}

export function resolveJwtConfig(): JwtConfig {
  const secret = (process.env.JWT_SECRET ?? "").trim();
  const headerRaw = (process.env.JWT_HEADER ?? "X-User-Token").trim();
  const userClaimRaw = (process.env.JWT_USER_CLAIM ?? "sub").trim();
  const groupClaimRaw = (process.env.JWT_GROUP_CLAIM ?? "groups").trim();
  return {
    enabled: Boolean(secret),
    secret,
    header: headerRaw || "X-User-Token",
    userClaim: userClaimRaw || "sub",
    groupClaim: groupClaimRaw || "groups",
  };
}

export function verifyJwt(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false } as const;
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parseJsonSegment(headerPart);
  if (!header || typeof header !== "object") return { ok: false } as const;
  const alg = (header as { alg?: unknown }).alg;
  if (alg !== "HS256") return { ok: false } as const;
  const payload = parseJsonSegment(payloadPart);
  if (!payload || typeof payload !== "object") return { ok: false } as const;

  const data = `${headerPart}.${payloadPart}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  if (signaturePart.length !== expected.length) return { ok: false } as const;
  const matches = timingSafeEqual(Buffer.from(signaturePart), Buffer.from(expected));
  if (!matches) return { ok: false } as const;

  const now = Math.floor(Date.now() / 1000);
  const exp = (payload as { exp?: unknown }).exp;
  if (typeof exp === "number" && Number.isFinite(exp) && now >= exp) {
    return { ok: false } as const;
  }
  const nbf = (payload as { nbf?: unknown }).nbf;
  if (typeof nbf === "number" && Number.isFinite(nbf) && now < nbf) {
    return { ok: false } as const;
  }

  return { ok: true, payload: payload as JwtPayload } as const;
}

export function extractJwtIdentity(
  payload: JwtPayload,
  userClaim: string,
  groupClaim: string
): JwtIdentity {
  const rawUser = payload[userClaim];
  const userId =
    typeof rawUser === "string"
      ? rawUser.trim()
      : typeof rawUser === "number"
        ? String(rawUser)
        : "";

  const rawGroups = payload[groupClaim];
  const groups: string[] = [];
  if (typeof rawGroups === "string") {
    if (rawGroups.trim()) groups.push(rawGroups.trim());
  } else if (Array.isArray(rawGroups)) {
    for (const entry of rawGroups) {
      if (typeof entry === "string" && entry.trim()) groups.push(entry.trim());
      if (typeof entry === "number") groups.push(String(entry));
    }
  }

  return { userId, groups: Array.from(new Set(groups)) };
}
