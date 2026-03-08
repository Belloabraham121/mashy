/**
 * Price oracle for perps: Chainlink Data Feeds (or adapter contract).
 * Used by CRE workflow and perps execution for current price.
 */
import { ethers } from "ethers";
import { config } from "../config/index.js";

const AGGREGATOR_ABI = [
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
];

export interface PriceResult {
  price: string;
  updatedAt: number;
}

/**
 * Fetch latest price from Chainlink AggregatorV3 (or ChainlinkPriceOracle).
 * If CHAINLINK_PRICE_FEED_ADDRESS is set, uses that feed; otherwise returns 0 (caller should use engine's oracle).
 */
export async function getLatestPrice(): Promise<PriceResult | null> {
  const rpcUrl = config.rpcUrl;
  const feedAddress = config.chainlinkPriceFeedAddress;
  if (!rpcUrl || !feedAddress) return null;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const feed = new ethers.Contract(feedAddress, AGGREGATOR_ABI, provider);
    const { answer, updatedAt } = await feed.latestRoundData();
    if (answer == null || updatedAt == null) return null;
    return {
      price: answer.toString(),
      updatedAt: Number(updatedAt),
    };
  } catch {
    return null;
  }
}
