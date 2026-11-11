import { guardMutation, jsonError } from "@/server/http";
import { providerStatus } from "@/server/config";
import { userClient } from "@/server/auth";
import { receiptObjectKey } from "@/domain/tenant";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guardMutation(req, `upload:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  if (!providerStatus().supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  const workspaceId = process.env.TRIALPULSE_WORKSPACE_ID;
  if (!workspaceId) return jsonError(503, "WORKSPACE_UNAVAILABLE", "TRIALPULSE_WORKSPACE_ID is not set.");
  const { id } = await context.params;
  const { data: claim } = await supabase.from("claims").select("id").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!claim) return jsonError(404, "NOT_FOUND", "Claim not found in this workspace.");
  const receiptId = crypto.randomUUID();
  const key = receiptObjectKey(workspaceId, receiptId, "receipt");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "receipts";
  const signed = await supabase.storage.from(bucket).createSignedUploadUrl(key);
  if (signed.error || !signed.data) return jsonError(503, "PROVIDER_UNAVAILABLE", signed.error?.message || "Could not allocate a private upload.");
  return Response.json({ receiptId, objectKey: key, uploadUrl: signed.data.signedUrl, token: signed.data.token });
}
