/**
 * Perpetuals (own contracts): encode open/close/liquidate, ACE gating, optional risk checks.
 */
import { ethers } from "ethers";
import { config } from "../config/index.js";
import { checkPrivateTransferAllowed } from "../lib/ace.js";

let poolWallet: ethers.Wallet | null = null;
export function getPoolWallet(): ethers.Wallet | null {
  if (poolWallet) return poolWallet;
  if (config.poolPrivateKey) poolWallet = new ethers.Wallet(config.poolPrivateKey);
  return poolWallet;
}

export function getPoolAddress(): string | null {
  return getPoolWallet()?.address ?? null;
}

const PERPS_ENGINE_ABI = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function openPosition(int256 size, uint256 margin, uint256 leverage)",
  "function closePosition()",
  "function liquidate(address user)",
  "function getPosition(address user) view returns (tuple(int256 size, uint256 margin, uint256 entryPrice, uint256 leverage, uint256 lastFundingAt))",
  "function getUnrealizedPnL(address user) view returns (int256)",
  "function isLiquidatable(address user) view returns (bool)",
];

const iface = new ethers.Interface(PERPS_ENGINE_ABI);

export function getPerpsEngineAddress(): string {
  return config.perpsEngineAddress;
}

export function encodeDeposit(amountWei: string): string {
  return iface.encodeFunctionData("deposit", [BigInt(amountWei)]);
}

export function encodeWithdraw(amountWei: string): string {
  return iface.encodeFunctionData("withdraw", [BigInt(amountWei)]);
}

export function encodeOpenPosition(size: string, marginWei: string, leverage: number): string {
  return iface.encodeFunctionData("openPosition", [BigInt(size), BigInt(marginWei), leverage]);
}

export function encodeClosePosition(): string {
  return iface.encodeFunctionData("closePosition", []);
}

export function encodeLiquidate(userAddress: string): string {
  return iface.encodeFunctionData("liquidate", [userAddress]);
}

/**
 * ACE (PolicyEngine) check for perps: deposit/margin movement.
 * Uses same checkPrivateTransferAllowed (sender = user, recipient = engine, amount = margin).
 */
export async function checkPerpsAllowed(userAddress: string, marginAmountWei: string): Promise<boolean> {
  const engineAddress = config.perpsEngineAddress;
  if (!engineAddress) return true;
  return checkPrivateTransferAllowed(
    config.rpcUrl || undefined,
    config.policyEngineAddress || undefined,
    userAddress,
    engineAddress,
    marginAmountWei
  );
}

export async function getPosition(userAddress: string): Promise<{
  size: string;
  margin: string;
  entryPrice: string;
  leverage: number;
  lastFundingAt: number;
} | null> {
  const rpcUrl = config.rpcUrl;
  const engineAddress = config.perpsEngineAddress;
  if (!rpcUrl || !engineAddress) return null;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const engine = new ethers.Contract(engineAddress, PERPS_ENGINE_ABI, provider);
    const pos = await engine.getPosition(userAddress);
    if (pos.leverage === 0n) return null;
    return {
      size: pos.size.toString(),
      margin: pos.margin.toString(),
      entryPrice: pos.entryPrice.toString(),
      leverage: Number(pos.leverage),
      lastFundingAt: Number(pos.lastFundingAt),
    };
  } catch {
    return null;
  }
}

export async function isLiquidatable(userAddress: string): Promise<boolean> {
  const rpcUrl = config.rpcUrl;
  const engineAddress = config.perpsEngineAddress;
  if (!rpcUrl || !engineAddress) return false;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const engine = new ethers.Contract(engineAddress, PERPS_ENGINE_ABI, provider);
    return await engine.isLiquidatable(userAddress);
  } catch {
    return false;
  }
}

const PNL_TO_COLLATERAL = 100; // 8 decimals -> 6 decimals

/**
 * Compute PnL in collateral units (6 decimals) for private perps close.
 * size: signed string (positive = long, negative = short). entryPrice/currentPrice: 8 decimals.
 */
export function computePnLCollateral(
  sizeStr: string,
  entryPriceStr: string,
  currentPriceStr: string
): bigint {
  const size = BigInt(sizeStr);
  const entryPrice = BigInt(entryPriceStr);
  const currentPrice = BigInt(currentPriceStr);
  const diff = currentPrice - entryPrice;
  if (size > 0n) {
    return (size * diff) / 10n ** 8n / BigInt(PNL_TO_COLLATERAL);
  }
  return (-size * diff) / 10n ** 8n / BigInt(PNL_TO_COLLATERAL);
}
