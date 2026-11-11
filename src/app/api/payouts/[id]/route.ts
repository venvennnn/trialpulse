import { jsonError } from "@/server/http";
import { userClient } from "@/server/auth";
import { providerStatus } from "@/server/config";
import { maskEmail } from "@/domain/mask";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!providerStatus().supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  const { id } = await context.params;
  const { data, error } = await supabase.from("payouts").select("id, amount, currency, status, sender_batch_id, provider_batch_id, provider_item_id, provider_raw_status, recipient_email, destination_version").eq("id", id).maybeSingle();
  if (error || !data) return jsonError(404, "NOT_FOUND", "Payout not found in this workspace.");
  return Response.json({
    id: data.id,
    amount: data.amount,
    currency: data.currency,
    status: data.status,
    senderBatchId: data.sender_batch_id,
    providerBatchId: data.provider_batch_id,
    providerItemId: data.provider_item_id,
    providerRawStatus: data.provider_raw_status,
    destinationVersion: data.destination_version,
    recipientMasked: maskEmail(data.recipient_email),
    modeLabel: "PayPal Sandbox",
  });
}
