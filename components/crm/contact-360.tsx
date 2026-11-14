"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CheckSquare2,
  CircleDollarSign,
  ContactRound,
  Edit3,
  FileText,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Tag,
  UserRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchWithSessionRetry } from "@/lib/client-fetch"
import { ContactDataEditor } from "@/components/crm/contact-data-editor"
import {
  contactDisplayName,
  contactInitials,
  isTaskOverdue,
  type Contact360Payload,
  type Contact360Response,
  type ContactActivity,
} from "@/lib/crm-v003-types"

const statusMeta = {
  active: { label: "Ativo", className: "bg-[#e7f8f2] text-[#178967] hover:bg-[#e7f8f2]" },
  inactive: { label: "Inativo", className: "bg-[#eef2f7] text-[#68738a] hover:bg-[#eef2f7]" },
  archived: { label: "Arquivado", className: "bg-[#fff1f3] text-[#a43b50] hover:bg-[#fff1f3]" },
}

const dealStateLabel: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" }
const taskStatusLabel: Record<string, string> = { open: "Em aberto", in_progress: "Em andamento", completed: "Concluída", cancelled: "Cancelada" }
const leadStatusLabel: Record<string, string> = { new: "Novo", working: "Em trabalho", qualified: "Qualificado", unqualified: "Desqualificado", converted: "Convertido", archived: "Arquivado" }

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "Não informado"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Não informado"
  return (withTime ? dateTimeFormatter : dateFormatter).format(date)
}

function formatCurrency(value: number | null | undefined, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value ?? 0))
}

function activityTitle(activity: ContactActivity) {
  const candidate = activity.metadata.title
  if (typeof candidate === "string" && candidate.trim()) return candidate
  return activity.type.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
}

