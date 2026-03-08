import { PrivyProvider } from "@/components/providers/privy-provider"
import { AuthProvider } from "@/lib/auth-context"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <PrivyProvider>
      <AuthProvider>{children}</AuthProvider>
    </PrivyProvider>
  )
}
