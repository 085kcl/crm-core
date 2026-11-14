// Receive-only parsing for Meta messaging events. No outbound messaging is enabled.
// Unrecognized message types are represented with a neutral media placeholder;
// attachments and other sensitive payload fields stay in the private ingress queue.

export type ConnectInboundMessage = {
  participant_id: string
  provider_message_id: string
  body: string
  message_type: "text" | "media"
  occurred_at: string
  display_name: string | null
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
function validId(value: unknown, max: number): string | null {
  const s = str(value)
  return s && s.length <= max ? s : null
}
function timestamp(input: unknown, ms: boolean): string {
  const number = typeof input === "string" || typeof input === "number" ? Number(input) : NaN
  const t = ms ? number : number * 1000
  return Number.isFinite(t) && t >= 946684800000 && t <= Date.now() + 86400000
    ? new Date(t).toISOString()
    : new Date().toISOString()
}
function safeBody(body: unknown) {
  if (typeof body !== "string") return null
  const trimmed = body.trim()
  return trimmed ? trimmed.slice(0, 4000) : null
}
function boundedName(name: unknown): string | null {
  const result = safeBody(name)
  return result ? result.slice(0, 180) : null
}

export function extractConnectInboundMessages(
  provider: string,
  payload: unknown,
): ConnectInboundMessage[] {
  const event = obj(payload)
  if (!event) return []
  const out: ConnectInboundMessage[] = []

  if (provider === "instagram" || provider === "messenger") {
    const ownId = str(event.id)
    const messaging = Array.isArray(event.messaging) ? event.messaging : []
    for (const value of messaging.slice(0, 100)) {
      const item = obj(value)
      const message = obj(item?.message)
      const sender = obj(item?.sender)
      if (!item || !message || message.is_echo === true || message.is_deleted === true) continue
      const participant = validId(sender?.id, 200)
      const messageId = validId(message.mid, 250)
      if (!participant || !messageId || participant === ownId) continue
      const type = safeBody(message.text) ? "text" : "media"
      const body = type === "text" ? safeBody(message.text)! : "[Mensagem de mídia]"
      out.push({
        participant_id: participant, provider_message_id: messageId,
        body, message_type: type, occurred_at: timestamp(item.timestamp, true),
        display_name: null,
      })
    }
  } else if (provider === "whatsapp") {
    const value = obj(event.value)
    const msgs = Array.isArray(value?.messages) ? value.messages : []
    const contacts = Array.isArray(value?.contacts) ? value.contacts : []
    const names = new Map<string, string>()
    for (const c of contacts.slice(0, 100)) {
      const contact = obj(c)
      const profile = obj(contact?.profile)
      const waId = validId(contact?.wa_id, 200)
      const name = boundedName(profile?.name)
      if (waId && name) names.set(waId, name)
    }
    for (const entry of msgs.slice(0, 100)) {
      const msg = obj(entry)
      if (!msg) continue
      const participant = validId(msg.from, 200)
      const messageId = validId(msg.id, 250)
      if (!participant || !messageId) continue
      const text = safeBody(obj(msg.text)?.body)
      out.push({
        participant_id: participant, provider_message_id: messageId,
        body: text || "[Mensagem de mídia]",
        message_type: text ? "text" : "media",
        occurred_at: timestamp(msg.timestamp, false),
        display_name: names.get(participant) ?? null,
      })
    }
  }
  return out
}
