/**
 * Trade: server-signed transaction (same as zkperps). Used for prediction market, vault, perp txs.
 */
import { Router, Response } from "express";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { verifyWalletSetup, getSignerIdForFrontend } from "../lib/privy.js";
import { sendTransactionAsUser } from "../lib/send-transaction.js";

export const tradeController = Router();
tradeController.use(authenticate);

tradeController.post("/send", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.sub) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const walletSetup = await verifyWalletSetup(req.user.sub);
    if (!walletSetup.isSetup) {
      res.status(400).json({
        error: walletSetup.error ?? "Wallet not properly set up",
        signerId: getSignerIdForFrontend(),
        instructions: walletSetup.walletAddress
          ? "Provide walletId when linking."
          : "Call POST /api/auth/link with walletAddress and walletId, then addSigners() with signerId.",
      });
      return;
    }
    const { to, value, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce } = req.body as {
      to?: string;
      value?: string;
      data?: string;
      gas?: string;
      gasPrice?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      nonce?: number;
    };
    if (!to || typeof to !== "string") {
      res.status(400).json({ error: "to (address) is required" });
      return;
    }
    if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
      res.status(400).json({ error: "Invalid address format" });
      return;
    }
    const result = await sendTransactionAsUser(walletSetup.walletId!, {
      to: to as `0x${string}`,
      value: value != null ? BigInt(value) : undefined,
      data: (data as `0x${string}`) ?? "0x",
      gas: gas != null ? BigInt(gas) : undefined,
      gasPrice: gasPrice != null ? BigInt(gasPrice) : undefined,
      maxFeePerGas: maxFeePerGas != null ? BigInt(maxFeePerGas) : undefined,
      maxPriorityFeePerGas: maxPriorityFeePerGas != null ? BigInt(maxPriorityFeePerGas) : undefined,
      nonce,
    });
    res.json({ hash: result.hash });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    res.status(500).json({ error: message });
  }
});
