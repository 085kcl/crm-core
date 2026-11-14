import type { Metadata } from "next"

import { IntakeDetail } from "@/components/crm/intake-detail"

export const metadata: Metadata = { title: "Solicitação" }

export default async function IntakeDetailPage({
  params,
}: {
  params: Promise<{ intakeId: string }>
}) {
  const { intakeId } = await params
  return <IntakeDetail intakeId={intakeId} />
}
