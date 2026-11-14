import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { clearCrmCookies } from "@/lib/crm-session"
import { isSameOriginMutation, rejectedMutation } from "@/lib/http-security"
import { getSupabaseConfig } from "@/lib/supabase-server"

const resetSchema = z.object({
  access_token: z.string().min(20).max(8192),
  password: z.string().min(8).max(200),
}).strict()

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return rejectedMutation()

  const config = getSupabaseConfig()
  if (!config) {
    return NextResponse.json(
      { message: "A conexão segura ainda não foi configurada." },
      { status: 503 },
    )
  }

  const parsed = resetSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ message: "Informe uma senha válida." }, { status: 400 })
  }

  let authResponse: Response
  try {
    authResponse = await fetch(`${config.url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${parsed.data.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: parsed.data.password }),
      cache: "no-store",
    })
  } catch {
    return NextResponse.json(
      { message: "Não foi possível contatar o serviço de autenticação." },
      { status: 502 },
    )
  }

  if (!authResponse.ok) {
    return NextResponse.json(
      {
        message: authResponse.status === 401
          ? "O link expirou. Solicite um novo link de recuperação."
          : "Não foi possível redefinir a senha. Verifique as regras de segurança e tente novamente.",
      },
      { status: authResponse.status === 401 ? 401 : 400 },
    )
  }

  const response = NextResponse.json({ ok: true })
  response.headers.set("Cache-Control", "no-store")
  clearCrmCookies(response)
  return response
}
