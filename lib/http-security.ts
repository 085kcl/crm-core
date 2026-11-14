import { NextRequest, NextResponse } from "next/server"

export function isSameOriginMutation(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite && fetchSite !== "same-origin") return false

  const origin = request.headers.get("origin")
  if (!origin) return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function rejectedMutation() {
  return NextResponse.json({ message: "Requisição não autorizada." }, { status: 403 })
}
