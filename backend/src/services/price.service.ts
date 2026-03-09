/**
 * Price oracle for perps: Chainlink Data Feeds (or adapter contract).
 * Used by CRE workflow and perps execution for current price.
 * Falls back to last CRE-reported price when Chainlink feed is unavailable.
 */
import { ethers } from "ethers";
import { config } from "../config/index.js";
import { getCrePrice } from "./cre-signal.service.js";

const AGGREGATOR_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

export interface PriceResult {
  price: string;
  updatedAt: number;
  source?: "chainlink" | "cre";
}

/**
 * Fetch latest price: Chainlink AggregatorV3 first, then fallback to last CRE signal if configured.
 */
export async function getLatestPrice(): Promise<PriceResult | null> {
  const rpcUrl = config.rpcUrl;
  const feedAddress = config.chainlinkPriceFeedAddress;
  if (rpcUrl && feedAddress) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const feed = new ethers.Contract(feedAddress, AGGREGATOR_ABI, provider);
      const { answer, updatedAt } = await feed.latestRoundData();
      if (answer != null && updatedAt != null) {
        return {
          price: answer.toString(),
          updatedAt: Number(updatedAt),
          source: "chainlink",
        };
      }
    } catch {
      // fall through to CRE fallback
    }
  }
  const cre = getCrePrice();
  if (cre) return { ...cre, source: "cre" };
  return null;
}
