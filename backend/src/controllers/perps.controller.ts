/**
 * Perpetuals API – private only (privacy token).
 * Margin = private balance (same vault), off-chain ledger, withdraw via ticket only.
 * No public on-chain perps endpoints; all perps go through /allocate, /open, /close, /deallocate, /status.
 */
import { Router, Response } from "express";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { verifyPrivateTransfer } from "../lib/eip712.js";
import { signAndBuildPoolTransfer } from "../lib/poolTransfer.js";
import { config } from "../config/index.js";
import {
  getPoolAddress,
  getPoolWallet,
  checkPerpsAllowed,
  computePnLCollateral,
} from "../services/perps.service.js";
import { getLatestPrice } from "../services/price.service.js";
import { setLastCreSignal, getLastCreSignal } from "../services/cre-signal.service.js";
import {
  allocateMargin,
  openPrivatePosition,
  closePrivatePosition,
  deallocateMargin,
  recordPayout,
  getPrivatePerpsStatus,
  getFreeMarginWei,
} from "../services/perps-margin.service.js";

export const perpsController = Router();

// ---------- Market data: CoinGecko OHLC proxy (public) ----------

perpsController.get("/ohlc", async (_req, res: Response): Promise<void> => {
  try {
    const days = String(_req.query.days ?? "1");
    const coin = String(_req.query.coin ?? "ethereum");
    const url = `https://api.coingecko.com/api/v3/coins/${coin}/ohlc?vs_currency=usd&days=${days}`;
    const resp = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) {
      res.status(resp.status).json({ error: `CoinGecko error: ${resp.status}` });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error("[perps/ohlc]", err);
    res.status(500).json({ error: "Failed to fetch OHLC data" });
  }
});

perpsController.get("/tickers", async (_req, res: Response): Promise<void> => {
  try {
    const ids = "bitcoin,ethereum,solana,avalanche-2";
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const resp = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!resp.ok) {
      res.status(resp.status).json({ error: `CoinGecko error: ${resp.status}` });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error("[perps/tickers]", err);
    res.status(500).json({ error: "Failed to fetch tickers" });
  }
});

// ---------- CRE integration (no auth): price for workflows, webhook for signals ----------
/** Stub price when feed is not configured (e.g. local CRE simulation). */
const STUB_PRICE = "0";

