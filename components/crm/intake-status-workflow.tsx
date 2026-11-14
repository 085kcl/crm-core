"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BellRing,
  CircleAlert,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  Save,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fetchWithSessionRetry } from "@/lib/client-fetch"

type Intake = {
  id: string
  public_reference: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  source: string
  submitted_at: string
  status_id: string
  row_version: number
}

type Status = {
  id: string
  key: string
  label: string
  position: number
  is_initial: boolean
  is_terminal: boolean
  customer_notification_enabled: boolean
  active: boolean
  inbox_bucket: "new" | "in_progress" | "awaiting_customer" | "closed"
}

type HistoryRow = {
  id: string
  from_status_id: string | null
  to_status_id: string
  from_status_label: string | null
  to_status_label: string
  actor_user_id: string | null
  actor_type: "user" | "system" | "integration"
  changed_at: string
  comment: string | null
  change_source: string
  resulting_version: number
  customer_notification_enabled_snapshot: boolean
}

type Workflow = {
  mode: "live" | "demo"
  intake: Intake | null
  statuses: Status[]
  history: HistoryRow[]
  status_notifications_enabled: boolean
}

type PendingCommand = {
  fingerprint: string
  requestId: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

export function IntakeStatusWorkflow({
  intakeId,
  readOnly = false,
  onChanged,
}: {
  intakeId: string
  readOnly?: boolean
  onChanged?: () => void
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [targetStatusId, setTargetStatusId] = useState("")
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingCommand = useRef<PendingCommand | null>(null)

  const load = useCallback(async (preserveComment = true) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchWithSessionRetry(
        `/api/intakes/${intakeId}/status`,
        { cache: "no-store" },
      )
      const body = (await response.json()) as Workflow & { message?: string }
      if (!response.ok || !body.intake) {
        throw new Error(body.message ?? "Não foi possível carregar a solicitação.")
      }
      setWorkflow(body)
      setTargetStatusId(body.intake.status_id)
      if (!preserveComment) setComment((current) => current)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a solicitação.")
    } finally {
      setLoading(false)
    }
  }, [intakeId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const currentStatus = useMemo(
    () => workflow?.statuses.find((status) => status.id === workflow.intake?.status_id) ?? null,
    [workflow],
  )

  const targetStatus = useMemo(
    () => workflow?.statuses.find((status) => status.id === targetStatusId) ?? null,
    [workflow, targetStatusId],
  )

  const selectableStatuses = useMemo(() => {
    if (!workflow?.intake) return []
    return workflow.statuses.filter(
      (status) => status.active || status.id === workflow.intake?.status_id,
    )
  }, [workflow])

  const isChange = Boolean(
    workflow?.intake && targetStatusId && targetStatusId !== workflow.intake.status_id,
  )
  const reopening = Boolean(
    isChange && currentStatus?.is_terminal && targetStatus && !targetStatus.is_terminal,
  )
  const willNotify = Boolean(
    isChange &&
      workflow?.status_notifications_enabled &&
      targetStatus?.customer_notification_enabled,
  )

  async function submit() {
    if (readOnly || !workflow?.intake || !targetStatus || !isChange || saving) return
    if (reopening && comment.trim().length < 3) {
      toast.error("Informe a justificativa para reabrir a solicitação.")
      return
    }

    const normalizedComment = comment.trim()
    const fingerprint = JSON.stringify({
      intake: workflow.intake.id,
      target: targetStatus.id,
      version: workflow.intake.row_version,
      comment: normalizedComment || null,
    })

    const requestId =
      pendingCommand.current?.fingerprint === fingerprint
        ? pendingCommand.current.requestId
        : crypto.randomUUID()

    pendingCommand.current = { fingerprint, requestId }
    setSaving(true)

    try {
      const response = await fetchWithSessionRetry(
        `/api/intakes/${workflow.intake.id}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_status_id: targetStatus.id,
            expected_version: workflow.intake.row_version,
            request_id: requestId,
            comment: normalizedComment || null,
          }),
        },
      )

      const body = (await response.json().catch(() => null)) as {
        message?: string
        code?: string
        changed?: boolean
        replayed?: boolean
      } | null

      if (response.status === 409) {
        toast.warning(body?.message ?? "A solicitação foi alterada em paralelo.")
        await load(true)
        return
      }

      if (!response.ok) {
        throw new Error(body?.message ?? "Não foi possível alterar o status.")
      }

      pendingCommand.current = null
      toast.success(body?.replayed ? "Operação já havia sido confirmada." : "Status atualizado.")
      setComment("")
      await load(true)
      onChanged?.()
    } catch (submitError) {
      // Preserve the request id and comment. If the response was lost after a COMMIT,
      // retrying the same intent reuses the same idempotency key.
      toast.error(
        submitError instanceof Error ? submitError.message : "Não foi possível alterar o status.",
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading && !workflow) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-[#8490a3]">
        <span><Loader2 className="mr-2 inline size-4 animate-spin" />Carregando solicitação…</span>
      </div>
    )
  }

  if (error || !workflow?.intake || !currentStatus) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Solicitação indisponível</AlertTitle>
        <AlertDescription>{error ?? "Não foi possível identificar o status atual."}</AlertDescription>
      </Alert>
    )
  }

  const intake = workflow.intake

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-5">
        <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="border-b px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">{intake.public_reference}</CardTitle>
                <p className="mt-1 text-xs text-[#8490a3]">
                  Recebida em {formatDate(intake.submitted_at)}
                </p>
              </div>
              <Badge className="bg-[#eaf0ff] text-[#3d63c9] hover:bg-[#eaf0ff]">
                {currentStatus.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5 sm:px-6">
            <div>
              <p className="text-sm font-semibold">{intake.customer_name}</p>
              <p className="mt-1 text-xs text-[#68738a]">{intake.customer_email}</p>
              {intake.customer_phone && (
                <p className="mt-1 text-xs text-[#68738a]">{intake.customer_phone}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="intake-status-target">Novo status</Label>
              <Select value={targetStatusId} onValueChange={setTargetStatusId} disabled={readOnly}>
                <SelectTrigger id="intake-status-target" className="h-11 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableStatuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.label}{!status.active ? " · inativo atual" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="intake-status-comment">
                Comentário interno {reopening ? "· obrigatório para reabertura" : "· opcional"}
              </Label>
              <Textarea
                id="intake-status-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Registre contexto operacional. Este texto não é enviado ao cliente."
                disabled={readOnly}
              />
              <p className="text-[11px] text-[#8a95a8]">
                {comment.length}/2000 · comentário exclusivamente interno
              </p>
            </div>

            {readOnly && (
              <Alert className="border-[#dfe5ee] bg-[#f8fafc] text-[#566176]">
                <CircleAlert />
                <AlertTitle>Modo somente leitura</AlertTitle>
                <AlertDescription>
                  Seu papel permite consultar o histórico, mas não alterar o status desta solicitação.
                </AlertDescription>
              </Alert>
            )}

            {reopening && (
              <Alert className="border-[#f0d18c] bg-[#fff9ec] text-[#76570f]">
                <RefreshCw />
                <AlertTitle>Reabertura de solicitação encerrada</AlertTitle>
                <AlertDescription className="text-[#866b31]">
                  A operação requer papel owner/admin/manager e justificativa registrada no histórico.
                </AlertDescription>
              </Alert>
            )}

            {willNotify && (
              <Alert className="border-[#bcd7ff] bg-[#f2f7ff] text-[#315f9f]">
                <BellRing />
                <AlertTitle>Esta mudança pode gerar e-mail ao cliente</AlertTitle>
                <AlertDescription className="text-[#5175a5]">
                  Somente o label do status e os dados aprovados do template são externos. O comentário acima permanece interno.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-[11px] text-[#8a95a8]">Versão confirmada: {intake.row_version}</p>
              <Button
                onClick={() => void submit()}
                disabled={readOnly || !isChange || saving || (reopening && comment.trim().length < 3)}
                className="rounded-xl"
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Confirmar mudança
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
        <CardHeader className="flex-row items-center justify-between border-b px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#eef2f7] text-[#324057]">
              <History className="size-5" />
            </span>
            <div>
              <CardTitle className="text-base">Histórico de status</CardTitle>
              <p className="mt-1 text-xs text-[#8490a3]">Narrativa imutável de cada mudança efetiva</p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => void load(true)} title="Atualizar">
            <RefreshCw />
          </Button>
        </CardHeader>
        <CardContent className="px-5 py-5 sm:px-6">
          <ol className="space-y-5">
            {workflow.history.map((item, index) => (
              <li key={item.id} className="relative flex gap-3">
                {index < workflow.history.length - 1 && (
                  <span className="absolute left-[5px] top-4 h-[calc(100%+10px)] w-px bg-[#e2e7ef]" />
                )}
                <span className="relative mt-1.5 size-2.5 shrink-0 rounded-full bg-[#3d6ae8] ring-4 ring-white" />
                <div className="min-w-0 flex-1 rounded-xl border border-[#edf0f5] bg-[#fafbfd] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#28344a]">
                      {item.from_status_label
                        ? `${item.from_status_label} → ${item.to_status_label}`
                        : `Entrada → ${item.to_status_label}`}
                    </p>
                    <span className="flex items-center gap-1 text-[10px] text-[#96a0b1]">
                      <Clock3 className="size-3" /> {formatDate(item.changed_at)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#7d889b]">
                    <span className="flex items-center gap-1">
                      <UserRound className="size-3" />
                      {item.actor_type === "user" ? "Usuário" : item.actor_type === "integration" ? "Integração" : "Sistema"}
                    </span>
                    <span>· versão {item.resulting_version}</span>
                    <span>· {item.change_source}</span>
                  </div>
                  {item.comment && (
                    <p className="mt-3 whitespace-pre-wrap rounded-lg border border-[#e5eaf1] bg-white p-3 text-xs leading-5 text-[#566176]">
                      {item.comment}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
