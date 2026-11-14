import type { Metadata } from "next"

import { ContactsList } from "@/components/crm/contacts-list"

export const metadata: Metadata = { title: "Contatos" }

export default function ContactsPage() {
  return <ContactsList />
}
