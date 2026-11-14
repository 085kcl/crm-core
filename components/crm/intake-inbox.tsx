"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CircleUserRound,
  Clock3,
  Inbox,
  RefreshCw,
  UserRoundCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchWithSessionRetry } from "@/lib/client-fetch"

type Bucket = "all" | "new" | "in_progress" | "awaiting_customer" | "closed"
type AssigneeFilter = "all" | "mine" | "unassigned"

type InboxItem = {
  id: string
  public_reference: string
  form_type: string
  source: string
  contact_id: string | null
  lead_id: string | null
  customer_name: string
  customer_email: string
  customer_phone: string | null
  assigned_to: string | null
  submitted_at: string
  updated_at: string
  row_version: number
  contact_match_state: string
  lead_link_state: string
  needs_review: boolean
  communication_state: "ok" | "failed" | "reconciliation_required" | "unknown"
  status: {
    id: string
    key: string
    label: string
    inbox_bucket: Exclude<Bucket, "all">
    is_terminal: boolean
    active: boolean
  } | null
  assignee: {
    id: string
    display_name: string
  } | null
}

type InboxResponse = {
  mode: "live" | "demo"
  role: string
  items: InboxItem[]
  page: number
  limit: number
  total: number
  total_pages: number
  communications_available: boolean
  message?: string
}

const bucketLabels: Record<Bucket, string> = {
  all: "Todas",
  new: "Novas",
  in_progress: "Em andamento",
  awaiting_customer: "Aguardando cliente",
  closed: "Concluídas",
}

const bucketTone: Record<Exclude<Bucket, "all">, string> = {
  new: "bg-[#eaf0ff] text-[#3d63c9] hover:bg-[#eaf0ff]",
  in_progress: "bg-[#e7f8f2] text-[#178967] hover:bg-[#e7f8f2]",
  awaiting_customer: "bg-[#fff4dc] text-[#8a6214] hover:bg-[#fff4dc]",
  closed: "bg-[#eef2f7] text-[#68738a] hover:bg-[#eef2f7]",
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
})

function elapsed(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "há menos de 1 min"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return `há ${days} d`
}

