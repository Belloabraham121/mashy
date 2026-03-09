# Marshmallow

Privacy-preserving perpetuals and prediction markets with server-signed transactions and Chainlink Runtime (CRE) for decentralized price signals and settlement.

---

## The Problem

DeFi users want to trade **perpetuals** and participate in **prediction markets** without fully exposing positions and balances on-chain. Two main challenges:

1. **Privacy vs. oracles**  
   Private or off-chain systems still need reliable, timely price data and settlement signals. Relying on a single Chainlink feed or a single backend can create a single point of failure or trust.

2. **Automated settlement**  
   Prediction markets need objective, timely resolution. Manually settling each market does not scale, and you want settlement logic that can be driven by on-chain events or external verification (e.g. oracles, DONs).

So: how do you get **decentralized, reliable signals** (prices, funding, settlement triggers) into a **privacy-aware** stack that keeps exposure and margin off-chain where needed?

---

## How We’ve Addressed It

### Architecture

- **Backend (Node)**  
  Auth (Privy + JWT), server-signed transactions for prediction market, vault, and perps. Private prediction is recorded off-chain (EIP-712 + exposure ledger); private perps use an off-chain margin ledger. Settlement pays winners from a pool via private-transfer. Price for perps comes from **Chainlink first**, with a **CRE-reported price as fallback** when the feed is down or missing.

- **Contracts**  
  Perpetuals engine (margin, positions, funding, liquidation), price oracle (Chainlink), SimpleMarket for prediction markets, vault and policy engine for privacy and compliance.

- **Frontend**  
  Dashboard for perps, prediction markets, and privacy/vault flows; uses backend auth and trade APIs.

- **CRE integration**  
  Chainlink Runtime is used to produce **perps signals** on a schedule and to allow **CRE-driven settlement** of private prediction markets, so the DON can drive both price/signals and settlement without a single trusted server.

### Perps: price and signals

- **Primary price:** Chainlink Data Feed (or adapter) via `getLatestPrice()`.
- **Fallback:** Last price received from CRE. The backend stores the latest CRE signal (`POST /api/perps/cre-signal`) and, when the Chainlink feed is unavailable, returns that price so perps can keep running.
- **CRE workflow:** A CRE cron job runs periodically (e.g. every 60s), calls the backend `GET /api/perps/price` (or in future, Chainlink Data Streams), then POSTs a normalized signal to `POST /api/perps/cre-signal`. So the DON contributes a decentralized signal layer; the backend trusts it when the primary feed is down.

### Prediction: CRE-driven settlement

- **Normal settlement:** `POST /api/prediction/settlement` with `{ marketId, outcome }` settles the private exposure ledger and pays winners from the pool.
- **CRE settlement:** `POST /api/prediction/cre-settlement` does the same thing but is secured by `X-CRE-Secret` (same secret as perps). A CRE workflow (e.g. one that listens for `SettlementRequested` and resolves outcome via an oracle or AI) can call this endpoint to settle the **private** side after determining the outcome, so CRE drives both on-chain resolution and private payouts.

---

## How We’ve Used CRE

### 1. Perps signals workflow (`cre-workflow/perps-signals/`)

- **Trigger:** Cron (e.g. every 60 seconds) via CRE **CronCapability**.
- **Flow:**  
  1. **HTTP GET** the backend `/api/perps/price` (CRE **HTTPClient** with consensus aggregation).  
  2. Optionally compute or normalize a signal (e.g. funding, risk).  
  3. **HTTP POST** to backend `/api/perps/cre-signal` with `{ signal, price, updatedAt, fundingRateBps? }` and optional `X-CRE-Secret`.
- **Backend:** Stores the last CRE signal; `getLatestPrice()` uses Chainlink when available and falls back to this stored price when the feed is missing or fails.
- **CRE capabilities:** Cron trigger, HTTP (GET + POST), consensus-identical aggregation for deterministic DON responses.

This gives perps a **decentralized signal path**: the DON runs the cron and pushes a single, agreed signal to the backend, which then uses it as a fallback oracle.

### 2. CRE-driven prediction settlement

- **Endpoint:** `POST /api/prediction/cre-settlement` with body `{ marketId, outcome }`, header `X-CRE-Secret` when `CRE_WEBHOOK_SECRET` is set.
- **Behavior:** Same as `POST /api/prediction/settlement`: calls `settleMarket(marketId, outcome)` and returns `{ ok, marketId, outcome, payouts }`.
- **Use case:** A CRE workflow (e.g. event-driven or cron) that resolves market outcomes (on-chain events, oracle, or AI) can call this endpoint to settle the **private** prediction ledger and trigger pool → winner payouts, so CRE is the authority that triggers private settlement.

### Summary

| CRE usage            | Trigger     | Action                                                                 | Backend role                                      |
|----------------------|------------|------------------------------------------------------------------------|---------------------------------------------------|
| Perps signals        | Cron       | GET price → POST signal                                                | Store signal; use CRE price when Chainlink fails  |
| Prediction settlement| CRE call   | POST `cre-settlement` with `marketId` + `outcome`                       | Same as manual settlement; pay winners from pool |

---

## Repo structure

```
mashy/
├── backend/          # Node API: auth, trade, prediction, perps, CRE endpoints
├── frontend/         # Dashboard (perps, prediction, privacy)
├── contracts/        # Solidity: PerpetualsEngine, SimpleMarket, vault, etc.
├── cre-workflow/     # CRE project
│   ├── perps-signals/   # Cron → price → POST cre-signal
│   └── ...
├── api-scripts/      # Scripts for private prediction, etc.
└── docs/             # Flows and integration notes
```

## Quick start

1. **Backend:** `cd backend && cp .env.example .env`, set `RPC_URL`, `JWT_SECRET`, optional `CRE_WEBHOOK_SECRET`, then `npm run dev`.
2. **Perps CRE workflow:** In `cre-workflow/perps-signals/config.json` set `backendBaseUrl` (e.g. `http://localhost:3001`) and optionally `creWebhookSecret`. From `cre-workflow/`: `bun install` then `cre workflow simulate perps-signals --target local-simulation` (see [cre-workflow/README.md](cre-workflow/README.md)).
3. **Frontend:** `cd frontend && npm install && npm run dev`.

See [backend/README.md](backend/README.md) for API routes and [cre-workflow/README.md](cre-workflow/README.md) for CRE workflow details and simulation.
