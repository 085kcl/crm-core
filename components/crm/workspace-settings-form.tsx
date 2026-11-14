"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Building2, CheckCircle2, CircleAlert, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchWithSessionRetry } from "@/lib/client-fetch"

type Workspace = {
  id: string
  name: string
  slug: string
  status: "active" | "inactive" | "archived"
}

export function WorkspaceSettingsForm({ demo }: { demo: boolean }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [name, setName] = useState("")
  const [status, setStatus] = useState<Workspace["status"]>("active")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const response = await fetchWithSessionRetry("/api/workspaces/current", { cache: "no-store" })
        const body = (await response.json()) as { workspace?: Workspace; message?: string }
        if (!response.ok || !body.workspace) throw new Error(body.message ?? "Não foi possível carregar o workspace.")
        setWorkspace(body.workspace)
        setName(body.workspace.name)
        setStatus(body.workspace.status)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o workspace.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspace || name.trim().length < 2) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetchWithSessionRetry("/api/workspaces/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, status }),
      })
      const body = (await response.json()) as { workspace?: Workspace; message?: string; mode?: string }
      if (!response.ok || !body.workspace) throw new Error(body.message ?? "Não foi possível salvar as alterações.")
      setWorkspace((current) => current ? { ...current, ...body.workspace } : body.workspace as Workspace)
      toast.success(demo ? "Alteração simulada nesta demonstração." : "Workspace atualizado com sucesso.")
      if (!demo) window.setTimeout(() => window.location.reload(), 550)
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Não foi possível salvar as alterações."
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
      <CardHeader className="border-b px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#eef2f7] text-[#324057]"><Building2 className="size-5" /></span>
          <div><CardTitle className="text-base">Identidade do workspace</CardTitle><p className="mt-1 text-xs text-[#8490a3]">Informações visíveis para os membros</p></div>
        </div>
      </CardHeader>
      <CardContent className="px-5 py-6 sm:px-6">
        {error && (
          <Alert variant="destructive" className="mb-5">
            <CircleAlert />
            <AlertTitle>Não foi possível concluir</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {demo && !error && (
          <Alert className="mb-5 border-[#f0d18c] bg-[#fff9ec] text-[#76570f]">
            <CheckCircle2 />
            <AlertTitle>Edição demonstrativa</AlertTitle>
            <AlertDescription className="text-[#866b31]">Você pode testar o formulário; a alteração dura apenas nesta sessão.</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-5">
            <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-11 w-full rounded-xl" /></div>
            <div className="grid gap-5 sm:grid-cols-2"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div>
            <Skeleton className="h-11 w-36 rounded-xl" />
          </div>
        ) : workspace ? (
          <form onSubmit={save} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Nome do workspace</Label>
              <Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-slug">Identificador</Label>
                <Input id="settings-slug" value={workspace.slug} disabled className="h-11 rounded-xl bg-[#f6f8fb] font-mono text-xs" />
                <p className="text-[11px] text-[#8a95a8]">Imutável nesta versão.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-status">Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as Workspace["status"])}>
                  <SelectTrigger id="settings-status" className="h-11 w-full rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-[#8a95a8]">O banco valida seu papel antes de aceitar.</p>
              </div>
            </div>
            <div className="flex justify-end border-t pt-5">
              <Button type="submit" disabled={saving || name.trim().length < 2} className="h-11 rounded-xl px-5">
                {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
