type SvixHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

function base64ToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  const binary = atob(normalized + padding)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function timingSafeStringEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index]
  }
  return difference === 0
}

export async function verifySvixWebhook(
  rawBody: string,
  headers: SvixHeaders,
  secret: string | undefined,
  toleranceSeconds = 300,
) {
  if (!secret?.startsWith("whsec_")) return false
  if (!headers.id || !headers.timestamp || !headers.signature) return false

  const timestamp = Number.parseInt(headers.timestamp, 10)
  if (!Number.isFinite(timestamp)) return false

  const now = Math.floor(Date.now() / 1000)
  if (now - timestamp > toleranceSeconds || timestamp > now + toleranceSeconds) {
    return false
  }

  let keyBytes: Uint8Array
  try {
    keyBytes = base64ToBytes(secret.slice("whsec_".length))
  } catch {
    return false
  }

  const rawKey = new Uint8Array(keyBytes).buffer

  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent)),
  )
  const expected = bytesToBase64(signature)

  return headers.signature
    .split(" ")
    .map((entry) => entry.split(",", 2))
    .some(([version, candidate]) =>
      version === "v1" && typeof candidate === "string"
        ? timingSafeStringEqual(candidate, expected)
        : false,
    )
}
