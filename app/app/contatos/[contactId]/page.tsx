import type { Metadata } from "next"

import { Contact360 } from "@/components/crm/contact-360"

export const metadata: Metadata = { title: "Contato 360°" }

export default async function ContactPage({
  params,
}: {
  params: Promise<{ contactId: string }>
}) {
  const { contactId } = await params
  return <Contact360 contactId={contactId} />
}
