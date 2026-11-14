"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  ShieldCheck,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BrandMark } from "@/components/crm/brand-mark"
import { RecoveryCompletionPanel } from "@/components/crm/recovery-completion-panel"
import { withCrmBasePath } from "@/lib/crm-base-path"

export function LoginPanel({ backendConfigured }: { backendConfigured: boolean }) {
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const [recoveryError, setRecoveryError] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fragment = window.location.hash.slice(1)
    if (!fragment) return
    const params = new URLSearchParams(fragment)
    if (params.get("type") !== "recovery" && !params.has("error")) return

    const token = params.get("access_token")
    queueMicrotask(() => {
      if (params.get("type") === "recovery" && token) setRecoveryToken(token)
      else setRecoveryError(true)
    })
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
  }, [])

  if (recoveryToken) {
    return <RecoveryCompletionPanel accessToken={recoveryToken} onExit={() => setRecoveryToken(null)} />
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(withCrmBasePath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const body = (await response.json()) as { message?: string }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível entrar.")
      window.location.assign(withCrmBasePath("/workspaces"))
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Não foi possível entrar.")
    } finally {
      setLoading(false)
    }
  }

  async function enterDemo() {
    setDemoLoading(true)
    setError(null)
    try {
      const response = await fetch(withCrmBasePath("/api/demo"), { method: "POST" })
      if (!response.ok) throw new Error("Não foi possível iniciar a demonstração.")
      window.location.assign("/workspaces")
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : "Não foi possível iniciar a demonstração.")
      setDemoLoading(false)
    }
  }

  return (
    <main className="min-h-svh bg-[#f4f7fb] p-3 sm:p-5 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100svh-1.5rem)] max-w-[1480px] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(23,32,51,0.13)] sm:min-h-[calc(100svh-2.5rem)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="crm-grid relative hidden overflow-hidden bg-[#0b1529] px-10 py-9 text-white lg:flex lg:flex-col xl:px-14 xl:py-12">
          <div className="absolute -right-32 -top-32 size-[430px] rounded-full border border-[#49d3a7]/20 bg-[#49d3a7]/5" />
          <div className="absolute -right-10 top-10 size-[230px] rounded-full border border-white/8" />
          <BrandMark className="relative z-10 text-white" />

          <div className="relative z-10 my-auto max-w-[620px] py-14">
            <div className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#8fe7ca]">
              <span className="crm-signal size-2 rounded-full bg-[#49d3a7]" />
              Núcleo operacional independente
            </div>
            <h1 className="max-w-[590px] text-4xl font-semibold leading-[1.08] tracking-[-0.045em] xl:text-[56px]">
              Seu relacionamento comercial, sob seu controle.
            </h1>
            <p className="mt-6 max-w-[560px] text-base leading-7 text-[#aebbd0] xl:text-lg xl:leading-8">
              Um CRM multiempresa para transformar contatos em histórico confiável, negócios em processo e operação em inteligência.
            </p>

            <div className="mt-11 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Network, title: "API-first", text: "Interface substituível" },
                { icon: Building2, title: "Multiempresa", text: "Tenants isolados" },
                { icon: ShieldCheck, title: "Seguro", text: "RLS e auditoria" },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
                  <Icon className="size-5 text-[#49d3a7]" />
                  <p className="mt-5 text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs text-[#8391a8]">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-[#74839c]">
            <span>Work/Sites · Supabase/PostgreSQL</span>
            <span className="flex items-center gap-2"><LockKeyhole className="size-3.5" /> Dados canônicos protegidos</span>
          </div>
        </section>

        <section className="flex min-h-full flex-col px-6 py-7 sm:px-10 sm:py-9 xl:px-20 xl:py-12">
          <BrandMark className="text-[#0b1529] lg:hidden" />
          <div className="mx-auto my-auto w-full max-w-[430px] py-10">
            <div className="mb-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#178967]">Acesso seguro</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#172033] sm:text-[38px]">
                Bem-vindo de volta
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#68738a]">
                Entre para acessar seus workspaces e continuar de onde parou.
              </p>
            </div>

            {!backendConfigured && (
              <Alert className="mb-6 border-[#b9ead9] bg-[#effbf7] text-[#145f4b]">
                <KeyRound />
                <AlertTitle>Ambiente de demonstração</AlertTitle>
                <AlertDescription className="text-[#397565]">
                  A conexão com o Supabase será ativada quando as credenciais públicas do projeto forem configuradas.
                </AlertDescription>
              </Alert>
            )}

            {recoveryError && (
              <Alert variant="destructive" className="mb-5">
                <AlertTitle>Link de recuperação inválido</AlertTitle>
                <AlertDescription>Solicite um novo link para redefinir sua senha.</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>Não foi possível entrar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-2.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@empresa.com.br"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={!backendConfigured || loading}
                  required
                  className="h-12 rounded-xl bg-white px-4"
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="password">Senha</Label>
                  <Link href="/recuperar-senha" className="text-xs font-semibold text-[#178967] hover:underline">
                    Esqueci minha senha
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={!backendConfigured || loading}
                    required
                    className="h-12 rounded-xl bg-white px-4 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={!backendConfigured}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#778298] transition hover:text-[#172033] disabled:opacity-40"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={!backendConfigured || loading} className="h-12 w-full rounded-xl bg-[#14213d] text-white hover:bg-[#1c2c50]">
                {loading ? <Loader2 className="animate-spin" /> : <>Entrar <ArrowRight /></>}
              </Button>
            </form>

            {!backendConfigured && (
              <div className="mt-6">
                <div className="mb-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9aa4b4]">
                  <span className="h-px flex-1 bg-[#e1e6ee]" /> ou <span className="h-px flex-1 bg-[#e1e6ee]" />
                </div>
                <Button type="button" variant="outline" onClick={enterDemo} disabled={demoLoading} className="h-12 w-full rounded-xl border-[#cbd6e4] bg-white">
                  {demoLoading ? <Loader2 className="animate-spin" /> : <><Check className="text-[#178967]" /> Acessar demonstração</>}
                </Button>
              </div>
            )}

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#818ca0]">
              <ShieldCheck className="size-4 text-[#20a57e]" />
              Nenhuma credencial administrativa é enviada ao navegador.
            </div>
          </div>

          <footer className="flex flex-col items-center justify-between gap-2 border-t border-[#edf0f5] pt-5 text-[11px] text-[#9aa4b4] sm:flex-row">
            <span>CRM Core v0.03</span>
            <span>Privacidade por arquitetura</span>
          </footer>
        </section>
      </div>
    </main>
  )
}
