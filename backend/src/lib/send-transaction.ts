/**
 * Send a transaction from the user's Privy wallet; backend signs via app authorization key (no popup).
 * Same flow for prediction market, vault, and perp txs.
 * @see https://docs.privy.io/wallets/wallets/server-side-access
 */
import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { getPrivyClient } from "./privy.js";
import { config } from "../config/index.js";

const caip2 = `eip155:${config.chainId}`;

function normalizePemString(raw: string): string {
  let s = raw.replace(/\\n/g, "\n").trim();
  const beginMatch = s.match(/-----BEGIN[^-]+-----/);
  const endMatch = s.match(/-----END[^-]+-----/);
  if (!beginMatch || !endMatch) return s.replace(/\s+/g, "\n");
  const header = beginMatch[0];
  const footer = endMatch[0];
  const start = s.indexOf(header) + header.length;
  const end = s.indexOf(footer);
  const body = s.slice(start, end).replace(/\s/g, "");
  const lines: string[] = [];
  for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));
  return `${header}\n${lines.join("\n")}\n${footer}`;
}

function pemToPkcs8Base64(pem: string): string {
  const trimmed = pem.trim();
  if (!trimmed) throw new Error("Authorization private key is empty");
  if (!trimmed.includes("-----BEGIN")) return trimmed;
  try {
    const key = createPrivateKey({ key: trimmed, format: "pem" });
    const pkcs8Der = key.export({ type: "pkcs8", format: "der" });
    if (!Buffer.isBuffer(pkcs8Der)) throw new Error("Key export did not return a Buffer");
    return pkcs8Der.toString("base64");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to convert authorization private key to PKCS8: ${msg}. Use a valid P-256 EC PEM.`);
  }
}

function getAuthorizationPrivateKey(): string {
  const fromEnv = config.privy.authorizationPrivateKey;
  if (fromEnv) return pemToPkcs8Base64(normalizePemString(fromEnv));
  const path = config.privy.authorizationPrivateKeyPath;
  if (!path) throw new Error("Set AUTHORIZATION_PRIVATE_KEY or AUTHORIZATION_PRIVATE_KEY_PATH to send transactions");
  const pathTrimmed = path.trim();
  if (pathTrimmed.includes("-----BEGIN")) return pemToPkcs8Base64(normalizePemString(pathTrimmed));
  const pem = readFileSync(path, "utf8").trim();
  if (!pem) throw new Error("Authorization private key file is empty");
  return pemToPkcs8Base64(pem);
}

export interface SendTransactionParams {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export async function sendTransactionAsUser(
  walletId: string,
  params: SendTransactionParams
): Promise<{ hash: string }> {
  if (!walletId) throw new Error("Wallet ID is required");
  const privy = getPrivyClient();
  const authKey = getAuthorizationPrivateKey();
  const valueHex = params.value != null ? `0x${params.value.toString(16)}` : "0x0";
  const transaction: Record<string, string> = {
    to: params.to,
    value: valueHex,
    data: params.data ?? "0x",
  };
  if (params.gas != null) transaction.gas_limit = `0x${params.gas.toString(16)}`;
  if (params.gasPrice != null) transaction.gas_price = `0x${params.gasPrice.toString(16)}`;
  if (params.maxFeePerGas != null) transaction.max_fee_per_gas = `0x${params.maxFeePerGas.toString(16)}`;
  if (params.maxPriorityFeePerGas != null) transaction.max_priority_fee_per_gas = `0x${params.maxPriorityFeePerGas.toString(16)}`;
  if (params.nonce != null) transaction.nonce = params.nonce.toString();

  try {
    const response = await privy
      .wallets()
      .ethereum()
      .sendTransaction(walletId, {
        caip2,
        params: { transaction },
        authorization_context: { authorization_private_keys: [authKey] },
      });
    const hash = (response as { hash?: string; transaction_hash?: string }).hash ?? (response as { transaction_hash?: string }).transaction_hash;
    if (!hash) throw new Error("Privy sendTransaction did not return a transaction hash");
    console.log(`[Server-side TX] ${hash} from wallet ${walletId} to ${params.to}`);
    return { hash };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Server-side TX] Failed:", { walletId, to: params.to, error: msg });
    if (msg.includes("authorization") || msg.includes("signer")) {
      throw new Error(`Authorization failed. User must add backend as signer (addSigners) with signerId: ${config.privy.keyQuorumId}`);
    }
    if (msg.includes("wallet") || msg.includes("not found")) {
      throw new Error("Wallet not found or not linked. Call POST /api/auth/link first.");
    }
    throw new Error(`Failed to send transaction: ${msg}`);
  }
}
