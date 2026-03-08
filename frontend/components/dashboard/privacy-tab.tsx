"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function PrivacyTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-pixel-line mb-1 text-xl font-bold tracking-tight text-foreground">
          Privacy
        </h2>
        <p className="font-mono text-sm text-muted-foreground">
          How Marshmallow keeps your activity and order flow encrypted and private.
        </p>
      </div>

      <Card className={cn("border-border bg-card rounded-none")}>
        <CardHeader>
          <CardTitle className="font-mono text-sm font-medium">
            Encrypted order flow
          </CardTitle>
          <CardDescription className="font-mono text-xs text-muted-foreground">
            Your trades and predictions are not visible on public mempools
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs text-muted-foreground">
          <p>
            Orders and predictions are recorded in private ledgers and settled via the pool. Only net exposures and settlements touch the chain where required; individual positions stay off public view.
          </p>
        </CardContent>
      </Card>

      <Card className={cn("border-border bg-card rounded-none")}>
        <CardHeader>
          <CardTitle className="font-mono text-sm font-medium">
            Private balance & vault
          </CardTitle>
          <CardDescription className="font-mono text-xs text-muted-foreground">
            Compliant private token vault and withdrawal tickets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs text-muted-foreground">
          <p>
            You deposit into the vault (on-chain). Your balance is represented as a private balance in the private-token system. Margin for perps and stakes for predictions move via private-transfer to the pool. Withdrawals use signed tickets redeemed on the vault.
          </p>
        </CardContent>
      </Card>

      <Card className={cn("border-border bg-card rounded-none")}>
        <CardHeader>
          <CardTitle className="font-mono text-sm font-medium">
            Server-signed transactions
          </CardTitle>
          <CardDescription className="font-mono text-xs text-muted-foreground">
            Backend can sign on your behalf (no popup) when you’ve linked your wallet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 font-mono text-xs text-muted-foreground">
          <p>
            After connecting with Privy and linking your embedded wallet, the backend can execute prediction market, vault, and perp actions on your behalf using your wallet ID—so you get a seamless experience without signing every step in the browser.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
