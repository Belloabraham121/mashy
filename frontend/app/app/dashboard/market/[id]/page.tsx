"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useWallets } from "@privy-io/react-auth"
import {
  predictionMarket,
  predictionPrivatePredict,
  predictionExposure,
  adminMint,
  getConfig,
  explorerTxUrl,
  type OnChainMarket,
  type ExposureEntry,
  type AppConfig,
} from "@/lib/api"
import { signPrivatePrediction } from "@/lib/eip712"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWei(wei: string, decimals = 6): string {
  const n = Number(BigInt(wei)) / 10 ** decimals
  if (n === 0) return "0"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function timeRemaining(closeTs: number): string {
  const diff = closeTs * 1000 - Date.now()
  if (diff <= 0) return "Closed"
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h ${mins}m remaining`
  return `${mins}m remaining`
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

// ─── Probability Chart ────────────────────────────────────────────────────────

function ProbabilityChart({ yesPct, noPct }: { yesPct: number; noPct: number }) {
  const W = 600
  const H = 200
  const padding = 40
  const chartW = W - padding * 2
  const chartH = H - padding * 2

  const points = 36
  const yesLine: number[] = []
  const noLine: number[] = []
  let yVal = 50
  for (let i = 0; i < points; i++) {
    yVal += (yesPct - yVal) * 0.15 + (Math.random() - 0.5) * 4
    yVal = Math.max(2, Math.min(98, yVal))
    if (i === points - 1) yVal = yesPct
    yesLine.push(yVal)
    noLine.push(100 - yVal)
  }

  function toPath(data: number[]) {
    const pts = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * chartW,
      y: padding + chartH - (v / 100) * chartH,
    }))
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2
      d += ` C${cpx.toFixed(1)},${pts[i - 1].y.toFixed(1)} ${cpx.toFixed(1)},${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`
    }
    return d
  }

  const gridLines = [0, 25, 50, 75, 100]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
      {gridLines.map((v) => {
        const y = padding + chartH - (v / 100) * chartH
        return (
          <g key={v}>
            <line x1={padding} y1={y} x2={W - padding} y2={y} stroke="currentColor" strokeOpacity={0.08} />
            <text x={padding - 6} y={y + 3} textAnchor="end" fill="currentColor" fillOpacity={0.3} fontSize={9} fontFamily="monospace">{v}%</text>
          </g>
        )
      })}
      <defs>
        <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${toPath(yesLine)} L${W - padding},${padding + chartH} L${padding},${padding + chartH} Z`} fill="url(#yesGrad)" />
      <path d={toPath(yesLine)} fill="none" stroke="#22c55e" strokeWidth={2} />
      <path d={toPath(noLine)} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} />
      <circle cx={W - padding} cy={padding + chartH - (yesPct / 100) * chartH} r={4} fill="#22c55e" />
      <circle cx={W - padding} cy={padding + chartH - (noPct / 100) * chartH} r={4} fill="#ef4444" />
    </svg>
  )
}

// ─── Order Book Summary ───────────────────────────────────────────────────────

