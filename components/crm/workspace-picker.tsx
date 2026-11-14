"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandMark } from "@/components/crm/brand-mark"
import { fetchWithSessionRetry } from "@/lib/client-fetch"
import { withCrmBasePath } from "@/lib/crm-base-path"

type Workspace = {
  id: string
  name: string
  slug: string
  role: string
  status: string
  members?: number
  transient?: boolean
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63)
}

export function WorkspacePicker({ demo, backendConfigured }: { demo: boolean; backendConfigured: boolean }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)

  const loadWorkspaces = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchWithSessionRetry("/api/workspaces", { cache: "no-store" })
      const body = (await response.json()) as { workspaces?: Workspace[]; message?: string }
      if (response.status === 401) {
        window.location.assign(withCrmBasePath("/"))
        return
      }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível carregar os workspaces.")
      setWorkspaces(body.workspaces ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os workspaces.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspaces()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadWorkspaces])

  const canCreate = useMemo(
    () => name.trim().length >= 2 && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug),
    [name, slug],
  )

  function updateName(value: string) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  async function selectWorkspace(workspaceId: string) {
    setSelecting(workspaceId)
    setError(null)
    try {
      const response = await fetch(withCrmBasePath("/api/workspaces/select"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      const body = (await response.json()) as { next?: string; message?: string }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível abrir o workspace.")
      window.location.assign(withCrmBasePath(body.next ?? "/app"))
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Não foi possível abrir o workspace.")
      setSelecting(null)
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      const response = await fetch(withCrmBasePath("/api/workspaces"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      })
      const body = (await response.json()) as { workspace?: Workspace; message?: string }
      if (!response.ok || !body.workspace) throw new Error(body.message ?? "Não foi possível criar o workspace.")
      setWorkspaces((current) => [...current, body.workspace as Workspace])
      setName("")
      setSlug("")
      setSlugTouched(false)
      setDialogOpen(false)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar o workspace.")
    } finally {
      setCreating(false)
    }
  }

  async function signOut() {
    await fetch(withCrmBasePath("/api/auth/logout"), { method: "POST" }).catch(() => null)
    window.location.assign("/")
  }

  return (
    <main className="min-h-svh bg-[#f4f7fb] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1120px]">
        <header className="flex items-center justify-between gap-4">
          <BrandMark className="text-[#0b1529]" />
          <Button variant="ghost" onClick={signOut} className="text-[#68738a]">
            <LogOut /> <span className="hidden sm:inline">Sair</span>
          </Button>
        </header>

        <section className="mt-14 sm:mt-20">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge className="border-0 bg-[#ddf7ee] text-[#116c52] hover:bg-[#ddf7ee]">
                  <ShieldCheck /> Ambiente isolado
                </Badge>
                {demo && <Badge variant="outline" className="border-[#efc872] bg-[#fff8e8] text-[#825d13]">Demonstração</Badge>}
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#172033] sm:text-[42px]">
                Escolha onde trabalhar
              </h1>
              <p className="mt-3 max-w-[620px] text-sm leading-6 text-[#68738a] sm:text-base">
                Cada workspace mantém usuários, funis e dados comerciais separados. Você pode alternar depois sem encerrar a sessão.
              </p>
            </div>
            <Button onClick={() => setDialogOpen(true)} className="h-11 rounded-xl bg-[#14213d] px-5">
              <Plus /> Novo workspace
            </Button>
          </div>

          {!backendConfigured && demo && (
            <Alert className="mt-8 border-[#b9ead9] bg-[#effbf7] text-[#145f4b]">
              <CheckCircle2 />
              <AlertTitle>Modo de apresentação ativo</AlertTitle>
              <AlertDescription className="text-[#397565]">
                Estes dados servem para validar a experiência. Nada desta sessão será gravado como dado canônico.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mt-8">
              <CircleAlert />
              <AlertTitle>Encontramos um problema</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button type="button" variant="outline" size="sm" onClick={loadWorkspaces}>
                  <RefreshCw /> Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {loading && [0, 1].map((item) => (
              <div key={item} className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-12 rounded-xl" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-28" /></div>
                </div>
                <Skeleton className="mt-8 h-10 w-full rounded-xl" />
              </div>
            ))}

            {!loading && workspaces.map((workspace, index) => (
              <article
                key={workspace.id}
                className="group relative overflow-hidden rounded-2xl border bg-white p-6 shadow-[0_10px_35px_rgba(23,32,51,0.055)] transition hover:-translate-y-0.5 hover:border-[#afc1d7] hover:shadow-[0_18px_44px_rgba(23,32,51,0.09)]"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#49d3a7] via-[#3d6ae8] to-[#8a5ae8] opacity-0 transition group-hover:opacity-100" />
                <div className="flex items-start gap-4">
                  <div className={`grid size-12 shrink-0 place-items-center rounded-xl ${index % 2 === 0 ? "bg-[#e7f8f2] text-[#178967]" : "bg-[#eaf0ff] text-[#3d63c9]"}`}>
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold tracking-[-0.02em]">{workspace.name}</h2>
                    <p className="mt-1 truncate text-xs text-[#7d889b]">/{workspace.slug}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">{workspace.role === "member" ? "Membro" : workspace.role}</Badge>
                </div>

                <div className="mt-7 flex items-center justify-between border-t pt-5 text-xs text-[#7d889b]">
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#36b58d]" /> Ativo</span>
                  {typeof workspace.members === "number" && <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {workspace.members} membros</span>}
                </div>

                <Button
                  onClick={() => selectWorkspace(workspace.id)}
                  disabled={selecting !== null}
                  variant="outline"
                  className="mt-5 h-11 w-full justify-between rounded-xl border-[#d5dfeb] bg-[#f9fbfd] px-4 hover:bg-[#edf7f4]"
                >
                  Abrir workspace
                  {selecting === workspace.id ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                </Button>
                {workspace.transient && <p className="mt-3 text-center text-[11px] text-[#a3791e]">Temporário nesta demonstração</p>}
              </article>
            ))}
          </div>

          {!loading && workspaces.length === 0 && !error && (
            <Empty className="mt-8 min-h-72 border bg-white">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
                <EmptyTitle>Nenhum workspace disponível</EmptyTitle>
                <EmptyDescription>Crie o primeiro ambiente para iniciar sua operação comercial.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setDialogOpen(true)}><Plus /> Criar workspace</Button>
              </EmptyContent>
            </Empty>
          )}
        </section>

        <footer className="mt-16 flex flex-col items-center justify-between gap-3 border-t py-6 text-[11px] text-[#96a0b1] sm:flex-row">
          <span>CRM Core v0.01</span>
          <span>O workspace selecionado orienta a interface; a autorização permanece no banco.</span>
        </footer>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[520px]">
          <form onSubmit={createWorkspace}>
            <DialogHeader>
              <DialogTitle>Novo workspace</DialogTitle>
              <DialogDescription>Crie um ambiente isolado para uma empresa, unidade ou operação.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Nome</Label>
                <Input
                  id="workspace-name"
                  value={name}
                  onChange={(event) => updateName(event.target.value)}
                  placeholder="Nome da empresa ou operação"
                  className="h-11 rounded-xl"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-slug">Identificador</Label>
                <Input
                  id="workspace-slug"
                  value={slug}
                  onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)) }}
                  placeholder="nome-do-workspace"
                  className="h-11 rounded-xl font-mono text-xs"
                />
                <p className="text-xs leading-5 text-[#7d889b]">Somente letras minúsculas, números e hífens. Ele não poderá colidir com outro workspace.</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!canCreate || creating}>
                {creating ? <Loader2 className="animate-spin" /> : <>Criar workspace <ArrowRight /></>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
