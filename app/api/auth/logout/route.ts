import { NextRequest, NextResponse } from "next/server"

import { clearCrmCookies, CRM_ACCESS_COOKIE } from "@/lib/crm-session"
import { supabaseRequest } from "@/lib/supabase-server"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const accessToken = request.cookies.get(CRM_ACCESS_COOKIE)?.value
  if (accessToken) {
    await supabaseRequest("/auth/v1/logout", { method: "POST" }, accessToken).catch(() => null)
  }

  const response = NextResponse.json({ ok: true })
  clearCrmCookies(response)
  return response
}
