/**
 * Load contract deployment addresses from contracts/deployments/<chainId>.json.
 * Env CONTRACT_DEPLOYMENTS_PATH can override the directory (default: ../contracts/deployments from cwd).
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface DeploymentJson {
  chainId: number;
  paymentToken?: string;
  policyEngine?: string;
  policyEngineImpl?: string;
  simpleMarket?: string;
  priceOracle?: string;
  perpsEngine?: string;
  vault?: string;
}

/** Try cwd/contracts/deployments (run from repo root) then cwd/../contracts/deployments (run from backend/). */
function findDeploymentsDir(): string {
  if (process.env.CONTRACT_DEPLOYMENTS_PATH) return process.env.CONTRACT_DEPLOYMENTS_PATH;
  const fromRoot = join(process.cwd(), "contracts", "deployments");
  const fromBackend = join(process.cwd(), "..", "contracts", "deployments");
  return existsSync(fromRoot) ? fromRoot : fromBackend;
}

/**
 * Load deployments/<chainId>.json. Returns null if file missing or invalid.
 */
export function loadDeployment(chainId: number): DeploymentJson | null {
  const dir = findDeploymentsDir();
  const path = join(dir, `${chainId}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw) as DeploymentJson;
    if (typeof data.chainId !== "number") data.chainId = chainId;
    return data;
  } catch {
    return null;
  }
}
