/**
 * Admin endpoints: mint (faucet) for payment token when backend has deployer key.
 * Deployer = owner of SimpleToken from contracts deployment; only they can mint.
 * Accepts human amount (e.g. 100) and converts using token decimals from chain.
 */
import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { config } from "../config/index.js";

const MINT_ABI = ["function mint(address to, uint256 amount) external"];
const DECIMALS_ABI = ["function decimals() view returns (uint8)"];

export const adminController = Router();

/** POST /api/admin/mint – Body: { to: string, amount?: number } (human amount) or { to: string, amountWei?: string }. Uses token decimals from chain when amount is provided. */
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

    const { to, amount: amountHuman, amountWei } = req.body as {
      to?: string;
      amount?: number;
      amountWei?: string;
    };
    if (!to || !ethers.isAddress(to)) {
      res.status(400).json({ error: "Invalid or missing 'to' address" });
      return;
    }

    let amountWeiToMint: string;
    if (amountHuman != null && typeof amountHuman === "number" && !Number.isNaN(amountHuman)) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const tokenRead = new ethers.Contract(
          config.paymentTokenAddress,
          DECIMALS_ABI,
          provider,
        );
        const d = await tokenRead.decimals();
        const decimals = Number(d);
        amountWeiToMint = (BigInt(Math.floor(amountHuman * 10 ** decimals))).toString();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to read token decimals";
        res.status(500).json({ error: message });
        return;
      }
    } else if (amountWei != null && typeof amountWei === "string") {
      amountWeiToMint = amountWei;
    } else {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const tokenRead = new ethers.Contract(config.paymentTokenAddress, DECIMALS_ABI, provider);
      const d = await tokenRead.decimals().catch(() => 18);
      const decimals = Number(d);
      amountWeiToMint = (BigInt(Math.floor(1000 * 10 ** decimals))).toString();
    }

    try {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const signer = new ethers.Wallet(config.deployerPrivateKey, provider);
      const token = new ethers.Contract(
        config.paymentTokenAddress,
        MINT_ABI,
        signer,
      );
      const tx = await token.mint(to, amountWeiToMint);
      await tx.wait();
      res.json({ ok: true, to, amountWei: amountWeiToMint, txHash: tx.hash });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Mint failed";
      res.status(500).json({ error: message });
    }
  },
);
