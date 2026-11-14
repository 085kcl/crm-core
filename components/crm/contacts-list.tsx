"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Building2,
  ContactRound,
  Mail,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
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
import {
  contactDisplayName,
  contactInitials,
  type ContactListResponse,
  type ContactSummary,
} from "@/lib/crm-v003-types"

const statusMeta = {
  active: { label: "Ativo", className: "bg-[#e7f8f2] text-[#178967] hover:bg-[#e7f8f2]" },
  inactive: { label: "Inativo", className: "bg-[#eef2f7] text-[#68738a] hover:bg-[#eef2f7]" },
  archived: { label: "Arquivado", className: "bg-[#fff1f3] text-[#a43b50] hover:bg-[#fff1f3]" },
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

export function ContactsList() {
  const [contacts, setContacts] = useState<ContactSummary[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function loadContacts() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetchWithSessionRetry("/api/contacts", { signal: controller.signal })
        const body = (await response.json().catch(() => ({}))) as Partial<ContactListResponse> & {
          message?: string
        }
        if (!response.ok) throw new Error(body.message ?? "Não foi possível carregar os contatos.")
        setContacts(body.contacts ?? [])
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os contatos.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadContacts()
    return () => controller.abort()
  }, [reloadKey])

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR")
    if (!normalized) return contacts
    return contacts.filter((contact) =>
      [
        contactDisplayName(contact),
        contact.email,
        contact.phone,
        contact.primary_company_name,
      ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(normalized),
    )
  }, [contacts, query])

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#178967]">Relacionamento</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Contatos</h1>
          <p className="mt-2 text-sm text-[#68738a]">Abra uma visão 360° do histórico, contexto e oportunidades de cada pessoa.</p>
        </div>
        <Button disabled className="h-10 rounded-xl bg-[#14213d] text-white">
          <Plus /> Novo contato <span className="text-[9px] uppercase opacity-65">em breve</span>
        </Button>
      </div>

      <Card className="mt-6 gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
        <CardHeader className="flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <CardTitle className="text-base">Base de contatos</CardTitle>
            <p className="mt-1 text-xs text-[#8490a3]">{loading ? "Carregando…" : `${contacts.length} contato${contacts.length === 1 ? "" : "s"} no workspace`}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b95a6]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrar esta lista"
                aria-label="Filtrar contatos carregados"
                className="h-10 rounded-xl bg-[#f8fafc] pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0 rounded-xl"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loading}
              aria-label="Atualizar contatos"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? <ContactListSkeleton /> : error ? (
            <Empty className="min-h-80 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ContactRound /></EmptyMedia>
                <EmptyTitle>Falha ao carregar os contatos</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>Tentar novamente</Button>
            </Empty>
          ) : filteredContacts.length === 0 ? (
            <Empty className="min-h-80 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ContactRound /></EmptyMedia>
                <EmptyTitle>{contacts.length ? "Nenhum contato neste filtro" : "Nenhum contato cadastrado"}</EmptyTitle>
                <EmptyDescription>
                  {contacts.length ? "Ajuste o texto informado para voltar à lista." : "Os contatos deste workspace aparecerão aqui quando forem cadastrados."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#fafbfd] hover:bg-[#fafbfd]">
                      <TableHead className="pl-6 text-[11px] text-[#778298]">Contato</TableHead>
                      <TableHead className="text-[11px] text-[#778298]">Empresa principal</TableHead>
                      <TableHead className="text-[11px] text-[#778298]">Oportunidades</TableHead>
                      <TableHead className="text-[11px] text-[#778298]">Última atividade</TableHead>
                      <TableHead className="pr-6 text-right text-[11px] text-[#778298]"><span className="sr-only">Abrir</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContacts.map((contact) => (
                      <TableRow key={contact.id} className="group">
                        <TableCell className="py-4 pl-6">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e7f8f2] text-xs font-bold text-[#178967]">{contactInitials(contact)}</span>
                            <div className="min-w-0">
                              <Link href={`/app/contatos/${contact.id}`} className="block truncate text-sm font-semibold text-[#28344a] hover:text-[#178967] hover:underline">{contactDisplayName(contact)}</Link>
                              <p className="mt-1 flex items-center gap-1 truncate text-xs text-[#7d889b]"><Mail className="size-3" /> {contact.email ?? contact.phone ?? "Sem canal cadastrado"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-xs text-[#566178]">
                          <span className="flex items-center gap-2"><Building2 className="size-3.5 text-[#8b95a6]" /> {contact.primary_company_name ?? "Sem empresa"}</span>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="outline">{contact.lead_count} lead{contact.lead_count === 1 ? "" : "s"}</Badge>
                            <Badge variant="outline">{contact.open_deal_count} negócio{contact.open_deal_count === 1 ? "" : "s"}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-xs text-[#68738a]">{contact.last_activity_at ? dateFormatter.format(new Date(contact.last_activity_at)) : "Sem atividade"}</TableCell>
                        <TableCell className="py-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Badge className={statusMeta[contact.status].className}>{statusMeta[contact.status].label}</Badge>
                            <Button variant="ghost" size="icon-sm" asChild aria-label={`Abrir ${contactDisplayName(contact)}`}>
                              <Link href={`/app/contatos/${contact.id}`}><ArrowRight /></Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y md:hidden">
                {filteredContacts.map((contact) => (
                  <Link key={contact.id} href={`/app/contatos/${contact.id}`} className="block p-4 transition hover:bg-[#fafbfd]">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f8f2] text-xs font-bold text-[#178967]">{contactInitials(contact)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{contactDisplayName(contact)}</p>
                          <Badge className={statusMeta[contact.status].className}>{statusMeta[contact.status].label}</Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-[#7d889b]">{contact.email ?? contact.phone ?? "Sem canal cadastrado"}</p>
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#566178]"><Building2 className="size-3.5" /> {contact.primary_company_name ?? "Sem empresa"}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function ContactListSkeleton() {
  return (
    <div className="space-y-0 divide-y p-0" aria-label="Carregando contatos" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-4 sm:px-6">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-56 max-w-full" /></div>
          <Skeleton className="hidden h-7 w-20 sm:block" />
        </div>
      ))}
    </div>
  )
}
