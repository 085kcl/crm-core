"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { BrandMark } from "@/components/crm/brand-mark"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { withCrmBasePath } from "@/lib/crm-base-path"

export function RecoveryCompletionPanel({
  accessToken,
  onExit,
}: {
  accessToken: string
  onExit: () => void
}) {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password !== confirmation) {
      setError("As senhas não coincidem.")
      return
    }

    setLoading(true)
    try {
      const response = await fetch(withCrmBasePath("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, password }),
        cache: "no-store",
      })
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível redefinir a senha.")
      setPassword("")
      setConfirmation("")
      setComplete(true)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Não foi possível redefinir a senha.")
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
            <CardTitle className="text-2xl tracking-[-0.03em]">Defina uma nova senha</CardTitle>
            <CardDescription className="leading-6">
              O link de recuperação autoriza esta alteração. Após salvar, entre novamente com a nova senha.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-7 pb-8 sm:px-9 sm:pb-10">
            {complete ? (
              <Alert className="mb-5 border-[#b9ead9] bg-[#effbf7] text-[#145f4b]">
                <CheckCircle2 />
                <AlertTitle>Senha redefinida</AlertTitle>
                <AlertDescription>Você já pode entrar com sua nova senha.</AlertDescription>
              </Alert>
            ) : (
              <>
                {error && (
                  <Alert variant="destructive" className="mb-5">
                    <AlertTitle>Não foi possível continuar</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <form onSubmit={submit} className="space-y-5">
                  <div className="space-y-2.5">
                    <Label htmlFor="new-password">Nova senha</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={200}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="confirm-password">Confirme a nova senha</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={200}
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                  <Button disabled={loading} className="h-12 w-full rounded-xl">
                    {loading ? <Loader2 className="animate-spin" /> : "Salvar nova senha"}
                  </Button>
                </form>
              </>
            )}
            <Button asChild variant="ghost" className="mt-4 h-11 w-full rounded-xl">
              <Link href="/" onClick={onExit}>Voltar ao login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
