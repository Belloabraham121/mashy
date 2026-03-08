"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { usePrivy } from "@privy-io/react-auth"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { token, walletAddress, hydrated, clearAuth } = useAuth()
  const { logout } = usePrivy()

  useEffect(() => {
    if (hydrated && token === null) {
      router.replace("/app")
    }
  }, [hydrated, token, router])

  const handleLogout = () => {
    clearAuth()
    logout()
    router.replace("/app")
  }

  if (!hydrated || token === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-mono text-sm text-muted-foreground">
        <span>{!hydrated ? "Loading…" : "Redirecting…"}</span>
      </div>
    )
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null

  const [copied, setCopied] = useState(false)

  const handleCopyAddress = useCallback(() => {
    if (!walletAddress) return
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [walletAddress])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <nav className="flex items-center justify-between px-4 py-0">
          <div className="flex items-center gap-0">
            <Link
              href="/app/dashboard"
              className="mr-4 flex items-center gap-2 py-3 font-mono text-sm text-foreground transition-opacity hover:opacity-80"
            >
              <span className="text-muted-foreground">{"🍡"}</span>
              <span className="font-pixel tracking-wider text-xs">MARSHMALLOW</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {shortAddr && (
              <button
                type="button"
                onClick={handleCopyAddress}
                title="Click to copy full address"
                className="relative border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground cursor-pointer"
              >
                {copied ? "Copied!" : shortAddr}
              </button>
            )}
            <Link
              href="/"
              className="px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              Disconnect
            </button>
          </div>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  )
}
