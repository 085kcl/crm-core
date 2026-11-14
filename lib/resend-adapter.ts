export type NotificationDeliveryForSend = {
  recipient: string
  template_key: string
  template_variables: Record<string, string | number>
  from_snapshot: string
  reply_to_snapshot: string | null
  delivery_key: string
}

export type NotificationSendResult =
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "rejected"; failureKind: "transient" | "permanent"; error: string }
  | { kind: "unknown"; failureKind: "uncertain"; error: string }

function sanitizeProviderError(value: unknown) {
  if (!value || typeof value !== "object") return "resend_request_failed"
  const source = value as Record<string, unknown>
  const code = typeof source.name === "string"
    ? source.name
    : typeof source.code === "string"
      ? source.code
      : "resend_request_failed"
  return code.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120)
}

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error("resend_api_key_not_configured")
  return key
}

export async function sendResendEmail(
  delivery: NotificationDeliveryForSend,
  timeoutMs = 10_000,
): Promise<NotificationSendResult> {
  const apiKey = getResendApiKey()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `crm/${delivery.delivery_key}`,
      },
      body: JSON.stringify({
        from: delivery.from_snapshot,
        to: [delivery.recipient],
        ...(delivery.reply_to_snapshot
          ? { reply_to: delivery.reply_to_snapshot }
          : {}),
        template: {
          id: delivery.template_key,
          variables: delivery.template_variables,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    })

    const body = (await response.json().catch(() => null)) as
      | { id?: string; name?: string; code?: string; message?: string }
      | null

    if (response.ok) {
      if (body?.id && typeof body.id === "string") {
        return { kind: "accepted", providerMessageId: body.id }
      }
      return {
        kind: "unknown",
        failureKind: "uncertain",
        error: "resend_accepted_without_message_id",
      }
    }

    const code = sanitizeProviderError(body)

    if (
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 409 && code === "concurrent_idempotent_requests")
    ) {
      return { kind: "rejected", failureKind: "transient", error: code }
    }

    return { kind: "rejected", failureKind: "permanent", error: code }
  } catch (error) {
    const name = error instanceof Error ? error.name : "network_error"
    // Resend idempotency keys make a retry with the exact same request safe
    // inside the provider's dedupe window.
    return {
      kind: "rejected",
      failureKind: "transient",
      error: name === "AbortError" ? "resend_timeout" : "resend_network_error",
    }
  } finally {
    clearTimeout(timeout)
  }
}
