/**
 * Private prediction: record prediction (EIP-712), settlement (pool → winners), exposure GET.
 * Also: GET /markets to fetch live market data from the SimpleMarket contract.
 */
import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { config } from "../config/index.js";
import {
  recordPrivatePrediction,
  checkAceAllowed,
  getExposure,
  settleMarket,
  isOutcome,
} from "../services/prediction.service.js";
import { getExposureByMarket } from "../services/exposure.service.js";

const SIMPLE_MARKET_ABI = [
  "function nextMarketId() view returns (uint256)",
  "function getMarket(uint256 marketId) view returns (tuple(string question, uint256 marketOpen, uint256 marketClose, uint8 status, uint8 outcome, uint256 settledAt, string evidenceURI, uint16 confidenceBps, uint256[2] predCounts, uint256[2] predTotals))",
  "function makePrediction(uint256 marketId, uint8 outcome, uint256 amount)",
  "function paymentToken() view returns (address)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

const STATUS_LABELS = ["Open", "SettlementRequested", "Settled", "NeedsManual"] as const;
const OUTCOME_LABELS = ["None", "No", "Yes", "Inconclusive"] as const;

export const predictionController = Router();

predictionController.get("/markets", async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!config.rpcUrl || !config.marketAddress) {
      res.status(503).json({ error: "Market contract not configured (RPC_URL or MARKET_ADDRESS missing)" });
      return;
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.marketAddress, SIMPLE_MARKET_ABI, provider);

    const nextId: bigint = await contract.nextMarketId();
    const count = Number(nextId);

    if (count === 0) {
      res.json([]);
      return;
    }

    const calls = Array.from({ length: count }, (_, i) => contract.getMarket(i));
    const results = await Promise.all(calls);

    const markets = results.map((m, i) => mergePrivateExposure(serializeMarket(m, i)));

    res.json(markets);
  } catch (err) {
    console.error("[prediction/markets]", err);
    res.status(500).json({ error: "Failed to fetch markets from chain" });
  }
});

function serializeMarket(m: ethers.Result, id: number) {
  return {
    id,
    question: m.question,
    marketOpen: Number(m.marketOpen),
    marketClose: Number(m.marketClose),
    status: STATUS_LABELS[Number(m.status)] ?? "Unknown",
    outcome: OUTCOME_LABELS[Number(m.outcome)] ?? "Unknown",
    settledAt: Number(m.settledAt),
    evidenceURI: m.evidenceURI,
    confidenceBps: Number(m.confidenceBps),
    predCounts: { no: m.predCounts[0].toString(), yes: m.predCounts[1].toString() },
    predTotals: { no: m.predTotals[0].toString(), yes: m.predTotals[1].toString() },
  };
}

/** Add private prediction exposure to chain market so volume/counts/chances include private bets. */
function mergePrivateExposure(
  market: ReturnType<typeof serializeMarket>,
): ReturnType<typeof serializeMarket> {
  const entries = getExposureByMarket(market.id);
  let privateNoTotal = 0n;
  let privateYesTotal = 0n;
  let privateNoCount = 0;
  let privateYesCount = 0;
  for (const e of entries) {
    const amt = BigInt(e.amountWei);
    if (e.outcome === "No") {
      privateNoTotal += amt;
      privateNoCount += 1;
    } else {
      privateYesTotal += amt;
      privateYesCount += 1;
    }
  }
  return {
    ...market,
    predCounts: {
      no: (BigInt(market.predCounts.no) + BigInt(privateNoCount)).toString(),
      yes: (BigInt(market.predCounts.yes) + BigInt(privateYesCount)).toString(),
    },
    predTotals: {
      no: (BigInt(market.predTotals.no) + privateNoTotal).toString(),
      yes: (BigInt(market.predTotals.yes) + privateYesTotal).toString(),
    },
  };
}

predictionController.get("/markets/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!config.rpcUrl || !config.marketAddress) {
      res.status(503).json({ error: "Market contract not configured" });
      return;
    }
    const id = Number(req.params.id);
    if (Number.isNaN(id) || id < 0) {
      res.status(400).json({ error: "Invalid market ID" });
      return;
    }
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.marketAddress, SIMPLE_MARKET_ABI, provider);
    const nextId = Number(await contract.nextMarketId());
    if (id >= nextId) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    const m = await contract.getMarket(id);
    res.json(mergePrivateExposure(serializeMarket(m, id)));
  } catch (err) {
    console.error("[prediction/markets/:id]", err);
    res.status(500).json({ error: "Failed to fetch market" });
  }
});

