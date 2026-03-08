/**
 * Perpetuals + privacy: off-chain margin ledger in MongoDB.
 * Margin = private balance (same vault). We track margin in use and positions; withdrawals via ticket only.
 */
import { getPerpsMarginCollection } from "../lib/db.js";
import type { PerpsMarginDoc } from "../lib/db.js";

export interface PrivatePerpsPosition {
  size: string;
  marginWei: string;
  entryPrice: string;
  leverage: number;
  openedAt: number;
}

export interface PrivatePerpsUser {
  allocatedWei: string;
  marginInUseWei: string;
  position: PrivatePerpsPosition | null;
  updatedAt: number;
}

function docToUser(doc: PerpsMarginDoc | null): PrivatePerpsUser {
  if (!doc) {
    return {
      allocatedWei: "0",
      marginInUseWei: "0",
      position: null,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }
  return {
    allocatedWei: doc.allocatedWei,
    marginInUseWei: doc.marginInUseWei,
    position: doc.position,
    updatedAt: doc.updatedAt,
  };
}

async function getUser(userAddress: string): Promise<PrivatePerpsUser> {
  const key = userAddress.toLowerCase();
  const col = getPerpsMarginCollection();
  const doc = await col.findOne({ walletAddress: key });
  if (doc) return docToUser(doc);
  const now = Math.floor(Date.now() / 1000);
  const newDoc: PerpsMarginDoc = {
    walletAddress: key,
    allocatedWei: "0",
    marginInUseWei: "0",
    position: null,
    updatedAt: now,
  };
  await col.insertOne(newDoc);
  return docToUser(newDoc);
}

/** Allocate margin: user has transferred to pool; we record it. */
export async function allocateMargin(userAddress: string, amountWei: string): Promise<void> {
  const key = userAddress.toLowerCase();
  const col = getPerpsMarginCollection();
  const u = await getUser(userAddress);
  const prev = BigInt(u.allocatedWei);
  const next = (prev + BigInt(amountWei)).toString();
  const now = Math.floor(Date.now() / 1000);
  await col.updateOne(
    { walletAddress: key },
    { $set: { allocatedWei: next, updatedAt: now } },
    { upsert: true }
  );
}

/** Free margin = allocated - margin in use. */
export async function getFreeMarginWei(userAddress: string): Promise<string> {
  const u = await getUser(userAddress);
  const allocated = BigInt(u.allocatedWei);
  const inUse = BigInt(u.marginInUseWei);
  const free = allocated - inUse;
  return free > 0n ? free.toString() : "0";
}

/** Open position: consume free margin, record position. */
export async function openPrivatePosition(
  userAddress: string,
  size: string,
  marginWei: string,
  entryPrice: string,
  leverage: number
): Promise<{ ok: boolean; error?: string }> {
  const key = userAddress.toLowerCase();
  const col = getPerpsMarginCollection();
  const u = await getUser(userAddress);
  const free = BigInt(await getFreeMarginWei(userAddress));
  const margin = BigInt(marginWei);
  if (margin > free) return { ok: false, error: "Insufficient free margin" };
  if (u.position) return { ok: false, error: "Position already open" };
  const newMarginInUse = (BigInt(u.marginInUseWei) + margin).toString();
  const now = Math.floor(Date.now() / 1000);
  const position: PrivatePerpsPosition = {
    size,
    marginWei,
    entryPrice,
    leverage,
    openedAt: now,
  };
  await col.updateOne(
    { walletAddress: key },
    {
      $set: {
        marginInUseWei: newMarginInUse,
        position,
        updatedAt: now,
      },
    }
  );
  return { ok: true };
}

/** Close position: release margin, return position (caller computes PnL and pays out). */
export async function closePrivatePosition(userAddress: string): Promise<{
  ok: boolean;
  error?: string;
  position?: PrivatePerpsPosition;
  marginWei?: string;
}> {
  const key = userAddress.toLowerCase();
  const col = getPerpsMarginCollection();
  const u = await getUser(userAddress);
  if (!u.position) return { ok: false, error: "No position open" };
  const pos = u.position;
  const newMarginInUse = (BigInt(u.marginInUseWei) - BigInt(pos.marginWei)).toString();
  const now = Math.floor(Date.now() / 1000);
  await col.updateOne(
    { walletAddress: key },
    { $set: { marginInUseWei: newMarginInUse, position: null, updatedAt: now } }
  );
  return { ok: true, position: pos, marginWei: pos.marginWei };
}

/** Deallocate: pool sends back to user; we reduce allocated. */
export async function deallocateMargin(
  userAddress: string,
  amountWei: string
): Promise<{ ok: boolean; error?: string }> {
  const key = userAddress.toLowerCase();
  const col = getPerpsMarginCollection();
  const u = await getUser(userAddress);
  const free = BigInt(await getFreeMarginWei(userAddress));
  const amount = BigInt(amountWei);
  if (amount > free) return { ok: false, error: "Insufficient free margin to deallocate" };
  const next = (BigInt(u.allocatedWei) - amount).toString();
  const now = Math.floor(Date.now() / 1000);
  await col.updateOne(
    { walletAddress: key },
    { $set: { allocatedWei: next, updatedAt: now } }
  );
  return { ok: true };
}

/** After close: reduce allocated by (margin + PnL) paid out to user. */
export async function recordPayout(userAddress: string, amountWei: string): Promise<void> {
  const key = userAddress.toLowerCase();
  const col = getPerpsMarginCollection();
  const u = await getUser(userAddress);
  const a = BigInt(u.allocatedWei);
  const pay = BigInt(amountWei);
  const next = a > pay ? (a - pay).toString() : "0";
  const now = Math.floor(Date.now() / 1000);
  await col.updateOne(
    { walletAddress: key },
    { $set: { allocatedWei: next, updatedAt: now } }
  );
}

export async function getPrivatePerpsStatus(userAddress: string): Promise<PrivatePerpsUser> {
  const u = await getUser(userAddress);
  return { ...u };
}

export async function getAllocatedWei(userAddress: string): Promise<string> {
  const u = await getUser(userAddress);
  return u.allocatedWei;
}
