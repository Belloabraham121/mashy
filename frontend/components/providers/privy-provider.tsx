"use client"

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth"

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""

/**
 * Console noise from Privy: requests to auth.privy.io/api/v1/analytics_events may show 422,
 * CORS errors, or net::ERR_FAILED. That's Privy's internal analytics — it does not affect
 * login or signing. Safe to ignore.
 */

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  if (!privyAppId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 font-mono text-sm text-muted-foreground">
        <p>NEXT_PUBLIC_PRIVY_APP_ID is not set. Add it to .env.local to enable login.</p>
      </div>
    )
  }

  return (
    <PrivyProviderBase
      appId={privyAppId}
      config={{
        loginMethods: ["email", "wallet", "google", "apple"],
        appearance: {
          theme: "dark",
          accentColor: "#ffffff",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </PrivyProviderBase>
  )
}
