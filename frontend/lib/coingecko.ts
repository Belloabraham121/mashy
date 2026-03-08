import type { OHLCPoint, VolumePoint } from "./chart-data"

const COINGECKO_BASE = "https://api.coingecko.com/api/v3"

type CoinGeckoOhlcItem = [number, number, number, number, number]

function getHeaders(): HeadersInit {
  const key = process.env.NEXT_PUBLIC_COINGECKO_API_KEY
  const headers: HeadersInit = { Accept: "application/json" }
  if (key) {
    ;(headers as Record<string, string>)["x-cg-demo-api-key"] = key
  }
  return headers
}

export async function fetchEthUsdOhlc(days: number): Promise<CoinGeckoOhlcItem[]> {
  const url = `${COINGECKO_BASE}/coins/ethereum/ohlc?vs_currency=usd&days=${days}`
  const res = await fetch(url, { headers: getHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CoinGecko OHLC failed: ${res.status} ${text}`)
  }
  return (await res.json()) as CoinGeckoOhlcItem[]
}

export function coingeckoOhlcToChart(raw: CoinGeckoOhlcItem[]): { points: OHLCPoint[]; volume: VolumePoint[] } {
  const points: OHLCPoint[] = []
  const volume: VolumePoint[] = []
  for (const [tsMs, open, high, low, close] of raw) {
    const time = Math.floor(tsMs / 1000)
    points.push({ time, open, high, low, close })
    volume.push({ time, value: 0 })
  }
  return { points, volume }
}

export const TIMEFRAME_TO_DAYS: Record<string, number> = {
  "1M": 1,
  "5M": 1,
  "15M": 1,
  "30M": 1,
  "1H": 1,
  "4H": 7,
  "8H": 14,
  "1D": 30,
}

export function hasCoingeckoApiKey(): boolean {
  return Boolean(typeof process !== "undefined" && process.env.NEXT_PUBLIC_COINGECKO_API_KEY)
}

export type CoinGeckoId = "bitcoin" | "ethereum" | "solana" | "avalanche-2"

export type SimplePriceResponse = Record<
  string,
  { usd: number; usd_24h_change: number | null }
>

export async function fetchSimplePrice(
  coinId: CoinGeckoId,
  vsCurrency = "usd"
): Promise<{ price: number; change24h: number; changePercent24h: number }> {
  const url = `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}&include_24hr_change=true`
  const res = await fetch(url, { headers: getHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CoinGecko simple price failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as SimplePriceResponse
  const row = data[coinId]
  if (!row || typeof row.usd !== "number") {
    throw new Error("CoinGecko: missing price data")
  }
  const price = row.usd
  const changePercent24h = row.usd_24h_change ?? 0
  const change24h = price * (changePercent24h / 100)
  return { price, change24h, changePercent24h }
}

export async function fetchMultiplePrices(
  coinIds: CoinGeckoId[]
): Promise<Record<string, { usd: number; usd_24h_change: number | null }>> {
  const ids = coinIds.join(",")
  const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
  const res = await fetch(url, { headers: getHeaders() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CoinGecko prices failed: ${res.status} ${text}`)
  }
  return (await res.json()) as SimplePriceResponse
}
