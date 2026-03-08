/**
 * Place a private prediction (off-chain).
 *
 * Usage:
 *   npx tsx src/private-prediction.ts <marketId> <outcome> <amountWei>
 *
 * Arguments:
 *   marketId   - Market ID (number)
 *   outcome    - "Yes" or "No"
 *   amountWei  - Amount in wei (e.g. "1000000000000000000" for 1 token)
 *
 * Environment:
 *   PRIVATE_KEY              - Your wallet private key (0x-prefixed)
 *   MARSHMALLOW_BACKEND_URL  - Backend URL (default http://localhost:3001)
 *   MARKET_ADDRESS           - SimpleMarket contract address (for EIP-712 verifyingContract)
 *   CHAIN_ID                 - Chain ID (default 11155111)
 *
 * Flow: 1) Deposit to vault. 2) Private-transfer tokens to the pool address (see docs).
 *       3) Call this script to record your prediction in the exposure ledger.
 */

import { ethers } from "ethers";
import { getWallet, setUsage } from "./common.js";
import { requiredArg } from "./common.js";

setUsage(
  "npx tsx src/private-prediction.ts <marketId> <outcome> <amountWei>"
);

const EIP712_TYPES = {
  "Private Prediction": [
    { name: "account", type: "address" },
    { name: "marketId", type: "uint256" },
    { name: "outcome", type: "string" },
    { name: "amountWei", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ],
};

async function main() {
  const wallet = getWallet();
  const account = wallet.address;
  const marketId = requiredArg(0, "marketId");
  const outcome = requiredArg(1, "outcome");
  const amountWei = requiredArg(2, "amountWei");

  if (outcome !== "Yes" && outcome !== "No") {
    console.error("Error: outcome must be Yes or No");
    process.exit(1);
  }

  const backendUrl =
    process.env.MARSHMALLOW_BACKEND_URL ?? "http://localhost:3001";
  const marketAddress = process.env.MARKET_ADDRESS;
  const chainId = parseInt(process.env.CHAIN_ID ?? "11155111", 10);

  if (!marketAddress) {
    console.error(
      "Error: MARKET_ADDRESS environment variable is not set (required for EIP-712)."
    );
    process.exit(1);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const domain = {
    name: "MarshmallowPrivatePrediction",
    version: "0.0.1",
    chainId,
    verifyingContract: marketAddress,
  };
  const message = {
    account,
    marketId,
    outcome,
    amountWei,
    timestamp,
  };
  const auth = await wallet.signTypedData(
    domain,
    EIP712_TYPES,
    message
  );

  console.log(`Account:   ${account}`);
  console.log(`MarketId:  ${marketId}`);
  console.log(`Outcome:   ${outcome}`);
  console.log(`Amount:    ${amountWei}`);
  console.log(`Backend:   ${backendUrl}`);

  const response = await fetch(`${backendUrl}/api/prediction/private-prediction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marketId,
      outcome,
      amountWei,
      account,
      timestamp,
      auth,
    }),
  });

  const data = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok) {
    console.error("Error:", data.error ?? response.statusText);
    process.exit(1);
  }
  console.log("\nResponse:", JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
