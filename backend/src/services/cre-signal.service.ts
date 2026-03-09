/**
 * Store last CRE (Chainlink Runtime) signal for perps.
 * Used so backend can use CRE-reported price as fallback when Chainlink feed is unavailable.
 */
export interface CreSignal {
  signal: string;
  price: string;
  updatedAt: number;
  fundingRateBps?: number;
  receivedAt: number;
}

let lastSignal: CreSignal | null = null;

export function setLastCreSignal(signal: {
  signal?: string;
  price?: string;
  updatedAt?: number;
  fundingRateBps?: number;
}): void {
  const now = Math.floor(Date.now() / 1000);
  lastSignal = {
    signal: signal.signal ?? "unknown",
    price: signal.price ?? "0",
    updatedAt: signal.updatedAt ?? now,
    fundingRateBps: signal.fundingRateBps,
    receivedAt: now,
  };
}

export function getLastCreSignal(): CreSignal | null {
  return lastSignal;
}

/** Price from last CRE signal, or null if none. Used as fallback when Chainlink feed is down. */
export function getCrePrice(): { price: string; updatedAt: number } | null {
  if (!lastSignal || !lastSignal.price || lastSignal.price === "0") return null;
  return { price: lastSignal.price, updatedAt: lastSignal.updatedAt };
}
