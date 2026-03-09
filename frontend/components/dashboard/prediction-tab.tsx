"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { predictionExposure, predictionMarkets, getConfig, type ExposureEntry, type OnChainMarket } from "@/lib/api"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  "All", "Crypto", "DeFi", "Markets", "Macro", "AI", "Elections", "Sports", "Culture",
]

interface Market {
  id: number
  title: string
  category: string
  icon: string
  outcomes: { label: string; probability: number }[]
  volume: string
  isLive?: boolean
}

const CATEGORY_ICONS: Record<string, string> = {
  Crypto: "◆", DeFi: "◎", Markets: "⬤", Macro: "◈", AI: "◇",
  Elections: "⬡", Sports: "⚽", Culture: "✦",
}

function guessCategory(question: string): string {
  const q = question.toLowerCase()
  if (q.includes("eth") || q.includes("btc") || q.includes("sol") || q.includes("crypto")) return "Crypto"
  if (q.includes("defi") || q.includes("tvl") || q.includes("yield") || q.includes("avalanche")) return "DeFi"
  if (q.includes("oil") || q.includes("gold") || q.includes("stock")) return "Markets"
  if (q.includes("fed") || q.includes("rate") || q.includes("inflation")) return "Macro"
  if (q.includes("gpt") || q.includes("ai") || q.includes("model")) return "AI"
  if (q.includes("elect") || q.includes("senate") || q.includes("president")) return "Elections"
  return "Markets"
}

function formatVolume(totalWei: string, decimals = 6): string {
  const n = Number(BigInt(totalWei)) / 10 ** decimals
  if (n === 0) return "$0 Vol."
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M Vol.`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K Vol.`
  return `$${n.toFixed(0)} Vol.`
}

function mapOnChainMarket(m: OnChainMarket, decimals = 6): Market {
  const yesTotal = BigInt(m.predTotals.yes)
  const noTotal = BigInt(m.predTotals.no)
  const total = yesTotal + noTotal

  let yesPct = 50
  let noPct = 50
  if (total > 0n) {
    yesPct = Number((yesTotal * 100n) / total)
    noPct = 100 - yesPct
  }

  const category = guessCategory(m.question)
  const isLive = m.status === "Open" && m.marketClose * 1000 > Date.now()

  return {
    id: m.id,
    title: m.question,
    category,
    icon: CATEGORY_ICONS[category] ?? "◆",
    outcomes: [
      { label: "Yes", probability: yesPct },
      { label: "No", probability: noPct },
    ],
    volume: formatVolume((yesTotal + noTotal).toString(), decimals),
    isLive,
  }
}

const OUTCOME_COLORS = ["#22c55e", "#ef4444"]

function getMarketYesPct(m: OnChainMarket): number {
  const yT = BigInt(m.predTotals.yes)
  const nT = BigInt(m.predTotals.no)
  const t = yT + nT
  return t > 0n ? Number((yT * 100n) / t) : 50
}

function getMarketVolume(m: OnChainMarket): bigint {
  return BigInt(m.predTotals.yes) + BigInt(m.predTotals.no)
}

function generateProbCurve(target: number, points = 36): number[] {
  const curve: number[] = []
  let v = 50
  for (let i = 0; i < points; i++) {
    v += (target - v) * 0.12 + (Math.random() - 0.5) * 5
    v = Math.max(2, Math.min(98, v))
    if (i === points - 1) v = target
    curve.push(Math.round(v))
  }
  return curve
}

function getDateLabels(count = 7): string[] {
  const labels: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }))
  }
  return labels
}

function deriveBreakingNews(markets: OnChainMarket[]): { title: string; probability: number; change: string; id: number }[] {
  return [...markets]
    .sort((a, b) => {
      const aCount = Number(a.predCounts.yes) + Number(a.predCounts.no)
      const bCount = Number(b.predCounts.yes) + Number(b.predCounts.no)
      return bCount - aCount
    })
    .slice(0, 3)
    .map((m) => ({
      title: m.question,
      probability: getMarketYesPct(m),
      change: m.status === "Open" ? "LIVE" : m.status,
      id: m.id,
    }))
}

