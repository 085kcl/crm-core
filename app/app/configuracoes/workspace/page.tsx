import type { Metadata } from "next"
import { cookies } from "next/headers"
import { KeyRound, ShieldCheck, UserPlus, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IntakeStatusSettings } from "@/components/crm/intake-status-settings"
import { WorkspaceSettingsForm } from "@/components/crm/workspace-settings-form"
import { CRM_DEMO_COOKIE } from "@/lib/crm-session"

export const metadata: Metadata = { title: "Configurações do workspace" }

const demoMembers = [
  { name: "João Fernandes", email: "joao@empresa.com.br", role: "Owner", initials: "JF", color: "bg-[#14213d]" },
  { name: "Mariana Costa", email: "mariana@empresa.com.br", role: "Manager", initials: "MC", color: "bg-[#20a57e]" },
  { name: "Rafael Mendes", email: "rafael@empresa.com.br", role: "Sales", initials: "RM", color: "bg-[#3d6ae8]" },
]

export default async function WorkspaceSettingsPage() {
  const cookieStore = await cookies()
  const demo = cookieStore.get(CRM_DEMO_COOKIE)?.value === "1"

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Configurações do workspace</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68738a]">Gerencie a identidade do ambiente, os membros e as regras básicas de acesso.</p>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <WorkspaceSettingsForm demo={demo} />

        <Card className="h-fit gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="border-b px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#e7f8f2] text-[#178967]"><ShieldCheck className="size-5" /></span>
              <div><CardTitle className="text-base">Segurança ativa</CardTitle><p className="mt-1 text-xs text-[#8490a3]">Defesa em profundidade</p></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-5 py-5 sm:px-6">
            {[
              ["Identidade", "Sessão autenticada"],
              ["Tenant", "Workspace selecionado"],
              ["Autorização", "Papel + RLS"],
              ["Auditoria", "Triggers no banco"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-[#8490a3]">{label}</span>
                <span className="flex items-center gap-2 font-semibold text-[#324057]"><span className="size-1.5 rounded-full bg-[#20a57e]" />{value}</span>
              </div>
            ))}
            <div className="rounded-xl border border-[#c9e7dd] bg-[#effbf7] p-3 text-[11px] leading-5 text-[#397565]">
              A interface adapta controles ao papel, mas o banco permanece responsável por rejeitar acessos indevidos.
            </div>
          </CardContent>
        </Card>
      </div>

      <IntakeStatusSettings demo={demo} />

      <Card className="mt-5 gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
        <CardHeader className="flex-row items-center justify-between border-b px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#eaf0ff] text-[#3d63c9]"><Users className="size-5" /></span>
            <div><CardTitle className="text-base">Membros e papéis</CardTitle><p className="mt-1 text-xs text-[#8490a3]">Quem pode acessar este workspace</p></div>
          </div>
          <Button variant="outline" disabled className="rounded-xl"><UserPlus /> <span className="hidden sm:inline">Convidar membro</span></Button>
        </CardHeader>
        <CardContent className="divide-y px-5 sm:px-6">
          {(demo ? demoMembers : [{ name: "Usuário autenticado", email: "Perfil carregado pelo backend", role: "Membro", initials: "UA", color: "bg-[#14213d]" }]).map((member) => (
            <div key={member.email} className="flex items-center gap-3 py-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold text-white ${member.color}`}>{member.initials}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.name}</p><p className="mt-0.5 truncate text-xs text-[#8490a3]">{member.email}</p></div>
              <Badge variant="outline" className="capitalize"><KeyRound /> {member.role}</Badge>
            </div>
          ))}
          <p className="py-4 text-xs leading-5 text-[#8490a3]">Convites, transferência de ownership e gestão completa de papéis serão conectados após a configuração de e-mail do Supabase.</p>
        </CardContent>
      </Card>
    </main>
  )
}
