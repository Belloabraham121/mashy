"use client"

import { useState } from "react"
import { PerpetualsTab } from "@/components/dashboard/perpetuals-tab"
import { PredictionTab } from "@/components/dashboard/prediction-tab"
import { PrivacyTab } from "@/components/dashboard/privacy-tab"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "perps", label: "Perps", icon: "◆" },
  { id: "prediction", label: "Prediction", icon: "◎" },
  { id: "privacy", label: "Privacy", icon: "◈" },
] as const

type TabId = (typeof TABS)[number]["id"]

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("perps")

  return (
    <div className="flex flex-col">
      {/* Top tab bar – Hyperliquid-style nav */}
      <div className="border-b border-border bg-card/50">
        <div className="flex items-center gap-0 px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2.5 font-mono text-xs transition-colors",
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="text-[10px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content – full width, no max-w constraint for perps */}
      {activeTab === "perps" && <PerpetualsTab />}
      {activeTab === "prediction" && <PredictionTab />}
      {activeTab === "privacy" && (
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <PrivacyTab />
        </div>
      )}
    </div>
  )
}
