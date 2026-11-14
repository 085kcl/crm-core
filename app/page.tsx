import { LoginPanel } from "@/components/crm/login-panel"
import { isSupabaseConfigured } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

export default function LoginPage() {
  return <LoginPanel backendConfigured={isSupabaseConfigured()} />
}
