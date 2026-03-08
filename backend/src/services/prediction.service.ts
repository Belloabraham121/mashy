/**
 * Private prediction and settlement: verify EIP-712, ACE, exposure ledger, pool payouts.
 */
import { ethers } from "ethers";
import { verifyPrivatePrediction, type PrivatePredictionMessage } from "../lib/eip712.js";
import { checkPrivateTransferAllowed } from "../lib/ace.js";
import { signAndBuildPoolTransfer } from "../lib/poolTransfer.js";
import {
  addExposure,
  getExposureByMarket,
  getAllExposure,
  computeWinnerPayouts,
  type Outcome,
} from "./exposure.service.js";
import { config } from "../config/index.js";

export type { Outcome };

export function isOutcome(x: string): x is Outcome {
  return x === "Yes" || x === "No";
}

let poolWallet: ethers.Wallet | null = null;
function getPoolWallet(): ethers.Wallet | null {
  if (poolWallet) return poolWallet;
  if (config.poolPrivateKey) poolWallet = new ethers.Wallet(config.poolPrivateKey);
  return poolWallet;
}

export interface RecordPrivatePredictionInput {
  marketId: number;
  outcome: string;
  amountWei: string;
  account: string;
  timestamp: string;
  auth: string;
}

export function recordPrivatePrediction(input: RecordPrivatePredictionInput): { ok: boolean; error?: string } {
  if (!isOutcome(input.outcome)) return { ok: false, error: "outcome must be Yes or No" };
  if (!config.marketAddress) return { ok: false, error: "MARKET_ADDRESS not configured" };
  const message: PrivatePredictionMessage = {
    account: input.account,
    marketId: String(input.marketId),
    outcome: input.outcome,
    amountWei: input.amountWei,
    timestamp: input.timestamp,
  };
  const recovered = verifyPrivatePrediction(
    message,
    input.auth,
    config.chainId,
    config.marketAddress
  );
  if (recovered.toLowerCase() !== input.account.toLowerCase()) {
    return { ok: false, error: "Invalid signature" };
  }
  addExposure({
    userAddress: recovered,
    marketId: input.marketId,
    outcome: input.outcome,
    amountWei: input.amountWei,
  });
  return { ok: true };
}

export async function checkAceAllowed(account: string, amountWei: string): Promise<boolean> {
  const pool = getPoolWallet();
  return checkPrivateTransferAllowed(
    config.rpcUrl || undefined,
    config.policyEngineAddress || undefined,
    account,
    pool?.address ?? config.vaultAddress,
    amountWei
  );
}

export function getExposure(marketId?: number) {
  if (marketId !== undefined) return getExposureByMarket(marketId);
  return getAllExposure();
}

export interface SettleResult {
  userAddress: string;
  amountWei: string;
  ok: boolean;
  error?: string;
}

export async function settleMarket(
  marketId: number,
  outcome: Outcome
): Promise<{ payouts: SettleResult[] }> {
  const pool = getPoolWallet();
  if (!pool || !config.paymentTokenAddress) {
    throw new Error("POOL_PRIVATE_KEY and PAYMENT_TOKEN_ADDRESS required for settlement");
  }
  const payouts = computeWinnerPayouts(marketId, outcome);
  const results: SettleResult[] = [];
  const vaultAddr = config.vaultAddress || "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13";
  const apiUrl = config.privateTokenApiUrl;
  for (const { userAddress, amountWei } of payouts) {
    if (BigInt(amountWei) === 0n) {
      results.push({ userAddress, amountWei, ok: true });
      continue;
    }
    try {
      const payload = await signAndBuildPoolTransfer(
        pool,
        userAddress,
        config.paymentTokenAddress,
        amountWei,
        config.chainId,
        vaultAddr
      );
      const r = await fetch(`${apiUrl}/private-transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await r.json()) as { error?: string };
      results.push({ userAddress, amountWei, ok: r.ok, error: r.ok ? undefined : (data.error ?? r.statusText) });
    } catch (e) {
      results.push({ userAddress, amountWei, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { payouts: results };
}
