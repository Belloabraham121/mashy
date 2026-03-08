"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useWallets } from "@privy-io/react-auth"
import { useAuth } from "@/lib/auth-context"
import {
  perpsStatus,
  perpsPrice,
  perpsOpen,
  perpsClose,
  perpsDeallocate,
  perpsAllocate,
  adminMint,
  getConfig,
  explorerTxUrl,
  type PerpsStatus as PerpsStatusType,
  type AppConfig,
} from "@/lib/api"
import {
  fetchEthUsdOhlc,
  coingeckoOhlcToChart,
  TIMEFRAME_TO_DAYS,
  fetchMultiplePrices,
  type CoinGeckoId,
} from "@/lib/coingecko"
import { generateCandleData } from "@/lib/chart-data"
import { signPrivateTransfer } from "@/lib/eip712"
import { cn } from "@/lib/utils"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWei(wei: string): string {
  const n = BigInt(wei)
  if (n === 0n) return "0.00"
  const d = Number(n) / 1e6
  return d.toFixed(2)
}

function formatPrice8(priceStr: string): string {
  const n = Number(priceStr)
  if (n === 0) return "0.00"
  return (n / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** PnL in collateral (6-decimal) units. Mirrors backend computePnLCollateral. */
function computePnL(sizeStr: string, entryPriceStr: string, currentPriceStr: string): bigint {
  const size = BigInt(sizeStr)
  const entryPrice = BigInt(entryPriceStr)
  const currentPrice = BigInt(currentPriceStr)
  return (size * (currentPrice - entryPrice)) / 10n ** 8n / 100n
}

/** Estimated liquidation price (8-decimal). 50% maintenance margin. */
function estimateLiqPrice(sizeStr: string, entryPriceStr: string, marginWei: string): string {
  const size = BigInt(sizeStr)
  if (size === 0n) return "0"
  const entry = BigInt(entryPriceStr)
  const margin = BigInt(marginWei)
  const halfMargin = margin / 2n
  const liq = entry - (halfMargin * 10n ** 8n * 100n) / size
  return liq < 0n ? "0" : liq.toString()
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}


// ─── Trade history (localStorage) ────────────────────────────────────────────

const HISTORY_KEY = "marshmallow_trade_history"

interface TradeRecord {
  id: string
  timestamp: number
  side: "long" | "short"
  size: string
  entryPrice: string
  exitPrice?: string
  pnl?: string
  leverage: number
  status: "open" | "closed"
}

function loadTradeHistory(): TradeRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as TradeRecord[]) : []
  } catch {
    return []
  }
}

function saveTradeHistory(records: TradeRecord[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(-50)))
  } catch {
    // quota exceeded — ignore
  }
}

function addTradeRecord(record: TradeRecord) {
  const history = loadTradeHistory()
  history.push(record)
  saveTradeHistory(history)
}

function closeTradeRecord(exitPrice: string, pnl: string) {
  const history = loadTradeHistory()
  const openIdx = history.findLastIndex((r) => r.status === "open")
  if (openIdx >= 0) {
    history[openIdx].status = "closed"
    history[openIdx].exitPrice = exitPrice
    history[openIdx].pnl = pnl
  }
  saveTradeHistory(history)
}

// ─── Mock data generators ────────────────────────────────────────────────────

function generateOrderBook(basePrice: number) {
  const asks: { price: number; amount: number; total: number }[] = []
  const bids: { price: number; amount: number; total: number }[] = []
  let askTotal = 0
  let bidTotal = 0
  const spread = basePrice * 0.0002
  for (let i = 0; i < 12; i++) {
    const askAmt = +(Math.random() * 8 + 0.5).toFixed(5)
    askTotal += askAmt
    asks.push({ price: +(basePrice + spread + i * spread).toFixed(2), amount: askAmt, total: +askTotal.toFixed(5) })
  }
  for (let i = 0; i < 12; i++) {
    const bidAmt = +(Math.random() * 8 + 0.5).toFixed(5)
    bidTotal += bidAmt
    bids.push({ price: +(basePrice - spread - i * spread).toFixed(2), amount: bidAmt, total: +bidTotal.toFixed(5) })
  }
  return { asks: asks.reverse(), bids }
}

// ─── Chart (TradingView Lightweight Charts with CoinGecko OHLC) ─────────────

