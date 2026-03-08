/**
 * MongoDB connection: user wallets (Privy), perps margin ledger.
 */
import { MongoClient, Db, Collection } from "mongodb";
import { config } from "../config/index.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export interface UserWallet {
  privyUserId: string;
  walletAddress: string;
  walletId?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Per-user perps margin and position (stored in MongoDB). */
export interface PerpsMarginDoc {
  walletAddress: string; // lowercase
  allocatedWei: string;
  marginInUseWei: string;
  position: {
    size: string;
    marginWei: string;
    entryPrice: string;
    leverage: number;
    openedAt: number;
  } | null;
  updatedAt: number;
}

export async function connectDB(): Promise<Db> {
  if (db) return db;
  if (!config.mongodb?.uri) {
    throw new Error("MONGODB_URI must be set when using auth/trade");
  }
  client = new MongoClient(config.mongodb.uri, {
    serverSelectionTimeoutMS: 30_000,
    connectTimeoutMS: 30_000,
  });
  await client.connect();
  db = client.db(config.mongodb.dbName);
  await db.collection<UserWallet>("userWallets").createIndex(
    { privyUserId: 1 },
    { unique: true }
  );
  await db.collection<UserWallet>("userWallets").createIndex({ walletAddress: 1 });
  await db.collection<PerpsMarginDoc>("perpsMargin").createIndex(
    { walletAddress: 1 },
    { unique: true }
  );
  return db;
}

export function getDB(): Db {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return db;
}

export function getUserWalletsCollection(): Collection<UserWallet> {
  return getDB().collection<UserWallet>("userWallets");
}

export function getPerpsMarginCollection(): Collection<PerpsMarginDoc> {
  return getDB().collection<PerpsMarginDoc>("perpsMargin");
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