perpsController.get("/price", async (_req, res: Response): Promise<void> => {
  try {
    const result = await getLatestPrice();
    if (result) {
      res.json({ price: result.price, updatedAt: result.updatedAt });
      return;
    }
    // Fallback so CRE workflow simulation can run without a live price feed
    res.json({ price: STUB_PRICE, updatedAt: Math.floor(Date.now() / 1000) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Price fetch failed";
    res.status(500).json({ error: message });
  }
});

perpsController.post("/cre-signal", async (req, res: Response): Promise<void> => {
  try {
    const { signal, fundingRateBps, price, updatedAt } = req.body as {
      signal?: string;
      fundingRateBps?: number;
      price?: string;
      updatedAt?: number;
    };
    if (config.creWebhookSecret && req.headers["x-cre-secret"] !== config.creWebhookSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    setLastCreSignal({ signal, price, updatedAt, fundingRateBps });
    console.log("[CRE signal]", { signal, fundingRateBps, price, updatedAt });
    res.json({ ok: true, received: { signal, fundingRateBps, price, updatedAt } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signal failed";
    res.status(500).json({ error: message });
  }
});

perpsController.get("/cre-signal", (_req, res: Response): void => {
  const last = getLastCreSignal();
  if (!last) {
    res.status(404).json({ error: "No CRE signal received yet" });
    return;
  }
  res.json(last);
});

perpsController.use(authenticate);

perpsController.post("/allocate", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { account, recipient, token, amountWei, flags, timestamp, auth } = req.body as {
      account?: string;
      recipient?: string;
      token?: string;
      amountWei?: string;
      timestamp?: string;
      flags?: string[];
      auth?: string;
    };
    if (!account || !recipient || !token || amountWei === undefined || timestamp === undefined || !auth) {
      res.status(400).json({ error: "account, recipient, token, amountWei, timestamp, auth required" });
      return;
    }
    const poolAddr = getPoolAddress();
    if (!poolAddr) {
      res.status(503).json({ error: "POOL_PRIVATE_KEY not configured" });
      return;
    }
    if (recipient.toLowerCase() !== poolAddr.toLowerCase()) {
      res.status(400).json({ error: "recipient must be pool address for perps allocate" });
      return;
    }
    const recovered = verifyPrivateTransfer(
      { sender: account, recipient, token, amount: amountWei, flags: flags ?? [], timestamp: String(timestamp) },
      auth,
      config.chainId,
      config.vaultAddress
    );
    if (recovered.toLowerCase() !== account.toLowerCase()) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    // Store margin under the authenticated user's wallet so /status and /open see the same balance
    const wallet = req.user?.walletAddress ?? account;
    if (wallet.toLowerCase() !== account.toLowerCase()) {
      res.status(400).json({ error: "account must match authenticated wallet" });
      return;
    }
    const allowed = await checkPerpsAllowed(account, amountWei);
    if (!allowed) {
      res.status(403).json({ error: "PolicyEngine: perps allocate not allowed" });
      return;
    }
    const apiUrl = config.privateTokenApiUrl;
    const r = await fetch(`${apiUrl}/private-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account,
        recipient,
        token,
        amount: amountWei,
        flags: flags ?? [],
        timestamp: Number(timestamp),
        auth,
      }),
    });
    if (!r.ok) {
      const data = (await r.json()) as { error?: string };
      const errMsg = data.error ?? "Private transfer failed";
      if (config.allowAllocateWithoutExternalTransfer) {
        console.warn("[perps/allocate] External private-transfer failed, allocating locally (dev):", errMsg);
        await allocateMargin(wallet, amountWei);
        res.status(201).json({ ok: true, message: "Margin allocated for perps (external transfer skipped)" });
        return;
      }
      res.status(400).json({ error: errMsg });
      return;
    }
    await allocateMargin(wallet, amountWei);
    res.status(201).json({ ok: true, message: "Margin allocated for perps" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Allocate failed";
    res.status(500).json({ error: message });
  }
});

perpsController.post("/open", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.walletAddress) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const wallet = req.user.walletAddress.toLowerCase();
    const { size, marginWei, leverage } = req.body as { size?: string; marginWei?: string; leverage?: number };
    if (size === undefined || !marginWei || leverage == null) {
      res.status(400).json({ error: "size, marginWei, leverage required" });
      return;
    }
    const allowed = await checkPerpsAllowed(req.user.walletAddress, marginWei);
    if (!allowed) {
      res.status(403).json({ error: "PolicyEngine: perps open not allowed" });
      return;
    }
    const priceResult = await getLatestPrice();
    const entryPrice = priceResult?.price ?? "0";
    if (entryPrice === "0") {
      res.status(503).json({ error: "Price oracle unavailable" });
      return;
    }
    const result = await openPrivatePosition(
      wallet,
      String(size),
      String(marginWei),
      entryPrice,
      Number(leverage)
    );
    if (!result.ok) {
      const freeWei = await getFreeMarginWei(wallet);
      res.status(400).json({
        error: result.error,
        freeMarginWei: freeWei,
      });
      return;
    }
    res.status(201).json({ ok: true, message: "Private position opened" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Open failed";
    res.status(500).json({ error: message });
  }
});

perpsController.post("/close", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.walletAddress) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const wallet = req.user.walletAddress.toLowerCase();
    const result = await closePrivatePosition(wallet);
    if (!result.ok || !result.position) {
      res.status(400).json({
        error: result.error ?? "No position to close",
        hint: "Refresh the page — the position may already be closed.",
      });
      return;
    }
    const priceResult = await getLatestPrice();
    const currentPrice = priceResult?.price ?? "0";
    if (currentPrice === "0") {
      res.status(503).json({ error: "Price oracle unavailable" });
      return;
    }
    const pnl = computePnLCollateral(
      result.position.size,
      result.position.entryPrice,
      currentPrice
    );
    const marginWei = BigInt(result.position.marginWei);
    const payout = marginWei + pnl;
    if (payout <= 0n) {
      await recordPayout(wallet, result.position.marginWei);
      res.json({ ok: true, payoutWei: "0", pnlCollateral: pnl.toString() });
      return;
    }
    const pool = getPoolWallet();
    if (!pool || !config.paymentTokenAddress) {
      res.status(503).json({ error: "Pool and payment token required for close payout" });
      return;
    }
    const payload = await signAndBuildPoolTransfer(
      pool,
      req.user.walletAddress,
      config.paymentTokenAddress,
      payout.toString(),
      config.chainId,
      config.vaultAddress
    );
    const r = await fetch(`${config.privateTokenApiUrl}/private-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const data = (await r.json()) as { error?: string };
      const errMsg = data.error ?? "Pool transfer failed";
      if (config.allowAllocateWithoutExternalTransfer) {
        console.warn("[perps/close] External pool transfer failed, closing locally (dev):", errMsg);
        // Position already closed; margin released. Do NOT recordPayout — we didn't send tokens, so balance stays.
        res.json({ ok: true, payoutWei: payout.toString(), pnlCollateral: pnl.toString() });
        return;
      }
      res.status(500).json({ error: errMsg });
      return;
    }
    await recordPayout(wallet, payout.toString());
    res.json({ ok: true, payoutWei: payout.toString(), pnlCollateral: pnl.toString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Close failed";
    res.status(500).json({ error: message });
  }
});

perpsController.post("/deallocate", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.walletAddress) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const wallet = req.user.walletAddress.toLowerCase();
    const { amountWei } = req.body as { amountWei?: string };
    if (!amountWei || typeof amountWei !== "string") {
      res.status(400).json({ error: "amountWei required" });
      return;
    }
    const result = await deallocateMargin(wallet, amountWei);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const pool = getPoolWallet();
    if (!pool || !config.paymentTokenAddress) {
      res.status(503).json({ error: "Pool and payment token required" });
      return;
    }
    const payload = await signAndBuildPoolTransfer(
      pool,
      req.user.walletAddress,
      config.paymentTokenAddress,
      amountWei,
      config.chainId,
      config.vaultAddress
    );
    const r = await fetch(`${config.privateTokenApiUrl}/private-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const data = (await r.json()) as { error?: string };
      res.status(500).json({ error: data.error ?? "Pool transfer failed" });
      return;
    }
    res.json({ ok: true, message: "Margin deallocated; use withdrawal ticket to redeem on vault" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Deallocate failed";
    res.status(500).json({ error: message });
  }
});

perpsController.get("/status", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user?.walletAddress) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const wallet = req.user.walletAddress.toLowerCase();
  const status = await getPrivatePerpsStatus(wallet);
  const freeMarginWei = await getFreeMarginWei(wallet);
  res.json({
    allocatedWei: status.allocatedWei,
    marginInUseWei: status.marginInUseWei,
    freeMarginWei,
    position: status.position,
    withdrawViaTicketOnly: true,
  });
});
