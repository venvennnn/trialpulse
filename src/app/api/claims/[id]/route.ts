import { guardMutation, jsonError, readJson } from "@/server/http";
import { providerStatus } from "@/server/config";
import { userClient } from "@/server/auth";

export const runtime = "nodejs";

async function gate(req: Request) {
  const blocked = await guardMutation(req, `claim:${req.headers.get("x-forwarded-for") ?? "local"}`);
  if (blocked) return blocked;
  if (!providerStatus().supabase) return jsonError(503, "WORKSPACE_UNAVAILABLE", "Supabase is not configured.");
  const supabase = await userClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user || !supabase) return jsonError(401, "FORBIDDEN", "Sign in is required.");
  return { supabase, userId: user.id };
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const ready = await gate(req);
  if (ready instanceof Response) return ready;
  const body = await readJson(req);
  const { id } = await context.params;
  if (!body || typeof body.revision !== "number") return jsonError(400, "INVALID_INPUT", "Expected revision is required.");
  const { data: claim } = await ready.supabase.from("claims").select("revision").eq("id", id).maybeSingle();
  if (!claim) return jsonError(404, "NOT_FOUND", "Claim not found in this workspace.");
  if (claim.revision !== body.revision) return jsonError(409, "STALE_REVISION", "This claim changed. Reload it and save again.");
  const { error } = await ready.supabase.from("claims").update({ revision: claim.revision + 1 }).eq("id", id).eq("revision", body.revision);
  if (error) return jsonError(409, "STALE_REVISION", error.message);
  return Response.json({ id, revision: claim.revision + 1 });
}
