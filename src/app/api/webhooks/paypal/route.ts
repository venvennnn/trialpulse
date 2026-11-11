import { jsonError } from "@/server/http";
import { readPayPalConfig, readWebhookHeaders, verifyPayPalWebhook } from "@/server/paypal";
import { serviceClient } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const config = readPayPalConfig();
  const event = await req.json().catch(() => null);
  const verified = await verifyPayPalWebhook({ config, headers: readWebhookHeaders(req.headers), event });
  if (!verified.ok) return jsonError(401, "FORBIDDEN", "PayPal webhook signature was not verified.");
  const id = event && typeof event === "object" && "id" in event ? String((event as { id: string }).id) : "";
  if (!id) return jsonError(400, "INVALID_INPUT", "Webhook event id is missing.");
  const client = serviceClient();
  if (!client) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const { error } = await client.from("webhook_events").insert({
    id,
    provider: "paypal",
    event_type: (event as { event_type?: string }).event_type ?? "unknown",
    sender_batch_id: null,
    payload: event,
  });
  if (error && !error.message.toLowerCase().includes("duplicate")) return jsonError(409, "INVALID_INPUT", error.message);
  await client.from("outbox_jobs").insert({
    workspace_id: process.env.TRIALPULSE_WORKSPACE_ID,
    job_type: "reconcile_payout",
    dedupe_key: `webhook:${id}`,
    payload: { eventId: id },
    state: "pending",
  });
  return Response.json({ received: true });
}
