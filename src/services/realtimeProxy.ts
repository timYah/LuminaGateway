import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { ServerType } from "@hono/node-server";
import type { Provider } from "../db/schema/providers";
import { parseKeyList, normalizeAuthToken } from "../utils/auth";
import { generateRequestId } from "../utils/requestId";
import { estimateUsage } from "./requestEstimator";
import { tokenRateLimiter } from "./tokenRateLimiter";
import { groupQuotaTracker, keyQuotaTracker, userQuotaTracker } from "./quotaService";
import { recordUsage } from "./usageSummaryService";
import { gatewayCircuitBreaker, gatewayRouter } from "./gatewayService";
import { gatewayInflightLimiter } from "./inflightService";
import { applyProviderFailurePolicy } from "./providerFailurePolicy";
import { classifyUpstreamError, getUpstreamErrorMessage } from "./upstreamService";
import { recordFailure } from "./failureStatsService";
import { resolveJwtConfig, verifyJwt, extractJwtIdentity } from "./jwtService";
import { activeRequestService } from "./activeRequestService";
import { createRequestLog } from "./requestLogService";
import { normalizeOpenAiBaseUrl } from "./aiSdkFactory";
import { normalizeOpenAiCompatibleModelSlug } from "./modelSlug";

const REALTIME_PATHS = new Set([
  "/openai/v1/realtime",
  "/convert/openai/v1/realtime",
]);

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
]);

const WS_HEADER_BLOCKLIST = new Set([
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-accept",
  "sec-websocket-protocol",
]);

function isOpenAiCandidate(provider: Provider) {
  return provider.protocol === "openai" || provider.protocol === "new-api";
}

function buildRealtimeUpstreamUrl(provider: Provider, requestUrl: URL) {
  const upstreamUrl = new URL(`${normalizeOpenAiBaseUrl(provider.baseUrl)}/realtime`);
  upstreamUrl.search = requestUrl.search;
  const url = new URL(upstreamUrl.toString());
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  return url.toString();
}

function buildRealtimeHeaders(source: IncomingMessage["headers"], apiKey: string) {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value) continue;
    const normalizedKey = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalizedKey) ||
      WS_HEADER_BLOCKLIST.has(normalizedKey) ||
      normalizedKey === "authorization"
    ) {
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(",") : value;
  }
  headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

function writeHttpError(socket: Socket, status: number, message: string) {
  const body = JSON.stringify({ error: { message } });
  const response = `HTTP/1.1 ${status} ${message}\r\n` +
    "Content-Type: application/json\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    "Connection: close\r\n\r\n" +
    body;
  socket.write(response);
  socket.destroy();
}

function resolveGatewayToken(authHeader: string | undefined) {
  const token = normalizeAuthToken(authHeader);
  const expectedKeys = new Set([
    ...parseKeyList(process.env.GATEWAY_API_KEYS),
    normalizeAuthToken(process.env.GATEWAY_API_KEY),
  ]);
  if (!token || !expectedKeys.has(token)) {
    return "";
  }
  return token;
}

async function recordRequestLogSafe(input: Parameters<typeof createRequestLog>[0]) {
  try {
    await createRequestLog(input);
  } catch (error) {
    console.error("[realtime] request log failed", error);
  }
}

function waitForWebSocketOpen(socket: WebSocket) {
  return new Promise<WebSocket>((resolve, reject) => {
    const cleanup = () => {
      socket.off("open", handleOpen);
      socket.off("error", handleError);
      socket.off("unexpected-response", handleUnexpected);
    };
    const handleOpen = () => {
      cleanup();
      resolve(socket);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleUnexpected = (_req: unknown, res: IncomingMessage) => {
      cleanup();
      const error = new Error(`Unexpected response: ${res.statusCode}`);
      (error as { status?: number }).status = res.statusCode ?? 0;
      reject(error);
    };
    socket.once("open", handleOpen);
    socket.once("error", handleError);
    socket.once("unexpected-response", handleUnexpected);
  });
}

function setupWebSocketProxy(options: {
  client: WebSocket;
  upstream: WebSocket;
  provider: Provider;
  requestId: string;
  modelSlug: string;
  startedAt: number;
}) {
  const { client, upstream, provider, requestId, modelSlug, startedAt } = options;
  let closed = false;

  const finalize = async (
    result: "success" | "failure",
    errorType?: ReturnType<typeof classifyUpstreamError>
  ) => {
    if (closed) return;
    closed = true;
    gatewayInflightLimiter.release(provider.id);
    activeRequestService.finishRequest(requestId);
    await recordRequestLogSafe({
      providerId: provider.id,
      requestId,
      modelSlug,
      result,
      errorType,
      latencyMs: Date.now() - startedAt,
    });
  };

  client.on("message", (data: RawData) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data);
    }
  });

  upstream.on("message", (data: RawData) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });

  const handleError = async (error: Error) => {
    const errorType = classifyUpstreamError(error);
    const message = getUpstreamErrorMessage(error);
    activeRequestService.failAttempt({
      requestId,
      providerId: provider.id,
      errorType,
    });
    recordFailure(provider.id, errorType);
    await applyProviderFailurePolicy({
      breaker: gatewayCircuitBreaker,
      providerId: provider.id,
      modelSlug,
      errorType,
    });
    console.warn("[realtime] upstream error after open", {
      providerId: provider.id,
      providerName: provider.name,
      errorType,
      message,
    });
    await finalize("failure", errorType);
    try {
      client.close(1011, "Upstream error");
    } catch {
      client.terminate();
    }
    try {
      upstream.close(1011, "Upstream error");
    } catch {
      upstream.terminate();
    }
  };

  client.on("error", handleError);
  upstream.on("error", handleError);

  client.on("close", async () => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.close();
    } else {
      upstream.terminate();
    }
    await finalize("success");
  });

  upstream.on("close", async () => {
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    } else {
      client.terminate();
    }
    await finalize("success");
  });
}

