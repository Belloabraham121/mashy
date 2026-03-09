const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export const EXPLORER_BASE = "https://sepolia.etherscan.io"
export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`
}
export function explorerAddressUrl(addr: string): string {
  return `${EXPLORER_BASE}/address/${addr}`
}

export interface LoginResponse {
  token: string | null
  walletAddress: string | null
  signerId?: string
  email?: string
  message?: string
}

export async function authLogin(accessToken: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Login failed: ${res.status}`)
  }
  return res.json()
}

export interface LinkResponse {
  token: string
  walletAddress: string
  signerId?: string
  email?: string
}

export async function authLink(
  accessToken: string,
  walletAddress: string,
  walletId?: string
): Promise<LinkResponse> {
  const res = await fetch(`${API_BASE}/api/auth/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, walletAddress, walletId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Link failed: ${res.status}`)
  }
  return res.json()
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }
}

// --- Perps (JWT required) ---
export interface PerpsStatus {
  allocatedWei: string
  marginInUseWei: string
  freeMarginWei: string
  position: {
    size: string
    marginWei: string
    entryPrice: string
    leverage: number
    openedAt: number
  } | null
  withdrawViaTicketOnly: boolean
}

export async function perpsStatus(token: string): Promise<PerpsStatus> {
  const res = await fetch(`${API_BASE}/api/perps/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error("Failed to load perps status")
  return res.json()
}

export async function perpsPrice(): Promise<{ price: string; updatedAt: number }> {
  const res = await fetch(`${API_BASE}/api/perps/price`)
  if (!res.ok) throw new Error("Failed to load price")
  return res.json()
}


export async function perpsAllocate(
  token: string,
  body: {
    account: string
    recipient: string
    token: string
    amountWei: string
    timestamp: string
    auth: string
    flags?: string[]
  }
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/perps/allocate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Allocate failed")
  }
  return res.json()
}

export async function perpsOpen(
  token: string,
  body: { size: string; marginWei: string; leverage: number }
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/perps/open`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; freeMarginWei?: string }
    let msg = err.error ?? "Open failed"
    if (err.error?.toLowerCase().includes("insufficient") && err.freeMarginWei != null) {
      const free = (Number(err.freeMarginWei) / 1e6).toFixed(2)
      msg = `${err.error} (you have ${free} PUSD available)`
    }
    throw new Error(msg)
  }
  return res.json()
}

export async function perpsClose(token: string): Promise<{
  ok: boolean
  payoutWei?: string
  pnlCollateral?: string
}> {
  const res = await fetch(`${API_BASE}/api/perps/close`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; hint?: string }
    const msg = err.hint ? `${err.error ?? "Close failed"}. ${err.hint}` : (err.error ?? "Close failed")
    throw new Error(msg)
  }
  return res.json()
}

export async function perpsDeallocate(
  token: string,
  body: { amountWei: string }
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/api/perps/deallocate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Deallocate failed")
  }
  return res.json()
}

// --- Config (public) ---
export interface AppConfig {
  chainId: number
  poolAddress: string
  paymentTokenAddress: string
  /** Payment token decimals (6 = USDC-style, 18 = default ERC20). Use for human amount → wei. */
  paymentTokenDecimals?: number
  vaultAddress: string
  perpsEngineAddress: string
  marketAddress: string
  signerId: string
}

export async function getConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE}/api/config`)
  if (!res.ok) throw new Error("Failed to load config")
  return res.json()
}

// --- Admin ---
/** Mint payment token. Pass human amount (e.g. 100) so backend uses token decimals from chain. */
export async function adminMint(
  to: string,
  amountOrWei?: number | string
): Promise<{ ok: boolean; to: string; amountWei: string; txHash: string }> {
  const body: { to: string; amount?: number; amountWei?: string } = { to }
  if (typeof amountOrWei === "number" && !Number.isNaN(amountOrWei)) {
    body.amount = amountOrWei
  } else if (typeof amountOrWei === "string") {
    body.amountWei = amountOrWei
  }
  const res = await fetch(`${API_BASE}/api/admin/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Mint failed")
  }
  return res.json()
}

// --- Trade (server-signed tx via Privy) ---
export async function tradeSend(
  token: string,
  body: {
    to: string
    value?: string
    data?: string
    gas?: string
  }
): Promise<{ hash: string }> {
  const res = await fetch(`${API_BASE}/api/trade/send`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Trade send failed")
  }
  return res.json()
}

// --- Prediction ---

export interface OnChainMarket {
  id: number
  question: string
  marketOpen: number
  marketClose: number
  status: "Open" | "SettlementRequested" | "Settled" | "NeedsManual"
  outcome: "None" | "No" | "Yes" | "Inconclusive"
  settledAt: number
  evidenceURI: string
  confidenceBps: number
  predCounts: { no: string; yes: string }
  predTotals: { no: string; yes: string }
}

export async function predictionMarkets(): Promise<OnChainMarket[]> {
  const res = await fetch(`${API_BASE}/api/prediction/markets`)
  if (!res.ok) throw new Error("Failed to load markets")
  return res.json()
}

export async function predictionMarket(id: number): Promise<OnChainMarket> {
  const res = await fetch(`${API_BASE}/api/prediction/markets/${id}`)
  if (!res.ok) throw new Error("Failed to load market")
  return res.json()
}

export async function predictionPredict(
  marketId: number,
  outcome: "Yes" | "No",
  amountWei: string,
  userAddress: string
): Promise<{ ok: boolean; txHash: string }> {
  const res = await fetch(`${API_BASE}/api/prediction/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketId, outcome, amountWei, userAddress }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Failed to place prediction")
  }
  return res.json()
}

export async function predictionPrivatePredict(body: {
  marketId: number
  outcome: string
  amountWei: string
  account: string
  timestamp: string
  auth: string
}): Promise<{ ok: boolean; message: string; marketId: number; outcome: string; amountWei: string }> {
  const res = await fetch(`${API_BASE}/api/prediction/private-prediction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? "Private prediction failed")
  }
  return res.json()
}

export interface ExposureEntry {
  account: string
  marketId: number
  outcome: string
  amountWei: string
}

export async function predictionExposure(marketId?: number): Promise<ExposureEntry[]> {
  const q = marketId != null ? `?marketId=${marketId}` : ""
  const res = await fetch(`${API_BASE}/api/prediction/exposure${q}`)
  if (!res.ok) throw new Error("Failed to load exposure")
  const data = await res.json()
  return Array.isArray(data) ? data : []
}
