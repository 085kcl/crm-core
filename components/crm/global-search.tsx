"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BriefcaseBusiness,
  Building2,
  ContactRound,
  Loader2,
  Search,
  UserRoundSearch,
} from "lucide-react"

import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { fetchWithSessionRetry } from "@/lib/client-fetch"
import {
  crmEntityHref,
  type CrmEntityType,
  type SearchCrmResponse,
  type SearchCrmResult,
} from "@/lib/crm-v003-types"

const entityMeta: Record<CrmEntityType, {
  label: string
  icon: typeof ContactRound
  tone: string
}> = {
  contact: { label: "Contato", icon: ContactRound, tone: "bg-[#e7f8f2] text-[#178967]" },
  company: { label: "Empresa", icon: Building2, tone: "bg-[#eaf0ff] text-[#3d63c9]" },
  lead: { label: "Lead", icon: UserRoundSearch, tone: "bg-[#fff4dc] text-[#9a6d13]" },
  deal: { label: "Negócio", icon: BriefcaseBusiness, tone: "bg-[#f1ebff] text-[#7650c6]" },
}

export function GlobalSearch() {
  const router = useRouter()
  const requestSequence = useRef(0)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchCrmResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  useEffect(() => {
    const normalized = query.trim()
    const currentRequest = ++requestSequence.current
    if (normalized.length < 2) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetchWithSessionRetry(
          `/api/search?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        )
        const body = (await response.json().catch(() => ({}))) as Partial<SearchCrmResponse> & {
          message?: string
        }
        if (!response.ok) throw new Error(body.message ?? "Não foi possível concluir a busca.")
        if (requestSequence.current !== currentRequest) return
        setResults(body.results ?? [])
      } catch (searchError) {
        if (controller.signal.aborted || requestSequence.current !== currentRequest) return
        setResults([])
        setError(searchError instanceof Error ? searchError.message : "Não foi possível concluir a busca.")
      } finally {
        if (requestSequence.current === currentRequest) setLoading(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  function openResult(result: SearchCrmResult) {
    setOpen(false)
    router.push(crmEntityHref(result))
  }

  function updateQuery(value: string) {
    setQuery(value)
    requestSequence.current += 1
    setResults([])
    setError(null)
    setLoading(value.trim().length >= 2)
  }

  const normalizedQuery = query.trim()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-[260px] items-center gap-2 rounded-xl border bg-[#f8fafc] px-3 text-left text-xs text-[#68738a] transition hover:border-[#b9c6d8] hover:bg-white lg:flex"
        aria-label="Abrir busca global"
      >
        <Search className="size-4" /> Buscar no CRM
        <kbd className="ml-auto rounded border bg-white px-1.5 py-0.5 text-[9px]">⌘ K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-lg text-[#5f6a7e] transition hover:bg-[#eef2f7] lg:hidden"
        aria-label="Abrir busca global"
      >
        <Search className="size-4" />
      </button>

      <CommandDialog
        shouldFilter={false}
        open={open}
        onOpenChange={setOpen}
        title="Busca global do CRM"
        description="Encontre contatos, empresas, leads e negócios no workspace atual."
        className="top-[18%] translate-y-0 gap-0 rounded-2xl sm:max-w-2xl"
      >
        <CommandInput
          autoFocus
          value={query}
          onValueChange={updateQuery}
          placeholder="Nome, e-mail, telefone, documento…"
          aria-label="Buscar no CRM"
        />
        <CommandList className="max-h-[min(430px,65vh)] p-2">
          {normalizedQuery.length < 2 && (
            <div className="px-3 py-10 text-center text-sm text-[#7d889b]">
              Digite pelo menos 2 caracteres para pesquisar neste workspace.
            </div>
          )}
          {normalizedQuery.length >= 2 && loading && (
            <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-[#68738a]" role="status">
              <Loader2 className="size-4 animate-spin" /> Buscando…
            </div>
          )}
          {normalizedQuery.length >= 2 && !loading && error && (
            <div className="px-3 py-10 text-center text-sm text-[#a43b50]" role="alert">{error}</div>
          )}
          {normalizedQuery.length >= 2 && !loading && !error && results.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-[#7d889b]">
              Nenhum resultado encontrado para “{normalizedQuery}”.
            </div>
          )}
          {!loading && !error && results.length > 0 && (
            <CommandGroup heading={`${results.length} resultado${results.length === 1 ? "" : "s"}`}>
              {results.map((result) => {
                const meta = entityMeta[result.entity_type]
                const Icon = meta.icon
                return (
                  <CommandItem
                    key={`${result.entity_type}:${result.entity_id}`}
                    value={`${result.title} ${result.subtitle} ${meta.label}`}
                    onSelect={() => openResult(result)}
                    className="min-h-14 cursor-pointer gap-3 rounded-xl px-3"
                  >
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${meta.tone}`}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#28344a]">{result.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-[#7d889b]">{result.subtitle || "Sem informação complementar"}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9aa4b4]">{meta.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
        <div className="flex items-center justify-between border-t bg-[#fafbfd] px-4 py-2 text-[10px] text-[#8b95a6]">
          <span>Busca restrita ao workspace atual</span>
          <span>↑↓ navegar · Enter abrir · Esc fechar</span>
        </div>
      </CommandDialog>
    </>
  )
}