async function handleUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  wss: WebSocketServer
) {
  const host = req.headers.host ?? "localhost";
  const requestUrl = new URL(req.url ?? "", `http://${host}`);
  if (!REALTIME_PATHS.has(requestUrl.pathname)) {
    socket.destroy();
    return;
  }

  const modelSlug = normalizeOpenAiCompatibleModelSlug(
    requestUrl.searchParams.get("model")
  );
  if (!modelSlug) {
    writeHttpError(socket, 400, "Missing model");
    return;
  }
  requestUrl.searchParams.set("model", modelSlug);

  const authToken = resolveGatewayToken(req.headers.authorization);
  if (!authToken) {
    writeHttpError(socket, 401, "Unauthorized");
    return;
  }

  const jwtConfig = resolveJwtConfig();
  let jwtIdentity: { userId: string; groups: string[] } | null = null;
  if (jwtConfig.enabled) {
    const headerValue = req.headers[jwtConfig.header.toLowerCase()];
    const jwtToken = normalizeAuthToken(
      Array.isArray(headerValue) ? headerValue[0] : headerValue
    );
    const jwtVerification = jwtToken ? verifyJwt(jwtToken, jwtConfig.secret) : null;
    if (!jwtToken || !jwtVerification?.ok) {
      writeHttpError(socket, 401, "Unauthorized");
      return;
    }
    const identity = extractJwtIdentity(
      jwtVerification.payload,
      jwtConfig.userClaim,
      jwtConfig.groupClaim
    );
    if (!identity.userId) {
      writeHttpError(socket, 401, "Unauthorized");
      return;
    }
    jwtIdentity = identity;
  }

  const usageEstimate = estimateUsage("openai-responses", { model: modelSlug, input: [] });
  const tokenLimit = tokenRateLimiter.consume(authToken, usageEstimate.totalTokens);
  if (!tokenLimit.allowed) {
    writeHttpError(socket, 429, "Token rate limit exceeded");
    return;
  }

  const quota = keyQuotaTracker.canConsume(authToken, usageEstimate);
  if (!quota.allowed) {
    writeHttpError(socket, 429, "Quota exceeded");
    return;
  }

  if (jwtIdentity?.userId) {
    const userQuota = userQuotaTracker.canConsume(jwtIdentity.userId, usageEstimate);
    if (!userQuota.allowed) {
      writeHttpError(socket, 429, "User quota exceeded");
      return;
    }
    for (const group of jwtIdentity.groups) {
      const groupQuota = groupQuotaTracker.canConsume(group, usageEstimate);
      if (!groupQuota.allowed) {
        writeHttpError(socket, 429, "Group quota exceeded");
        return;
      }
    }
  }

  keyQuotaTracker.consume(authToken, usageEstimate);
  if (jwtIdentity?.userId) {
    userQuotaTracker.consume(jwtIdentity.userId, usageEstimate);
    for (const group of jwtIdentity.groups) {
      groupQuotaTracker.consume(group, usageEstimate);
    }
  }

  recordUsage({
    apiKey: authToken,
    route: requestUrl.pathname,
    totalTokens: usageEstimate.totalTokens,
    estimatedCostUsd: usageEstimate.estimatedCostUsd,
  });

  const requestId = generateRequestId();
  activeRequestService.startRequest({
    requestId,
    path: requestUrl.pathname,
    modelSlug,
  });

  const candidates = (await gatewayRouter.getAllCandidates(modelSlug)).filter(isOpenAiCandidate);
  if (candidates.length === 0) {
    activeRequestService.finishRequest(requestId);
    writeHttpError(socket, 503, "No provider available");
    return;
  }

  for (const provider of candidates) {
    if (!gatewayInflightLimiter.tryAcquire(provider.id, provider.name)) {
      continue;
    }

    activeRequestService.startAttempt({
      requestId,
      providerId: provider.id,
      providerName: provider.name,
    });

    const startedAt = Date.now();
    const upstreamUrl = buildRealtimeUpstreamUrl(provider, requestUrl);
    const upstream = new WebSocket(upstreamUrl, {
      headers: buildRealtimeHeaders(req.headers, provider.apiKey),
    });

    try {
      await waitForWebSocketOpen(upstream);
      wss.handleUpgrade(req, socket, head, (client: WebSocket) => {
        setupWebSocketProxy({
          client,
          upstream,
          provider,
          requestId,
          modelSlug,
          startedAt,
        });
      });
      return;
    } catch (error) {
      upstream.terminate();
      gatewayInflightLimiter.release(provider.id);

      const errorType = classifyUpstreamError(error);
      const message = getUpstreamErrorMessage(error);

      activeRequestService.failAttempt({
        requestId,
        providerId: provider.id,
        errorType,
      });
      recordFailure(provider.id, errorType);
      await recordRequestLogSafe({
        providerId: provider.id,
        requestId,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - startedAt,
      });

      const shouldFailover = await applyProviderFailurePolicy({
        breaker: gatewayCircuitBreaker,
        providerId: provider.id,
        modelSlug,
        errorType,
      });
      if (shouldFailover) {
        continue;
      }

      activeRequestService.finishRequest(requestId);
      writeHttpError(socket, 502, message || "Upstream error");
      return;
    }
  }

  activeRequestService.finishRequest(requestId);
  writeHttpError(socket, 503, "No provider available");
}

export function attachRealtimeProxy(server: ServerType) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    void handleUpgrade(req, socket, head, wss);
  });
}
