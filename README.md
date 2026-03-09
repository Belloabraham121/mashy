# Marshmallow

Privacy-preserving perpetuals and prediction markets with server-signed transactions and Chainlink Runtime Environment (CRE) for decentralized price signals and settlement.

## Project Description

**Marshmallow** is a DeFi protocol that unifies **prediction markets**, **leveraged perpetual futures (perps)**, and **encrypted / private order flow** into a single seamless system. Users can trade real-world outcomes with institutional-grade privacy: positions, balances, margins, and exposure stay off-chain and encrypted where possible, eliminating transparent on-chain visibility that enables exploitation.

Deposits and withdrawals occur via an on-chain vault for security and verifiability. Pricing relies on **Chainlink Data Feeds** (primary) with CRE-powered fallback signals. Settlement (especially for prediction markets) is driven by Chainlink Runtime Environment (CRE) workflows for decentralized, timely, and trust-minimized resolution—even in private contexts.

Built for privacy-first traders who want to predict events, take leveraged positions, and manage risk without leaking sensitive information to the chain or MEV actors.

## The Problem It Addresses

DeFi users face major barriers when trading **perpetuals** and participating in **prediction markets** on public blockchains:

- **Front-running & MEV bots** — Transparent order flow and visible positions allow sophisticated actors (searchers, bots, validators) to front-run trades, sandwich orders, or liquidate positions profitably, extracting value from users.
- **Information asymmetry & exposure leakage** — Full on-chain visibility of balances, margins, open positions, and order intent exposes traders to targeted attacks, copy-trading, or predatory behavior.
- **Privacy vs. reliable oracles & settlement** — Purely private/off-chain systems lack decentralized, tamper-proof price feeds and automated resolution. Relying on centralized servers introduces single points of failure, trust issues, or downtime.
- **Manual / slow settlement in prediction markets** — Outcomes often require manual resolution, which doesn't scale. Without decentralized triggers, markets stall or become manipulable.
- **Lack of unified privacy-preserving stack** — No protocol combines high-leverage perps, outcome-based prediction, and true encrypted flows while still accessing reliable external data and automation.

Result: Traders either sacrifice privacy (and get exploited via MEV/front-running) or sacrifice decentralization/reliability (and accept centralized risks).

## How We’ve Addressed the Problem

Marshmallow uses a **hybrid architecture** that keeps sensitive data private while leveraging decentralized infrastructure for the parts that must be trustless:

- **Off-chain private ledger** — Positions, margins, balances, and exposure (especially for perps and private predictions) are tracked off-chain in an encrypted / server-signed manner (EIP-712 structured data + backend ledger).
- **Server-signed transactions** — Backend (Node.js + Privy auth + JWT) signs actions for prediction markets, vault interactions, and perps updates → users get fast, private execution without broadcasting everything on-chain.
- **On-chain vault & core engine** — Deposits/withdrawals via secure vault; on-chain PerpetualsEngine handles margin math, funding, liquidations (visible but minimal); SimpleMarket for prediction basics.
- **Hybrid oracle design** — Primary price from Chainlink Data Feeds → fallback to CRE-provided signals ensures continuity even during feed issues.
- **CRE-driven automation** — Chainlink Runtime Environment (CRE) orchestrates decentralized signals (prices, funding) and settlement triggers → removes single-server dependency and enables objective, timely resolution for private prediction markets.
- **Private settlement flows** — Winners receive payouts from a pool via private transfers; CRE can trigger these settlements securely after determining outcomes (via oracle, event, or AI).

This delivers **privacy where it matters** (order flow, positions, balances) + **decentralized reliability** where it must be trustless (prices, settlement).

## How We’ve Used CRE (Chainlink Runtime Environment)

CRE acts as the **decentralized orchestration layer**, bringing reliable signals and automation into the privacy stack without central points of failure.

### 1. Perps Signals Workflow (`cre-workflow/perps-signals/`)

- **Trigger**: CronCapability (e.g., every 60 seconds).
- **Flow**:
  1. CRE uses HTTPClient (with DON consensus aggregation) to GET latest price from backend `/api/perps/price`.
  2. Normalizes / computes optional signals (funding rate, risk metrics).
  3. POSTs the agreed signal to backend `/api/perps/cre-signal` (secured with optional `X-CRE-Secret`).
- **Backend role**: Stores latest CRE signal → `getLatestPrice()` returns Chainlink feed when available, falls back to CRE price during outages/downtime.
- **Benefit**: Provides a decentralized backup oracle path → perps keep running reliably even if primary Chainlink feed stalls.

### 2. CRE-Driven Prediction Market Settlement

- **Endpoint**: `POST /api/prediction/cre-settlement` (body: `{ marketId, outcome }`, secured via `X-CRE-Secret` when configured).
- **Behavior**: Mirrors manual settlement → updates private exposure ledger, computes payouts, transfers from pool to winners privately.
- **CRE workflow use case**: Event-driven or cron-based workflow listens for resolution conditions (on-chain events, external oracle, AI verdict) → determines outcome → calls the endpoint to trigger private settlement.
- **Benefit**: Decentralized DON consensus drives objective resolution and private payouts → no trusted server can censor or manipulate settlement.

### Summary Table

| CRE Usage             | Trigger  | Primary Action                              | Backend Role                                          | Key Benefit                                   |
| --------------------- | -------- | ------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Perps signals         | Cron     | GET price → normalize → POST cre-signal     | Store fallback price; use when Chainlink unavailable  | Decentralized backup oracle for uptime        |
| Prediction settlement | CRE call | POST cre-settlement with marketId + outcome | Settle private ledger & trigger pool → winner payouts | Trust-minimized, automated private resolution |

By integrating CRE workflows (Cron, HTTPClient with consensus, secure secrets), Marshmallow achieves **privacy-preserving yet decentralized** perps and prediction markets—directly aligned with Chainlink's Privacy Standard and Confidential Compute vision.
