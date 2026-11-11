import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyCanonical, applySubmitResult, markSubmitting, retryDecision, type CanonicalItem } from "../src/domain/payouts";
import type { Allocation, Payout } from "../src/domain/types";
import { finishExtractionJob } from "../src/server/extraction-job";
import { extractWithGemini, parseGeminiReceipt, readGeminiConfig } from "../src/server/gemini";
import { prepareEvidence } from "../src/server/media";
import { createPayPalAdapter, readPayPalConfig } from "../src/server/paypal";
import { checkSenderCredentials, runFixtureScenario } from "../src/server/worker";

const fixture = process.argv.includes("--fixture");
const once = process.argv.includes("--once");
const LEASE_MS = 60_000;

async function main() {
  if (fixture || (!process.env.PAYPAL_CLIENT_ID && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    const report = runFixtureScenario();
    console.log(report.lines.join("\n"));
    console.log("\nStill to verify against Sandbox:");
    for (const item of report.remains) console.log(`- ${item}`);
    process.exit(fixture ? 0 : 2);
  }

  const sender = await checkSenderCredentials();
  console.log(sender.detail);
  if (!sender.ok) process.exit(2);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required to lease jobs.");
    process.exit(2);
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  if (once) {
    const count = await drainOnce(client);
    console.log(`Processed ${count} job(s).`);
    process.exit(0);
  }

  console.log("Reconciliation worker leasing outbox jobs. Restart preserves leased work after the lease expires.");
  for (;;) {
    const count = await drainOnce(client);
    if (count === 0) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function drainOnce(client: SupabaseClient): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("outbox_jobs")
    .select("*")
    .in("state", ["pending", "failed", "leased"])
    .order("id", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  const due = (data ?? []).filter((job) => job.state !== "leased" || !job.lease_expires_at || job.lease_expires_at <= now).slice(0, 5);
  let processed = 0;
  for (const job of due) {
    const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
    const { data: leased } = await client
      .from("outbox_jobs")
      .update({
        state: "leased",
        attempts: (job.attempts ?? 0) + 1,
        lease_expires_at: leaseUntil,
        lease_owner: "trialpulse-worker",
      })
      .eq("id", job.id)
      .eq("state", job.state)
      .select("id")
      .maybeSingle();
    if (!leased) continue;
    try {
      if (job.job_type === "submit_payout" || job.job_type === "reconcile_payout") {
        await settlePayoutJob(client, String(job.payload?.payoutId ?? ""), job.job_type);
      } else if (job.job_type === "extract_receipt") {
        await settleExtractionJob(client, job.payload as { receiptId?: string; revision?: number; contentHash?: string });
      } else {
        throw new Error(`Unknown job type ${job.job_type}`);
      }
      await client.from("outbox_jobs").update({ state: "succeeded", last_error: null, lease_expires_at: null }).eq("id", job.id);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job failed";
      const attempts = (job.attempts ?? 0) + 1;
      await client
        .from("outbox_jobs")
        .update({
          state: attempts >= 8 ? "dead" : "failed",
          last_error: message.slice(0, 400),
          lease_expires_at: null,
        })
        .eq("id", job.id);
      console.error(`Job ${job.id} ${job.job_type}: ${message}`);
    }
  }
  return processed;
}

function rowToPayout(row: Record<string, unknown>, allocations: Allocation[]): Payout {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    claimantId: String(row.claimant_id),
    claimId: String(row.claim_id),
    destinationId: String(row.destination_id),
    destinationVersion: Number(row.destination_version),
    recipientEmail: String(row.recipient_email),
    amount: Number(row.amount),
    currency: "USD",
    status: row.status as Payout["status"],
    senderBatchId: String(row.sender_batch_id),
    senderItemId: String(row.sender_item_id),
    providerBatchId: row.provider_batch_id ? String(row.provider_batch_id) : null,
    providerItemId: row.provider_item_id ? String(row.provider_item_id) : null,
    providerRawStatus: row.provider_raw_status ? String(row.provider_raw_status) : null,
    idempotencyKey: String(row.idempotency_key),
    payloadHash: String(row.payload_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastObservationAt: row.last_observation_at ? String(row.last_observation_at) : null,
    allocations,
    lineIds: allocations.map((allocation) => allocation.lineId),
    note: String(row.note),
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

async function loadPayout(client: SupabaseClient, payoutId: string): Promise<Payout> {
  const { data: row, error } = await client.from("payouts").select("*").eq("id", payoutId).maybeSingle();
  if (error || !row) throw new Error(error?.message || "Payout not found");
  const { data: allocations, error: allocationError } = await client.from("payout_allocations").select("*").eq("payout_id", payoutId);
  if (allocationError) throw new Error(allocationError.message);
  return rowToPayout(
    row,
    (allocations ?? []).map((allocation) => ({
      id: String(allocation.id),
      payoutId,
      lineId: String(allocation.line_id),
      amount: Number(allocation.amount),
      currency: "USD" as const,
      state: allocation.state,
    })),
  );
}

async function savePayout(client: SupabaseClient, payout: Payout) {
  const { error } = await client
    .from("payouts")
    .update({
      status: payout.status,
      provider_batch_id: payout.providerBatchId,
      provider_item_id: payout.providerItemId,
      provider_raw_status: payout.providerRawStatus,
      last_error: payout.lastError,
      last_observation_at: payout.lastObservationAt,
      updated_at: payout.updatedAt,
    })
    .eq("id", payout.id);
  if (error) throw new Error(error.message);
  for (const allocation of payout.allocations) {
    const { error: allocationError } = await client.from("payout_allocations").update({ state: allocation.state }).eq("id", allocation.id);
    if (allocationError) throw new Error(allocationError.message);
  }
}

async function settlePayoutJob(client: SupabaseClient, payoutId: string, jobType: string) {
  if (!payoutId) throw new Error("Payout job is missing payoutId");
  const payout = await loadPayout(client, payoutId);
  const now = new Date().toISOString();
  const adapter = createPayPalAdapter(readPayPalConfig());
  if (jobType === "submit_payout") {
    const decision = retryDecision(payout, Date.now());
    if (decision === "not_retryable") return;
    if (decision === "reconcile_first") {
      await reconcile(client, payout, now);
      return;
    }
    const submitting = markSubmitting(payout, now);
    await savePayout(client, submitting);
    const result = await adapter.submit(submitting);
    const next = applySubmitResult(submitting, result, new Date().toISOString());
    await savePayout(client, next);
    if (next.providerItemId && (next.status === "pending" || next.status === "outcome_unknown")) {
      await reconcile(client, next, new Date().toISOString());
    }
    return;
  }
  await reconcile(client, payout, now);
}

async function reconcile(client: SupabaseClient, payout: Payout, now: string) {
  const adapter = createPayPalAdapter(readPayPalConfig());
  const item = await adapter.getItem(payout);
  if ("uncertain" in item) {
    const held = applySubmitResult(payout, { type: "uncertain", message: item.uncertain }, now);
    await savePayout(client, held);
    throw new Error(item.uncertain);
  }
  const canonical: CanonicalItem = item;
  const applied = applyCanonical(payout, canonical);
  await savePayout(client, applied.payout);
}

async function settleExtractionJob(client: SupabaseClient, payload: { receiptId?: string; revision?: number; contentHash?: string }) {
  if (!payload.receiptId) throw new Error("Extraction job is missing receiptId");
  const { data: receipt, error } = await client.from("receipts").select("*").eq("id", payload.receiptId).maybeSingle();
  if (error || !receipt) throw new Error(error?.message || "Receipt not found");
  const config = readGeminiConfig();
  if (!config) throw new Error("Gemini is not configured. The receipt and any claimant edits were left unchanged.");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "receipts";
  const downloaded = await client.storage.from(bucket).download(String(receipt.object_key));
  if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message || "Could not read the private receipt.");
  const prepared = await prepareEvidence(new Uint8Array(await downloaded.data.arrayBuffer()));
  if ("error" in prepared) throw new Error(prepared.error);
  if (prepared.contentHash !== receipt.content_hash || receipt.revision !== payload.revision) {
    return;
  }
  const gemini = await extractWithGemini({ apiKey: config.apiKey, model: config.model, mimeType: prepared.mimeType, bytes: prepared.bytes });
  const { data: existing } = await client.from("extracted_fields").select("*").eq("receipt_id", receipt.id);
  const current = (existing ?? []).map((field) => ({
    name: String(field.field_name),
    candidateValue: field.candidate_value == null ? null : String(field.candidate_value),
    correctedValue: field.corrected_value == null ? null : String(field.corrected_value),
    region: field.region,
    sourceRevision: Number(field.source_revision),
    correctedAtRevision: field.corrected_at_revision == null ? null : Number(field.corrected_at_revision),
    status: field.status,
  }));
  const provider = "error" in gemini
    ? gemini
    : parseGeminiReceipt(gemini.text, {
        receiptId: String(receipt.id),
        contentHash: prepared.contentHash,
        revision: Number(receipt.revision),
        extractorVersion: config.model,
      });
  const finished = finishExtractionJob({
    fields: current,
    job: { id: String(receipt.id), receiptId: String(receipt.id), contentHash: String(receipt.content_hash), revision: Number(receipt.revision) },
    provider,
  });
  if (finished.status === "failed") throw new Error(finished.message || "Extraction failed");
  for (const field of finished.fields) {
    const { error: upsertError } = await client.from("extracted_fields").upsert(
      {
        workspace_id: receipt.workspace_id,
        receipt_id: receipt.id,
        field_name: field.name,
        candidate_value: field.candidateValue,
        corrected_value: field.correctedValue,
        region: field.region,
        source_revision: field.sourceRevision,
        corrected_at_revision: field.correctedAtRevision,
        status: field.status,
        extractor_version: config.model,
      },
      { onConflict: "receipt_id,field_name" },
    );
    if (upsertError) throw new Error(upsertError.message);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
