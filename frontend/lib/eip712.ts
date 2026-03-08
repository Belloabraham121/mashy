/**
 * EIP-712 signing utilities.
 * Domain and types must match backend/src/lib/eip712.ts exactly.
 */

// --- Private Prediction (prediction market) ---
export interface PrivatePredictionMessage {
  account: string
  marketId: string
  outcome: string
  amountWei: string
  timestamp: string
}

const PRIVATE_PREDICTION_DOMAIN_NAME = "MarshmallowPrivatePrediction"
const PRIVATE_PREDICTION_DOMAIN_VERSION = "0.0.1"

/**
 * Sign a Private Prediction using EIP-712 (account, marketId, outcome, amountWei, timestamp).
 * verifyingContract = marketAddress.
 */
export async function signPrivatePrediction(
  provider: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> },
  message: PrivatePredictionMessage,
  chainId: number,
  verifyingContract: string
): Promise<string> {
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      "Private Prediction": [
        { name: "account", type: "address" },
        { name: "marketId", type: "uint256" },
        { name: "outcome", type: "string" },
        { name: "amountWei", type: "uint256" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "Private Prediction",
    domain: {
      name: PRIVATE_PREDICTION_DOMAIN_NAME,
      version: PRIVATE_PREDICTION_DOMAIN_VERSION,
      chainId,
      verifyingContract,
    },
    message: {
      account: message.account,
      marketId: message.marketId,
      outcome: message.outcome,
      amountWei: message.amountWei,
      timestamp: message.timestamp,
    },
  }

  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [message.account, JSON.stringify(typedData)],
  })

  return signature as string
}

// --- Private Token Transfer (perps margin) ---
export interface PrivateTransferMessage {
  sender: string
  recipient: string
  token: string
  amount: string
  flags: string[]
  timestamp: string
}

const PRIVATE_TRANSFER_DOMAIN_NAME = "CompliantPrivateTokenDemo"
const PRIVATE_TRANSFER_DOMAIN_VERSION = "0.0.1"

/**
 * Sign a Private Token Transfer using EIP-712 via an EIP-1193 provider
 * (e.g. Privy embedded wallet provider).
 */
export async function signPrivateTransfer(
  provider: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> },
  message: PrivateTransferMessage,
  chainId: number,
  verifyingContract: string
): Promise<string> {
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      "Private Token Transfer": [
        { name: "sender", type: "address" },
        { name: "recipient", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "flags", type: "string[]" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "Private Token Transfer",
    domain: {
      name: PRIVATE_TRANSFER_DOMAIN_NAME,
      version: PRIVATE_TRANSFER_DOMAIN_VERSION,
      chainId,
      verifyingContract,
    },
    message: {
      sender: message.sender,
      recipient: message.recipient,
      token: message.token,
      amount: message.amount,
      flags: message.flags,
      timestamp: message.timestamp,
    },
  }

  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [message.sender, JSON.stringify(typedData)],
  })

  return signature as string
}
