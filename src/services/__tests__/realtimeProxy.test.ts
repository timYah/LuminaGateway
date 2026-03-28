import { createAdaptorServer } from "@hono/node-server";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../requestLogService", () => ({
  createRequestLog: vi.fn(async () => null),
}));
import { createApp } from "../../app";
import { attachRealtimeProxy } from "../realtimeProxy";
import { gatewayRouter } from "../gatewayService";

process.env.GATEWAY_API_KEY = "test-key";

describe("realtime proxy", () => {
  const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");
  let lastUpstreamPath = "";

  beforeEach(() => {
    getAllCandidatesSpy.mockReset();
    lastUpstreamPath = "";
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("proxies websocket messages to upstream", async () => {
    const upstreamServer = new WebSocketServer({ port: 0 });
    upstreamServer.on("connection", (ws, req) => {
      lastUpstreamPath = req.url ?? "";
      ws.on("message", (data) => {
        ws.send(data);
      });
    });

    const upstreamPort = (upstreamServer.address() as { port: number }).port;

    getAllCandidatesSpy.mockResolvedValue([
      {
        id: 1,
        name: "Realtime",
        protocol: "openai" as const,
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        apiKey: "sk-upstream",
        apiMode: "responses" as const,
        codexTransform: false,
        balance: 0,
        inputPrice: null,
        outputPrice: null,
        isActive: true,
        priority: 1,
        healthCheckModel: null,
        healthStatus: "unknown" as const,
        lastHealthCheckAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const app = createApp();
    const server = createAdaptorServer({ fetch: app.fetch });
    attachRealtimeProxy(server);

    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });

    const port = (server.address() as { port: number }).port;

    const client = new WebSocket(
      `ws://127.0.0.1:${port}/openai/v1/realtime?model=openai/gpt-4o-realtime-preview`,
      {
        headers: {
          Authorization: "Bearer test-key",
        },
      }
    );

    const messagePromise = new Promise<string>((resolve, reject) => {
      client.on("message", (data) => resolve(data.toString()));
      client.on("error", (err) => reject(err));
    });

    await new Promise<void>((resolve) => {
      client.on("open", () => resolve());
    });

    client.send("ping");

    await expect(messagePromise).resolves.toBe("ping");
    expect(getAllCandidatesSpy).toHaveBeenCalledWith("gpt-4o-realtime-preview");
    expect(lastUpstreamPath).toContain("model=gpt-4o-realtime-preview");
    expect(lastUpstreamPath).not.toContain("model=openai%2Fgpt-4o-realtime-preview");

    client.close();
    upstreamServer.close();
    server.close();
  });
});
