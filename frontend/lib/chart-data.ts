export type OHLCPoint = { time: number; open: number; high: number; low: number; close: number }
export type VolumePoint = { time: number; value: number }

const SEED = 25968
function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

export function generateCandleData(
  basePrice: number,
  count: number,
  intervalMinutes = 1
): { points: OHLCPoint[]; volume: VolumePoint[] } {
  const rand = seeded(SEED)
  const now = Math.floor(Date.now() / 1000)
  const intervalSec = intervalMinutes * 60
  const points: OHLCPoint[] = []
  const volume: VolumePoint[] = []

  let open = basePrice
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * intervalSec
    const change = (rand() - 0.48) * 0.006
    const high = open * (1 + Math.abs(change) + rand() * 0.002)
    const low = open * (1 - Math.abs(change) - rand() * 0.002)
    const close = open * (1 + change)
    const vol = rand() * 100 + 10
    points.push({ time, open, high, low, close })
    volume.push({ time, value: vol })
    open = close
  }

  return { points, volume }
}

export function getOhlcvSummary(
  points: OHLCPoint[]
): { open: number; high: number; low: number; close: number; amplitudePct: number } {
  if (points.length === 0) {
    return { open: 0, high: 0, low: 0, close: 0, amplitudePct: 0 }
  }
  const first = points[0]
  const last = points[points.length - 1]
  let high = first.high
  let low = first.low
  for (const p of points) {
    if (p.high > high) high = p.high
    if (p.low < low) low = p.low
  }
  return {
    open: first.open,
    high,
    low,
    close: last.close,
    amplitudePct: low > 0 ? ((high - low) / low) * 100 : 0,
  }
}
