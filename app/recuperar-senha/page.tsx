import type { Metadata } from "next"

import { RecoveryPanel } from "@/components/crm/recovery-panel"
import { isSupabaseConfigured } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Recuperar senha",
}

export default function RecoverPasswordPage() {
  return <RecoveryPanel backendConfigured={isSupabaseConfigured()} />
}
