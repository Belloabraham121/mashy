"use client"

import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { motion } from "framer-motion"

const COMMANDS: Record<string, string[]> = {
  help: [
    "Available commands:",
    "  help       - Show this message",
    "  markets    - List available prediction markets",
    "  balance    - Check your private balance",
    "  about      - About Marshmallow Protocol",
    "  security   - Security & privacy features",
    "  clear      - Clear terminal",
    "  deposit    - Deposit flow information",
    "  trade      - Trading examples",
  ],
  markets: [
    "01  ETH to 100k by Q2 2025 (Yes/No)",
    "02  Avalanche TVL > 10B (Yes/No)",
    "03  DeFi yield protocols surge (Yes/No)",
    "04  Layer 2 dominance increases (Yes/No)",
    "05  Privacy protocols adoption growth (Yes/No)",
    "06  Prediction market volume 2x (Yes/No)",
    "",
    "Use private balance to stake on any market.",
    "Payouts credited to your vault.",
  ],
  balance: [
    "Private Balance: 5.42 AVAX",
    "Vault Address: 0x742d35Cc6634C0532925a3b844Bc57e5f5....",
    "Prediction Stakes: 1.50 AVAX",
    "Perps Margin Available: 3.92 AVAX",
    "Pending Withdrawals: 0 AVAX",
  ],
  about: [
    "Marshmallow Protocol v0.1.0",
    "",
    "Private prediction markets and perpetuals",
    "on Avalanche, powered by Chainlink CRE.",
    "",
    "Predict outcomes, trade perpetuals, manage",
    "positions entirely with your private balance.",
    "Deposits & withdrawals via on-chain vault.",
    "",
    "Built for privacy-first trading.",
  ],
  security: [
    "Privacy Features:",
    "  • Private balance system (off-chain tracking)",
    "  • Position encryption via private ledger",
    "  • Chainlink CRE resolution (tamper-proof)",
    "  • One-time withdrawal tickets",
    "  • PolicyEngine compliance integration",
    "",
    "Audit: Conducted by CertiK",
    "Status: SECURITY_VERIFIED",
  ],
  deposit: [
    "Deposit Flow:",
    "  1. Connect Avalanche wallet",
    "  2. Select amount to deposit",
    "  3. Approve AVAX transfer",
    "  4. Receive private balance",
    "  5. Start predicting & trading",
    "",
    "Min deposit: 0.1 AVAX",
    "Vault gas: ~0.02 AVAX",
  ],
  trade: [
    "Trading Examples:",
    "",
    "Prediction Market:",
    "  Stake 1 AVAX on ETH 100k → Win 2 AVAX",
    "",
    "Perpetuals with Margin:",
    "  Margin: 0.5 AVAX | Leverage: 5x",
    "  Long BTC → Current P&L: +0.15 AVAX",
    "",
    "Withdraw Winnings:",
    "  Request → Get signed ticket → Redeem",
  ],
  v0: [
    "",
    "  ███╗   ███╗ █████╗ ██████╗ ███████╗██╗  ██╗███╗   ███╗██╗    ██╗",
    "  ████╗ ████║██╔══██╗██╔══██╗██╔════╝██║  ██║████╗ ████║██║    ██║",
    "  ██╔████╔██║███████║██████╔╝███████╗███████║██╔████╔██║██║ █╗ ██║",
    "  ██║╚██╔╝██║██╔══██║██╔══██╗╚════██║██╔══██║██║╚██╔╝██║██║███╗██║",
    "  ██║ ╚═╝ ██║██║  ██║██║  ██║███████║██║  ██║██║ ╚═╝ ██║╚███╔███╔╝",
    "  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚══╝╚══╝",
    "",
    "  Private. Verifiable. Chainlink-Powered.",
    "",
  ],
}

interface TerminalLine {
  type: "input" | "output" | "v0"
  content: string
}

export function PseudoTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "output", content: 'Welcome to Marshmallow Protocol Terminal v0.1.0' },
    { type: "output", content: 'Type "help" for available commands.' },
    { type: "output", content: "" },
  ])
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const processCommand = (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase()
    const baseLines: TerminalLine[] = [
      ...lines,
      { type: "input", content: `$ ${cmd}` },
    ]

    if (trimmed === "clear") {
      setLines([])
      setInput("")
      return
    }

    if (trimmed === "v0") {
      setLines([...baseLines, { type: "output", content: "" }])
      setInput("")
      const v0Lines = COMMANDS["v0"]
      v0Lines.forEach((line, i) => {
        setTimeout(() => {
          setLines((prev) => [...prev, { type: "v0", content: line }])
        }, i * 80)
      })
      return
    }

    const newLines: TerminalLine[] = [...baseLines]
    const response = COMMANDS[trimmed]
    if (response) {
      response.forEach((line) => {
        newLines.push({ type: "output", content: line })
      })
    } else if (trimmed === "") {
      // do nothing
    } else {
      newLines.push({ type: "output", content: `command not found: ${trimmed}` })
      newLines.push({ type: "output", content: 'Type "help" for available commands.' })
    }

    newLines.push({ type: "output", content: "" })
    setLines(newLines)
    setInput("")
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      processCommand(input)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24"
    >
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-muted-foreground">{">"}</span>
          <div className="h-[1px] w-12 bg-border" />
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Interactive
          </span>
        </div>
        <h2 className="font-pixel-line text-3xl font-bold tracking-tight text-foreground md:text-5xl">
          Interactive Terminal
        </h2>
        <p className="max-w-prose font-mono text-sm leading-relaxed text-muted-foreground">
          Explore Marshmallow. Query your vault, check markets, manage positions through the command line.
        </p>
      </div>

      <div
        className="border border-border"
        onClick={() => inputRef.current?.focus()}
        role="application"
        aria-label="Interactive pseudo-terminal"
      >
        {/* Terminal header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="h-2.5 w-2.5 bg-foreground" />
          <div className="h-2.5 w-2.5 bg-muted-foreground/50" />
          <div className="h-2.5 w-2.5 bg-muted-foreground/30" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            marshmallow-protocol ~ terminal
          </span>
        </div>

        {/* Terminal body */}
        <div
          ref={scrollRef}
          className="h-80 overflow-y-auto bg-secondary/20 p-4"
        >
          {lines.map((line, i) => (
            <div
              key={i}
              className={`font-mono text-xs leading-relaxed ${
                line.type === "input"
                  ? "text-foreground"
                  : line.type === "v0"
                  ? "text-foreground brightness-125"
                  : "text-muted-foreground"
              }`}
            >
              {line.content || "\u00A0"}
            </div>
          ))}

          {/* Input line */}
          <div className="relative flex items-center font-mono text-xs text-foreground">
            <span className="mr-1">{"$"}</span>
            <span>{input}</span>
            <span className="animate-blink">{"█"}</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="absolute inset-0 h-full w-full cursor-default border-none bg-transparent opacity-0 outline-none"
              aria-label="Terminal input"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </motion.section>
  )
}
