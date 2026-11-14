import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { EntityPreview } from "@/components/crm/entity-preview"
import type { CrmEntityType } from "@/lib/crm-v003-types"

export const metadata: Metadata = { title: "Resultado da busca" }

const supportedTypes = new Set<CrmEntityType>(["company", "lead", "deal"])

export default async function EntityPreviewPage({
  params,
}: {
  params: Promise<{ entityType: string; entityId: string }>
}) {
  const { entityType, entityId } = await params
  if (!supportedTypes.has(entityType as CrmEntityType)) notFound()

  return (
    <EntityPreview
      entityType={entityType as Exclude<CrmEntityType, "contact">}
      entityId={entityId}
    />
  )
}
