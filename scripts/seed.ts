import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SANDBOX_OPERATOR_EMAIL",
  "SANDBOX_OPERATOR_PASSWORD",
  "SANDBOX_CLAIMANT_EMAIL",
  "SANDBOX_CLAIMANT_PASSWORD",
  "SANDBOX_RECIPIENT_EMAIL",
  "PAYPAL_SENDER_EMAIL",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error("Seed did not run. Missing environment variables:");
  for (const name of missing) console.error(`- ${name}`);
  console.error("\nThe public demo does not need a seed. See .env.example.");
  process.exit(2);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function ensureUser(email: string, password: string) {
  const existing = await supabase.auth.admin.listUsers();
  const found = existing.data.users.find((user) => user.email === email);
  if (found) return found.id;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message || "Could not create user");
  return created.data.user.id;
}

async function main() {
const operatorId = await ensureUser(process.env.SANDBOX_OPERATOR_EMAIL!, process.env.SANDBOX_OPERATOR_PASSWORD!);
const claimantId = await ensureUser(process.env.SANDBOX_CLAIMANT_EMAIL!, process.env.SANDBOX_CLAIMANT_PASSWORD!);
const workspaceId = process.env.TRIALPULSE_WORKSPACE_ID || "11111111-1111-4111-8111-111111111111";

const { error: workspaceError } = await supabase.from("workspaces").upsert({ id: workspaceId, name: "Harborlight Volunteers" });
if (workspaceError) throw new Error(workspaceError.message);
for (const role of ["coordinator", "finance", "admin"]) {
  await supabase.from("memberships").upsert({ workspace_id: workspaceId, user_id: operatorId, role }, { onConflict: "workspace_id,user_id,role" });
}
await supabase.from("memberships").upsert({ workspace_id: workspaceId, user_id: claimantId, role: "claimant" }, { onConflict: "workspace_id,user_id,role" });

const programId = "22222222-2222-4222-8222-222222222222";
await supabase.from("programs").upsert({ id: programId, workspace_id: workspaceId, name: "Community Nutrition" });
const policyId = "33333333-3333-4333-8333-333333333333";
await supabase.from("policies").upsert({ id: policyId, workspace_id: workspaceId, program_id: programId, name: "Volunteer expense policy" });
await supabase.from("policy_versions").upsert({
  id: "44444444-4444-4444-8444-444444444444",
  workspace_id: workspaceId,
  policy_id: policyId,
  version: 1,
  currency: "USD",
  activity_window_days: 1,
  review_sla_hours: 48,
  categories: { transit: { cap: 4000 }, supplies: { cap: 2500 }, meals: { cap: 1500 } },
  effective_at: "2025-01-01T00:00:00.000Z",
});
const activityId = "55555555-5555-4555-8555-555555555555";
await supabase.from("activities").upsert({
  id: activityId,
  workspace_id: workspaceId,
  program_id: programId,
  name: "Community Pantry Shift",
  activity_date: "2025-01-18",
});
await supabase.from("attendance").upsert({
  workspace_id: workspaceId,
  activity_id: activityId,
  claimant_id: claimantId,
  status: "assigned",
}, { onConflict: "activity_id,claimant_id" });
await supabase.from("payout_destinations").upsert({
  id: "66666666-6666-4666-8666-666666666666",
  workspace_id: workspaceId,
  claimant_id: claimantId,
  version: 1,
  email: process.env.SANDBOX_RECIPIENT_EMAIL,
  status: "verified",
});

console.log(`Seeded workspace ${workspaceId}`);
console.log(`Sender ${process.env.PAYPAL_SENDER_EMAIL}`);
console.log(`Recipient ${process.env.SANDBOX_RECIPIENT_EMAIL}`);
console.log("Set TRIALPULSE_WORKSPACE_ID to the printed workspace id if you did not pass one.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
