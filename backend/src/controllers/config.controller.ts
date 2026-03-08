import { Router, type Response } from "express";
import { config } from "../config/index.js";
import { getPoolAddress } from "../services/perps.service.js";

export const configController = Router();

configController.get("/", (_req, res: Response): void => {
  res.json({
    chainId: config.chainId,
    poolAddress: getPoolAddress() ?? "",
    paymentTokenAddress: config.paymentTokenAddress,
    vaultAddress: config.vaultAddress,
    perpsEngineAddress: config.perpsEngineAddress,
    marketAddress: config.marketAddress,
    signerId: config.privy.keyQuorumId,
  });
});
