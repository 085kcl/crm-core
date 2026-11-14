import { z } from "zod"

export const classyBridgeIntakeSchema = z.object({
  external_id: z.string().trim().min(1).max(160).optional(),
  schema_version: z.literal(1).default(1),
  customer_name: z.string().trim().min(2).max(160),
  customer_email: z.string().trim().email().max(254),
  customer_phone: z.string().trim().min(6).max(40).optional(),
  payload: z.record(z.string(), z.unknown()),
}).strict()

export type ClassyBridgeIntake = z.infer<typeof classyBridgeIntakeSchema>

function canonicalJson(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non_finite_number")
    return JSON.stringify(value)
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (typeof value === "object") {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`
  }
  throw new Error("unsupported_json_value")
}

export function canonicalIntakeBody(body: ClassyBridgeIntake) {
  return canonicalJson({
    external_id: body.external_id ?? null,
    schema_version: body.schema_version,
    customer_name: body.customer_name.trim(),
    customer_email: body.customer_email.trim().toLowerCase(),
    customer_phone: body.customer_phone?.trim() ?? null,
    payload: body.payload,
  })
}

async function sha256Bytes(value: string) {
  const encoded = new TextEncoder().encode(value)
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoded))
}

export async function sha256Hex(value: string) {
  const bytes = await sha256Bytes(value)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function secureTokenMatches(supplied: string | null, expected: string | undefined) {
  if (!supplied || !expected) return false
  const prefix = "Bearer "
  if (!supplied.startsWith(prefix)) return false
  const candidate = supplied.slice(prefix.length).trim()
  if (!candidate) return false

  const [candidateHash, expectedHash] = await Promise.all([
    sha256Bytes(candidate),
    sha256Bytes(expected.trim()),
  ])

  if (candidateHash.length !== expectedHash.length) return false
  let difference = 0
  for (let index = 0; index < candidateHash.length; index += 1) {
    difference |= candidateHash[index] ^ expectedHash[index]
  }
  return difference === 0
}

export function bridgeBodyWithinLimit(raw: string, maxBytes = 32 * 1024) {
  return new TextEncoder().encode(raw).byteLength <= maxBytes
}