function OrderBookSummary({
  market,
  paymentTokenDecimals = 6,
}: {
  market: OnChainMarket
  paymentTokenDecimals?: number
}) {
  const yesTotal = BigInt(market.predTotals.yes)
  const noTotal = BigInt(market.predTotals.no)
  const total = yesTotal + noTotal
  const yesPct = total > 0n ? Number((yesTotal * 100n) / total) : 50
  const noPct = 100 - yesPct
  const fmt = (wei: string) => formatWei(wei, paymentTokenDecimals)

  return (
    <div className="border border-border bg-card/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-xs font-medium text-foreground">Order Book</h3>
        <span className="font-mono text-[10px] text-muted-foreground">{fmt(total.toString())} Vol.</span>
      </div>
      <div className="mb-3 flex h-2 overflow-hidden rounded-sm">
        <div className="bg-green-500/60 transition-all" style={{ width: `${yesPct}%` }} />
        <div className="bg-red-500/60 transition-all" style={{ width: `${noPct}%` }} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-foreground">Yes</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{market.predCounts.yes} bets</span>
            <span className="text-green-400 font-medium">{fmt(market.predTotals.yes)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            <span className="text-foreground">No</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{market.predCounts.no} bets</span>
            <span className="text-red-400 font-medium">{fmt(market.predTotals.no)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Private Prediction Modal ─────────────────────────────────────────────────

type PredictStep = "input" | "minting" | "signing" | "predicting" | "done" | "error"

const STEP_LABELS: Record<PredictStep, string> = {
  input: "Enter amount",
  minting: "Minting mock USDC…",
  signing: "Signing private transfer…",
  predicting: "Recording private prediction…",
  done: "Prediction placed",
  error: "Error",
}

const PIPELINE_STEPS: PredictStep[] = ["minting", "signing", "predicting"]

function PredictModal({
  open,
  onClose,
  onSuccess,
  marketId,
  marketQuestion,
  jwtToken,
  walletAddress,
  appConfig,
  defaultOutcome,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  marketId: number
  marketQuestion: string
  jwtToken: string
  walletAddress: string
  appConfig: AppConfig | null
  defaultOutcome: "Yes" | "No"
}) {
  const { wallets } = useWallets()
  const [amount, setAmount] = useState("")
  const [outcome, setOutcome] = useState<"Yes" | "No">(defaultOutcome)
  const [step, setStep] = useState<PredictStep>("input")
  const [error, setError] = useState<string | null>(null)
  const [txHashes, setTxHashes] = useState<Record<string, string>>({})

  const reset = () => {
    setAmount("")
    setOutcome(defaultOutcome)
    setStep("input")
    setError(null)
    setTxHashes({})
  }

  const handlePredict = async () => {
    if (!appConfig || !walletAddress || !amount) return
    const amountNum = Number(amount)
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Enter a valid amount")
      setStep("error")
      return
    }
    try {
      setStep("minting")
      const mintResult = await adminMint(walletAddress, amountNum)
      const amountWei = mintResult.amountWei
      setTxHashes((h) => ({ ...h, mint: mintResult.txHash }))

      setStep("signing")
      const embedded = wallets.find((w) => w.walletClientType === "privy")
      if (!embedded) throw new Error("Embedded wallet not found")
      const provider = await embedded.getEthereumProvider()
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = await signPrivatePrediction(
        provider,
        {
          account: walletAddress,
          marketId: String(marketId),
          outcome,
          amountWei,
          timestamp,
        },
        appConfig.chainId,
        appConfig.marketAddress
      )

      setStep("predicting")
      await predictionPrivatePredict({
        marketId,
        outcome,
        amountWei,
        account: walletAddress,
        timestamp,
        auth: signature,
      })

      setStep("done")
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prediction failed")
      setStep("error")
    }
  }

  if (!open) return null

  const isProcessing = step !== "input" && step !== "done" && step !== "error"
  const stepIndex = PIPELINE_STEPS.indexOf(step)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-border bg-background p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-mono text-sm font-medium text-foreground">
            Private Prediction
          </h3>
          <button
            type="button"
            onClick={() => { reset(); onClose() }}
            disabled={isProcessing}
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            x
          </button>
        </div>

        {step === "input" && (
          <div className="space-y-4">
            <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
              Mints mock USDC, deposits into the privacy vault, signs a private transfer, and records your prediction off-chain.
            </p>

            <div className="font-mono text-[10px] text-muted-foreground">
              <span className="text-foreground">Market:</span> {marketQuestion.length > 60 ? `${marketQuestion.slice(0, 60)}…` : marketQuestion}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOutcome("Yes")}
                className={cn(
                  "flex-1 py-2 font-mono text-xs font-medium transition-colors",
                  outcome === "Yes"
                    ? "bg-green-600/30 text-green-400 ring-1 ring-green-500/50"
                    : "border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setOutcome("No")}
                className={cn(
                  "flex-1 py-2 font-mono text-xs font-medium transition-colors",
                  outcome === "No"
                    ? "bg-red-500/30 text-red-400 ring-1 ring-red-500/50"
                    : "border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                No
              </button>
            </div>

            <div className="border border-border">
              <div className="flex items-center justify-between px-3 py-2">
                <input
                  type="number"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  min="1"
                  step="1"
                />
                <span className="font-mono text-xs text-muted-foreground">USDC</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePredict}
              disabled={!amount || Number(amount) <= 0 || !appConfig}
              className={cn(
                "w-full py-2.5 font-mono text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50",
                outcome === "Yes" ? "bg-green-600" : "bg-red-600"
              )}
            >
              {appConfig ? `Predict ${outcome}` : "Loading config…"}
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="space-y-3">
            {PIPELINE_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 font-mono text-[10px]">
                <span className={cn(
                  "flex h-4 w-4 items-center justify-center border text-[8px]",
                  i < stepIndex ? "border-green-500 text-green-400" :
                  i === stepIndex ? "border-foreground text-foreground animate-pulse" :
                  "border-border text-muted-foreground"
                )}>
                  {i < stepIndex ? "✓" : i + 1}
                </span>
                <span className={i <= stepIndex ? "text-foreground" : "text-muted-foreground"}>
                  {STEP_LABELS[s]}
                </span>
                {i < stepIndex && txHashes[["mint", "", ""][i]] && (
                  <a
                    href={explorerTxUrl(txHashes[["mint", "", ""][i]])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-blue-400 underline hover:text-blue-300"
                  >
                    {shortHash(txHashes[["mint", "", ""][i]])}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="border border-green-500/30 bg-green-500/10 p-3">
              <p className="font-mono text-xs text-green-400">
                {amount} USDC prediction on {outcome} placed privately.
              </p>
            </div>

            {Object.entries(txHashes).length > 0 && (
              <div className="space-y-1.5">
                <span className="font-mono text-[10px] text-muted-foreground">On-chain transactions:</span>
                {Object.entries(txHashes).map(([label, hash]) => (
                  <div key={label} className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-muted-foreground capitalize">{label}</span>
                    <a
                      href={explorerTxUrl(hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline hover:text-blue-300"
                    >
                      {shortHash(hash)} ↗
                    </a>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => { reset(); onClose() }}
              className="w-full border border-border py-2 font-mono text-xs text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Close
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4">
            <div className="border border-red-500/30 bg-red-500/10 p-3">
              <p className="font-mono text-xs text-red-400 wrap-break-word">{error}</p>
            </div>

            {Object.entries(txHashes).length > 0 && (
              <div className="space-y-1.5">
                <span className="font-mono text-[10px] text-muted-foreground">Completed transactions:</span>
                {Object.entries(txHashes).map(([label, hash]) => (
                  <div key={label} className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-muted-foreground capitalize">{label}</span>
                    <a
                      href={explorerTxUrl(hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline hover:text-blue-300"
                    >
                      {shortHash(hash)} ↗
                    </a>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={reset}
                className="border border-border py-2 font-mono text-xs text-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => { reset(); onClose() }}
                className="border border-border py-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Trading Panel ────────────────────────────────────────────────────────────

function TradingPanel({
  market,
  onPredict,
  loading,
}: {
  market: OnChainMarket
  onPredict: (outcome: "Yes" | "No") => void
  loading: boolean
}) {
  const [tab, setTab] = useState<"buy" | "sell">("buy")
  const [outcome, setOutcome] = useState<"Yes" | "No">("Yes")

  const yesTotal = BigInt(market.predTotals.yes)
  const noTotal = BigInt(market.predTotals.no)
  const total = yesTotal + noTotal
  const yesPct = total > 0n ? Number((yesTotal * 100n) / total) : 50
  const noPct = 100 - yesPct

  const isOpen = market.status === "Open" && market.marketClose * 1000 > Date.now()

  return (
    <div className="border border-border bg-card/30">
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setTab("buy")}
          className={cn(
            "flex-1 py-2.5 font-mono text-xs font-medium transition-colors",
            tab === "buy" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setTab("sell")}
          className={cn(
            "flex-1 py-2.5 font-mono text-xs font-medium transition-colors",
            tab === "sell" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Sell
        </button>
        <div className="flex items-center border-l border-border px-3">
          <span className="font-mono text-[10px] text-muted-foreground">Limit</span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOutcome("Yes")}
            className={cn(
              "flex-1 py-2.5 font-mono text-sm font-medium transition-colors",
              outcome === "Yes"
                ? "bg-green-600/30 text-green-400 ring-1 ring-green-500/50"
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            Yes {yesPct}¢
          </button>
          <button
            type="button"
            onClick={() => setOutcome("No")}
            className={cn(
              "flex-1 py-2.5 font-mono text-sm font-medium transition-colors",
              outcome === "No"
                ? "bg-red-500/30 text-red-400 ring-1 ring-red-500/50"
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            No {noPct}¢
          </button>
        </div>

        <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
          Clicking below opens the private deposit &amp; predict flow. Your funds go through the privacy vault — no on-chain visibility of your prediction.
        </p>

        <button
          type="button"
          disabled={!isOpen || loading}
          onClick={() => onPredict(outcome)}
          className={cn(
            "w-full py-3 font-mono text-sm font-medium transition-colors",
            !isOpen
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : outcome === "Yes"
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-red-600 text-white hover:bg-red-700",
            loading && "opacity-50 cursor-wait"
          )}
        >
          {loading ? "Processing…" : !isOpen ? "Market Closed" : `${tab === "buy" ? "Buy" : "Sell"} ${outcome}`}
        </button>

        <p className="text-center font-mono text-[9px] text-muted-foreground/60">
          By trading, you agree to the Terms of Use.
        </p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { token, walletAddress } = useAuth()
  const [market, setMarket] = useState<OnChainMarket | null>(null)
  const [exposure, setExposure] = useState<ExposureEntry[]>([])
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalOutcome, setModalOutcome] = useState<"Yes" | "No">("Yes")

  const id = Number(params.id)

  const fetchMarket = useCallback(() => {
    predictionMarket(id)
      .then(setMarket)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetchMarket()
    predictionExposure(id).then(setExposure).catch(() => {})
    getConfig().then(setAppConfig).catch(() => {})
  }, [id, fetchMarket])

  const handleOpenPredict = (outcome: "Yes" | "No") => {
    if (!token || !walletAddress) return
    setModalOutcome(outcome)
    setModalOpen(true)
  }

  const handlePredictSuccess = () => {
    fetchMarket()
    predictionExposure(id).then(setExposure).catch(() => {})
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="animate-pulse font-mono text-xs text-muted-foreground">Loading market…</span>
      </div>
    )
  }

  if (!market) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <span className="font-mono text-sm text-muted-foreground">Market not found</span>
        <button
          type="button"
          onClick={() => router.back()}
          className="border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          ← Go back
        </button>
      </div>
    )
  }

  const yesTotal = BigInt(market.predTotals.yes)
  const noTotal = BigInt(market.predTotals.no)
  const total = yesTotal + noTotal
  const yesPct = total > 0n ? Number((yesTotal * 100n) / total) : 50
  const noPct = 100 - yesPct
  const isOpen = market.status === "Open" && market.marketClose * 1000 > Date.now()
  const decimals = appConfig?.paymentTokenDecimals ?? 6
  const fmt = (wei: string) => formatWei(wei, decimals)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4">
      <Link
        href="/app/dashboard"
        className="mb-4 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to markets
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              {isOpen ? (
                <span className="inline-flex items-center gap-1 rounded-sm bg-green-600/20 px-2 py-0.5 font-mono text-[10px] text-green-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {market.status}
                </span>
              )}
              <span className="font-mono text-[10px] text-muted-foreground">
                {timeRemaining(market.marketClose)}
              </span>
              {appConfig && (
                <a
                  href={`https://sepolia.etherscan.io/address/${appConfig.marketAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-blue-400 underline hover:text-blue-300"
                >
                  View on Etherscan ↗
                </a>
              )}
            </div>
            <h1 className="font-mono text-lg font-semibold text-foreground leading-tight">
              {market.question}
            </h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold text-foreground">{yesPct}%</div>
            <div className="font-mono text-[10px] text-muted-foreground">chance</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <span>{fmt(total.toString())} Vol.</span>
          <span>{Number(market.predCounts.yes) + Number(market.predCounts.no)} predictions</span>
          <span>Opened {new Date(market.marketOpen * 1000).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="border border-border bg-card/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-mono text-[10px] text-green-400">Yes {yesPct}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span className="font-mono text-[10px] text-red-400">No {noPct}%</span>
                </div>
              </div>
              <div className="flex gap-1">
                {["5 Min", "15 Min", "1 Hour", "1 Day"].map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    className={cn(
                      "px-2 py-0.5 font-mono text-[10px] transition-colors",
                      i === 2 ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-48 lg:h-64">
              <ProbabilityChart yesPct={yesPct} noPct={noPct} />
            </div>
          </div>

          <OrderBookSummary market={market} paymentTokenDecimals={decimals} />

          {exposure.length > 0 && (
            <div className="border border-border bg-card/30 p-4">
              <h3 className="mb-3 font-mono text-xs font-medium text-foreground">Your Positions</h3>
              <div className="space-y-2">
                {exposure.map((e, i) => (
                  <div key={`${e.marketId}-${i}`} className="flex items-center justify-between font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        e.outcome === "Yes" ? "bg-green-500" : "bg-red-500"
                      )} />
                      <span className="text-foreground">{e.outcome}</span>
                    </div>
                    <span className="text-muted-foreground">{fmt(e.amountWei)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <TradingPanel
            market={market}
            onPredict={handleOpenPredict}
            loading={modalOpen}
          />

          {!token && (
            <div className="mt-4 border border-border bg-card/30 p-4">
              <p className="font-mono text-[10px] text-muted-foreground text-center">
                Connect your wallet to place predictions
              </p>
            </div>
          )}
        </div>
      </div>

      {token && walletAddress && (
        <PredictModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={handlePredictSuccess}
          marketId={id}
          marketQuestion={market.question}
          jwtToken={token}
          walletAddress={walletAddress}
          appConfig={appConfig}
          defaultOutcome={modalOutcome}
        />
      )}
    </div>
  )
}
