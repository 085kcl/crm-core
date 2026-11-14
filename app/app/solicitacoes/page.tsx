import type { Metadata } from "next"

import { IntakeInbox } from "@/components/crm/intake-inbox"

export const metadata: Metadata = { title: "Solicitações" }

export default function IntakeInboxPage() {
  return <IntakeInbox />
}
