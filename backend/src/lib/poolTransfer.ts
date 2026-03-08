import { ethers } from "ethers";

const EIP712_TYPES = {
  "Private Token Transfer": [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "flags", type: "string[]" },
    { name: "timestamp", type: "uint256" },
  ],
};

export interface PoolTransferPayload {
  account: string;
  recipient: string;
  token: string;
  amount: string;
  flags: string[];
  timestamp: number;
  auth: string;
}

export async function signAndBuildPoolTransfer(
  poolWallet: ethers.Wallet,
  recipient: string,
  token: string,
  amountWei: string,
  chainId: number,
  verifyingContract: string
): Promise<PoolTransferPayload> {
  const sender = poolWallet.address;
  const timestamp = Math.floor(Date.now() / 1000);
  const flags: string[] = [];
  const domain = { name: "CompliantPrivateTokenDemo", version: "0.0.1", chainId, verifyingContract };
  const auth = await poolWallet.signTypedData(
    domain,
    EIP712_TYPES,
    { sender, recipient, token, amount: amountWei, flags, timestamp }
  );
  return { account: sender, recipient, token, amount: amountWei, flags, timestamp, auth };
}
