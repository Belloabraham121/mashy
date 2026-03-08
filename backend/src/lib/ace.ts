import { ethers } from "ethers";

const POLICY_ABI = [
  "function checkPrivateTransferAllowed(address sender, address recipient, uint256 amount) external view returns (bool)",
];

export async function checkPrivateTransferAllowed(
  rpcUrl: string | undefined,
  policyEngineAddress: string | undefined,
  sender: string,
  recipient: string,
  amountWei: string
): Promise<boolean> {
  if (!rpcUrl || !policyEngineAddress) return true;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(policyEngineAddress, POLICY_ABI, provider);
    const allowed = await contract.checkPrivateTransferAllowed(sender, recipient, amountWei);
    return Boolean(allowed);
  } catch {
    return true;
  }
}
