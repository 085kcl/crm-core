"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Loader2,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchWithSessionRetry } from "@/lib/client-fetch"
import type {
  CrmEntityPreview as CrmEntityPreviewData,
  CrmEntityPreviewResponse,
  CrmEntityType,
} from "@/lib/crm-v003-types"

const entityMeta = {
  company: { label: "Empresa", icon: Building2, tone: "bg-[#eaf0ff] text-[#3d63c9]" },
  lead: { label: "Lead", icon: UserRoundSearch, tone: "bg-[#fff4dc] text-[#9a6d13]" },
  deal: { label: "Negócio", icon: BriefcaseBusiness, tone: "bg-[#f1ebff] text-[#7650c6]" },
} satisfies Record<Exclude<CrmEntityType, "contact">, {
  label: string
  icon: typeof Building2
  tone: string
}>

export function EntityPreview(props: Parameters<typeof EntityPreviewContent>[0]) {
  return <EntityPreviewContent key={`${props.entityType}:${props.entityId}`} {...props} />
}

function EntityPreviewContent({
  entityType,
  entityId,
}: {
  entityType: Exclude<CrmEntityType, "contact">
  entityId: string
}) {
  const [entity, setEntity] = useState<CrmEntityPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetchWithSessionRetry(
          `/api/entities/${entityType}/${entityId}`,
          { signal: controller.signal },
        )
        const body = (await response.json().catch(() => ({}))) as
          Partial<CrmEntityPreviewResponse> & { message?: string }

        if (!response.ok || !body.entity) {
          throw new Error(
            response.status === 403 || response.status === 404
              ? "Registro não encontrado ou indisponível neste workspace."
              : body.message ?? "Não foi possível carregar o registro.",
          )
        }
        if (!controller.signal.aborted) setEntity(body.entity)
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o registro.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [entityId, entityType])

  const meta = entityMeta[entityType]
  const Icon = meta.icon

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/app"
        className="inline-flex items-center gap-2 text-xs font-semibold text-[#68738a] transition hover:text-[#172033]"
      >
        <ArrowLeft className="size-4" /> Voltar
      </Link>

      <div className="mt-5 flex items-center gap-3">
        <span className={`grid size-11 place-items-center rounded-xl ${meta.tone}`}>
          <Icon className="size-5" />
        </span>
        <div>
          <Badge variant="outline">{meta.label}</Badge>
          <p className="mt-1 text-xs text-[#7d889b]">Resultado da busca global</p>
        </div>
      </div>

      {loading && (
        <Card className="mt-5 min-h-72 place-items-center rounded-2xl border-[#e0e6ef]" role="status">
          <div className="flex items-center gap-2 text-sm text-[#68738a]">
            <Loader2 className="size-4 animate-spin" /> Carregando registro…
          </div>
        </Card>
      )}

      {!loading && error && (
        <Card className="mt-5 min-h-72 place-items-center rounded-2xl border-[#efc7cf]" role="alert">
          <div className="max-w-md px-6 text-center">
            <ShieldCheck className="mx-auto size-7 text-[#a43b50]" />
            <p className="mt-4 text-sm font-semibold text-[#28344a]">Registro indisponível</p>
            <p className="mt-2 text-xs leading-5 text-[#7d889b]">{error}</p>
          </div>
        </Card>
      )}

      {!loading && entity && (
        <Card className="mt-5 gap-0 rounded-2xl border-[#e0e6ef] py-0 shadow-[0_8px_28px_rgba(23,32,51,0.045)]">
          <CardHeader className="border-b px-5 py-6 sm:px-7">
            <CardTitle className="text-2xl tracking-[-0.035em]">{entity.title}</CardTitle>
            <p className="mt-2 text-sm text-[#68738a]">{entity.subtitle || "Sem informação complementar"}</p>
          </CardHeader>
          <CardContent className="px-5 py-6 sm:px-7">
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {entity.fields.map((field) => (
                <div key={field.label} className="border-b border-[#edf0f5] pb-4">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#96a0b1]">
                    {field.label}
                  </dt>
                  <dd className="mt-2 break-words text-sm text-[#28344a]">
                    {field.value || "Não informado"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 flex items-center gap-2 text-[11px] text-[#8b95a6]">
              <ShieldCheck className="size-3.5 text-[#178967]" />
              Visualização somente leitura, protegida pelo workspace ativo e pelas policies RLS.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
