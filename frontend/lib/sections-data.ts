export interface TechSection {
  id: string
  number: string
  title: string
  subtitle: string
  description: string
  ascii: string
  specs: { label: string; value: string }[]
  commands: string[]
}

export const techSections: TechSection[] = [
  {
    id: "prediction-markets",
    number: "01",
    title: "Prediction Markets",
    subtitle: "Binary outcome pricing",
    description:
      "Decentralized probability discovery. Markets where participants stake capital on future events, aggregating dispersed information into prices that reflect collective intelligence. Pure information economics.",
    ascii: `
    ┌──────────────────────────┐
    │  MARKET STATE            │
    │  ┌────────┐ ┌────────┐  │
    │  │ YES    │ │  NO    │  │
    │  │ $0.62  │ │ $0.38  │  │
    │  └────┬───┘ └───┬────┘  │
    │       │         │       │
    │  ┌────┴─────────┴───┐   │
    │  │ Price Discovery  │   │
    │  │ Last: 2,847 txn  │   │
    │  └──────────────────┘   │
    │  ┌──────────────────┐   │
    │  │ Liquidity: 250M  │   │
    │  └──────────────────┘   │
    └──────────────────────────┘`,
    specs: [
      { label: "Settlement", value: "Automated AMM" },
      { label: "Pricing Model", value: "Logarithmic Market" },
      { label: "Resolution", value: "Decentralized Oracle" },
      { label: "Fee", value: "0.25% on trades" },
    ],
    commands: [
      "$ market query --symbol BTC_RALLY_2025",
      "Yes: 0.62 | No: 0.38 | Vol: 2,847",
      "$ position query --user 0x7d2a",
      "Holdings: 150 YES @ 0.58 | P&L: +12.07%",
      "$ trade --action buy --outcome yes --amount 10",
      "Executed: 16.1 YES tokens | Avg: $0.621",
    ],
  },
  {
    id: "perpetual-trading",
    number: "02",
    title: "Perpetual Trading",
    subtitle: "Margin derivatives",
    description:
      "Leverage unlimited. Perpetual futures with continuous settlement, allowing traders to build directional positions with multiplied capital. Funding rates create market equilibrium between long and short flow.",
    ascii: `
    Entry: $24,500     Exit Targets
         ┌────┐
       4x│    │         ╱─ LIQUIDATION: $20,100
        │    │       ╱
    Pos │    ├─────╱─── TAKE-PROFIT: $29,400
        │    │     
       1x│    │      Mark: $24,563
         └────┘      Index: $24,487
              ║      Funding: +0.051% / 8h
              ║ ─ Current P&L: +$1,848
         
    Long Leverage Pyramid
    ┌────────────┐
    │  4.2x LEV  │
    │ [████████] │
    └────────────┘`,
    specs: [
      { label: "Max Leverage", value: "20x" },
      { label: "Funding Rate", value: "Hourly rebase" },
      { label: "Liquidation", value: "Partial / Full" },
      { label: "Slippage Control", value: "Price bands ±5%" },
    ],
    commands: [
      "$ perp open --direction long --leverage 4 --amount 100",
      "Entry: $24,521 | Collateral: $6,125 | Mark: $24,563",
      "$ position query --id perp_001",
      "P&L: +$1,848 | Funding: -$124 | Unrealized: +7.54%",
      "$ liquidation-price --position perp_001",
      "Liquidation at: $20,125 | Safety: 18.2%",
    ],
  },
  {
    id: "privacy-mechanics",
    number: "03",
    title: "Privacy Mechanics",
    subtitle: "Encrypted settlement",
    description:
      "Trade without exposure. Privacy vaults encrypt order flow, shielding positions from front-runners and extraction mechanisms. Threshold cryptography ensures only settlement reveals true positions. Information asymmetry neutralized.",
    ascii: `
    User Order (Encrypted)
         │
    ┌────▼──────────────┐
    │ ████████████████ │
    │ Encrypted Vault  │
    │ Threshold: 4/7   │
    │ ████████████████ │
    └────┬──────────────┘
         │
    ┌────┴─────────┬──────────┐
    │              │          │
    [Node 1]  [Node 2]  [Node 3]
     key_1     key_2     key_3
     ├──────────┼──────────┤
     └──────────────────────┘
           Settlement
           (Decrypted)
              │
           Order Matched
           Position Created`,
    specs: [
      { label: "Encryption", value: "Threshold ECDSA" },
      { label: "Key Shares", value: "7-of-7 Validators" },
      { label: "Delay", value: "2 blocks (~30s)" },
      { label: "MEV Resistance", value: "Cryptographic" },
    ],
    commands: [
      "$ order submit --encrypted --amount 50",
      "Encrypted order hash: 0x8f2a9c... [PENDING]",
      "$ vault status --order-id 0x8f2a9c",
      "Key shares: 4/7 collected | Decryption: 2 blocks",
      "$ position query --after-settlement",
      "Position: LONG 50 @ settlement price $24,587",
    ],
  },
  {
    id: "value-accumulation",
    number: "04",
    title: "Value Accumulation",
    subtitle: "Economic sustainability",
    description:
      "Revenue → Stakers. Protocol captures fees from prediction markets, perpetual funding, and privacy services. Accumulated value flows to token holders, creating sustainable incentive alignment. Growth that compounds.",
    ascii: `
    Sources of Value
    ┌─────────────────────────┐
    │ Market Fees: 0.25%      │
    │ Perp Funding: ~0.05%/hr │
    │ Privacy Rent: $50k/day  │
    ├─────────────────────────┤
    │ Daily Revenue: $1.2M    │
    └────────────┬────────────┘
                 │
            ┌────▼────┐
            │ Collect  │
            │   Fees   │
            └────┬────┘
                 │
    ┌────────────┴──────────────┐
    │                           │
    [Token Buyback]     [Staker Yield]
    │                           │
    [Burn] ◄──────────────► [Rewards]
                           
    APY to Stakers: 12-18%`,
    specs: [
      { label: "Fee Capture", value: "3 revenue streams" },
      { label: "Yield Model", value: "Automated buyback" },
      { label: "Staker APY", value: "12-18% variable" },
      { label: "Token Supply", value: "Deflationary" },
    ],
    commands: [
      "$ protocol revenue --period 24h",
      "Total: $1.2M | Market: $450k | Perp: $580k | Privacy: $170k",
      "$ staking stats --token MARSH",
      "Staked: 42.5M | Yield: 14.2% APY | APE: $0.18",
      "$ buyback query --last-execution",
      "Executed: $156k | Burned: 2.1M tokens | Time: 4h ago",
    ],
  },
]

export const navLinks = techSections.map((s) => ({
  id: s.id,
  number: s.number,
  title: s.title,
}))
