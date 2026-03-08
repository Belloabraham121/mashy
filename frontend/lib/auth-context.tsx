"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"

const TOKEN_KEY = "marshmallow_jwt"

type AuthState = {
  token: string | null
  walletAddress: string | null
  hydrated: boolean
  setAuth: (token: string | null, walletAddress: string | null) => void
  clearAuth: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TOKEN_KEY)
      if (stored) {
        const { token: t, walletAddress: w } = JSON.parse(stored) as {
          token?: string
          walletAddress?: string | null
        }
        if (t) setToken(t)
        if (w) setWalletAddress(w)
      }
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  const setAuth = useCallback((t: string | null, w: string | null) => {
    setToken(t)
    setWalletAddress(w)
    if (t && w) {
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: t, walletAddress: w }))
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem(TOKEN_KEY)
      } catch {
        // ignore
      }
    }
  }, [])

  const clearAuth = useCallback(() => {
    setToken(null)
    setWalletAddress(null)
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore
    }
  }, [])

  if (!hydrated) {
    return null
  }

  return (
    <AuthContext.Provider
      value={{ token, walletAddress, hydrated, setAuth, clearAuth }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