predictionController.post("/predict", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!config.rpcUrl || !config.marketAddress || !config.deployerPrivateKey) {
      res.status(503).json({ error: "Prediction not configured (missing RPC, market address, or deployer key)" });
      return;
    }
    const { marketId, outcome, amountWei, userAddress } = req.body;
    if (marketId === undefined || !outcome || !amountWei || !userAddress) {
      res.status(400).json({ error: "Missing fields: marketId, outcome, amountWei, userAddress" });
      return;
    }
    const outcomeNum = outcome === "Yes" ? 2 : outcome === "No" ? 1 : 0;
    if (outcomeNum === 0) {
      res.status(400).json({ error: "outcome must be Yes or No" });
      return;
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(config.deployerPrivateKey, provider);
    const market = new ethers.Contract(config.marketAddress, SIMPLE_MARKET_ABI, signer);
    const tokenAddr = config.paymentTokenAddress || await market.paymentToken();
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);

    const amt = BigInt(amountWei);

    const approveTx = await token.approve(config.marketAddress, amt);
    await approveTx.wait();

    const predictTx = await market.makePrediction(marketId, outcomeNum, amt);
    const receipt = await predictTx.wait();

    res.json({
      ok: true,
      marketId: Number(marketId),
      outcome,
      amountWei: amt.toString(),
      txHash: receipt.hash,
    });
  } catch (err: unknown) {
    console.error("[prediction/predict]", err);
    const msg = err instanceof Error ? err.message : "Failed to place prediction";
    res.status(500).json({ error: msg });
  }
});

predictionController.post("/private-prediction", async (req: Request, res: Response): Promise<void> => {
  try {
    const { marketId, outcome, amountWei, account, timestamp, auth } = req.body;
    if (marketId === undefined || !outcome || !amountWei || !account || timestamp === undefined || !auth) {
      res.status(400).json({
        error: "Missing fields: marketId, outcome, amountWei, account, timestamp, auth",
      });
      return;
    }
    const allowed = await checkAceAllowed(account, String(amountWei));
    if (!allowed) {
      res.status(403).json({ error: "PolicyEngine: transfer not allowed" });
      return;
    }
    const result = recordPrivatePrediction({
      marketId: Number(marketId),
      outcome,
      amountWei: String(amountWei),
      account,
      timestamp: String(timestamp),
      auth,
    });
    if (!result.ok) {
      res.status(result.error === "Invalid signature" ? 401 : 400).json({ error: result.error });
      return;
    }
    res.status(201).json({
      ok: true,
      message: "Private prediction recorded",
      marketId: Number(marketId),
      outcome,
      amountWei: String(amountWei),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

predictionController.post("/settlement", async (req: Request, res: Response): Promise<void> => {
  try {
    const { marketId, outcome } = req.body;
    if (marketId === undefined || !outcome) {
      res.status(400).json({ error: "Missing marketId or outcome" });
      return;
    }
    if (!isOutcome(outcome)) {
      res.status(400).json({ error: "outcome must be Yes or No" });
      return;
    }
    const { payouts } = await settleMarket(Number(marketId), outcome);
    res.json({ ok: true, marketId: Number(marketId), outcome, payouts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

predictionController.post("/cre-settlement", async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.creWebhookSecret && req.headers["x-cre-secret"] !== config.creWebhookSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { marketId, outcome } = req.body;
    if (marketId === undefined || !outcome) {
      res.status(400).json({ error: "Missing marketId or outcome" });
      return;
    }
    if (!isOutcome(outcome)) {
      res.status(400).json({ error: "outcome must be Yes or No" });
      return;
    }
    const { payouts } = await settleMarket(Number(marketId), outcome);
    res.json({ ok: true, marketId: Number(marketId), outcome, payouts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

predictionController.get("/exposure", (req: Request, res: Response): void => {
  const marketId = req.query.marketId;
  if (marketId !== undefined) {
    const id = Number(marketId);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid marketId" });
      return;
    }
    res.json(getExposure(id));
  } else {
    res.json(getExposure());
  }
});
