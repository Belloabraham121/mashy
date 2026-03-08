/**
 * Admin endpoints: mint (faucet) for payment token when backend has deployer key.
 * Deployer = owner of SimpleToken from contracts deployment; only they can mint.
 */
import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { config } from "../config/index.js";

const MINT_ABI = ["function mint(address to, uint256 amount) external"];

export const adminController = Router();

/** POST /api/admin/mint – mint payment token to address (deployer key only). Body: { to: string, amountWei: string } */
adminController.post(
  "/mint",
  async (req: Request, res: Response): Promise<void> => {
    if (
      !config.deployerPrivateKey ||
      !config.paymentTokenAddress ||
      !config.rpcUrl
    ) {
      res.status(503).json({
        error: "Mint not configured",
        need: [
          !config.deployerPrivateKey && "DEPLOYER_PRIVATE_KEY",
          !config.paymentTokenAddress &&
            "PAYMENT_TOKEN_ADDRESS (or deployment file)",
          !config.rpcUrl && "RPC_URL",
        ].filter(Boolean),
      });
      return;
    }

    const { to, amountWei } = req.body as { to?: string; amountWei?: string };
    if (!to || !ethers.isAddress(to)) {
      res.status(400).json({ error: "Invalid or missing 'to' address" });
      return;
    }
    const amount = amountWei ?? ethers.parseEther("1000").toString();
    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const signer = new ethers.Wallet(config.deployerPrivateKey, provider);
      const token = new ethers.Contract(
        config.paymentTokenAddress,
        MINT_ABI,
        signer,
      );
      const tx = await token.mint(to, amount);
      await tx.wait();
      res.json({ ok: true, to, amountWei: amount, txHash: tx.hash });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Mint failed";
      res.status(500).json({ error: message });
    }
  },
);
