import type { Metadata } from "next"
import type { CSSProperties } from "react"
import type { LucideIcon } from "lucide-react"
import { cookies } from "next/headers"
import {
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ContactRound,
  MoreHorizontal,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CRM_DEMO_COOKIE } from "@/lib/crm-session"

export const metadata: Metadata = { title: "Visão geral" }

type StatTone = "green" | "blue" | "violet" | "amber"
type DashboardStat = {
  label: string
  value: string
  delta: string
  trend: "up" | "down"
  helper: string
  icon: LucideIcon
  tone: StatTone
}

const demoStats: DashboardStat[] = [
  { label: "Novos leads", value: "24", delta: "+18%", trend: "up", helper: "nos últimos 30 dias", icon: ContactRound, tone: "green" },
  { label: "Negócios abertos", value: "17", delta: "+3", trend: "up", helper: "em 5 etapas", icon: BriefcaseBusiness, tone: "blue" },
  { label: "Negócios ganhos", value: "R$ 128 mil", delta: "+12%", trend: "up", helper: "no período", icon: CheckCircle2, tone: "violet" },
  { label: "Valor do pipeline", value: "R$ 472,8 mil", delta: "-4%", trend: "down", helper: "ponderado: R$ 219 mil", icon: CircleDollarSign, tone: "amber" },
]

const emptyStats: DashboardStat[] = demoStats.map((stat) => ({
  ...stat,
  value: stat.label.includes("ganhos") || stat.label.includes("Valor") ? "R$ 0" : "0",
  delta: "—",
  helper: "sem dados no período",
}))

const stages = [
  { name: "Entrada", count: 24, value: "R$ 188 mil", progress: 100, color: "#3d6ae8" },
  { name: "Qualificação", count: 16, value: "R$ 142 mil", progress: 67, color: "#20a57e" },
  { name: "Proposta", count: 9, value: "R$ 96 mil", progress: 38, color: "#8a5ae8" },
  { name: "Fechamento", count: 5, value: "R$ 46,8 mil", progress: 21, color: "#e4a11b" },
]

const tasks = [
  { title: "Retornar análise documental", contact: "Mariana Costa", due: "Hoje, 14:30", priority: "Alta", status: "Em aberto" },
  { title: "Revisar proposta comercial", contact: "Grupo Atlas", due: "Hoje, 17:00", priority: "Normal", status: "Em andamento" },
  { title: "Confirmar reunião de diagnóstico", contact: "Rafael Mendes", due: "Amanhã, 09:00", priority: "Normal", status: "Em aberto" },
]

