// CLASSY Connect: pure helpers for Meta webhook validation and event extraction.
// No tenant IDs, user-provided routing decisions, or outbound message delivery here.

export type MetaEventProvider = "instagram" | "messenger" | "whatsapp"

export type ConnectMetaEvent = {
  provider: MetaEventProvider
  external_account_id: string
  event_hash: string
  event_kind: string
  payload: Record<string, unknown>
}

type UnsignedMetaEvent = Omit<ConnectMetaEvent, "event_hash">

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function safeAccountId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : null
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("")
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return bytesToHex(new Uint8Array(hash))
}

export function safeTokenEquals(supplied: string | null, expected: string | undefined): boolean {
  if (!supplied || !expected || supplied.length > 256 || expected.length > 256) return false
  const left = new TextEncoder().encode(supplied)
  const right = new TextEncoder().encode(expected)
  let difference = left.length ^ right.length
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return difference === 0
}

export async function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): Promise<boolean> {
  if (!appSecret || !signatureHeader || !/^sha256=[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))
  return safeTokenEquals(signatureHeader.toLowerCase(), `sha256=${bytesToHex(new Uint8Array(digest))}`)
}

export function extractMetaWebhookEntries(payload: unknown): UnsignedMetaEvent[] | null {
  const root = asRecord(payload)
  if (!root || !Array.isArray(root.entry) || root.entry.length > 1000) return null

  const provider: MetaEventProvider | null =
    root.object === "instagram" ? "instagram" :
    root.object === "page" ? "messenger" :
    root.object === "whatsapp_business_account" ? "whatsapp" : null
  if (!provider) return null

  const events: UnsignedMetaEvent[] = []
  for (const item of root.entry) {
    const entry = asRecord(item)
    if (!entry) continue

    if (provider === "whatsapp") {
      // The WABA entry ID is not the phone_number_id. Use the latter for routing.
      if (!Array.isArray(entry.changes)) continue
      for (const itemChange of entry.changes) {
        const change = asRecord(itemChange)
        const value = asRecord(change?.value)
        const metadata = asRecord(value?.metadata)
        const accountId = safeAccountId(metadata?.phone_number_id)
        if (!accountId) continue
        events.push({
          provider, external_account_id: accountId,
          event_kind: "whatsapp.change", payload: change!,
        })
        if (events.length > 1000) return null
      }
    } else {
      const accountId = safeAccountId(entry.id)
      if (!accountId) continue
      events.push({
        provider, external_account_id: accountId,
        event_kind: provider === "instagram" ? "instagram.entry" : "messenger.entry",
        payload: entry,
      })
    }
  }
  return events
}

export async function prepareMetaWebhookEvents(payload: unknown): Promise<ConnectMetaEvent[] | null> {
  const entries = extractMetaWebhookEntries(payload)
  if (!entries) return null
  return Promise.all(entries.map(async event => ({
    ...event,
    event_hash: await sha256Hex(
      `${event.provider}:${event.external_account_id}:${canonicalJson(event.payload)}`,
    ),
  })))
}
