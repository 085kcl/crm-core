import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CRM_ACCESS_COOKIE,
  CRM_REFRESH_COOKIE,
  secureCookie,
} from "@/lib/crm-session"
import { getSupabaseConfig } from "@/lib/supabase-server"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
})

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const config = getSupabaseConfig()
  if (!config) {
    return NextResponse.json(
      { message: "A conexão segura ainda não foi configurada." },
      { status: 503 },
    )
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Revise o e-mail e a senha informados." }, { status: 400 })
  }

  const authResponse = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parsed.data),
    cache: "no-store",
  })

  const authBody = (await authResponse.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!authResponse.ok || !authBody.access_token || !authBody.refresh_token) {
    return NextResponse.json({ message: "E-mail ou senha inválidos." }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(CRM_ACCESS_COOKIE, authBody.access_token, {
    ...secureCookie,
    maxAge: Math.max(60, authBody.expires_in ?? 3600),
  })
  response.cookies.set(CRM_REFRESH_COOKIE, authBody.refresh_token, {
    ...secureCookie,
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