function deriveHotTopics(markets: OnChainMarket[]): { label: string; volume: string }[] {
  const catVol: Record<string, bigint> = {}
  for (const m of markets) {
    const cat = guessCategory(m.question)
    catVol[cat] = (catVol[cat] ?? 0n) + getMarketVolume(m)
  }
  return Object.entries(catVol)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 5)
    .map(([label, vol]) => ({ label, volume: formatVolume(vol.toString()) }))
}

function toSmoothPath(pts: number[], W: number, H: number) {
  if (pts.length < 2) return ""
  const points = pts.map((v, i) => ({
    x: (i / (pts.length - 1)) * W,
    y: H - (v / 100) * H,
  }))

  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cpx = (prev.x + curr.x) / 2
    d += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`
  }
  return d
}

function toAreaPath(pts: number[], W: number, H: number) {
  const linePath = toSmoothPath(pts, W, H)
  const lastX = ((pts.length - 1) / (pts.length - 1)) * W
  return `${linePath} L${lastX.toFixed(1)},${H} L0,${H} Z`
}

// ─── Featured Market Hero ────────────────────────────────────────────────────
function FeaturedMarketHero({ rawMarkets }: { rawMarkets: OnChainMarket[] }) {
  const router = useRouter()

  if (rawMarkets.length === 0) return null

  const featured = [...rawMarkets].sort((a, b) => {
    const aVol = getMarketVolume(a)
    const bVol = getMarketVolume(b)
    if (bVol !== aVol) return bVol > aVol ? 1 : -1
    return (Number(b.predCounts.yes) + Number(b.predCounts.no)) - (Number(a.predCounts.yes) + Number(a.predCounts.no))
  })[0]

  const yesPct = getMarketYesPct(featured)
  const noPct = 100 - yesPct
  const category = guessCategory(featured.question)
  const icon = CATEGORY_ICONS[category] ?? "◆"
  const volume = formatVolume(getMarketVolume(featured).toString())
  const isOpen = featured.status === "Open" && featured.marketClose * 1000 > Date.now()

  const yesCurve = useMemo(() => generateProbCurve(yesPct), [yesPct])
  const noCurve = useMemo(() => generateProbCurve(noPct), [noPct])
  const dateLabels = useMemo(() => getDateLabels(7), [])
  const chartLines = [yesCurve, noCurve]

  const breakingNews = useMemo(() => deriveBreakingNews(rawMarkets), [rawMarkets])
  const hotTopics = useMemo(() => deriveHotTopics(rawMarkets), [rawMarkets])

  const W = 1000
  const H = 220
  const PADDING_RIGHT = 40

  return (
    <div className="grid grid-cols-1 gap-0 border border-border lg:grid-cols-[1fr_280px]">
      {/* Left: featured card */}
      <div
        className="flex flex-col cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/app/dashboard/market/${featured.id}`)}
        onKeyDown={(e) => { if (e.key === "Enter") router.push(`/app/dashboard/market/${featured.id}`) }}
      >
        <div className="p-5 pb-3">
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <span>{category}</span>
            <span>·</span>
            {isOpen ? (
              <span className="inline-flex items-center gap-1 text-green-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            ) : (
              <span>{featured.status}</span>
            )}
          </div>
          <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center border border-border text-lg">
              {icon}
            </span>
            <h2 className="flex-1 font-mono text-lg font-bold leading-tight text-foreground">
              {featured.question}
            </h2>
          </div>

          <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm text-muted-foreground">Yes</span>
                <span className="font-mono text-2xl font-bold text-green-400">{yesPct}%</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm text-muted-foreground">No</span>
                <span className="font-mono text-2xl font-bold text-red-400">{noPct}%</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: OUTCOME_COLORS[0] }} />
                Yes {yesPct}%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: OUTCOME_COLORS[1] }} />
                No {noPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 px-0">
          <svg
            viewBox={`0 0 ${W} ${H + 22}`}
            className="block h-56 w-full sm:h-64 lg:h-72"
            preserveAspectRatio="none"
          >
            <defs>
              {chartLines.map((_, li) => (
                <linearGradient key={`grad-${li}`} id={`area-grad-${li}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={OUTCOME_COLORS[li]} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={OUTCOME_COLORS[li]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            {[100, 75, 50, 25, 0].map((v) => {
              const y = H - (v / 100) * H
              return (
                <g key={v}>
                  <line x1={0} y1={y} x2={W - PADDING_RIGHT} y2={y} stroke="#262626" strokeWidth={0.5} />
                  <text x={W - PADDING_RIGHT + 6} y={y + 4} fill="#666" fontSize={10} fontFamily="monospace">{v}%</text>
                </g>
              )
            })}

            {/* Yes area fill */}
            <path d={toAreaPath(chartLines[0], W - PADDING_RIGHT, H)} fill="url(#area-grad-0)" />

            {chartLines.map((pts, li) => (
              <path
                key={`line-${li}`}
                d={toSmoothPath(pts, W - PADDING_RIGHT, H)}
                fill="none"
                stroke={OUTCOME_COLORS[li]}
                strokeWidth={li === 0 ? 2 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={li === 1 ? "4 3" : undefined}
              />
            ))}

            {chartLines.map((pts, li) => {
              const lastV = pts[pts.length - 1]
              const cx = W - PADDING_RIGHT
              const cy = H - (lastV / 100) * H
              return (
                <g key={`dot-${li}`}>
                  <circle cx={cx} cy={cy} r={7} fill={OUTCOME_COLORS[li]} opacity={0.2} />
                  <circle cx={cx} cy={cy} r={4} fill={OUTCOME_COLORS[li]} />
                  <circle cx={cx} cy={cy} r={1.5} fill="#fff" />
                </g>
              )
            })}

            {dateLabels.map((d, i) => {
              const x = (i / (dateLabels.length - 1)) * (W - PADDING_RIGHT)
              return (
                <text key={d} x={x} y={H + 16} textAnchor="middle" fill="#666" fontSize={10} fontFamily="monospace">
                  {d}
                </text>
              )
            })}
          </svg>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-5 pt-4">
          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span>{volume}</span>
            <div className="flex items-center gap-2">
              <span>{Number(featured.predCounts.yes) + Number(featured.predCounts.no)} predictions</span>
              <span>· ◎ Marshmallow</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: breaking news + hot topics — all derived from on-chain data */}
      <div className="hidden border-l border-border lg:block">
        <div className="p-4">
          <h3 className="mb-3 font-mono text-xs font-medium text-foreground">
            Top markets →
          </h3>
          <ul className="space-y-3">
            {breakingNews.map((item, i) => (
              <li
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/app/dashboard/market/${item.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/app/dashboard/market/${item.id}`) }}
                className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0 cursor-pointer hover:bg-card/30 transition-colors -mx-1 px-1"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                  <span className="font-mono text-xs leading-tight text-foreground">{item.title}</span>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-medium text-foreground">{item.probability}%</div>
                  <div className={cn(
                    "font-mono text-[10px]",
                    item.change === "LIVE" ? "text-green-400" : "text-muted-foreground"
                  )}>{item.change}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-border p-4">
          <h3 className="mb-3 font-mono text-xs font-medium text-foreground">
            Hot topics →
          </h3>
          {hotTopics.length > 0 ? (
            <ul className="space-y-2">
              {hotTopics.map((t, i) => (
                <li key={t.label} className="flex items-center justify-between font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{i + 1}</span>
                    <span className="text-foreground">{t.label}</span>
                  </div>
                  <span className="text-muted-foreground">{t.volume} →</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[10px] text-muted-foreground">No volume yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

function formatWei(wei: string, decimals = 6): string {
  const n = BigInt(wei)
  if (n === 0n) return "0"
  const d = Number(n) / 10 ** decimals
  return d >= 1 ? d.toFixed(2) : d > 0 ? "< 0.01" : "0"
}

// ─── Market Card ─────────────────────────────────────────────────────────────
function MarketCard({ market }: { market: Market }) {
  const router = useRouter()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/app/dashboard/market/${market.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter") router.push(`/app/dashboard/market/${market.id}`) }}
      className="flex flex-col border border-border bg-card/50 p-4 transition-colors hover:border-muted-foreground/40 cursor-pointer">
      <div className="mb-3 flex items-start gap-2">
        <span className="flex h-7 w-7 items-center justify-center border border-border text-sm">
          {market.icon}
        </span>
        <h3 className="flex-1 font-mono text-sm font-medium leading-tight text-foreground">
          {market.title}
        </h3>
        {market.outcomes.length === 2 && (
          <span className="font-mono text-lg font-bold text-foreground">
            {market.outcomes[0].probability}%
          </span>
        )}
      </div>

      {market.isLive && (
        <div className="mb-2 inline-flex w-fit items-center gap-1 px-1 py-0.5 font-mono text-[9px] text-green-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
          LIVE
        </div>
      )}

      {market.outcomes.length <= 2 ? (
        <div className="mt-auto flex gap-2">
          {market.outcomes.map((o) => {
            const isYes = o.label === "Yes" || o.label === "Up"
            return (
              <button
                key={o.label}
                type="button"
                className={cn(
                  "flex-1 py-2 font-mono text-xs font-medium transition-colors",
                  isYes
                    ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                    : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                )}
              >
                {o.label} {o.probability}¢
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mt-auto space-y-1.5">
          {market.outcomes.map((o) => (
            <div key={o.label} className="flex items-center justify-between font-mono text-xs">
              <span className="text-muted-foreground">{o.label}</span>
              <span className="text-foreground">{o.probability}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span>{market.volume}</span>
        <span>{market.category}</span>
      </div>
    </div>
  )
}

// ─── Your Exposure ───────────────────────────────────────────────────────────
function ExposureBar({
  exposure,
  paymentTokenDecimals = 6,
}: {
  exposure: ExposureEntry[]
  paymentTokenDecimals?: number
}) {
  if (exposure.length === 0) return null
  return (
    <div className="border border-border p-3">
      <h3 className="mb-2 font-mono text-xs font-medium text-foreground">
        Your exposure
      </h3>
      <div className="flex flex-wrap gap-2">
        {exposure.map((e, i) => (
          <span
            key={`${e.marketId}-${i}`}
            className="inline-flex items-center gap-1 border border-border px-2 py-1 font-mono text-[10px]"
          >
            <span className="text-muted-foreground">Mkt {e.marketId}</span>
            <span className={e.outcome === "Yes" ? "text-green-400" : "text-red-400"}>
              {e.outcome}
            </span>
            <span className="text-muted-foreground">{formatWei(e.amountWei, paymentTokenDecimals)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function PredictionTab() {
  const [exposure, setExposure] = useState<ExposureEntry[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [rawMarkets, setRawMarkets] = useState<OnChainMarket[]>([])
  const [marketsLoading, setMarketsLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState("All")
  const [paymentTokenDecimals, setPaymentTokenDecimals] = useState(6)

  useEffect(() => {
    getConfig().then((c) => setPaymentTokenDecimals(c.paymentTokenDecimals ?? 6)).catch(() => {})
  }, [])

  useEffect(() => {
    predictionExposure()
      .then(setExposure)
      .catch(() => {})
  }, [])

  useEffect(() => {
    setMarketsLoading(true)
    predictionMarkets()
      .then((onChain) => {
        setRawMarkets(onChain)
        setMarkets(onChain.map((m) => mapOnChainMarket(m, paymentTokenDecimals)))
      })
      .catch(() => {})
      .finally(() => setMarketsLoading(false))
  }, [paymentTokenDecimals])

  const filtered =
    activeCategory === "All"
      ? markets
      : markets.filter((m) => m.category === activeCategory)

  return (
    <div className="px-4 py-4 space-y-6">
      {/* Featured market hero with chart + breaking news sidebar */}
      <FeaturedMarketHero rawMarkets={rawMarkets} />

      {/* Exposure banner */}
      <ExposureBar exposure={exposure} paymentTokenDecimals={paymentTokenDecimals} />

      {/* Category filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "whitespace-nowrap px-3 py-1.5 font-mono text-xs transition-colors",
              activeCategory === cat
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <h2 className="font-mono text-sm font-medium text-foreground">
        All markets
      </h2>

      {/* Market cards grid */}
      {marketsLoading ? (
        <div className="flex items-center justify-center py-16">
          <span className="font-mono text-xs text-muted-foreground animate-pulse">
            Loading markets from chain…
          </span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {markets.length === 0 ? "No markets created yet" : "No markets in this category"}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  )
}
