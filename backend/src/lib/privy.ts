/**
 * Privy: verify access token, link wallet, get walletId for server-side signing.
 * Backend signs tx on behalf of user via Privy (app signer) – no popup.
 */
import { PrivyClient } from "@privy-io/node";
import { config } from "../config/index.js";
import { getUserWalletsCollection } from "./db.js";

let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    if (!config.privy.appId || !config.privy.appSecret) {
      throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET must be set");
    }
    privyClient = new PrivyClient({
      appId: config.privy.appId,
      appSecret: config.privy.appSecret,
    });
  }
  return privyClient;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient =
        msg.includes("SSL") ||
        msg.includes("TLS") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT");
      if (isTransient && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function verifyAccessToken(accessToken: string): Promise<{
  userId: string;
  email?: string;
  walletAddress?: string;
  walletId?: string;
}> {
  const privy = getPrivyClient();
  let verified: { user_id?: string };
  try {
    verified = await retryWithBackoff(
      () => (privy as { utils: () => { auth: () => { verifyAccessToken: (t: string) => Promise<{ user_id?: string }> } } }).utils().auth().verifyAccessToken(accessToken)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("verify") || msg.includes("Invalid") || msg.includes("expired")) {
      throw new Error("Invalid or expired login. Please sign in again.");
    }
    throw new Error(`Failed to verify token with Privy: ${msg}`);
  }
  const userId = verified?.user_id;
  if (!userId) {
    throw new Error("Invalid or expired Privy token – no userId");
  }
  const stored = await getUserWalletsCollection().findOne({ privyUserId: userId });
  if (stored?.walletAddress) {
    return {
      userId,
      email: stored.email,
      walletAddress: stored.walletAddress,
      walletId: stored.walletId,
    };
  }
  return { userId, email: undefined, walletAddress: undefined, walletId: undefined };
}

export async function linkWallet(
  privyUserId: string,
  walletAddress: string,
  walletId?: string,
  email?: string
): Promise<void> {
  const now = new Date();
  await getUserWalletsCollection().updateOne(
    { privyUserId },
    {
      $set: {
        privyUserId,
        walletAddress,
        walletId,
        email,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );
}

export async function getWalletIdForUser(privyUserId: string): Promise<string | undefined> {
  const w = await getUserWalletsCollection().findOne({ privyUserId });
  return w?.walletId;
}

export function getSignerIdForFrontend(): string {
  return config.privy.keyQuorumId ?? "";
}

export async function verifyWalletSetup(privyUserId: string): Promise<{
  isSetup: boolean;
  walletAddress?: string;
  walletId?: string;
  error?: string;
}> {
  const w = await getUserWalletsCollection().findOne({ privyUserId });
  if (!w) {
    return { isSetup: false, error: "Wallet not linked. Call POST /api/auth/link with walletAddress and walletId." };
  }
  if (!w.walletId) {
    return {
      isSetup: false,
      walletAddress: w.walletAddress,
      error: "Wallet ID missing. Provide walletId when linking.",
    };
  }
  return { isSetup: true, walletAddress: w.walletAddress, walletId: w.walletId };
}
