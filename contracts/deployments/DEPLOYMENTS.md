# Contract deployment order and addresses

This document describes **which contracts to deploy and in what order**. After running the deploy script, addresses are written to `deployments/<chainId>.json`.

## Deployment order

Deploy in this order so that each contract has the addresses it needs:

| Step | Contract | Depends on | Env / notes |
|------|----------|------------|-------------|
| 1 | **Payment token** (ERC-20) | — | If `PAYMENT_TOKEN` is not set, the script deploys `SimpleToken` and mints to deployer. Otherwise uses existing address. |
| 2 | **PolicyEngine** (implementation + proxy) | — | Chainlink ACE PolicyEngine behind ERC1967 proxy. Use proxy address as `POLICY_ENGINE_ADDRESS`. |
| 3 | **Vault registration** (optional) | Token, PolicyEngine | If `VAULT_ADDRESS` is set, calls `Vault.register(token, policyEngine)`. The Vault contract itself is **not** deployed by this repo (use existing Compliant Private Token vault). |
| 4 | **SimpleMarket** (prediction market) | Payment token, CRE forwarder | Needs `PAYMENT_TOKEN` and a fixed CRE forwarder address (e.g. Sepolia simulation forwarder). |
| 5 | **Price oracle** | — | If `CHAINLINK_PRICE_FEED_ADDRESS` is set: deploy `ChainlinkPriceOracle(feed)`. Otherwise deploy `MockPriceOracle(initialPrice)` (use `MOCK_ORACLE_INITIAL_PRICE`, default 2000e8). |
| 6 | **PerpetualsEngine** | Payment token (collateral), Price oracle | Deploy with `collateralToken` = payment token and `priceOracle` = step 5. |

## Environment variables for the script

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | Yes | Deployer EOA private key (no `0x` prefix). |
| `PAYMENT_TOKEN` | No | If set, use this as the ERC-20 payment token and skip deploying SimpleToken. If unset, deploy SimpleToken and use it. |
| `VAULT_ADDRESS` | No | If set, call `Vault.register(token, policyEngine)` after deploying. **Note:** The Compliant Private Token demo vault calls `attach()` on the PolicyEngine; the Chainlink ACE PolicyEngine does not implement it, so registration will revert. Omit `VAULT_ADDRESS` to deploy without registering. |
| `CRE_FORWARDER_ADDRESS` | No | Forwarder for SimpleMarket (CRE). Default: Sepolia simulation forwarder. |
| `CHAINLINK_PRICE_FEED_ADDRESS` | No | If set, deploy ChainlinkPriceOracle with this feed. Else deploy MockPriceOracle. |
| `MOCK_ORACLE_INITIAL_PRICE` | No | Used only when MockPriceOracle is deployed (e.g. `200000000000` for 2000e8). Default: 2000e8. |

## Output: `deployments/<chainId>.json`

The script creates or overwrites `contracts/deployments/<chainId>.json` with a JSON object like:

```json
{
  "chainId": 11155111,
  "paymentToken": "0x...",
  "policyEngine": "0x...",
  "policyEngineImpl": "0x...",
  "simpleMarket": "0x...",
  "priceOracle": "0x...",
  "perpsEngine": "0x...",
  "vault": "0x..."
}
```

The `vault` field is `0x0000000000000000000000000000000000000000` if no registration was performed; otherwise it is the Vault address used.

## How to run the deploy script

From the `contracts/` directory, **source your `.env` first** so `RPC_URL` and `PRIVATE_KEY` are set:

```bash
# Load env (PRIVATE_KEY, RPC_URL, optional PAYMENT_TOKEN, VAULT_ADDRESS, etc.)
source .env

# Dry run (no broadcast)
forge script script/DeployAll.s.sol:DeployAll --rpc-url "$RPC_URL"

# Deploy on network and write deployments/<chainId>.json
forge script script/DeployAll.s.sol:DeployAll --rpc-url "$RPC_URL" --broadcast
```

If you don’t use `source .env`, set the URL explicitly:

```bash
forge script script/DeployAll.s.sol:DeployAll --rpc-url https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY --broadcast
```

For a local chain (e.g. anvil):

```bash
forge script script/DeployAll.s.sol:DeployAll --rpc-url http://127.0.0.1:8545 --broadcast
```

After deployment, copy the addresses from `deployments/<chainId>.json` into your backend `.env` (e.g. `PAYMENT_TOKEN_ADDRESS`, `MARKET_ADDRESS`, `POLICY_ENGINE_ADDRESS`, `PERPS_ENGINE_ADDRESS`, `CHAINLINK_PRICE_FEED_ADDRESS` if you use the feed directly, or the deployed oracle address).

## Vault and private token API

The **Vault** (Compliant Private Token) is not deployed by this repo. Use an existing deployment and set `VAULT_ADDRESS` to register your token and PolicyEngine. The off-chain private balance ledger, private transfer, shielded addresses, and withdrawal tickets are provided by the **Private Token API** (e.g. Convergence demo API); point the backend at it with `PRIVATE_TOKEN_API_URL`.
