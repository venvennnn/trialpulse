import { guardMutation, jsonError } from "@/server/http";
import { providerStatus } from "@/server/config";
import { serviceClient, userClient } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guardMutation(req, `extract:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  const status = providerStatus();
  if (!status.supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  if (!status.gemini) return jsonError(503, "PROVIDER_UNAVAILABLE", "Gemini is not configured. Enter the receipt fields manually. The claim is unchanged.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  const { id } = await context.params;
  const { data: receipt } = await supabase.from("receipts").select("id, workspace_id, revision, content_hash").eq("id", id).maybeSingle();
  if (!receipt) return jsonError(404, "NOT_FOUND", "Receipt not found in this workspace.");
  const client = serviceClient();
  if (!client) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const operationId = crypto.randomUUID();
  const { error } = await client.from("outbox_jobs").insert({
    id: operationId,
    workspace_id: receipt.workspace_id,
    job_type: "extract_receipt",
    dedupe_key: `extract:${receipt.id}:${receipt.revision}:${receipt.content_hash}`,
    payload: { receiptId: receipt.id, revision: receipt.revision, contentHash: receipt.content_hash },
    state: "pending",
  });
  if (error) return jsonError(409, "INVALID_INPUT", error.message);
  return Response.json({ operationId }, { status: 202 });
}
