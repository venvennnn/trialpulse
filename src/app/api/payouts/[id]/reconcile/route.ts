import { guardMutation, jsonError } from "@/server/http";
import { providerStatus } from "@/server/config";
import { serviceClient } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guardMutation(req, `reconcile:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  if (!providerStatus().supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const { id } = await context.params;
  const client = serviceClient();
  if (!client) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const { error } = await client.from("outbox_jobs").insert({
    workspace_id: process.env.TRIALPULSE_WORKSPACE_ID,
    job_type: "reconcile_payout",
    dedupe_key: `reconcile:${id}:${Date.now()}`,
    payload: { payoutId: id },
    state: "pending",
  });
  if (error) return jsonError(409, "INVALID_INPUT", error.message);
  return Response.json({ status: "queued" }, { status: 202 });
}
