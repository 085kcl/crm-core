import type { Metadata } from "next"
import { ConnectInbox } from "@/components/crm/connect-inbox"

export const metadata: Metadata = { title:"CLASSY Connect | Conversas" }

export default function ConnectPage() {
  return <ConnectInbox />
}
