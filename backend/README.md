# Marshmallow Backend

Monolithic backend: **auth** (Privy + JWT), **trade** (server-signed tx for prediction market, vault, perp), **prediction** (private prediction ledger + settlement).

## Structure

- **config/** – env config
- **lib/** – db (MongoDB), privy, send-transaction, eip712, ace, poolTransfer
- **services/** – exposure (ledger), prediction (record + settle)
- **middleware/** – auth (JWT)
- **controllers/** – auth, trade, prediction

## Contract deployments

The backend loads addresses from **contracts/deployments/\<chainId\>.json** when present (e.g. `contracts/deployments/11155111.json`). Any env var (e.g. `PAYMENT_TOKEN_ADDRESS`, `MARKET_ADDRESS`) overrides the deployment file. Run from **backend/** or set `CONTRACT_DEPLOYMENTS_PATH` to the `contracts/deployments` folder.

The **deployer** address (from `PRIVATE_KEY` in contracts deploy) is the owner of `SimpleToken` and can mint. Set **DEPLOYER_PRIVATE_KEY** in the backend to the same key to enable **POST /api/admin/mint** (faucet).

## Setup

```bash
cp .env.example .env
# Set JWT_SECRET, RPC_URL. Optionally set CONTRACT_DEPLOYMENTS_PATH (default: contracts/deployments from cwd).
# Addresses are read from deployments/<CHAIN_ID>.json; override with VAULT_ADDRESS, PAYMENT_TOKEN_ADDRESS, etc.
# For prediction/settlement set POOL_PRIVATE_KEY. For auth/trade set Privy + MONGODB_URI.
# For mint/faucet set DEPLOYER_PRIVATE_KEY (same key used to deploy contracts).
npm install
```

## Run

```bash
npm start
# or
npm run dev
```

## Routes

| Route | Description |
|-------|-------------|
| **GET /health** | Health check |
| **POST /api/auth/login** | Body: `{ accessToken }`. Privy verify → JWT + wallet + signerId |
| **POST /api/auth/signup** | Same as login |
| **POST /api/auth/verify-token** | Same as login |
| **POST /api/auth/link** | Body: `{ accessToken, walletAddress, walletId? }`. Link wallet, return JWT + signerId |
| **GET /api/auth/me** | JWT required. Current user |
| **POST /api/trade/send** | JWT required. Body: `{ to, value?, data?, gas?, ... }`. Server-signed tx (prediction market, vault, perp) |
| **POST /api/prediction/private-prediction** | Body: `{ marketId, outcome, amountWei, account, timestamp, auth }`. EIP-712 + ACE, record in ledger |
| **POST /api/prediction/settlement** | Body: `{ marketId, outcome }`. Payout winners via pool → private-transfer |
| **GET /api/prediction/exposure** | Query: `?marketId=` optional. Exposure entries |
| **POST /api/admin/mint** | Body: `{ to: address, amountWei?: string }`. Mint payment token (requires DEPLOYER_PRIVATE_KEY). |

## Flow

1. **Auth**: Frontend logs in with Privy → access token → POST /api/auth/login → JWT + signerId. Frontend calls POST /api/auth/link with walletAddress/walletId, then addSigners(signerId).
2. **Trade**: Any on-chain tx (makePrediction, vault deposit, perp open/close) → POST /api/trade/send with JWT and { to, data, value?, ... }. Backend signs via Privy (no popup).
3. **Private prediction**: User private-transfers to pool, then POST /api/prediction/private-prediction (EIP-712). On settlement, POST /api/prediction/settlement → backend credits winners. Withdraw via ticket.

See [../docs/PRIVACY_PREDICTION_FLOW.md](../docs/PRIVACY_PREDICTION_FLOW.md) and [../docs/PRIVY_SERVER_SIDE_SIGNING.md](../docs/PRIVY_SERVER_SIDE_SIGNING.md).
