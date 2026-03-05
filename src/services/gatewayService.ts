import type { UpstreamRequestParams } from "./upstreamService";

export type ClientFormat = "openai" | "anthropic";

export type GatewayRequestParams = UpstreamRequestParams & {
  model: string;
};

export async function handleRequest(
  _requestParams: GatewayRequestParams,
  _clientFormat: ClientFormat
) {
  return {
    status: 501,
    body: { error: { message: "Not implemented" } },
  };
}
