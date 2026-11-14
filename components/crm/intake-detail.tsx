"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowLeft,
  CircleAlert,
  CircleUserRound,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { IntakeCommunications } from "@/components/crm/intake-communications"
import { IntakeStatusWorkflow } from "@/components/crm/intake-status-workflow"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchWithSessionRetry } from "@/lib/client-fetch"

type DetailResponse = {
  mode: "live"
  role: string
  permissions: {
    operate: boolean
    assign: boolean
  }
  intake: {
    id: string
    public_reference: string
    form_type: string
    form_schema_version: number
    source: string
    contact_id: string | null
    lead_id: string | null
    status_id: string
    customer_name: string
    customer_email: string
    customer_phone: string | null
    payload: Record<string, unknown>
    assigned_to: string | null
    submitted_at: string
    created_at: string
    updated_at: string
    row_version: number
    contact_match_state: string
    lead_link_state: string
    needs_review: boolean
    status: {
      id: string
      key: string
      label: string
      inbox_bucket: string
      is_terminal: boolean
      active: boolean
    } | null
    assignee: {
      id: string
      display_name: string
    } | null
  }
  contact: {
    id: string
    first_name: string
    last_name: string | null
    email: string | null
    phone: string | null
    whatsapp: string | null
    status: string
  } | null
  lead: {
    id: string
    source: string | null
    status: string
    score: number
    qualification: string | null
    owner_id: string | null
  } | null
  integration_links: Array<{
    id: string
    source_system: string
    external_entity_type: string
    external_id: string
    metadata: Record<string, unknown>
    created_at: string
  }>
  activities: Array<{
    id: string
    type: string
    actor_id: string | null
    actor_name: string
    metadata: Record<string, unknown>
    created_at: string
  }>
  assignable_members: Array<{
    user_id: string
    role: string
    display_name: string
  }>
  partial: {
    activities_unavailable: boolean
  }
  message?: string
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
})

const fieldLabels: Record<string, string> = {
  source: "Origem",
  source_protocol: "Protocolo de origem",
  project: "Projeto",
  stage: "Estágio",
  propertyDefined: "Imóvel definido",
  propertyCity: "Cidade do imóvel",
  propertyValue: "Valor do imóvel",
  incomeRange: "Faixa de renda",
  workType: "Atividade",
  composeIncome: "Composição de renda",
  downPayment: "Entrada",
  fgts: "FGTS",
  contactTime: "Período de contato",
  marketingConsent: "Consentimento de marketing",
  partnerCode: "Parceiro",
  classification: "Classificação operacional",
  schema_version: "Versão do payload",
}

function readableField(key: string) {
  return fieldLabels[key] || key.replaceAll("_", " ")
}

function payloadValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Não informado"
  if (typeof value === "boolean") return value ? "Sim" : "Não"
  if (typeof value === "string" || typeof value === "number") return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return "Valor indisponível"
  }
}

function contactName(contact: DetailResponse["contact"]) {
  if (!contact) return ""
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ")
}

function activityLabel(activity: DetailResponse["activities"][number]) {
  if (activity.type === "intake.status_changed") return "Status alterado"
  if (activity.type === "intake.assigned") return "Responsável alterado"
  if (activity.type === "intake.created") return "Solicitação criada"
  return activity.type
}

