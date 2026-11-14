import { NextRequest, NextResponse } from "next/server"
import { CRM_DEMO_COOKIE, secureCookie } from "@/lib/crm-session"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(CRM_DEMO_COOKIE, "1", {
    ...secureCookie,
    maxAge: 60 * 60 * 8,
  })
  return response
}