export function Contact360({ contactId }: { contactId: string }) {
  const [payload, setPayload] = useState<Contact360Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [demo, setDemo] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")

  useEffect(() => {
    const controller = new AbortController()
    async function loadContact() {
      setLoading(true)
      setError(null)
      setPayload(null)
      try {
        const response = await fetchWithSessionRetry(`/api/contacts/${encodeURIComponent(contactId)}`, { signal: controller.signal })
        const body = (await response.json().catch(() => ({}))) as Partial<Contact360Response> & { message?: string }
        if (!response.ok || !body.contact360) throw new Error(body.message ?? "Não foi possível carregar o contato.")
        if (controller.signal.aborted) return
        setPayload(body.contact360)
        setDemo(body.mode === "demo")
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o contato.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadContact()
    return () => controller.abort()
  }, [contactId, reloadKey])

  if (loading) return <Contact360Skeleton />
  if (error || !payload) {
    return (
      <main className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-[1680px] place-items-center px-4 py-8 sm:px-6 lg:px-8">
        <Empty className="w-full max-w-xl border bg-white shadow-sm">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ContactRound /></EmptyMedia>
            <EmptyTitle>Contato indisponível</EmptyTitle>
            <EmptyDescription>{error ?? "O contato não existe ou não está disponível neste workspace."}</EmptyDescription>
          </EmptyHeader>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/app/contatos"><ArrowLeft /> Voltar</Link></Button>
            <Button onClick={() => setReloadKey((value) => value + 1)}><RefreshCw /> Tentar novamente</Button>
          </div>
        </Empty>
      </main>
    )
  }

  const { contact } = payload
  const fullName = contactDisplayName(contact)
  const whatsappDigits = contact.whatsapp?.replace(/\D/g, "")

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/app/contatos" className="inline-flex items-center gap-2 text-xs font-semibold text-[#68738a] transition hover:text-[#172033]">
        <ArrowLeft className="size-3.5" /> Voltar para contatos
      </Link>

      <Card className="mt-4 gap-0 overflow-hidden rounded-2xl border-[#dce3ee] py-0 shadow-[0_12px_38px_rgba(23,32,51,0.06)]">
        <CardContent className="p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#14213d] text-lg font-bold text-white">{contactInitials(contact)}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{fullName}</h1>
                  <Badge className={statusMeta[contact.status].className}>{statusMeta[contact.status].label}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#68738a]">
                  <span className="flex items-center gap-1.5"><Building2 className="size-3.5" /> {contact.primary_company_name ?? "Sem empresa principal"}</span>
                  <span className="flex items-center gap-1.5"><UserRound className="size-3.5" /> {payload.owner?.display_name ?? "Sem responsável"}</span>
                  <span className="flex items-center gap-1.5"><Activity className="size-3.5" /> Última atividade: {formatDate(contact.last_activity_at, true)}</span>
                </div>
                {payload.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2" aria-label="Tags do contato">
                    {payload.tags.map((tag) => <Badge key={tag.id} variant="outline" className="border-[#bfe2d7] bg-[#effbf7] text-[#397565]"><Tag className="size-3" /> {tag.name}</Badge>)}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:max-w-[560px] xl:justify-end">
              {contact.email && <Button variant="outline" size="sm" className="rounded-xl" asChild><a href={`mailto:${contact.email}`}><Mail /> E-mail</a></Button>}
              {contact.phone && <Button variant="outline" size="sm" className="rounded-xl" asChild><a href={`tel:${contact.phone}`}><Phone /> Ligar</a></Button>}
              {whatsappDigits && <Button variant="outline" size="sm" className="rounded-xl" asChild><a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>}
              <Button size="sm" className="rounded-xl bg-[#14213d] text-white" disabled title="Edição entra no próximo incremento"><Edit3 /> Editar <span className="text-[9px] uppercase opacity-65">em breve</span></Button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t pt-5" aria-label="Ações rápidas">
            <QuickAction icon={<CheckSquare2 />} label="Nova tarefa" />
            <QuickAction icon={<FileText />} label="Adicionar nota" />
            <QuickAction icon={<Plus />} label="Criar lead" />
            <QuickAction icon={<BriefcaseBusiness />} label="Novo negócio" />
          </div>
        </CardContent>
      </Card>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Métricas do contato">
        <Metric label="Leads" value={String(contact.lead_count)} icon={<ContactRound />} tone="green" />
        <Metric label="Negócios abertos" value={String(contact.open_deal_count)} icon={<BriefcaseBusiness />} tone="blue" />
        <Metric label="Pipeline aberto" value={formatCurrency(contact.open_pipeline_value)} icon={<CircleDollarSign />} tone="violet" />
        <Metric label="Tarefas abertas" value={String(contact.open_task_count)} icon={<CheckSquare2 />} tone="amber" />
        <Metric label="Tarefas vencidas" value={String(contact.overdue_task_count)} icon={<AlertTriangle />} tone={contact.overdue_task_count ? "red" : "neutral"} />
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-5 gap-4">
        <div className="overflow-x-auto rounded-xl border bg-white px-2 scrollbar-none">
          <TabsList variant="line" className="h-12 min-w-max gap-1">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="deals">Negócios <CountBadge value={payload.deals.length} /></TabsTrigger>
            <TabsTrigger value="activities">Atividades <CountBadge value={payload.activities.length} /></TabsTrigger>
            <TabsTrigger value="tasks">Tarefas <CountBadge value={payload.tasks.length} /></TabsTrigger>
            <TabsTrigger value="notes">Notas <CountBadge value={payload.notes.length} /></TabsTrigger>
            <TabsTrigger value="data">Dados</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <InfoCard title="Informações do contato">
            <DefinitionGrid items={[
              ["E-mail", contact.email],
              ["Telefone", contact.phone],
              ["WhatsApp", contact.whatsapp],
              ["Documento", contact.document],
              ["Nascimento", contact.birth_date ? formatDate(contact.birth_date) : null],
              ["Responsável", payload.owner?.display_name],
            ]} />
          </InfoCard>
          <InfoCard title="Empresas relacionadas" helper={`${payload.companies.length} vínculo${payload.companies.length === 1 ? "" : "s"}`}>
            {payload.companies.length ? <div className="divide-y">{payload.companies.map((company) => (
              <div key={company.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-semibold">{company.trade_name}</p><p className="mt-1 text-xs text-[#7d889b]">{company.legal_name ?? company.tax_id ?? "Sem complemento"}</p></div>
                <div className="flex flex-wrap gap-2">{company.is_primary && <Badge>Principal</Badge>}{company.relationship_title && <Badge variant="outline">{company.relationship_title}</Badge>}</div>
              </div>
            ))}</div> : <InlineEmpty text="Nenhuma empresa relacionada." />}
          </InfoCard>
          <InfoCard title="Leads relacionados" helper={`${payload.leads.length} registro${payload.leads.length === 1 ? "" : "s"}`} className="xl:col-span-2">
            {payload.leads.length ? <div className="grid gap-3 lg:grid-cols-2">{payload.leads.map((lead) => (
              <div key={lead.id} className="rounded-xl border bg-[#fafbfd] p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{lead.source ?? "Origem não informada"}</p><p className="mt-1 text-xs text-[#7d889b]">{lead.owner_name ?? "Sem responsável"}</p></div><Badge variant="outline">{leadStatusLabel[lead.status] ?? lead.status}</Badge></div>
                <p className="mt-3 text-xs leading-5 text-[#566178]">{lead.qualification ?? "Sem qualificação registrada."}</p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#8b95a6]"><span>Score {lead.score}</span><span>Atualizado {formatDate(lead.updated_at)}</span></div>
              </div>
            ))}</div> : <InlineEmpty text="Nenhum lead relacionado." />}
          </InfoCard>
        </TabsContent>

        <TabsContent value="deals">
          <InfoCard title="Negócios" helper={`${payload.deals.length} registro${payload.deals.length === 1 ? "" : "s"}`}>
            {payload.deals.length ? <div className="divide-y">{payload.deals.map((deal) => (
              <div key={deal.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div><p className="text-sm font-semibold">{deal.title}</p><p className="mt-1 text-xs text-[#7d889b]">{deal.pipeline_name} · {deal.stage_name} · {deal.probability}%</p></div>
                <p className="text-sm font-semibold">{formatCurrency(deal.amount, deal.currency)}</p>
                <Badge className={deal.state === "won" ? "bg-[#e7f8f2] text-[#178967]" : deal.state === "lost" ? "bg-[#fff1f3] text-[#a43b50]" : "bg-[#eaf0ff] text-[#3d63c9]"}>{dealStateLabel[deal.state] ?? deal.state}</Badge>
              </div>
            ))}</div> : <InlineEmpty text="Nenhum negócio relacionado." />}
          </InfoCard>
        </TabsContent>

        <TabsContent value="activities">
          <InfoCard title="Linha do tempo" helper="Mais recentes primeiro">
            {payload.activities.length ? <ol className="space-y-0">{payload.activities.map((activity, index) => (
              <li key={activity.id} className="relative flex gap-4 pb-6 last:pb-0">
                {index < payload.activities.length - 1 && <span className="absolute left-[6px] top-5 h-[calc(100%-10px)] w-px bg-[#dce3ee]" />}
                <span className="relative mt-1.5 size-3 shrink-0 rounded-full bg-[#20a57e] ring-4 ring-[#e7f8f2]" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{activityTitle(activity)}</p><p className="mt-1 text-xs text-[#7d889b]">{activity.actor_name ?? "Sistema"} · {formatDate(activity.created_at, true)}</p></div>
              </li>
            ))}</ol> : <InlineEmpty text="Nenhuma atividade registrada." />}
          </InfoCard>
        </TabsContent>

        <TabsContent value="tasks">
          <InfoCard title="Tarefas" helper={`${contact.overdue_task_count} vencida${contact.overdue_task_count === 1 ? "" : "s"}`}>
            {payload.tasks.length ? <div className="divide-y">{payload.tasks.map((task) => {
              const overdue = isTaskOverdue(task)
              return <div key={task.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div><p className="flex items-center gap-2 text-sm font-semibold">{overdue && <AlertTriangle className="size-4 text-[#c15266]" />}{task.title}</p><p className="mt-1 text-xs text-[#7d889b]">{task.description ?? task.assignee_name ?? "Sem descrição"}</p></div>
                <span className={`text-xs ${overdue ? "font-semibold text-[#c15266]" : "text-[#68738a]"}`}>{task.due_at ? formatDate(task.due_at, true) : "Sem prazo"}</span>
                <Badge variant={overdue ? "destructive" : "outline"}>{taskStatusLabel[task.status] ?? task.status}</Badge>
              </div>
            })}</div> : <InlineEmpty text="Nenhuma tarefa relacionada." />}
          </InfoCard>
        </TabsContent>

        <TabsContent value="notes">
          <InfoCard title="Notas" helper={`${payload.notes.length} registro${payload.notes.length === 1 ? "" : "s"}`}>
            {payload.notes.length ? <div className="grid gap-3">{payload.notes.map((note) => (
              <article key={note.id} className="rounded-xl border bg-[#fffdf7] p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-[#39445a]">{note.body}</p><p className="mt-3 text-[11px] text-[#8b95a6]">{note.created_by_name ?? "Autor não identificado"} · {formatDate(note.created_at, true)}</p></article>
            ))}</div> : <InlineEmpty text="Nenhuma nota registrada." />}
          </InfoCard>
        </TabsContent>

        <TabsContent value="data" className="grid gap-4 lg:grid-cols-2">
          <InfoCard title="Campos personalizados">
            <ContactDataEditor contactId={contactId} tags={payload.tags} fields={payload.custom_fields} demo={demo} onSaved={() => setReloadKey((value) => value + 1)} />
          </InfoCard>
          <InfoCard title="Dados do registro">
            <DefinitionGrid items={[
              ["Identificador", contact.id],
              ["Criado em", formatDate(contact.created_at, true)],
              ["Atualizado em", formatDate(contact.updated_at, true)],
              ["Empresas", String(contact.company_count)],
              ["Tags", String(contact.tag_count)],
              ["Campos preenchidos", String(contact.custom_field_count)],
            ]} monospaceFirst />
          </InfoCard>
        </TabsContent>
      </Tabs>
    </main>
  )
}

function QuickAction({ icon, label }: { icon: ReactNode; label: string }) {
  return <Button variant="ghost" size="sm" className="rounded-xl text-[#566178]" disabled title="Disponível no próximo incremento">{icon}{label}<span className="text-[9px] uppercase opacity-55">em breve</span></Button>
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone: "green" | "blue" | "violet" | "amber" | "red" | "neutral" }) {
  const colors = { green: "bg-[#e7f8f2] text-[#178967]", blue: "bg-[#eaf0ff] text-[#3d63c9]", violet: "bg-[#f1ebff] text-[#7650c6]", amber: "bg-[#fff4dc] text-[#9a6d13]", red: "bg-[#fff1f3] text-[#a43b50]", neutral: "bg-[#eef2f7] text-[#68738a]" }
  return <Card className="gap-3 rounded-2xl border-[#e0e6ef] py-4 shadow-[0_6px_22px_rgba(23,32,51,0.035)]"><CardContent className="flex items-center gap-3 px-4"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${colors[tone]} [&_svg]:size-4`}>{icon}</span><div className="min-w-0"><p className="truncate text-[11px] text-[#7d889b]">{label}</p><p className="mt-1 truncate text-base font-semibold">{value}</p></div></CardContent></Card>
}

function CountBadge({ value }: { value: number }) {
  return <span className="rounded-full bg-[#eef2f7] px-1.5 py-0.5 text-[9px] text-[#68738a]">{value}</span>
}

function InfoCard({ title, helper, children, className = "" }: { title: string; helper?: string; children: ReactNode; className?: string }) {
  return <Card className={`gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.04)] ${className}`}><CardHeader className="flex-row items-center justify-between border-b px-5 py-4 sm:px-6"><CardTitle className="text-sm">{title}</CardTitle>{helper && <span className="text-[11px] text-[#8b95a6]">{helper}</span>}</CardHeader><CardContent className="p-5 sm:p-6">{children}</CardContent></Card>
}

function DefinitionGrid({ items, monospaceFirst = false }: { items: Array<[string, string | null | undefined]>; monospaceFirst?: boolean }) {
  return <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{items.map(([label, value], index) => <div key={label} className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#929cad]">{label}</dt><dd className={`mt-1.5 break-words text-sm text-[#39445a] ${monospaceFirst && index === 0 ? "font-mono text-xs" : ""}`}>{value || "Não informado"}</dd></div>)}</dl>
}

function InlineEmpty({ text }: { text: string }) {
  return <div className="grid min-h-28 place-items-center rounded-xl border border-dashed bg-[#fafbfd] px-4 text-center text-xs text-[#8490a3]">{text}</div>
}

function Contact360Skeleton() {
  return <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-label="Carregando contato" role="status"><Skeleton className="h-4 w-32" /><Card className="mt-4 rounded-2xl py-0"><CardContent className="flex gap-4 p-6"><Skeleton className="size-16 rounded-2xl" /><div className="flex-1 space-y-3"><Skeleton className="h-7 w-64 max-w-full" /><Skeleton className="h-4 w-96 max-w-full" /><Skeleton className="h-6 w-40" /></div></CardContent></Card><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}</div><Skeleton className="mt-5 h-12 rounded-xl" /><Skeleton className="mt-4 h-72 rounded-2xl" /></main>
}