export function IntakeInbox() {
  const [bucket, setBucket] = useState<Bucket>("all")
  const [assignee, setAssignee] = useState<AssigneeFilter>("all")
  const [needsReview, setNeedsReview] = useState(false)
  const [page, setPage] = useState(1)
  const [payload, setPayload] = useState<InboxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        bucket,
        assignee,
        needs_review: needsReview ? "1" : "0",
        page: String(page),
        limit: "25",
      })
      const response = await fetchWithSessionRetry(
        `/api/intakes?${params.toString()}`,
        { cache: "no-store", signal },
      )
      const body = (await response.json().catch(() => ({}))) as Partial<InboxResponse>
      if (!response.ok) {
        throw new Error(body.message ?? "Não foi possível carregar as solicitações.")
      }
      setPayload(body as InboxResponse)
    } catch (loadError) {
      if (signal.aborted) return
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as solicitações.",
      )
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [assignee, bucket, needsReview, page])

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

  function changeBucket(next: Bucket) {
    setBucket(next)
    setPage(1)
  }

  function changeAssignee(next: AssigneeFilter) {
    setAssignee(next)
    setPage(1)
  }

  const items = payload?.items ?? []

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#178967]">
            Operação
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            Solicitações
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[#68738a]">
            Fila operacional das pré-análises recebidas. O estado de comunicação é exibido separadamente do status de negócio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {payload?.role === "viewer" && (
            <Badge variant="outline">Somente leitura</Badge>
          )}
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
      </div>

      <Card className="mt-6 gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
        <CardHeader className="gap-4 border-b px-4 py-4 sm:px-6">
          <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
            <div>
              <CardTitle className="text-base">Caixa de entrada</CardTitle>
              <p className="mt-1 text-xs text-[#8490a3]">
                {loading
                  ? "Carregando…"
                  : `${payload?.total ?? 0} solicitação${payload?.total === 1 ? "" : "ões"} neste filtro`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Filtrar por etapa operacional">
              {(Object.keys(bucketLabels) as Bucket[]).map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={bucket === item ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => changeBucket(item)}
                >
                  {bucketLabels[item]}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[220px_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="inbox-assignee" className="text-xs text-[#68738a]">
                Responsável
              </Label>
              <Select value={assignee} onValueChange={(value) => changeAssignee(value as AssigneeFilter)}>
                <SelectTrigger id="inbox-assignee" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="mine">Minhas solicitações</SelectItem>
                  <SelectItem value="unassigned">Sem responsável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant={needsReview ? "default" : "outline"}
              className="h-10 w-fit rounded-xl"
              onClick={() => {
                setNeedsReview((value) => !value)
                setPage(1)
              }}
            >
              <AlertTriangle />
              {needsReview ? "Revisão humana ativa" : "Somente needs_review"}
            </Button>
          </div>

          {payload && !payload.communications_available && (
            <div className="rounded-xl border border-[#f0d18c] bg-[#fff9ec] px-3 py-2 text-xs text-[#76570f]">
              A lista continua disponível, mas o estado de comunicação não pôde ser consultado nesta atualização.
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <InboxSkeleton />
          ) : error ? (
            <Empty className="min-h-80 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                <EmptyTitle>Falha ao carregar solicitações</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
                Tentar novamente
              </Button>
            </Empty>
          ) : items.length === 0 ? (
            <Empty className="min-h-80 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                <EmptyTitle>Nenhuma solicitação neste filtro</EmptyTitle>
                <EmptyDescription>
                  A caixa permanece vazia apenas para os critérios selecionados; falhas de e-mail não removem solicitações.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#fafbfd] hover:bg-[#fafbfd]">
                      <TableHead className="pl-6 text-[11px] text-[#778298]">Solicitação</TableHead>
                      <TableHead className="text-[11px] text-[#778298]">Status</TableHead>
                      <TableHead className="text-[11px] text-[#778298]">Responsável</TableHead>
                      <TableHead className="text-[11px] text-[#778298]">Recebida</TableHead>
                      <TableHead className="text-[11px] text-[#778298]">Comunicação</TableHead>
                      <TableHead className="pr-6 text-right text-[11px] text-[#778298]">
                        <span className="sr-only">Abrir</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="group">
                        <TableCell className="py-4 pl-6">
                          <Link
                            href={`/app/solicitacoes/${item.id}`}
                            className="text-sm font-semibold text-[#28344a] hover:text-[#178967] hover:underline"
                          >
                            {item.public_reference}
                          </Link>
                          <p className="mt-1 max-w-64 truncate text-xs text-[#68738a]">
                            {item.customer_name} · {item.customer_email}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge variant="outline">{item.form_type}</Badge>
                            {!item.assignee && (
                              <Badge variant="outline" className="border-[#f0d18c] bg-[#fff9ec] text-[#76570f]">
                                Sem responsável
                              </Badge>
                            )}
                            {item.needs_review && (
                              <Badge variant="outline" className="border-[#efb7c1] bg-[#fff1f3] text-[#a43b50]">
                                needs_review
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {item.status ? (
                            <Badge className={bucketTone[item.status.inbox_bucket]}>
                              {item.status.label}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Status indisponível</Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-xs text-[#566178]">
                          <span className="flex items-center gap-1.5">
                            <CircleUserRound className="size-3.5 text-[#8b95a6]" />
                            {item.assignee?.display_name ?? "Não atribuído"}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-xs text-[#68738a]">
                          <p>{dateFormatter.format(new Date(item.submitted_at))}</p>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-[#929cad]">
                            <Clock3 className="size-3" />
                            {elapsed(item.submitted_at)}
                          </p>
                        </TableCell>
                        <TableCell className="py-4">
                          <CommunicationBadge state={item.communication_state} />
                        </TableCell>
                        <TableCell className="py-4 pr-6 text-right">
                          <Button variant="ghost" size="icon-sm" asChild aria-label={`Abrir ${item.public_reference}`}>
                            <Link href={`/app/solicitacoes/${item.id}`}>
                              <ArrowRight />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y lg:hidden">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/app/solicitacoes/${item.id}`}
                    className="block p-4 transition hover:bg-[#fafbfd]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.public_reference}</p>
                        <p className="mt-1 truncate text-xs text-[#68738a]">{item.customer_name}</p>
                      </div>
                      {item.status && (
                        <Badge className={bucketTone[item.status.inbox_bucket]}>
                          {item.status.label}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-[#68738a]">{dateFormatter.format(new Date(item.submitted_at))} · {elapsed(item.submitted_at)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-[#566178]">
                        <UserRoundCheck className="size-3.5" />
                        {item.assignee?.display_name ?? "Não atribuído"}
                      </span>
                      <CommunicationBadge state={item.communication_state} />
                      {item.needs_review && <Badge variant="outline">needs_review</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {!loading && !error && (payload?.total_pages ?? 0) > 1 && (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-4 sm:px-6">
              <p className="text-xs text-[#7d889b]">
                Página {payload?.page ?? page} de {payload?.total_pages ?? 1}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={page >= (payload?.total_pages ?? 1)}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function CommunicationBadge({
  state,
}: {
  state: InboxItem["communication_state"]
}) {
  if (state === "failed") {
    return <Badge className="bg-[#fff1f3] text-[#a43b50] hover:bg-[#fff1f3]">Falha de comunicação</Badge>
  }
  if (state === "reconciliation_required") {
    return <Badge className="bg-[#fff4dc] text-[#8a6214] hover:bg-[#fff4dc]">Requer reconciliação</Badge>
  }
  if (state === "unknown") {
    return <Badge variant="outline">Estado indisponível</Badge>
  }
  return <Badge className="bg-[#e7f8f2] text-[#178967] hover:bg-[#e7f8f2]">Sem alerta</Badge>
}

function InboxSkeleton() {
  return (
    <div className="divide-y" role="status" aria-label="Carregando solicitações">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-5 sm:px-6">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-7 w-28 sm:block" />
          <Skeleton className="hidden h-7 w-32 lg:block" />
        </div>
      ))}
    </div>
  )
}
