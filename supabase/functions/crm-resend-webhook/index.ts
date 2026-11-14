export {}

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

type ResendWebhookEvent = {
  type?: unknown
  created_at?: unknown
  data?: { email_id?: unknown }
}

const encoder = new TextEncoder();

function adminHeaders(): Record<string, string> {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) {
    return {
      apikey: legacy,
      Authorization: `Bearer ${legacy}`,
      "Content-Type": "application/json",
    };
  }
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "{}";
  const parsed = JSON.parse(raw);
  const key = String(parsed.default || "").trim();
  if (!key) throw new Error("supabase_admin_key_missing");
  return {
    apikey: key,
    "Content-Type": "application/json",
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
if (!supabaseUrl) throw new Error("supabase_url_missing");

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`rpc_failed:${name}`);
  return payload as T;
}

async function getSecret(name: string): Promise<string> {
  const value = await rpc<string>("get_notification_runtime_secret", { p_name: name });
  if (typeof value !== "string" || !value) throw new Error("runtime_secret_missing");
  return value;
}

function base64ToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeStringEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySvix(rawBody: string, request: Request, secret: string, toleranceSeconds = 300) {
  if (!secret.startsWith("whsec_")) return false;
  const id = request.headers.get("svix-id");
  const tsRaw = request.headers.get("svix-timestamp");
  const signatures = request.headers.get("svix-signature");
  if (!id || !tsRaw || !signatures) return false;

  const ts = Number.parseInt(tsRaw, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - ts > toleranceSeconds || ts > now + toleranceSeconds) return false;

  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(secret.slice("whsec_".length));
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyBytes).buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = `${id}.${tsRaw}.${rawBody}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signed)));
  const expected = bytesToBase64(signature);

  return signatures
    .split(" ")
    .map((entry) => entry.split(",", 2))
    .some(([version, candidate]) =>
      version === "v1" && typeof candidate === "string" && timingSafeStringEqual(candidate, expected)
    );
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const acceptedEvents = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.bounced",
  "email.suppressed",
  "email.complained",
]);

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const rawBody = await request.text();
  if (encoder.encode(rawBody).byteLength > 128 * 1024) {
    return Response.json({ code: "payload_too_large" }, { status: 413 });
  }

  try {
    const secret = await getSecret("resend_webhook_secret");
    const valid = await verifySvix(rawBody, request, secret);
    if (!valid) return Response.json({ code: "invalid_webhook_signature" }, { status: 400 });

    let event: ResendWebhookEvent;
    try {
      event = JSON.parse(rawBody) as ResendWebhookEvent;
    } catch {
      return Response.json({ code: "invalid_json" }, { status: 400 });
    }

    const type = typeof event?.type === "string" ? event.type : "";
    const emailId = typeof event?.data?.email_id === "string" ? event.data.email_id : "";
    const createdAt = typeof event?.created_at === "string" ? new Date(event.created_at) : new Date(NaN);
    const svixId = request.headers.get("svix-id");

    if (!svixId || !type || !emailId || Number.isNaN(createdAt.getTime())) {
      return Response.json({ code: "invalid_event_shape" }, { status: 400 });
    }
    if (!acceptedEvents.has(type)) return Response.json({ ok: true, ignored: true });

    const result = await rpc<string>("record_resend_webhook_event", {
      p_provider_event_id: svixId,
      p_event_type: type,
      p_provider_message_id: emailId,
      p_event_created_at: createdAt.toISOString(),
      p_payload_hash: await sha256Hex(rawBody),
    });

    return Response.json({ ok: true, result: result || "processed" });
  } catch {
    return Response.json({ code: "webhook_processing_failed" }, { status: 503 });
  }
});