export function IntakeDetail({ intakeId }: { intakeId: string }) {
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [assigneeValue, setAssigneeValue] = useState("__unassigned")
  const [assigning, setAssigning] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchWithSessionRetry(
        `/api/intakes/${intakeId}`,
        { cache: "no-store", signal },
      )
      const body = (await response.json().catch(() => ({}))) as Partial<DetailResponse>
      if (!response.ok || !body.intake) {
        throw new Error(body.message ?? "Não foi possível carregar a solicitação.")
      }
      const next = body as DetailResponse
      setDetail(next)
      setAssigneeValue(next.intake.assigned_to || "__unassigned")
    } catch (loadError) {
      if (signal?.aborted) return
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a solicitação.")
    } finally {
      if (!signal?.aborted) setLoading(false)
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

  const payloadEntries = useMemo(
    () =>
      detail
        ? Object.entries(detail.intake.payload || {}).filter(
            ([key]) => !["idempotency_key_hash", "request_hash"].includes(key),
          )
        : [],
    [detail],
  )

  async function assign() {
    if (!detail?.permissions.assign || assigning) return
    const target = assigneeValue === "__unassigned" ? null : assigneeValue
    if (target === detail.intake.assigned_to) return

    setAssigning(true)
    try {
      const response = await fetchWithSessionRetry(
        `/api/intakes/${detail.intake.id}/assignment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assigned_to: target,
            expected_version: detail.intake.row_version,
            request_id: crypto.randomUUID(),
          }),
        },
      )
      const body = (await response.json().catch(() => ({}))) as {
        message?: string
        code?: string
      }
      if (response.status === 409) {
        toast.warning(body.message ?? "A solicitação foi alterada em paralelo.")
        setReloadKey((value) => value + 1)
        return
      }
      if (!response.ok) {
        throw new Error(body.message ?? "Não foi possível alterar o responsável.")
      }
      toast.success(target ? "Responsável atualizado." : "Responsável removido.")
      setReloadKey((value) => value + 1)
    } catch (assignError) {
      toast.error(assignError instanceof Error ? assignError.message : "Não foi possível alterar o responsável.")
    } finally {
      setAssigning(false)
    }
  }

  if (loading && !detail) {
    return <DetailSkeleton />
  }

  if (error || !detail) {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Solicitação indisponível</AlertTitle>
          <AlertDescription>{error ?? "Não foi possível localizar a solicitação."}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4 rounded-xl">
          <Link href="/app/solicitacoes"><ArrowLeft /> Voltar para Solicitações</Link>
        </Button>
      </main>
    )
  }

  const intake = detail.intake

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/app/solicitacoes"><ArrowLeft /> Solicitações</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
              {intake.public_reference}
            </h1>
            {intake.status && <Badge variant="outline">{intake.status.label}</Badge>}
            {intake.needs_review && (
              <Badge className="bg-[#fff1f3] text-[#a43b50] hover:bg-[#fff1f3]">needs_review</Badge>
            )}
            {detail.role === "viewer" && <Badge variant="outline">Somente leitura</Badge>}
          </div>
          <p className="mt-2 text-sm text-[#68738a]">
            Recebida em {dateFormatter.format(new Date(intake.submitted_at))} · versão {intake.row_version}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="border-b px-5 py-5 sm:px-6">
            <CardTitle className="text-base">Dados do cliente e vínculos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-5 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label="Nome" value={intake.customer_name} />
              <Fact label="E-mail" value={intake.customer_email} />
              <Fact label="Telefone" value={intake.customer_phone || "Não informado"} />
              <Fact label="Tipo de formulário" value={intake.form_type} />
            </div>

            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#e5eaf1] bg-[#fafbfd] p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-[#566176]">
                  <UserRound className="size-4" /> Contato relacionado
                </p>
                {detail.contact ? (
                  <>
                    <p className="mt-2 text-sm font-semibold">{contactName(detail.contact)}</p>
                    <p className="mt-1 text-xs text-[#7d889b]">{detail.contact.email || detail.contact.phone || "Sem canal"}</p>
                    <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs">
                      <Link href={`/app/contatos/${detail.contact.id}`}>
                        Abrir Contact 360° <ExternalLink className="size-3" />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-[#8490a3]">Vínculo pendente ou não informado.</p>
                )}
              </div>

              <div className="rounded-xl border border-[#e5eaf1] bg-[#fafbfd] p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-[#566176]">
                  <Link2 className="size-4" /> Lead relacionado
                </p>
                {detail.lead ? (
                  <>
                    <p className="mt-2 text-sm font-semibold">{detail.lead.status}</p>
                    <p className="mt-1 text-xs text-[#7d889b]">
                      Origem: {detail.lead.source || "Não informada"}
                    </p>
                    <p className="mt-1 break-all text-[11px] text-[#929cad]">ID {detail.lead.id}</p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-[#8490a3]">Vínculo pendente ou não informado.</p>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#566176]">Responsável</p>
              {detail.permissions.assign ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Select value={assigneeValue} onValueChange={setAssigneeValue}>
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned">Sem responsável</SelectItem>
                      {detail.assignable_members.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.display_name} · {member.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    className="rounded-xl"
                    disabled={
                      assigning ||
                      (assigneeValue === "__unassigned" ? null : assigneeValue) === intake.assigned_to
                    }
                    onClick={() => void assign()}
                  >
                    {assigning ? <Loader2 className="animate-spin" /> : <Save />}
                    Salvar responsável
                  </Button>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-2 text-sm text-[#68738a]">
                  <CircleUserRound className="size-4" />
                  {intake.assignee?.display_name ?? "Não atribuído"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="border-b px-5 py-5 sm:px-6">
            <CardTitle className="text-base">Origem e integração</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label="Origem CRM" value={intake.source || "Não informada"} />
              <Fact label="Schema do formulário" value={String(intake.form_schema_version)} />
              <Fact label="Match do contato" value={intake.contact_match_state} />
              <Fact label="Vínculo do lead" value={intake.lead_link_state} />
            </div>
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-[#566176]">Referências externas registradas</p>
              {detail.integration_links.length ? (
                <div className="mt-2 space-y-2">
                  {detail.integration_links.map((link) => (
                    <div key={link.id} className="rounded-lg bg-[#f8fafc] px-3 py-2 text-xs text-[#68738a]">
                      <span className="font-semibold text-[#344057]">{link.source_system}</span>
                      {" · "}{link.external_entity_type}
                      <span className="mt-1 block break-all text-[11px] text-[#929cad]">{link.external_id}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#8490a3]">Nenhuma referência externa registrada.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="border-b px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-[#566176]" />
              <div>
                <CardTitle className="text-base">Respostas recebidas</CardTitle>
                <p className="mt-1 text-xs text-[#8490a3]">Snapshot original; esta tela não edita o payload.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 py-5 sm:px-6">
            {payloadEntries.length ? (
              <dl className="grid gap-3">
                {payloadEntries.map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-[#edf0f5] bg-[#fafbfd] p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8490a3]">
                      {readableField(key)}
                    </dt>
                    <dd className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[#344057]">
                      {payloadValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-[#8490a3]">Nenhuma resposta adicional foi registrada.</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="border-b px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <Activity className="size-5 text-[#566176]" />
              <div>
                <CardTitle className="text-base">Timeline operacional</CardTitle>
                <p className="mt-1 text-xs text-[#8490a3]">Fatos registrados no CRM; sem inferência de leitura.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 py-5 sm:px-6">
            {detail.partial.activities_unavailable && (
              <Alert className="mb-4">
                <CircleAlert />
                <AlertTitle>Timeline parcial</AlertTitle>
                <AlertDescription>
                  A solicitação continua disponível, mas algumas atividades não puderam ser carregadas.
                </AlertDescription>
              </Alert>
            )}
            <ol className="space-y-4">
              <li className="relative flex gap-3">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[#178967] ring-4 ring-white" />
                <div>
                  <p className="text-xs font-semibold text-[#28344a]">Solicitação recebida</p>
                  <p className="mt-1 text-[11px] text-[#929cad]">
                    {dateFormatter.format(new Date(intake.submitted_at))}
                  </p>
                </div>
              </li>
              {detail.activities.map((activity) => (
                <li key={activity.id} className="relative flex gap-3">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[#3d6ae8] ring-4 ring-white" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#28344a]">{activityLabel(activity)}</p>
                    <p className="mt-1 text-[11px] text-[#7d889b]">
                      {activity.actor_name} · {dateFormatter.format(new Date(activity.created_at))}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      <section className="mt-5">
        <IntakeStatusWorkflow
          intakeId={intake.id}
          readOnly={!detail.permissions.operate}
          onChanged={() => setReloadKey((value) => value + 1)}
        />
      </section>

      <section className="mt-5">
        <IntakeCommunications intakeId={intake.id} />
      </section>
    </main>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8490a3]">{label}</p>
      <p className="mt-1 break-words text-sm text-[#344057]">{value}</p>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8" role="status" aria-label="Carregando solicitação">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </main>
  )
}
