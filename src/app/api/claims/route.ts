import { guardMutation, jsonError, readJson } from "@/server/http";
import { providerStatus } from "@/server/config";
import { userClient } from "@/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = await guardMutation(req, `claims:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (!body?.activityId) return jsonError(400, "INVALID_INPUT", "Choose an activity.");
  if (body.mode === "demo") return jsonError(403, "FORBIDDEN", "Demo identifiers have no authority on provider routes.");
  if (!providerStatus().supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  const workspaceId = process.env.TRIALPULSE_WORKSPACE_ID;
  const { data: activity } = await supabase.from("activities").select("id, program_id").eq("id", body.activityId).eq("workspace_id", workspaceId).maybeSingle();
  if (!activity) return jsonError(404, "NOT_FOUND", "Activity not found in this workspace.");
  const { data, error } = await supabase.from("claims").insert({
    workspace_id: workspaceId,
    program_id: activity.program_id,
    claimant_id: user.id,
    activity_id: activity.id,
    public_id: `TP-${Date.now()}`,
    review_status: "draft",
  }).select("id, public_id, revision").single();
  if (error) return jsonError(409, "INVALID_INPUT", error.message);
  return Response.json({ claim: data }, { status: 201 });
}
