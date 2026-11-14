import { z } from "zod"

import { supabaseRequest } from "@/lib/supabase-server"

export async function getSupabaseUserId(accessToken: string) {
  const response = await supabaseRequest("/auth/v1/user", {}, accessToken)
  if (!response.ok) return null

  const body = (await response.json().catch(() => null)) as { id?: string } | null
  return z.string().uuid().safeParse(body?.id).success ? body!.id! : null
}
