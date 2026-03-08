"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { usePrivy, useWallets, useSigners } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Link from "next/link"
import { authLogin, authLink, getConfig } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"

function getEmbeddedWalletId(
  user: { linkedAccounts?: Array<Record<string, unknown>>; wallet?: Record<string, unknown> } | null,
  address: string
): string | undefined {
  if (!user || !address) return undefined
  if (
    user.wallet &&
    typeof user.wallet.address === "string" &&
    user.wallet.address.toLowerCase() === address.toLowerCase() &&
    typeof user.wallet.id === "string"
  ) {
    return user.wallet.id
  }
  const acct = user.linkedAccounts?.find(
    (a) =>
      a.type === "wallet" &&
      a.walletClientType === "privy" &&
      typeof a.address === "string" &&
      (a.address as string).toLowerCase() === address.toLowerCase()
  )
  if (acct && typeof acct.id === "string") return acct.id as string
  return undefined
}

export default function AppConnectPage() {
  const router = useRouter()
  const { token, setAuth } = useAuth()
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { addSigners } = useSigners()
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const signerSetupDone = useRef<Set<string>>(new Set())
  const lastLinkedWalletId = useRef<string | null>(null)

  const embeddedWallet = useMemo(
    () => wallets.find((w) => w.walletClientType === "privy"),
    [wallets]
  )
  const walletAddress = embeddedWallet?.address
  const walletId = useMemo(
    () => (user && walletAddress ? getEmbeddedWalletId(user, walletAddress) : undefined),
    [user, walletAddress]
  )

  const ensureSigner = useCallback(
    async (address: string, signerId: string) => {
      if (signerSetupDone.current.has(address)) return
      try {
        await addSigners({ address, signers: [{ signerId }] })
        signerSetupDone.current.add(address)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("Duplicate") || msg.includes("already")) {
          signerSetupDone.current.add(address)
        } else {
          console.warn("addSigners failed:", msg)
        }
      }
    },
    [addSigners]
  )

  const syncWithBackend = useCallback(async () => {
    const accessToken = await getAccessToken()
    if (!accessToken) return
    setStatus("loading")
    setErrorMessage(null)
    try {
      const loginRes = await authLogin(accessToken)

      const embedded = wallets.find((w) => w.walletClientType === "privy")
      if (!embedded?.address) {
        if (loginRes.walletAddress && loginRes.token) {
          setAuth(loginRes.token, loginRes.walletAddress)
          setStatus("success")
          return
        }
        setErrorMessage("Wallet not ready. Try again in a moment.")
        setStatus("idle")
        return
      }

      let signerId = loginRes.signerId
      if (!signerId || signerId.trim() === "" || signerId.length <= 10) {
        try {
          const cfg = await getConfig()
          signerId = cfg.signerId
        } catch { /* ignore */ }
      }

      if (signerId && signerId.trim() !== "" && signerId.length > 10) {
        await ensureSigner(embedded.address, signerId)
      }

      const currentWalletId = getEmbeddedWalletId(user, embedded.address)

      if (loginRes.walletAddress && loginRes.token && !loginRes.message?.includes("link")) {
        if (currentWalletId && currentWalletId !== lastLinkedWalletId.current) {
          await authLink(accessToken, embedded.address, currentWalletId).catch(() => {})
          lastLinkedWalletId.current = currentWalletId
        }
        setAuth(loginRes.token, loginRes.walletAddress)
        setStatus("success")
        return
      }

      const linkRes = await authLink(accessToken, embedded.address, currentWalletId)
      if (linkRes.token) {
        if (currentWalletId) lastLinkedWalletId.current = currentWalletId
        setAuth(linkRes.token, linkRes.walletAddress)
        setStatus("success")
        return
      }

      setStatus("idle")
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Backend error")
      setStatus("error")
    }
  }, [getAccessToken, wallets, user, ensureSigner, setAuth])

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return
    syncWithBackend()
  }, [ready, authenticated, walletsReady, wallets, syncWithBackend])

  useEffect(() => {
    if (!token || !walletAddress || !walletId || walletId === lastLinkedWalletId.current) return
    let cancelled = false
    getAccessToken()
      .then((accessToken) => {
        if (!cancelled && accessToken) return authLink(accessToken, walletAddress, walletId)
      })
      .then((res) => {
        if (!cancelled && res?.token) lastLinkedWalletId.current = walletId
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token, walletAddress, walletId, getAccessToken])

  const handleLogin = () => {
    setStatus("loading")
    setErrorMessage(null)
    login()
  }

  useEffect(() => {
    if (token) {
      router.replace("/app/dashboard")
      return
    }
    if (status === "success") {
      router.replace("/app/dashboard")
    }
  }, [status, token, router])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-mono text-sm text-muted-foreground">
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-sm text-foreground transition-all duration-200 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
          >
            <span className="text-muted-foreground">{"🍡"}</span>
            <span className="font-pixel tracking-wider">MARSHMALLOW</span>
          </Link>
          <Link
            href="/"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-65px)] max-w-lg flex-col items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full border border-border bg-secondary/30 p-6"
        >
          <div className="mb-2 inline-flex items-center gap-2 border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 bg-foreground" />
            <span>CONNECT / SIGN IN</span>
          </div>
          <h1 className="font-pixel-line mb-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Launch app
          </h1>
          <p className="mb-6 font-mono text-sm leading-relaxed text-muted-foreground">
            Connect your wallet or create an account to access encrypted markets and private order flow.
          </p>

          {!authenticated && !token ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleLogin}
                disabled={status === "loading"}
                className="group flex items-center justify-center gap-2 border border-foreground bg-foreground px-6 py-3 font-mono text-sm text-background transition-all duration-200 hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-50"
              >
                {status === "loading" ? "Opening…" : "Connect wallet or create account"}
                <span className="transition-transform duration-200 group-hover:translate-x-1">{"->"}</span>
              </button>
              {errorMessage && (
                <p className="font-mono text-xs text-destructive">{errorMessage}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {status === "loading" && !token && (
                <p className="font-mono text-xs text-muted-foreground">Syncing with backend…</p>
              )}
              {status === "success" && !token && (
                <p className="font-mono text-xs text-foreground">Redirecting to dashboard…</p>
              )}
              {status === "error" && errorMessage && (
                <p className="font-mono text-xs text-destructive">{errorMessage}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {user?.linkedAccounts?.filter((a) => a.type === "wallet").map((a) => (
                  <span
                    key={"address" in a ? a.address : ""}
                    className="border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground"
                  >
                    {"address" in a ? `${(a.address as string).slice(0, 6)}…${(a.address as string).slice(-4)}` : ""}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="mt-2 border border-border px-4 py-2 font-mono text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                Disconnect
              </button>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}
