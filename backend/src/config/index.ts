import "dotenv/config";
import { loadDeployment } from "./deployments.js";

const chainId = parseInt(process.env.CHAIN_ID ?? "11155111", 10);
const deployment = loadDeployment(chainId);

/** Resolve address: env override, else deployment file, else default/empty */
function addr(
  envKey: string,
  deploymentValue: string | undefined,
  fallback: string = ""
): string {
  const env = process.env[envKey];
  if (env && env.trim() !== "") return env.trim();
  if (deploymentValue) return deploymentValue;
  return fallback;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",

  jwt: {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },

  privy: {
    appId: process.env.PRIVY_APP_ID ?? "",
    appSecret: process.env.PRIVY_APP_SECRET ?? "",
    keyQuorumId: process.env.PRIVY_KEY_QUORUM_ID ?? "",
    authorizationPrivateKey: process.env.AUTHORIZATION_PRIVATE_KEY ?? "",
    authorizationPrivateKeyPath:
      process.env.AUTHORIZATION_PRIVATE_KEY_PATH ?? "",
  },

  chainId,
  rpcUrl: process.env.RPC_URL ?? "",

  /** Prediction market + privacy token (from deployment or env) */
  vaultAddress: addr(
    "VAULT_ADDRESS",
    deployment?.vault,
    "0xE588a6c73933BFD66Af9b4A07d48bcE59c0D2d13"
  ),
  paymentTokenAddress: addr("PAYMENT_TOKEN_ADDRESS", deployment?.paymentToken),
  marketAddress: addr("MARKET_ADDRESS", deployment?.simpleMarket),
  policyEngineAddress: addr("POLICY_ENGINE_ADDRESS", deployment?.policyEngine),
  privateTokenApiUrl:
    process.env.PRIVATE_TOKEN_API_URL ??
    "https://convergence2026-token-api.cldev.cloud",
  /** When true, allocate margin even if external private-transfer API fails (e.g. policy denied). Dev only. */
  allowAllocateWithoutExternalTransfer:
    process.env.ALLOW_ALLOCATE_WITHOUT_EXTERNAL_TRANSFER === "true",
  poolPrivateKey: process.env.POOL_PRIVATE_KEY ?? "",
  exposureLedgerPath: process.env.EXPOSURE_LEDGER_PATH ?? "",

  /** Perpetuals (from deployment or env) */
  perpsEngineAddress: addr("PERPS_ENGINE_ADDRESS", deployment?.perpsEngine),
  priceOracleAddress: addr("PRICE_ORACLE_ADDRESS", deployment?.priceOracle),
  chainlinkPriceFeedAddress: process.env.CHAINLINK_PRICE_FEED_ADDRESS ?? "",

  /** Deployer/minter: same key used to deploy contracts (SimpleToken owner). Enables mint/faucet. */
  deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY ?? "",

  /** Perpetuals + privacy (margin ledger path) */
  perpsMarginLedgerPath: process.env.PERPS_MARGIN_LEDGER_PATH ?? "",

  /** CRE webhook: optional secret for POST /api/perps/cre-signal */
  creWebhookSecret: process.env.CRE_WEBHOOK_SECRET ?? "",

  mongodb: {
    uri: process.env.MONGODB_URI ?? "",
    dbName: process.env.MONGODB_DB_NAME ?? "marshmallow",
  },
};
