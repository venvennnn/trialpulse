import { guardMutation, jsonError, readJson } from "@/server/http";
import { userClient } from "@/server/auth";
import { providerStatus } from "@/server/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = await guardMutation(req, `payout:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (!body) return jsonError(400, "INVALID_INPUT", "Expected a JSON payout confirmation.");
  if (body.mode === "demo") return jsonError(403, "FORBIDDEN", "Demo identifiers have no authority on provider routes.");
  const status = providerStatus();
  if (!status.supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  if (!status.paypal) return jsonError(503, "PROVIDER_UNAVAILABLE", "PayPal Sandbox is not configured. No payout was submitted.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  const workspaceId = process.env.TRIALPULSE_WORKSPACE_ID;
  if (!workspaceId) return jsonError(503, "WORKSPACE_UNAVAILABLE", "TRIALPULSE_WORKSPACE_ID is not set.");
  const { data, error } = await supabase.rpc("reserve_payout", {
    p_workspace: workspaceId,
    p_actor: user.id,
    p_destination: body.destinationId,
    p_destination_version: body.destinationVersion,
    p_claim: body.claimId,
    p_lines: body.lines,
    p_idempotency_key: body.idempotencyKey,
    p_payload_hash: body.payloadHash,
    p_payout_id: body.payoutId,
    p_recipient_email: body.recipientEmail,
  });
  if (error) return jsonError(409, "INVALID_INPUT", error.message);
  return Response.json({ payout: data, status: "queued" }, { status: 202 });
}
