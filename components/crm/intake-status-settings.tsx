"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleAlert, Loader2, Pencil, Plus, RadioTower, Save, Star } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchWithSessionRetry } from "@/lib/client-fetch"

type Bucket = "new" | "in_progress" | "awaiting_customer" | "closed"

type IntakeStatus = {
  id: string
  key: string
  label: string
  position: number
  is_initial: boolean
  is_terminal: boolean
  customer_notification_enabled: boolean
  active: boolean
  inbox_bucket: Bucket
}

type EditorState = {
  id: string | null
  key: string
  label: string
  position: string
  is_terminal: boolean
  customer_notification_enabled: boolean
  active: boolean
  inbox_bucket: Bucket
}

const bucketLabels: Record<Bucket, string> = {
  new: "Novas",
  in_progress: "Em andamento",
  awaiting_customer: "Aguardando cliente",
  closed: "Concluídas",
}

const emptyEditor: EditorState = {
  id: null,
  key: "",
  label: "",
  position: "0",
  is_terminal: false,
  customer_notification_enabled: false,
  active: true,
  inbox_bucket: "in_progress",
}

export function IntakeStatusSettings({ demo }: { demo: boolean }) {
  const [statuses, setStatuses] = useState<IntakeStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [changingInitial, setChangingInitial] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...statuses].sort((a, b) => a.position - b.position || a.label.localeCompare(b.label)),
    [statuses],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchWithSessionRetry("/api/intake-statuses", { cache: "no-store" })
      const body = (await response.json()) as { statuses?: IntakeStatus[]; message?: string }
      if (!response.ok || !body.statuses) {
        throw new Error(body.message ?? "Não foi possível carregar os status.")
      }
      setStatuses(body.statuses)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os status.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  function edit(status: IntakeStatus) {
    setEditor({
      id: status.id,
      key: status.key,
      label: status.label,
      position: String(status.position),
      is_terminal: status.is_terminal,
      customer_notification_enabled: status.customer_notification_enabled,
      active: status.active,
      inbox_bucket: status.inbox_bucket,
    })
  }

  async function save() {
    if (!editor || saving) return
    const position = Number.parseInt(editor.position, 10)
    if (!Number.isFinite(position) || position < 0 || !editor.label.trim()) return

    setSaving(true)
    try {
      const payload = {
        ...(editor.id ? {} : { key: editor.key.trim().toLowerCase() }),
        label: editor.label.trim(),
        position,
        is_terminal: editor.is_terminal,
        customer_notification_enabled: editor.customer_notification_enabled,
        active: editor.active,
        inbox_bucket: editor.inbox_bucket,
      }

      const response = await fetchWithSessionRetry(
        editor.id ? `/api/intake-statuses/${editor.id}` : "/api/intake-statuses",
        {
          method: editor.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível salvar o status.")

      toast.success(editor.id ? "Status atualizado." : "Status criado.")
      setEditor(null)
      await load()
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Não foi possível salvar o status.")
    } finally {
      setSaving(false)
    }
  }

  async function makeInitial(status: IntakeStatus) {
    if (demo || status.is_initial || !status.active || status.is_terminal || changingInitial) return
    setChangingInitial(status.id)
    try {
      const response = await fetchWithSessionRetry(`/api/intake-statuses/${status.id}/initial`, {
        method: "POST",
      })
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) throw new Error(body?.message ?? "Não foi possível alterar o status inicial.")
      toast.success("Status inicial atualizado.")
      await load()
    } catch (changeError) {
      toast.error(changeError instanceof Error ? changeError.message : "Não foi possível alterar o status inicial.")
    } finally {
      setChangingInitial(null)
    }
  }

  return (
    <>
      <Card className="mt-5 gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
        <CardHeader className="flex-row items-center justify-between border-b px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#f1ebff] text-[#7650c6]">
              <RadioTower className="size-5" />
            </span>
            <div>
              <CardTitle className="text-base">Workflow de solicitações</CardTitle>
              <p className="mt-1 text-xs text-[#8490a3]">
                Status do intake, categoria operacional e política de comunicação
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={demo}
            onClick={() => setEditor({ ...emptyEditor, position: String(statuses.length * 10) })}
          >
            <Plus /> Novo status
          </Button>
        </CardHeader>

        <CardContent className="px-0">
          {error && (
            <div className="p-5 sm:p-6">
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Workflow indisponível</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {!error && loading && (
            <div className="p-6 text-sm text-[#8490a3]">
              <Loader2 className="mr-2 inline size-4 animate-spin" /> Carregando status…
            </div>
          )}

          {!error && !loading && sorted.length === 0 && (
            <div className="p-6 text-sm text-[#8490a3]">
              Nenhum status configurado neste workspace.
            </div>
          )}

          {!error && !loading && sorted.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="bg-[#fafbfd] hover:bg-[#fafbfd]">
                  <TableHead className="pl-5 sm:pl-6">Status</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-5 text-right sm:pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((status) => (
                  <TableRow key={status.id}>
                    <TableCell className="pl-5 sm:pl-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{status.label}</span>
                        {status.is_initial && <Badge className="bg-[#e7f8f2] text-[#178967] hover:bg-[#e7f8f2]">Inicial</Badge>}
                        {status.is_terminal && <Badge variant="outline">Terminal</Badge>}
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-[#96a0b1]">{status.key} · posição {status.position}</p>
                    </TableCell>
                    <TableCell className="text-xs text-[#68738a]">{bucketLabels[status.inbox_bucket]}</TableCell>
                    <TableCell>
                      {status.customer_notification_enabled ? (
                        <Badge className="bg-[#fff4dc] text-[#8b6416] hover:bg-[#fff4dc]">Notificável</Badge>
                      ) : (
                        <span className="text-xs text-[#96a0b1]">Sem e-mail</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={status.active ? "border-[#c9e7dd] text-[#397565]" : "text-[#8791a1]"}>
                        {status.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right sm:pr-6">
                      <div className="flex justify-end gap-1">
                        {!status.is_initial && status.active && !status.is_terminal && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={demo || changingInitial === status.id}
                            title="Definir como inicial"
                            onClick={() => void makeInitial(status)}
                          >
                            {changingInitial === status.id ? <Loader2 className="animate-spin" /> : <Star />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" disabled={demo} title="Editar" onClick={() => edit(status)}>
                          <Pencil />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && !saving && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Editar status" : "Novo status"}</DialogTitle>
            <DialogDescription>
              A chave é estável. Labels e políticas podem evoluir sem alterar o histórico já registrado.
            </DialogDescription>
          </DialogHeader>

          {editor && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="status-label">Label</Label>
                <Input
                  id="status-label"
                  value={editor.label}
                  onChange={(event) => setEditor({ ...editor, label: event.target.value })}
                />
              </div>

              {!editor.id && (
                <div className="grid gap-2">
                  <Label htmlFor="status-key">Chave técnica</Label>
                  <Input
                    id="status-key"
                    value={editor.key}
                    placeholder="ex.: document_review"
                    onChange={(event) => setEditor({ ...editor, key: event.target.value.replace(/[^a-z0-9_]/g, "") })}
                    className="font-mono"
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="status-position">Posição</Label>
                  <Input
                    id="status-position"
                    type="number"
                    min={0}
                    value={editor.position}
                    onChange={(event) => setEditor({ ...editor, position: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Categoria da inbox</Label>
                  <Select
                    value={editor.inbox_bucket}
                    onValueChange={(value) => setEditor({ ...editor, inbox_bucket: value as Bucket })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(bucketLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border bg-[#fafbfd] p-4">
                <ToggleRow
                  label="Ativo"
                  description="Status inativo continua visível no histórico, mas não aceita novas transições."
                  checked={editor.active}
                  onCheckedChange={(checked) => setEditor({ ...editor, active: checked })}
                />
                <ToggleRow
                  label="Terminal"
                  description="Encerrar em um status terminal exige justificativa para reabertura posterior."
                  checked={editor.is_terminal}
                  onCheckedChange={(checked) =>
                    setEditor({
                      ...editor,
                      is_terminal: checked,
                      inbox_bucket: checked ? "closed" : editor.inbox_bucket,
                    })
                  }
                />
                <ToggleRow
                  label="Pode notificar o cliente"
                  description="A entrega só ocorrerá se a política global de notificações de status também estiver ativa."
                  checked={editor.customer_notification_enabled}
                  onCheckedChange={(checked) => setEditor({ ...editor, customer_notification_enabled: checked })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>Cancelar</Button>
            <Button
              onClick={() => void save()}
              disabled={
                saving ||
                !editor ||
                !editor.label.trim() ||
                (!editor.id && !/^[a-z][a-z0-9_]{0,62}$/.test(editor.key)) ||
                Number.parseInt(editor.position, 10) < 0
              }
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[#8490a3]">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
