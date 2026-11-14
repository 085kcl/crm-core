"use client"

import { useEffect, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  Building2,
  CheckSquare2,
  ChevronsUpDown,
  CircleUserRound,
  ContactRound,
  Gauge,
  Inbox,
  KanbanSquare,
  LogOut,
  Settings2,
  UserRoundSearch,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { BrandMark } from "@/components/crm/brand-mark"
import { GlobalSearch } from "@/components/crm/global-search"
import { refreshSession } from "@/lib/client-fetch"
import { withCrmBasePath } from "@/lib/crm-base-path"

const navItems = [
  { label: "Visão geral", icon: Gauge, href: "/app", enabled: true },
  { label: "Solicitações", icon: Inbox, href: "/app/solicitacoes", enabled: true },
  { label: "Contatos", icon: ContactRound, href: "/app/contatos", enabled: true },
  { label: "Empresas", icon: Building2, href: "/app/empresas", enabled: false },
  { label: "Leads", icon: UserRoundSearch, href: "/app/leads", enabled: false },
  { label: "Pipeline", icon: KanbanSquare, href: "/app/pipeline", enabled: false },
  { label: "Negócios", icon: BriefcaseBusiness, href: "/app/negocios", enabled: false },
  { label: "Tarefas", icon: CheckSquare2, href: "/app/tarefas", enabled: false },
  { label: "Atividades", icon: Activity, href: "/app/atividades", enabled: false },
]

function pageLabel(pathname: string) {
  if (pathname.startsWith("/app/configuracoes")) return "Configurações do workspace"
  if (pathname === "/app/solicitacoes") return "Solicitações"
  if (pathname.startsWith("/app/solicitacoes/")) return "Solicitação"
  if (pathname.startsWith("/app/contatos/")) return "Contato 360°"
  if (pathname.startsWith("/app/contatos")) return "Contatos"
  return "Visão geral"
}

export function AppShell({
  children,
  demo,
  workspaceId,
  workspaceName,
  needsInitialRefresh,
}: {
  children: ReactNode
  demo: boolean
  workspaceId: string
  workspaceName: string
  needsInitialRefresh: boolean
}) {
  const pathname = usePathname()

  useEffect(() => {
    if (demo) return
    const refresh = () => {
      void refreshSession()
    }
    if (needsInitialRefresh) refresh()
    const timer = window.setInterval(refresh, 45 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [demo, needsInitialRefresh])

  async function signOut() {
    await fetch(withCrmBasePath("/api/auth/logout"), { method: "POST" }).catch(() => null)
    window.location.assign(withCrmBasePath("/"))
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="px-3 py-4">
          <BrandMark className="text-white group-data-[collapsible=icon]:hidden" />
          <BrandMark compact className="hidden justify-center group-data-[collapsible=icon]:flex" />
        </SidebarHeader>
        <SidebarSeparator className="mx-3 w-auto bg-white/10" />
        <SidebarContent className="px-2 py-3">
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6f809d]">
              Operação
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map(({ label, icon: Icon, href, enabled }) => (
                  <SidebarMenuItem key={label}>
                    {enabled ? (
                      <SidebarMenuButton asChild isActive={href === "/app" ? pathname === href : pathname.startsWith(href)} tooltip={label} className="h-10 text-[13px]">
                        <Link href={href}><Icon /> <span>{label}</span></Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton disabled tooltip={`${label} · próximo incremento`} className="h-10 text-[13px] opacity-48">
                        <Icon /> <span>{label}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6f809d]">
              Administração
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/app/configuracoes")} tooltip="Configurações" className="h-10 text-[13px]">
                    <Link href="/app/configuracoes/workspace"><Settings2 /> <span>Configurações</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#49d3a7]">
              <span className="size-1.5 rounded-full bg-[#49d3a7]" /> v0.03.2 · Intake Inbox
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[#8391a8]">Solicitações, Contact 360 e busca global no workspace.</p>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#f4f7fb]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <SidebarTrigger className="size-9 rounded-lg text-[#5f6a7e]" />
          <div className="hidden h-5 w-px bg-[#e2e7ef] sm:block" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8b95a6]">{workspaceName}</p>
            <p className="truncate text-sm font-semibold text-[#172033]">{pageLabel(pathname)}</p>
          </div>

          <GlobalSearch key={workspaceId} />
          {demo && <Badge className="hidden border-0 bg-[#fff2cc] text-[#76570f] hover:bg-[#fff2cc] sm:flex">Demonstração</Badge>}
          <Button variant="ghost" size="icon" className="relative size-9 rounded-lg" aria-label="Notificações" disabled>
            <Bell />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#d45d79]" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-10 gap-2 rounded-xl px-2">
                <span className="grid size-8 place-items-center rounded-lg bg-[#14213d] text-xs font-bold text-white">JD</span>
                <span className="hidden max-w-28 text-left sm:block">
                  <span className="block truncate text-xs font-semibold">João</span>
                  <span className="block truncate text-[10px] text-[#8b95a6]">Owner</span>
                </span>
                <ChevronsUpDown className="size-3.5 text-[#8b95a6]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-xl p-2">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-semibold">João</p>
                <p className="mt-1 text-xs text-muted-foreground">{demo ? "Sessão de demonstração" : "Sessão autenticada"}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/workspaces"><ChevronsUpDown /> Trocar workspace</Link></DropdownMenuItem>
              <DropdownMenuItem disabled><CircleUserRound /> Meu perfil <span className="ml-auto text-[9px] uppercase">em breve</span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} variant="destructive"><LogOut /> Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="min-w-0 flex-1">{children}</div>
        <Toaster position="top-right" richColors />
      </SidebarInset>
    </SidebarProvider>
  )
}
