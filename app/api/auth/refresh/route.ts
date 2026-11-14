import { NextRequest, NextResponse } from "next/server"

import {
  CRM_ACCESS_COOKIE,
  CRM_REFRESH_COOKIE,
  clearCrmCookies,
  secureCookie,
} from "@/lib/crm-session"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { getSupabaseConfig } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const config = getSupabaseConfig()
  const refreshToken = request.cookies.get(CRM_REFRESH_COOKIE)?.value
  if (!config || !refreshToken) {
    const response = NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
    clearCrmCookies(response)
    return response
  }

  const authResponse = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  })
  const authBody = (await authResponse.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!authResponse.ok || !authBody.access_token || !authBody.refresh_token) {
    const response = NextResponse.json({ message: "Sessão expirada." }, { status: 401 })
    clearCrmCookies(response)
    return response
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
