import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getSupabaseConfig } from "@/lib/supabase-server"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { CRM_BASE_PATH } from "@/lib/crm-base-path"

const recoverSchema = z.object({ email: z.string().trim().email().max(254) })

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const config = getSupabaseConfig()
  if (!config) {
    return NextResponse.json(
      { message: "A conexão segura ainda não foi configurada." },
      { status: 503 },
    )
  }

  const parsed = recoverSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Informe um e-mail válido." }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  await fetch(`${config.url}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: parsed.data.email, redirect_to: `${origin}${CRM_BASE_PATH}` }),
    cache: "no-store",
  }).catch(() => null)

  return NextResponse.json({
    ok: true,
    message: "Se o e-mail estiver cadastrado, as instruções serão enviadas.",
  })
}