function PriceChart({ timeframe }: { timeframe: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null)
  const [loading, setLoading] = useState(true)

  const days = TIMEFRAME_TO_DAYS[timeframe] ?? 1

  useEffect(() => {
    if (!chartContainerRef.current) return

    let cancelled = false

    const init = async () => {
      const { createChart, CandlestickSeries, ColorType } = await import("lightweight-charts")

      if (cancelled || !chartContainerRef.current) return

      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#666",
          fontFamily: "monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "#1a1a1a" },
          horzLines: { color: "#1a1a1a" },
        },
        crosshair: {
          vertLine: { color: "#444", labelBackgroundColor: "#333" },
          horzLine: { color: "#444", labelBackgroundColor: "#333" },
        },
        rightPriceScale: {
          borderColor: "#262626",
        },
        timeScale: {
          borderColor: "#262626",
          timeVisible: true,
          secondsVisible: false,
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      })

      chartRef.current = chart

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        wickUpColor: "#22c55e",
      })

      try {
        setLoading(true)
        const raw = await fetchEthUsdOhlc(days)
        if (cancelled) return

        const { points } = coingeckoOhlcToChart(raw)
        if (points.length > 0) {
          const data = points.map((p) => ({
            time: p.time as import("lightweight-charts").UTCTimestamp,
            open: p.open,
            high: p.high,
            low: p.low,
            close: p.close,
          }))
          candleSeries.setData(data)
          chart.timeScale().fitContent()
        }
      } catch {
        const fallback = generateCandleData(2200, 120, 15)
        const data = fallback.points.map((p) => ({
          time: p.time as import("lightweight-charts").UTCTimestamp,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
        }))
        candleSeries.setData(data)
        chart.timeScale().fitContent()
      } finally {
        if (!cancelled) setLoading(false)
      }

      const resizeObserver = new ResizeObserver((entries) => {
        if (entries[0] && chartRef.current) {
          const { width, height } = entries[0].contentRect
          chartRef.current.applyOptions({ width, height })
        }
      })
      resizeObserver.observe(chartContainerRef.current)

      return () => {
        resizeObserver.disconnect()
      }
    }

    init()

    return () => {
      cancelled = true
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [days])

  return (
    <div ref={chartContainerRef} className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] text-muted-foreground animate-pulse">Loading chart…</span>
        </div>
      )}
    </div>
  )
}

// ─── Order Book ──────────────────────────────────────────────────────────────

