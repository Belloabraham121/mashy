/**
 * Exposure ledger: private predictions (user, marketId, outcome, amount).
 * Persists to JSON when exposureLedgerPath is set.
 */
import { readFileSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type Outcome = "Yes" | "No";

export interface ExposureEntry {
  userAddress: string;
  marketId: number;
  outcome: Outcome;
  amountWei: string;
  timestamp: number;
}

let ledger: ExposureEntry[] = [];
let persistPath: string | null = null;

export function setExposureLedgerPath(path: string | null): void {
  persistPath = path;
}

export function loadLedger(path: string): void {
  persistPath = path;
  try {
    ledger = JSON.parse(readFileSync(path, "utf-8")) as ExposureEntry[];
  } catch {
    ledger = [];
  }
}

async function saveLedger(): Promise<void> {
  if (!persistPath) return;
  try {
    await mkdir(dirname(persistPath), { recursive: true });
    await writeFile(persistPath, JSON.stringify(ledger, null, 2));
  } catch (err) {
    console.error("Failed to persist exposure ledger:", err);
  }
}

export function addExposure(entry: Omit<ExposureEntry, "timestamp">): void {
  ledger.push({ ...entry, timestamp: Math.floor(Date.now() / 1000) });
  saveLedger();
}

export function getExposureByMarket(marketId: number): ExposureEntry[] {
  return ledger.filter((e) => e.marketId === marketId);
}

export function getAllExposure(): ExposureEntry[] {
  return [...ledger];
}

export function computeWinnerPayouts(
  marketId: number,
  settledOutcome: Outcome
): { userAddress: string; amountWei: string }[] {
  const entries = getExposureByMarket(marketId).filter((e) => e.outcome === settledOutcome);
  if (entries.length === 0) return [];
  const totalStaked = entries.reduce((sum, e) => sum + BigInt(e.amountWei), 0n);
  const totalPool = getExposureByMarket(marketId).reduce((sum, e) => sum + BigInt(e.amountWei), 0n);
  if (totalPool === 0n) return [];
  return entries.map((e) => ({
    userAddress: e.userAddress,
    amountWei: ((BigInt(e.amountWei) * totalPool) / totalStaked).toString(),
  }));
}
