"use client"

import { useCallback, useEffect, useState } from "react"
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchWithSessionRetry } from "@/lib/client-fetch"

type Attempt = {
  delivery_id: string
  attempt_number: number
  started_at: string
  finished_at: string | null
  result: string
  failure_kind: string | null
}

type Delivery = {
  id: string
  event_type: string
  intent_key: string
  recipient: string | null
  template_key: string | null
  provider: string | null
  status: string
  attempt_count: number
  queued_at: string
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  retryable: boolean
  reconciliation_required: boolean
  attempts: Attempt[]
}

type CommunicationsResponse = {
  mode: "live" | "demo"
  role?: string
  can_retry?: boolean
  deliveries: Delivery[]
  message?: string
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
})

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Na fila",
    processing: "Processando",
    sent: "Aceita pelo provedor",
    delivered: "Entregue pelo provedor",
    failed: "Falha",
    reconciliation_required: "Requer reconciliação",
  }
  return labels[status] || status
}

function statusClass(status: string) {
  if (status === "delivered") return "bg-[#e7f8f2] text-[#178967] hover:bg-[#e7f8f2]"
  if (status === "failed") return "bg-[#fff1f3] text-[#a43b50] hover:bg-[#fff1f3]"
  if (status === "sent" || status === "processing") return "bg-[#eaf0ff] text-[#3d63c9] hover:bg-[#eaf0ff]"
  return "bg-[#eef2f7] text-[#68738a] hover:bg-[#eef2f7]"
}

function intentLabel(intent: string) {
  if (intent === "company_internal") return "Aviso interno"
  if (intent === "customer_receipt") return "Confirmação de recebimento"
  if (intent === "customer_status") return "Atualização de status"
  return intent
}

export function IntakeCommunications({ intakeId }: { intakeId: string }) {
  const [payload, setPayload] = useState<CommunicationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [retryReasons, setRetryReasons] = useState<Record<string, string>>({})
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchWithSessionRetry(
        `/api/intakes/${intakeId}/communications`,
        { cache: "no-store", signal },
      )
      const body = (await response.json().catch(() => ({}))) as Partial<CommunicationsResponse>
      if (!response.ok) {
        throw new Error(body.message ?? "Não foi possível carregar as comunicações.")
      }
      setPayload(body as CommunicationsResponse)
    } catch (loadError) {
      if (signal.aborted) return
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as comunicações.")
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [intakeId])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void load(controller.signal)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [load, reloadKey])

  async function requestRetry(delivery: Delivery) {
    const reason = (retryReasons[delivery.id] || "").trim()
    if (reason.length < 3) {
      toast.error("Informe o motivo do retry.")
      return
    }

    setRetryingId(delivery.id)
    try {
      const response = await fetchWithSessionRetry(
        `/api/notification-deliveries/${delivery.id}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      )
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      if (!response.ok) throw new Error(body.message ?? "Não foi possível solicitar o retry.")
      toast.success("Retry solicitado.")
      setRetryReasons((current) => ({ ...current, [delivery.id]: "" }))
      setReloadKey((value) => value + 1)
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : "Não foi possível solicitar o retry.")
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
      <CardHeader className="flex-row items-center justify-between border-b px-5 py-5 sm:px-6">
        <div>
          <CardTitle className="text-base">Comunicações</CardTitle>
          <p className="mt-1 text-xs text-[#8490a3]">
            Evidência de processamento e entrega separada do status de negócio.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={loading}
          aria-label="Atualizar comunicações"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </CardHeader>
      <CardContent className="px-5 py-5 sm:px-6">
        {loading ? (
          <div className="space-y-3" role="status" aria-label="Carregando comunicações">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Histórico de comunicação indisponível</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !payload?.deliveries.length ? (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <Mail className="mx-auto size-5 text-[#8b95a6]" />
            <p className="mt-3 text-sm font-semibold">Nenhuma comunicação registrada</p>
            <p className="mt-1 text-xs text-[#8490a3]">
              A solicitação permanece operacional mesmo sem e-mail materializado.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {payload.deliveries.map((delivery) => {
              const canRetry =
                Boolean(payload.can_retry) &&
                delivery.status === "failed" &&
                delivery.retryable &&
                !delivery.reconciliation_required
              return (
                <div key={delivery.id} className="rounded-xl border border-[#e5eaf1] bg-[#fafbfd] p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-sm font-semibold text-[#28344a]">
                        {intentLabel(delivery.intent_key)}
                      </p>
                      {delivery.recipient && (
                        <p className="mt-1 text-xs text-[#68738a]">{delivery.recipient}</p>
                      )}
                      <p className="mt-1 text-[11px] text-[#929cad]">
                        Enfileirada em {dateFormatter.format(new Date(delivery.queued_at))}
                      </p>
                    </div>
                    <Badge className={statusClass(delivery.status)}>
                      {statusLabel(delivery.status)}
                    </Badge>
                  </div>

                  {delivery.status === "delivered" && delivery.delivered_at && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#c9e7dd] bg-white px-3 py-2 text-xs text-[#397565]">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Entrega reportada pelo provedor em {dateFormatter.format(new Date(delivery.delivered_at))}. Isso não comprova leitura pelo destinatário.
                      </span>
                    </div>
                  )}

                  {delivery.reconciliation_required && (
                    <div className="mt-3 rounded-lg border border-[#f0d18c] bg-[#fff9ec] px-3 py-2 text-xs text-[#76570f]">
                      Esta comunicação exige reconciliação antes de qualquer novo envio.
                    </div>
                  )}

                  {delivery.status === "failed" && !delivery.reconciliation_required && (
                    <div className="mt-3 rounded-lg border border-[#efb7c1] bg-[#fff1f3] px-3 py-2 text-xs text-[#8d394b]">
                      O envio falhou. A solicitação continua registrada e visível no CRM.
                    </div>
                  )}

                  {delivery.attempts.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[#566176]">
                        {delivery.attempts.length} tentativa{delivery.attempts.length === 1 ? "" : "s"}
                      </summary>
                      <ol className="mt-2 space-y-2">
                        {delivery.attempts.map((attempt) => (
                          <li key={`${delivery.id}-${attempt.attempt_number}`} className="text-[11px] text-[#7d889b]">
                            #{attempt.attempt_number} · {attempt.result} · {dateFormatter.format(new Date(attempt.started_at))}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}

                  {canRetry && (
                    <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <label htmlFor={`retry-${delivery.id}`} className="text-xs font-medium text-[#566176]">
                          Motivo do retry
                        </label>
                        <Input
                          id={`retry-${delivery.id}`}
                          value={retryReasons[delivery.id] || ""}
                          onChange={(event) =>
                            setRetryReasons((current) => ({
                              ...current,
                              [delivery.id]: event.target.value.slice(0, 500),
                            }))
                          }
                          maxLength={500}
                          className="mt-1 h-9 rounded-lg bg-white"
                          placeholder="Ex.: falha transitória confirmada"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-lg"
                        disabled={retryingId === delivery.id}
                        onClick={() => void requestRetry(delivery)}
                      >
                        {retryingId === delivery.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                        Solicitar retry
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