function OrderBook({ currentPrice }: { currentPrice: number }) {
  const { asks, bids } = useMemo(() => generateOrderBook(currentPrice), [currentPrice])
  const maxTotal = Math.max(
    asks.length ? asks[0].total : 1,
    bids.length ? bids[bids.length - 1].total : 1
  )

  const fmtPrice = currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="flex h-full flex-col font-mono text-[11px]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">Order Book</span>
        <span className="text-xs text-muted-foreground">ETH/USD</span>
      </div>
      <div className="grid grid-cols-3 gap-0 border-b border-border px-3 py-1 text-[10px] text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex-1 overflow-hidden">
        {asks.map((a, i) => (
          <div key={`a${i}`} className="relative grid grid-cols-3 gap-0 px-3 py-0.5">
            <div
              className="absolute inset-y-0 right-0 bg-red-500/10"
              style={{ width: `${(a.total / maxTotal) * 100}%` }}
            />
            <span className="relative text-red-400">{a.price.toFixed(2)}</span>
            <span className="relative text-right text-muted-foreground">{a.amount.toFixed(4)}</span>
            <span className="relative text-right text-muted-foreground">{a.total.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="border-y border-border px-3 py-1.5 text-center">
        <span className="text-sm font-medium text-foreground">{fmtPrice}</span>
      </div>

      <div className="flex-1 overflow-hidden">
        {bids.map((b, i) => (
          <div key={`b${i}`} className="relative grid grid-cols-3 gap-0 px-3 py-0.5">
            <div
              className="absolute inset-y-0 right-0 bg-green-500/10"
              style={{ width: `${(b.total / maxTotal) * 100}%` }}
            />
            <span className="relative text-green-400">{b.price.toFixed(2)}</span>
            <span className="relative text-right text-muted-foreground">{b.amount.toFixed(4)}</span>
            <span className="relative text-right text-muted-foreground">{b.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Deposit + Allocate Modal ────────────────────────────────────────────────

type DepositStep = "input" | "minting" | "signing" | "allocating" | "done" | "error"

const STEP_LABELS: Record<DepositStep, string> = {
  input: "Enter amount",
  minting: "Minting PUSD…",
  signing: "Signing private transfer…",
  allocating: "Allocating margin…",
  done: "Deposit complete",
  error: "Error",
}

function DepositModal({
  open,
  onClose,
  onSuccess,
  jwtToken,
  walletAddress,
  appConfig,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  jwtToken: string
  walletAddress: string
  appConfig: AppConfig | null
}) {
  const { wallets } = useWallets()
  const [amount, setAmount] = useState("")
  const [step, setStep] = useState<DepositStep>("input")
  const [error, setError] = useState<string | null>(null)
  const [txHashes, setTxHashes] = useState<Record<string, string>>({})

  const reset = () => {
    setAmount("")
    setStep("input")
    setError(null)
    setTxHashes({})
  }

  const poolConfigured = Boolean(appConfig?.poolAddress && appConfig.poolAddress.length === 42)

  const handleDeposit = async () => {
    if (!appConfig || !walletAddress || !amount) return
    if (!poolConfigured) {
      setError("Pool not configured. Add POOL_PRIVATE_KEY to backend .env.")
      setStep("error")
      return
    }
    const amountWei = (BigInt(Math.floor(Number(amount) * 1e6))).toString()

    try {
      setStep("minting")
      const mintResult = await adminMint(walletAddress, amountWei)
      setTxHashes((h) => ({ ...h, mint: mintResult.txHash }))

      setStep("signing")
      const embedded = wallets.find((w) => w.walletClientType === "privy")
      if (!embedded) throw new Error("Embedded wallet not found")
      const provider = await embedded.getEthereumProvider()
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = await signPrivateTransfer(
        provider,
        {
          sender: walletAddress,
          recipient: appConfig.poolAddress,
          token: appConfig.paymentTokenAddress,
          amount: amountWei,
          flags: [],
          timestamp,
        },
        appConfig.chainId,
        appConfig.vaultAddress
      )

      setStep("allocating")
      await perpsAllocate(jwtToken, {
        account: walletAddress,
        recipient: appConfig.poolAddress,
        token: appConfig.paymentTokenAddress,
        amountWei,
        timestamp,
        auth: signature,
        flags: [],
      })

      setStep("done")
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed")
      setStep("error")
    }
  }

  if (!open) return null

  const isProcessing = step !== "input" && step !== "done" && step !== "error"
  const stepIndex = ["minting", "approving", "depositing", "signing", "allocating"].indexOf(step)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-border bg-background p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-mono text-sm font-medium text-foreground">
            Deposit Margin
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
            <p className="font-mono text-[10px] text-muted-foreground">
              Mints PUSD (private token), signs a private transfer to the pool, and allocates as perps margin.
            </p>
            {!poolConfigured && appConfig && (
              <p className="font-mono text-[10px] text-amber-500">
                Pool not configured. Add POOL_PRIVATE_KEY to backend .env to enable deposits.
              </p>
            )}
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
                <span className="font-mono text-xs text-muted-foreground">PUSD</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDeposit}
              disabled={!amount || Number(amount) <= 0 || !appConfig || !poolConfigured}
              className="w-full bg-foreground py-2.5 font-mono text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {!appConfig ? "Loading config…" : !poolConfigured ? "Pool not configured" : "Deposit & Allocate"}
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="space-y-3">
            {(["minting", "signing", "allocating"] as const).map((s, i) => {
              const hashKey = ["mint", "", ""][i]
              const hash = hashKey ? txHashes[hashKey] : undefined
              return (
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
                  {i < stepIndex && hash && (
                    <a
                      href={explorerTxUrl(hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-blue-400 underline hover:text-blue-300"
                    >
                      {shortHash(hash)}
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <div className="border border-green-500/30 bg-green-500/10 p-3">
              <p className="font-mono text-xs text-green-400">
                {amount} PUSD deposited and allocated as margin.
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
              <p className="font-mono text-xs text-red-400">{error}</p>
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

// ─── Withdraw / Deallocate Modal ─────────────────────────────────────────────

function WithdrawModal({
  open,
  onClose,
  onSuccess,
  jwtToken,
  freeMarginWei,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  jwtToken: string
  freeMarginWei: string
}) {
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const maxUsdc = Number(freeMarginWei) / 1e6

  const reset = () => {
    setAmount("")
    setLoading(false)
    setError(null)
    setDone(false)
  }

  const handleWithdraw = async () => {
    if (!amount) return
    const amountWei = (BigInt(Math.floor(Number(amount) * 1e6))).toString()
    setLoading(true)
    setError(null)
    try {
      await perpsDeallocate(jwtToken, { amountWei })
      setDone(true)
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdraw failed")
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm border border-border bg-background p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-mono text-sm font-medium text-foreground">
            Withdraw Margin
          </h3>
          <button
            type="button"
            onClick={() => { reset(); onClose() }}
            disabled={loading}
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            x
          </button>
        </div>

        {!done ? (
          <div className="space-y-4">
            <p className="font-mono text-[10px] text-muted-foreground">
              Deallocate free margin. Only margin not in use by an open position can be withdrawn.
            </p>
            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>Available</span>
              <button
                type="button"
                onClick={() => setAmount(maxUsdc.toFixed(2))}
                className="text-foreground underline transition-colors hover:text-muted-foreground"
              >
                {maxUsdc.toFixed(2)} PUSD
              </button>
            </div>
            <div className="border border-border">
              <div className="flex items-center justify-between px-3 py-2">
                <input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  min="0"
                  max={maxUsdc}
                  step="0.01"
                />
                <span className="font-mono text-xs text-muted-foreground">PUSD</span>
              </div>
            </div>
            {error && (
              <p className="font-mono text-[10px] text-red-400">{error}</p>
            )}
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={loading || !amount || Number(amount) <= 0 || Number(amount) > maxUsdc}
              className="w-full bg-foreground py-2.5 font-mono text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Withdrawing…" : "Withdraw"}
            </button>
            <p className="font-mono text-[9px] text-muted-foreground">
              After deallocating, use a withdrawal ticket to redeem from the vault.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-green-500/30 bg-green-500/10 p-3">
              <p className="font-mono text-xs text-green-400">
                {amount} PUSD margin deallocated.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { reset(); onClose() }}
              className="w-full border border-border py-2 font-mono text-xs text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Trade Form (right panel) ────────────────────────────────────────────────

function TradeForm({
  status,
  price,
  loading,
  actionLoading,
  onOpen,
  onClose,
  onDeposit,
  onWithdraw,
}: {
  status: PerpsStatusType | null
  price: string | null
  loading: boolean
  actionLoading: boolean
  onOpen: (side: "long" | "short", size: string, leverage: number) => void
  onClose: () => void
  onDeposit: () => void
  onWithdraw: () => void
}) {
  const [side, setSide] = useState<"long" | "short">("long")
  const [leverage, setLeverage] = useState(20)
  const [size, setSize] = useState("")

  const freeMargin = status ? Number(status.freeMarginWei) / 1e6 : 0
  const sizeNum = Number(size) || 0
  const marginRequired = sizeNum
  const orderValue = sizeNum * leverage
  const marginUsage = freeMargin > 0 ? (marginRequired / freeMargin) * 100 : 0

  const unrealizedPnl = useMemo(() => {
    if (!status?.position || !price || price === "0") return 0
    try {
      const pnl = computePnL(status.position.size, status.position.entryPrice, price)
      return Number(pnl) / 1e6
    } catch {
      return 0
    }
  }, [status?.position, price])

  return (
    <div className="flex h-full flex-col font-mono text-xs">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Cross</span>
        <span className="border border-foreground bg-foreground px-2 py-0.5 text-[10px] text-background">
          {leverage}x
        </span>
        <div className="ml-auto flex gap-1">
          <span className="px-3 py-1 text-[10px] font-medium bg-green-600 text-white">
            Market
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0 border-b border-border">
        <button
          type="button"
          onClick={() => setSide("long")}
          className={cn(
            "py-2.5 text-xs font-medium transition-colors",
            side === "long"
              ? "bg-green-600 text-white"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Buy / Long
        </button>
        <button
          type="button"
          onClick={() => setSide("short")}
          className={cn(
            "py-2.5 text-xs font-medium transition-colors",
            side === "short"
              ? "bg-red-500 text-white"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Sell / Short
        </button>
      </div>

      <div className="flex-1 space-y-3 p-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Available Funds</span>
          <span className="text-foreground">
            {freeMargin.toFixed(2)} PUSD
          </span>
        </div>
        {freeMargin === 0 && (
          <p className="text-[10px] text-amber-500">
            Deposit PUSD first (Deposit button below) to open a position.
          </p>
        )}

        <div className="border border-border">
          <div className="flex items-center justify-between px-3 py-2">
            <input
              type="text"
              placeholder="0"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <span className="text-muted-foreground">PUSD</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Leverage</span>
            <span className="text-foreground">{leverage}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="w-full accent-foreground"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            {[1, 5, 10, 25, 50].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setLeverage(v)}
                className={cn(
                  "px-1 transition-colors",
                  leverage === v ? "text-foreground" : "hover:text-foreground"
                )}
              >
                {v}x
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 border-t border-border pt-3 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>Order Value</span>
            <span className="text-foreground">
              ${orderValue.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Margin Required</span>
            <span className="text-foreground">${marginRequired.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Margin Usage</span>
            <span className={marginUsage > 90 ? "text-red-400" : "text-foreground"}>
              {marginUsage.toFixed(1)}%
            </span>
          </div>
        </div>

        {status?.position ? (
          <button
            type="button"
            onClick={onClose}
            disabled={actionLoading}
            className="w-full bg-red-500 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {actionLoading ? "Closing…" : "Close Position"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const sizeWei = (BigInt(Math.floor(sizeNum * 1e6))).toString()
              onOpen(side, sizeWei, leverage)
            }}
            disabled={actionLoading || loading || sizeNum <= 0 || sizeNum > freeMargin}
            className={cn(
              "w-full py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50",
              side === "long" ? "bg-green-600" : "bg-red-500"
            )}
          >
            {actionLoading
              ? "Opening…"
              : sizeNum > freeMargin
                ? "Insufficient margin"
                : side === "long"
                  ? "Buy / Long"
                  : "Sell / Short"
            }
          </button>
        )}
      </div>

      <div className="space-y-1 border-t border-border p-3 text-[10px] text-muted-foreground">
        <div className="flex justify-between">
          <span>Account Equity</span>
          <span className="text-foreground">{status ? formatWei(status.allocatedWei) : "0.00"}</span>
        </div>
        <div className="flex justify-between">
          <span>Free Margin</span>
          <span className="text-foreground">{status ? formatWei(status.freeMarginWei) : "0.00"}</span>
        </div>
        <div className="flex justify-between">
          <span>Margin In Use</span>
          <span className="text-foreground">{status ? formatWei(status.marginInUseWei) : "0.00"}</span>
        </div>
        <div className="flex justify-between">
          <span>Unrealized P&L</span>
          <span className={unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}>
            {unrealizedPnl >= 0 ? "+" : ""}{unrealizedPnl.toFixed(2)} PUSD
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onDeposit}
            className="border border-border py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-green-500 hover:text-green-400"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            disabled={!status || BigInt(status.freeMarginWei) === 0n}
            className="border border-border py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Positions / Orders / History Table ──────────────────────────────────────

function PositionsTable({
  status,
  price,
  tradeHistory,
}: {
  status: PerpsStatusType | null
  price: string | null
  tradeHistory: TradeRecord[]
}) {
  const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history">("positions")

  const tabs = [
    { id: "positions" as const, label: "Positions", count: status?.position ? 1 : 0 },
    { id: "orders" as const, label: "Open Orders", count: status?.position ? 1 : 0 },
    { id: "history" as const, label: "Trade History", count: tradeHistory.length },
  ]

  const pnl = useMemo(() => {
    if (!status?.position || !price || price === "0") return null
    try {
      return computePnL(status.position.size, status.position.entryPrice, price)
    } catch {
      return null
    }
  }, [status?.position, price])

  const liqPrice = useMemo(() => {
    if (!status?.position) return null
    try {
      return estimateLiqPrice(
        status.position.size,
        status.position.entryPrice,
        status.position.marginWei
      )
    } catch {
      return null
    }
  }, [status?.position])

  const positionSide = status?.position
    ? BigInt(status.position.size) >= 0n ? "LONG" : "SHORT"
    : null

  const openTrades = tradeHistory.filter((r) => r.status === "open")
  const closedTrades = tradeHistory.filter((r) => r.status === "closed").reverse()
  const hasAnyHistory = openTrades.length > 0 || closedTrades.length > 0

  return (
    <div className="border-t border-border">
      <div className="flex items-center gap-0 border-b border-border px-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "border-b-2 px-4 py-2 font-mono text-xs transition-colors",
              activeTab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1 text-[9px] text-muted-foreground">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-30 px-4 py-3">
        {activeTab === "positions" && (
          status?.position ? (
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  <th className="pb-2 text-left font-normal">Market</th>
                  <th className="pb-2 text-left font-normal">Side</th>
                  <th className="pb-2 text-left font-normal">Size</th>
                  <th className="pb-2 text-left font-normal">Entry Price</th>
                  <th className="pb-2 text-left font-normal">Mark Price</th>
                  <th className="pb-2 text-left font-normal">Liq. Price</th>
                  <th className="pb-2 text-left font-normal">Leverage</th>
                  <th className="pb-2 text-left font-normal">Margin</th>
                  <th className="pb-2 text-right font-normal">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-foreground">
                  <td className="py-1.5">ETH-PERP</td>
                  <td className={cn("py-1.5 font-medium", positionSide === "LONG" ? "text-green-400" : "text-red-400")}>
                    {positionSide}
                  </td>
                  <td className="py-1.5">{formatWei(status.position.size.replace("-", ""))}</td>
                  <td className="py-1.5">${formatPrice8(status.position.entryPrice)}</td>
                  <td className="py-1.5">{price ? `$${formatPrice8(price)}` : "—"}</td>
                  <td className="py-1.5 text-yellow-500">
                    {liqPrice ? `$${formatPrice8(liqPrice)}` : "—"}
                  </td>
                  <td className="py-1.5">{status.position.leverage}x</td>
                  <td className="py-1.5">{formatWei(status.position.marginWei)}</td>
                  <td className={cn(
                    "py-1.5 text-right font-medium",
                    pnl !== null && pnl >= 0n ? "text-green-400" : "text-red-400"
                  )}>
                    {pnl !== null
                      ? `${pnl >= 0n ? "+" : ""}${(Number(pnl) / 1e6).toFixed(2)} PUSD`
                      : "—"
                    }
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center font-mono text-xs text-muted-foreground">
              No open positions
            </p>
          )
        )}

        {activeTab === "orders" && (
          status?.position ? (
            <div>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                Your open position (filled at market). No pending limit orders — close from the right panel or Positions tab.
              </p>
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground">
                    <th className="pb-2 text-left font-normal">Market</th>
                    <th className="pb-2 text-left font-normal">Side</th>
                    <th className="pb-2 text-left font-normal">Size</th>
                    <th className="pb-2 text-left font-normal">Entry</th>
                    <th className="pb-2 text-left font-normal">Leverage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-foreground">
                    <td className="py-1.5">ETH-PERP</td>
                    <td className={cn("py-1.5 font-medium", positionSide === "LONG" ? "text-green-400" : "text-red-400")}>
                      {positionSide}
                    </td>
                    <td className="py-1.5">{formatWei(status.position.size.replace("-", ""))}</td>
                    <td className="py-1.5">${formatPrice8(status.position.entryPrice)}</td>
                    <td className="py-1.5">{status.position.leverage}x</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="font-mono text-xs text-muted-foreground">
                No open orders
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                Market orders fill instantly and show under Positions. No limit/pending orders.
              </p>
            </div>
          )
        )}

        {activeTab === "history" && (
          hasAnyHistory ? (
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="text-[10px] text-muted-foreground">
                  <th className="pb-2 text-left font-normal">Time</th>
                  <th className="pb-2 text-left font-normal">Market</th>
                  <th className="pb-2 text-left font-normal">Side</th>
                  <th className="pb-2 text-left font-normal">Size</th>
                  <th className="pb-2 text-left font-normal">Entry</th>
                  <th className="pb-2 text-left font-normal">Exit</th>
                  <th className="pb-2 text-left font-normal">Leverage</th>
                  <th className="pb-2 text-left font-normal">Status</th>
                  <th className="pb-2 text-right font-normal">P&L</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((t) => (
                  <tr key={t.id} className="text-foreground">
                    <td className="py-1.5 text-muted-foreground">
                      {new Date(t.timestamp).toLocaleDateString()}
                    </td>
                    <td className="py-1.5">ETH-PERP</td>
                    <td className={cn("py-1.5", t.side === "long" ? "text-green-400" : "text-red-400")}>
                      {t.side.toUpperCase()}
                    </td>
                    <td className="py-1.5">{formatWei(t.size)}</td>
                    <td className="py-1.5">${formatPrice8(t.entryPrice)}</td>
                    <td className="py-1.5">—</td>
                    <td className="py-1.5">{t.leverage}x</td>
                    <td className="py-1.5">
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">Open</span>
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">—</td>
                  </tr>
                ))}
                {closedTrades.map((t) => {
                  const pnlNum = t.pnl ? Number(t.pnl) / 1e6 : 0
                  return (
                    <tr key={t.id} className="text-foreground">
                      <td className="py-1.5 text-muted-foreground">
                        {new Date(t.timestamp).toLocaleDateString()}
                      </td>
                      <td className="py-1.5">ETH-PERP</td>
                      <td className={cn("py-1.5", t.side === "long" ? "text-green-400" : "text-red-400")}>
                        {t.side.toUpperCase()}
                      </td>
                      <td className="py-1.5">{formatWei(t.size)}</td>
                      <td className="py-1.5">${formatPrice8(t.entryPrice)}</td>
                      <td className="py-1.5">{t.exitPrice ? `$${formatPrice8(t.exitPrice)}` : "—"}</td>
                      <td className="py-1.5">{t.leverage}x</td>
                      <td className="py-1.5 text-muted-foreground">Closed</td>
                      <td className={cn(
                        "py-1.5 text-right font-medium",
                        pnlNum >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {pnlNum >= 0 ? "+" : ""}{pnlNum.toFixed(2)} PUSD
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center font-mono text-xs text-muted-foreground">
              No trade history yet. Open a position — it will appear here and under Positions until you close.
            </p>
          )
        )}
      </div>
    </div>
  )
}

// ─── Ticker Bar ──────────────────────────────────────────────────────────────

interface TickerEntry { usd: number; usd_24h_change: number | null }
type TickerMap = Record<string, TickerEntry>

const TICKER_COINS: { sym: string; id: CoinGeckoId }[] = [
  { sym: "BTC", id: "bitcoin" },
  { sym: "ETH", id: "ethereum" },
  { sym: "SOL", id: "solana" },
  { sym: "AVAX", id: "avalanche-2" },
]

function TickerBar({ tickerData }: { tickerData: TickerMap | null }) {
  return (
    <div className="flex items-center gap-4 overflow-x-auto border-b border-border px-4 py-1.5 font-mono text-[10px]">
      {TICKER_COINS.map((c) => {
        const data = tickerData?.[c.id]
        const price = data?.usd
        const change = data?.usd_24h_change
        const fmtPrice = price
          ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "—"
        const fmtChange = change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : ""
        const color = change != null && change >= 0 ? "text-green-400" : "text-red-400"

        return (
          <div key={c.sym} className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-foreground">{c.sym}</span>
            <span className="text-foreground">{fmtPrice}</span>
            {fmtChange && <span className={color}>{fmtChange}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function PerpetualsTab() {
  const { token, walletAddress } = useAuth()
  const [status, setStatus] = useState<PerpsStatusType | null>(null)
  const [price, setPrice] = useState<string | null>(null)
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [depositOpen, setDepositOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([])
  const [timeframe, setTimeframe] = useState("15M")
  const [tickerData, setTickerData] = useState<TickerMap | null>(null)

  useEffect(() => {
    setTradeHistory(loadTradeHistory())
  }, [])

  const fetchStatus = useCallback(() => {
    if (!token) return
    perpsStatus(token)
      .then(setStatus)
      .catch(() => {})
  }, [token])

  const refreshTickers = useCallback(() => {
    fetchMultiplePrices(TICKER_COINS.map((c) => c.id))
      .then(setTickerData)
      .catch(() => {})
  }, [])

  useEffect(() => {
    getConfig().then(setAppConfig).catch(() => {})
    perpsPrice()
      .then((r) => setPrice(r.price))
      .catch(() => setPrice(null))
    refreshTickers()
  }, [refreshTickers])

  useEffect(() => {
    if (!price || price === "0") return
    const interval = setInterval(() => {
      perpsPrice()
        .then((r) => setPrice(r.price))
        .catch(() => {})
      refreshTickers()
    }, 60_000)
    return () => clearInterval(interval)
  }, [price, refreshTickers])

  useEffect(() => {
    if (!token) { setLoading(false); return }
    setLoading(true)
    perpsStatus(token)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  const handleOpen = (side: "long" | "short", sizeWei: string, leverage: number) => {
    if (!token || !price) return
    const sizeStr = side === "short" ? `-${sizeWei}` : sizeWei
    setActionLoading(true)
    setActionError(null)
    perpsOpen(token, { size: sizeStr, marginWei: sizeWei, leverage })
      .then(() => {
        addTradeRecord({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          side,
          size: sizeWei,
          entryPrice: price,
          leverage,
          status: "open",
        })
        setTradeHistory(loadTradeHistory())
        fetchStatus()
      })
      .catch((e) => setActionError(e instanceof Error ? e.message : "Open failed"))
      .finally(() => setActionLoading(false))
  }

  const handleClose = () => {
    if (!token || !price) return
    setActionLoading(true)
    setActionError(null)
    perpsClose(token)
      .then((res) => {
        closeTradeRecord(price, res.pnlCollateral ?? "0")
        setTradeHistory(loadTradeHistory())
        fetchStatus()
      })
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : "Close failed")
        fetchStatus()
      })
      .finally(() => setActionLoading(false))
  }

  const formattedPrice = price && price !== "0"
    ? `$${(Number(price) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
    : null

  const currentEthPrice = tickerData?.["ethereum"]?.usd ?? (price ? Number(price) / 1e8 : 0)

  return (
    <div className="flex flex-col">
      <TickerBar tickerData={tickerData} />

      {actionError && (
        <div className="bg-red-500/10 px-4 py-1.5 font-mono text-xs text-red-400">
          {actionError}
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="ml-2 underline hover:no-underline"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_260px]">
        <div className="flex flex-col border-r border-border">
          <div className="flex items-center gap-3 border-b border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
            <span className="text-sm font-medium text-foreground">ETH/USD</span>
            <span>Mark</span>
            <span className="text-foreground">{formattedPrice ?? "—"}</span>
            <span className="ml-2">Oracle</span>
            <span className="text-foreground">{formattedPrice ?? "—"}</span>
            {tickerData?.["ethereum"]?.usd_24h_change != null && (
              <span className={tickerData["ethereum"].usd_24h_change! >= 0 ? "text-green-400" : "text-red-400"}>
                {tickerData["ethereum"].usd_24h_change! >= 0 ? "+" : ""}{tickerData["ethereum"].usd_24h_change!.toFixed(2)}%
              </span>
            )}
            {appConfig && (
              <a
                href={`https://sepolia.etherscan.io/address/${appConfig.perpsEngineAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-blue-400 underline hover:text-blue-300"
              >
                Contract ↗
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 border-b border-border px-4 py-1 font-mono text-[10px] text-muted-foreground">
            {["1M", "5M", "15M", "30M", "1H", "4H", "8H", "1D"].map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-1.5 py-0.5 transition-colors hover:text-foreground",
                  tf === timeframe ? "bg-foreground text-background" : ""
                )}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="h-100 lg:h-120">
            <PriceChart timeframe={timeframe} />
          </div>
        </div>

        <div className="border-r border-border">
          <OrderBook currentPrice={currentEthPrice} />
        </div>

        <div>
          <TradeForm
            status={status}
            price={price}
            loading={loading}
            actionLoading={actionLoading}
            onOpen={handleOpen}
            onClose={handleClose}
            onDeposit={() => setDepositOpen(true)}
            onWithdraw={() => setWithdrawOpen(true)}
          />
        </div>
      </div>

      <PositionsTable status={status} price={price} tradeHistory={tradeHistory} />

      {token && walletAddress && (
        <DepositModal
          open={depositOpen}
          onClose={() => setDepositOpen(false)}
          onSuccess={fetchStatus}
          jwtToken={token}
          walletAddress={walletAddress}
          appConfig={appConfig}
        />
      )}

      {token && (
        <WithdrawModal
          open={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          onSuccess={fetchStatus}
          jwtToken={token}
          freeMarginWei={status?.freeMarginWei ?? "0"}
        />
      )}
    </div>
  )
}
