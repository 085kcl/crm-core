export {}

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const encoder = new TextEncoder();

function timingSafeEqual(a: string, b: string) {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function adminHeaders(): { key: string; headers: Record<string, string> } {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) {
    return {
      key: legacy,
      headers: {
        apikey: legacy,
        Authorization: `Bearer ${legacy}`,
        "Content-Type": "application/json",
      },
    };
  }
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "{}";
  const parsed = JSON.parse(raw);
  const key = String(parsed.default || "").trim();
  if (!key) throw new Error("supabase_admin_key_missing");
  return {
    key,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
    },
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
if (!supabaseUrl) throw new Error("supabase_url_missing");

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { headers } = adminHeaders();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
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

function sanitizeProviderError(value: unknown) {
  if (!value || typeof value !== "object") return "resend_request_failed";
  const source = value as Record<string, unknown>;
  const code = typeof source.name === "string"
    ? source.name
    : typeof source.code === "string"
      ? source.code
      : "resend_request_failed";
  return code.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120);
}

type ClaimedDelivery = {
  delivery_id: string;
  workspace_id: string;
  intake_request_id: string;
  recipient: string;
  template_key: string;
  template_variables: Record<string, string | number>;
  from_snapshot: string;
  reply_to_snapshot: string | null;
  provider: string;
  delivery_key: string;
  attempt_number: number;
};

async function sendResend(delivery: ClaimedDelivery, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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
        ...(delivery.reply_to_snapshot ? { reply_to: delivery.reply_to_snapshot } : {}),
        template: {
          id: delivery.template_key,
          variables: delivery.template_variables,
        },
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null) as
      | { id?: string; name?: string; code?: string }
      | null;

    if (response.ok) {
      if (body?.id && typeof body.id === "string") {
        return { kind: "accepted" as const, providerMessageId: body.id };
      }
      return { kind: "unknown" as const, failureKind: "uncertain", error: "resend_accepted_without_message_id" };
    }

    const code = sanitizeProviderError(body);
    if (
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 409 && code === "concurrent_idempotent_requests")
    ) {
      return { kind: "rejected" as const, failureKind: "transient", error: code };
    }
    return { kind: "rejected" as const, failureKind: "permanent", error: code };
  } catch (error) {
    const name = error instanceof Error ? error.name : "network_error";
    return {
      kind: "rejected" as const,
      failureKind: "transient",
      error: name === "AbortError" ? "resend_timeout" : "resend_network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const correlationId = crypto.randomUUID();
  try {
    const workerToken = await getSecret("crm_notification_worker_token");
    const auth = request.headers.get("authorization") || "";
    const expected = `Bearer ${workerToken}`;
    if (!timingSafeEqual(auth, expected)) {
      return Response.json({ code: "worker_unauthorized", correlation_id: correlationId }, { status: 401 });
    }

    const resendApiKey = await getSecret("resend_api_key");
    const url = new URL(request.url);
    const requested = Number.parseInt(url.searchParams.get("limit") || "10", 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 25) : 10;

    const summary = {
      correlation_id: correlationId,
      leases_expired: 0,
      outbox_events_scanned: 0,
      claimed: 0,
      sent: 0,
      retry_scheduled: 0,
      failed: 0,
      reconciliation_required: 0,
    };

    summary.leases_expired = Number(await rpc<number>("expire_notification_leases", {}) || 0);
    summary.outbox_events_scanned = Number(await rpc<number>("materialize_notification_batch", { p_limit: limit }) || 0);

    for (let i = 0; i < limit; i++) {
      const claimedRows = await rpc<ClaimedDelivery[]>("claim_notification_delivery", {
        p_correlation_id: correlationId,
      });
      const delivery = Array.isArray(claimedRows) ? claimedRows[0] : null;
      if (!delivery) break;

      summary.claimed += 1;
      const result = await sendResend(delivery, resendApiKey);

      const dbResult = await rpc<string>("record_notification_result", {
        p_delivery_id: delivery.delivery_id,
        p_attempt_number: delivery.attempt_number,
        p_result: result.kind === "accepted" ? "accepted" : result.kind === "unknown" ? "unknown" : "rejected",
        p_failure_kind: result.kind === "accepted" ? null : result.failureKind,
        p_sanitized_error: result.kind === "accepted" ? null : result.error,
        p_provider_message_id: result.kind === "accepted" ? result.providerMessageId : null,
        p_correlation_id: correlationId,
      });

      if (dbResult === "sent") summary.sent += 1;
      else if (dbResult === "retry_scheduled") summary.retry_scheduled += 1;
      else if (dbResult === "reconciliation_required") summary.reconciliation_required += 1;
      else summary.failed += 1;
    }

    return Response.json(summary);
  } catch {
    return Response.json({ code: "notification_dispatch_failed", correlation_id: correlationId }, { status: 503 });
  }
});
