// http.ts – Fetch price from backend and POST signal. Used by perps-signals CRE workflow.

import {
  cre,
  ok,
  consensusIdenticalAggregation,
  type Runtime,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import type { PerpsConfig, PriceResponse, CreSignalBody } from "./types";

function getPriceRequest(sendRequester: HTTPSendRequester, config: PerpsConfig): PriceResponse {
  const url = `${config.backendBaseUrl.replace(/\/$/, "")}/api/perps/price`;
  const req = { url, method: "GET" as const, cacheSettings: { readFromCache: true, maxAgeMs: 10_000 } };
  const resp = sendRequester.sendRequest(req).result();
  const bodyText = new TextDecoder().decode(resp.body);
  if (!ok(resp)) throw new Error(`GET price failed: ${resp.statusCode} ${bodyText}`);
  return JSON.parse(bodyText) as PriceResponse;
}

function postSignalRequest(body: CreSignalBody) {
  return (sendRequester: HTTPSendRequester, config: PerpsConfig): { ok: boolean } => {
    const url = `${config.backendBaseUrl.replace(/\/$/, "")}/api/perps/cre-signal`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.creWebhookSecret) headers["X-CRE-Secret"] = config.creWebhookSecret;
    const req = {
      url,
      method: "POST" as const,
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
      headers,
    };
    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);
    if (!ok(resp)) throw new Error(`POST cre-signal failed: ${resp.statusCode} ${bodyText}`);
    return { ok: true };
  };
}

/** Fetch latest price from Marshmallow backend (aggregated across CRE nodes). */
export function fetchPrice(runtime: Runtime<PerpsConfig>): PriceResponse {
  const httpClient = new cre.capabilities.HTTPClient();
  return httpClient
    .sendRequest(runtime, getPriceRequest, consensusIdenticalAggregation<PriceResponse>())
    (runtime.config)
    .result();
}

/** POST signal to Marshmallow backend (price, optional funding rate, signal label). */
export function sendSignal(runtime: Runtime<PerpsConfig>, body: CreSignalBody): void {
  const httpClient = new cre.capabilities.HTTPClient();
  httpClient
    .sendRequest(runtime, postSignalRequest(body), consensusIdenticalAggregation<{ ok: boolean }>())
    (runtime.config)
    .result();
}
