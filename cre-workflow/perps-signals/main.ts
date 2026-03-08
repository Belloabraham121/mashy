// main.ts – Perps signals CRE workflow: cron trigger → fetch price → compute signal → POST to backend.
// Use direct CronCapability + handler imports so CRE CLI can detect the trigger (run from cre-workflow/).

import {
  CronCapability,
  handler,
  type Runtime,
  type CronPayload,
  Runner,
} from "@chainlink/cre-sdk";
import { configSchema, type PerpsConfig } from "./types";
import { fetchPrice, sendSignal } from "./http";

/**
 * Cron callback: read price from backend, compute signal, POST to backend.
 * Backend uses price for private perps; CRE can later extend to funding/risk.
 */
const onCronTrigger = (runtime: Runtime<PerpsConfig>, payload?: CronPayload): string => {
  if (payload?.scheduledExecutionTime) {
    const { seconds } = payload.scheduledExecutionTime;
    runtime.log(`Perps signals run at ${String(seconds)}`);
  }

  const priceResult = fetchPrice(runtime);
  runtime.log(`Price: ${priceResult.price} updatedAt: ${priceResult.updatedAt}`);

  const signal = "perps_signals_ok";
  const body = {
    signal,
    price: priceResult.price,
    updatedAt: priceResult.updatedAt,
    fundingRateBps: undefined as number | undefined,
  };
  sendSignal(runtime, body);
  runtime.log(`Signal sent: ${signal}`);

  return "Perps signals completed";
};

/** Exported so CRE runtime can discover triggers (subscribe phase). */
const initWorkflow = (_config: PerpsConfig) => {
  const cronTrigger = new CronCapability().trigger({
    schedule: "*/60 * * * * *",
  });
  return [handler(cronTrigger, onCronTrigger)];
};

export { initWorkflow };

export async function main() {
  // Omit configSchema so CLI subscribe phase can discover triggers without validating config.
  const runner = await Runner.newRunner<PerpsConfig>();
  await runner.run(initWorkflow);
}

main();
