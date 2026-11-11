import { guardMutation, jsonError, readJson } from "@/server/http";
import { providerStatus } from "@/server/config";
import { userClient } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guardMutation(req, `submit:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (body?.mode === "demo") return jsonError(403, "FORBIDDEN", "Demo identifiers have no authority on provider routes.");
  if (!providerStatus().supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  const { id } = await context.params;
  const { data: claim } = await supabase.from("claims").select("id, revision, claimant_id").eq("id", id).maybeSingle();
  if (!claim || claim.claimant_id !== user.id) return jsonError(404, "NOT_FOUND", "Claim not found.");
  if (body?.revision != null && body.revision !== claim.revision) return jsonError(409, "STALE_REVISION", "Reload the claim before submitting.");
  const { error } = await supabase.from("claims").update({
    review_status: "submitted",
    submitted_at: new Date().toISOString(),
    policy_version_id: body?.policyVersionId ?? null,
    revision: claim.revision + 1,
  }).eq("id", id).eq("revision", claim.revision);
  if (error) return jsonError(409, "STALE_REVISION", error.message);
  return Response.json({ id, status: "submitted" });
}
