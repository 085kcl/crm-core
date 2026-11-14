"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandMark } from "@/components/crm/brand-mark"
import { withCrmBasePath } from "@/lib/crm-base-path"

export function RecoveryPanel({ backendConfigured }: { backendConfigured: boolean }) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(withCrmBasePath("/api/auth/recover"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const body = (await response.json()) as { message?: string }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível enviar as instruções.")
      setMessage(body.message ?? "Verifique sua caixa de entrada.")
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : "Não foi possível enviar as instruções.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="crm-grid grid min-h-svh place-items-center bg-[#0b1529] p-4 sm:p-8">
      <div className="w-full max-w-[510px]">
        <BrandMark className="mx-auto mb-8 w-fit text-white" />
        <Card className="gap-0 rounded-[24px] border-white/10 py-0 shadow-[0_30px_90px_rgba(0,0,0,0.28)]">
          <CardHeader className="gap-3 px-7 pb-5 pt-8 sm:px-9 sm:pt-10">
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-[#e7f8f2] text-[#178967]">
              <KeyRound className="size-5" />
            </div>
            <CardTitle className="text-2xl tracking-[-0.03em]">Recupere seu acesso</CardTitle>
            <CardDescription className="leading-6">
              Informe seu e-mail. Se ele estiver cadastrado, enviaremos um link seguro para redefinir a senha.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-7 pb-8 sm:px-9 sm:pb-10">
            {!backendConfigured && (
              <Alert className="mb-5 border-[#d9e2ef] bg-[#f7f9fc]">
                <ShieldCheck />
                <AlertTitle>Conexão pendente</AlertTitle>
                <AlertDescription>A recuperação será habilitada com a conexão do Supabase Auth.</AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert className="mb-5 border-[#b9ead9] bg-[#effbf7] text-[#145f4b]">
                <CheckCircle2 />
                <AlertTitle>Solicitação recebida</AlertTitle>
                <AlertDescription className="text-[#397565]">{message}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertTitle>Não foi possível continuar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="recovery-email">E-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8a95a8]" />
                  <Input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    placeholder="nome@empresa.com.br"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={!backendConfigured || loading}
                    required
                    className="h-12 rounded-xl pl-11"
                  />
                </div>
              </div>
              <Button disabled={!backendConfigured || loading} className="h-12 w-full rounded-xl">
                {loading ? <Loader2 className="animate-spin" /> : "Enviar instruções"}
              </Button>
            </form>

            <Button asChild variant="ghost" className="mt-4 h-11 w-full rounded-xl text-[#5d687c]">
              <Link href="/"><ArrowLeft /> Voltar ao login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