const activities = [
  { title: "Negócio avançou para Proposta", subject: "Financiamento · Mariana Costa", time: "há 18 min", color: "bg-[#8a5ae8]" },
  { title: "Novo lead criado", subject: "Rafael Mendes · Origem: site", time: "há 42 min", color: "bg-[#3d6ae8]" },
  { title: "Tarefa concluída", subject: "Validar documentação · Grupo Atlas", time: "há 1 h", color: "bg-[#20a57e]" },
  { title: "Nota adicionada", subject: "Contato pediu retorno após as 16h", time: "há 2 h", color: "bg-[#e4a11b]" },
]

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const demo = cookieStore.get(CRM_DEMO_COOKIE)?.value === "1"
  const stats = demo ? demoStats : emptyStats

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Visão geral</h1>
            {demo && <Badge className="border-0 bg-[#fff2cc] text-[#76570f] hover:bg-[#fff2cc]">Dados demonstrativos</Badge>}
          </div>
          <p className="mt-2 text-sm text-[#68738a]">Acompanhe o movimento comercial e as prioridades da operação.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#7d889b]">
          <Clock3 className="size-4" /> Atualizado agora
        </div>
      </div>

      {!demo && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#c9e7dd] bg-[#effbf7] px-4 py-3 text-sm text-[#397565]">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[#178967]" />
          <p>O workspace está conectado. O Contact 360 e a busca global já estão disponíveis; os indicadores executivos serão ampliados nos próximos incrementos.</p>
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principais">
        {stats.map((stat) => {
          const Icon = stat.icon
          const tone = ({
            green: "bg-[#e7f8f2] text-[#178967]",
            blue: "bg-[#eaf0ff] text-[#3d63c9]",
            violet: "bg-[#f1ebff] text-[#7650c6]",
            amber: "bg-[#fff4dc] text-[#9a6d13]",
          } satisfies Record<StatTone, string>)[stat.tone]
          return (
            <Card key={stat.label} className="gap-4 rounded-2xl border-[#e0e6ef] py-5 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
              <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-3 px-5">
                <div>
                  <p className="text-xs font-medium text-[#7d889b]">{stat.label}</p>
                  <CardTitle className="mt-3 text-2xl tracking-[-0.035em]">{stat.value}</CardTitle>
                </div>
                <span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon className="size-[18px]" /></span>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 px-5 text-[11px]">
                <span className={`flex items-center gap-1 font-semibold ${stat.trend === "down" ? "text-[#c15266]" : "text-[#178967]"}`}>
                  {stat.trend === "down" ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}{stat.delta}
                </span>
                <span className="truncate text-[#929cad]">{stat.helper}</span>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
        <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="flex-row items-center justify-between border-b px-5 py-5 sm:px-6">
            <div>
              <CardTitle className="text-base">Funil comercial</CardTitle>
              <p className="mt-1 text-xs text-[#8490a3]">Volume e valor por etapa</p>
            </div>
            <Badge variant="outline">Pipeline principal</Badge>
          </CardHeader>
          <CardContent className="px-5 py-6 sm:px-6">
            {demo ? (
              <div className="space-y-6">
                {stages.map((stage) => (
                  <div key={stage.name} className="grid gap-3 sm:grid-cols-[120px_1fr_96px] sm:items-center">
                    <div>
                      <p className="text-sm font-semibold">{stage.name}</p>
                      <p className="mt-1 text-[11px] text-[#8a95a8]">{stage.count} negócios</p>
                    </div>
                    <Progress
                      value={stage.progress}
                      className="h-2.5 bg-[#edf1f6]"
                      style={{ "--primary": stage.color } as CSSProperties}
                      aria-label={`${stage.name}: ${stage.progress}%`}
                    />
                    <p className="text-left text-xs font-semibold sm:text-right">{stage.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center text-center">
                <div><KanbanPlaceholder /><p className="mt-4 text-sm font-semibold">Pipeline ainda sem movimentação</p><p className="mt-1 text-xs text-[#8490a3]">Os estágios aparecerão após o Incremento 4.</p></div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="flex-row items-center justify-between border-b px-5 py-5 sm:px-6">
            <div><CardTitle className="text-base">Atividades recentes</CardTitle><p className="mt-1 text-xs text-[#8490a3]">Linha do tempo operacional</p></div>
            <Button variant="ghost" size="icon-sm" disabled aria-label="Mais opções"><MoreHorizontal /></Button>
          </CardHeader>
          <CardContent className="px-5 py-5 sm:px-6">
            {demo ? (
              <ol className="space-y-5">
                {activities.map((item, index) => (
                  <li key={item.title} className="relative flex gap-3">
                    {index < activities.length - 1 && <span className="absolute left-[5px] top-4 h-[calc(100%+8px)] w-px bg-[#e2e7ef]" />}
                    <span className={`relative mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-white ${item.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#28344a]">{item.title}</p>
                      <p className="mt-1 truncate text-[11px] text-[#7d889b]">{item.subject}</p>
                    </div>
                    <time className="shrink-0 text-[10px] text-[#a0a9b8]">{item.time}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="grid min-h-64 place-items-center text-center text-xs text-[#8490a3]">Nenhuma atividade registrada.</div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="mt-4 gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
        <CardHeader className="flex-row items-center justify-between border-b px-5 py-5 sm:px-6">
          <div><CardTitle className="text-base">Próximas tarefas</CardTitle><p className="mt-1 text-xs text-[#8490a3]">Ações que exigem atenção</p></div>
          <Badge variant="outline" className={demo ? "border-[#f0d18c] bg-[#fff9ec] text-[#7f601a]" : ""}>{demo ? "4 vencidas" : "0 pendentes"}</Badge>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#fafbfd] hover:bg-[#fafbfd]">
                <TableHead className="pl-5 text-[11px] text-[#778298] sm:pl-6">Tarefa</TableHead>
                <TableHead className="text-[11px] text-[#778298]">Relacionado a</TableHead>
                <TableHead className="text-[11px] text-[#778298]">Vencimento</TableHead>
                <TableHead className="text-[11px] text-[#778298]">Prioridade</TableHead>
                <TableHead className="pr-5 text-right text-[11px] text-[#778298] sm:pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demo ? tasks.map((task) => (
                <TableRow key={task.title}>
                  <TableCell className="py-4 pl-5 text-xs font-semibold sm:pl-6">{task.title}</TableCell>
                  <TableCell className="py-4 text-xs text-[#68738a]">{task.contact}</TableCell>
                  <TableCell className="py-4 text-xs text-[#68738a]">{task.due}</TableCell>
                  <TableCell className="py-4"><Badge variant="outline" className={task.priority === "Alta" ? "border-[#efb7c1] bg-[#fff1f3] text-[#a43b50]" : ""}>{task.priority}</Badge></TableCell>
                  <TableCell className="py-4 pr-5 text-right sm:pr-6"><Badge className={task.status === "Em andamento" ? "bg-[#eaf0ff] text-[#3d63c9] hover:bg-[#eaf0ff]" : "bg-[#eef2f7] text-[#68738a] hover:bg-[#eef2f7]"}>{task.status}</Badge></TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={5} className="h-28 text-center text-xs text-[#8490a3]">Nenhuma tarefa para exibir.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  )
}

function KanbanPlaceholder() {
  return (
    <div className="mx-auto flex w-fit gap-2" aria-hidden="true">
      {[20, 28, 16].map((height, index) => <span key={index} className="w-7 rounded-md bg-[#e6ebf2]" style={{ height }} />)}
    </div>
  )
}
