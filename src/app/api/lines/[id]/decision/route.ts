import { guardMutation, jsonError, readJson } from "@/server/http";
import { providerStatus } from "@/server/config";
import { userClient } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const blocked = await guardMutation(req, `decision:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (!body || typeof body.revision !== "number" || typeof body.outcome !== "string") {
    return jsonError(400, "INVALID_INPUT", "Expected a revision and an outcome.");
  }
  if (body.mode === "demo") return jsonError(403, "FORBIDDEN", "Demo identifiers have no authority on provider routes.");
  if (!providerStatus().supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  const { id } = await context.params;
  const { data: line } = await supabase.from("claim_lines").select("id, revision, workspace_id").eq("id", id).maybeSingle();
  if (!line) return jsonError(404, "NOT_FOUND", "Line not found in this workspace.");
  if (line.revision !== body.revision) return jsonError(409, "STALE_REVISION", "This line changed. Reload it and decide again.");
  const { error } = await supabase.from("review_decisions").insert({
    workspace_id: line.workspace_id,
    line_id: id,
    actor_id: user.id,
    outcome: body.outcome,
    amount: Number(body.amount ?? 0),
    reason: String(body.reason ?? ""),
    policy_version_id: body.policyVersionId ?? null,
  });
  if (error) return jsonError(409, "INVALID_INPUT", error.message);
  await supabase.from("claim_lines").update({
    review_state: body.outcome,
    approved_amount: body.outcome === "approved" ? Number(body.amount ?? 0) : 0,
    revision: line.revision + 1,
  }).eq("id", id).eq("revision", line.revision);
  return Response.json({ id, revision: line.revision + 1 });
}
