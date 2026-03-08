import { ethers } from "ethers";

/** Types for Private Prediction only — verifyTypedData requires a single primary type. */
const PRIVATE_PREDICTION_TYPES = {
  "Private Prediction": [
    { name: "account", type: "address" },
    { name: "marketId", type: "uint256" },
    { name: "outcome", type: "string" },
    { name: "amountWei", type: "uint256" },
    { name: "timestamp", type: "uint256" },
  ],
};

/** Types for Private Token Transfer only — verifyTypedData requires a single primary type. */
const PRIVATE_TRANSFER_TYPES = {
  "Private Token Transfer": [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "flags", type: "string[]" },
    { name: "timestamp", type: "uint256" },
  ],
};

export interface PrivatePredictionMessage {
  account: string;
  marketId: string;
  outcome: string;
  amountWei: string;
  timestamp: string;
}

export function verifyPrivatePrediction(
  message: PrivatePredictionMessage,
  signature: string,
  chainId: number,
  verifyingContract: string
): string {
  const domain = { name: "MarshmallowPrivatePrediction", version: "0.0.1", chainId, verifyingContract };
  return ethers.verifyTypedData(
    domain,
    PRIVATE_PREDICTION_TYPES,
    { account: message.account, marketId: message.marketId, outcome: message.outcome, amountWei: message.amountWei, timestamp: message.timestamp },
    signature
  );
}

export interface PrivateTransferMessage {
  sender: string;
  recipient: string;
  token: string;
  amount: string;
  flags: string[];
  timestamp: string;
}

/** Verify EIP-712 signed Private Token Transfer; returns recovered sender. */
export function verifyPrivateTransfer(
  message: PrivateTransferMessage,
  signature: string,
  chainId: number,
  verifyingContract: string
): string {
  const domain = { name: "CompliantPrivateTokenDemo", version: "0.0.1", chainId, verifyingContract };
  return ethers.verifyTypedData(
    domain,
    PRIVATE_TRANSFER_TYPES,
    {
      sender: message.sender,
      recipient: message.recipient,
      token: message.token,
      amount: message.amount,
      flags: message.flags ?? [],
      timestamp: message.timestamp,
    },
    signature
  );
}
