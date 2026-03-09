import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { config } from "../config/index.js";
import { getPoolAddress } from "../services/perps.service.js";

const ERC20_DECIMALS_ABI = ["function decimals() view returns (uint8)"];

export const configController = Router();

/** In-memory cache so we don't hit RPC on every config request. */
let cachedDecimals: number | null = null;

configController.get("/", async (_req: Request, res: Response): Promise<void> => {
  let decimals = config.paymentTokenDecimals;
  if (config.rpcUrl && config.paymentTokenAddress) {
    if (cachedDecimals !== null) {
      decimals = cachedDecimals;
    } else {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const token = new ethers.Contract(
          config.paymentTokenAddress,
          ERC20_DECIMALS_ABI,
          provider,
        );
        const d = await token.decimals();
        cachedDecimals = Number(d);
        decimals = cachedDecimals;
      } catch {
        // keep env/default
      }
    }
  }
  res.json({
    chainId: config.chainId,
    poolAddress: getPoolAddress() ?? "",
    paymentTokenAddress: config.paymentTokenAddress,
    paymentTokenDecimals: decimals,
    vaultAddress: config.vaultAddress,
    perpsEngineAddress: config.perpsEngineAddress,
    marketAddress: config.marketAddress,
    signerId: config.privy.keyQuorumId,
  });
});
