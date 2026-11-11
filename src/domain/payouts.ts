import { hashString, stableStringify } from "./hash";
import { assertCents } from "./money";
import { maskEmail } from "./mask";
import type { Cents } from "./money";
import type { Destination, IdempotencyRecord, Payout, PublicPayout } from "./types";
import type { LedgerLine } from "./types";

export const PAYPAL_DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const GENERIC_PAYOUT_NOTE = "Volunteer reimbursement";

export type PayoutCode =
  | "INVALID_INPUT"
  | "NOTHING_PAYABLE"
  | "LINE_NOT_PAYABLE"
  | "AMOUNT_MISMATCH"
  | "DESTINATION_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "STALE_REVISION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RETRY_WINDOW_EXPIRED"
  | "NOT_RETRYABLE";

export type PlanResult =
  | { ok: true; payout: Payout; idempotency: IdempotencyRecord; replay: boolean }
  | { ok: false; code: PayoutCode; message: string };

export interface PlanInput {
  workspaceId: string;
  actorId: string;
  payoutId: string;
  claimId: string;
  destination: Destination;
  expectedDestinationVersion: number;
  lines: { lineId: string; amount: Cents }[];
  ledger: LedgerLine[];
  payouts: Payout[];
  idempotencyKey: string;
  idempotency: IdempotencyRecord[];
  now: string;
}

export type SubmitAdapterResult =
  | { type: "accepted"; providerBatchId: string; providerItemId: string | null; rawStatus: string }
  | { type: "duplicate"; providerBatchId: string | null }
  | { type: "not_configured"; message: string }
  | { type: "rejected"; message: string }
  | { type: "uncertain"; message: string };

export interface CanonicalItem {
  senderBatchId: string;
  senderItemId: string;
  providerBatchId: string | null;
  providerItemId: string | null;
  amount: Cents;
  currency: string;
  receiverEmail: string;
  rawStatus: string;
  observedAt: string;
}

function fail(code: PayoutCode, message: string): PlanResult {
  return { ok: false, code, message };
}

export function reservedForLine(lineId: string, payouts: Payout[]): Cents {
  let total = 0;
  for (const payout of payouts) {
    for (const allocation of payout.allocations) {
      if (allocation.lineId === lineId && allocation.state !== "released") total += allocation.amount;
    }
  }
  return total;
}

/** Unpaid and unreserved portion of an approved line. Declined and open lines contribute nothing. */
export function availableToReserve(line: LedgerLine, payouts: Payout[]): Cents {
  if (line.reviewState !== "approved" || line.currency !== "USD") return 0;
  return Math.max(0, line.approvedAmount - reservedForLine(line.id, payouts));
}

export function canonicalPayoutPayload(input: {
  workspaceId: string;
  destinationId: string;
  destinationVersion: number;
  lines: { lineId: string; amount: Cents }[];
}) {
  const lines = [...input.lines].sort((a, b) => a.lineId.localeCompare(b.lineId));
  return {
    workspaceId: input.workspaceId,
    destinationId: input.destinationId,
    destinationVersion: input.destinationVersion,
    currency: "USD" as const,
    lines,
  };
}

/**
 * Reserve only the unpaid, unreserved portion of each approved line.
 * Callers lock ledger rows in line-id order before committing this plan.
 */
export function planPayout(input: PlanInput): PlanResult {
  if (input.lines.length === 0) return fail("INVALID_INPUT", "Choose at least one approved line.");
  if (input.destination.workspaceId !== input.workspaceId) {
    return fail("FORBIDDEN", "Destination is outside this workspace.");
  }
  if (input.destination.status !== "verified") {
    return fail("DESTINATION_MISMATCH", "Recipient is not a verified payout destination.");
  }
  if (input.destination.version !== input.expectedDestinationVersion) {
    return fail("STALE_REVISION", "The recipient destination changed. Confirm the new version.");
  }

  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(line.lineId)) return fail("INVALID_INPUT", "A line can appear only once in a payout.");
    seen.add(line.lineId);
    try {
      assertCents(line.amount);
    } catch {
      return fail("INVALID_INPUT", "Amounts must be integer cents.");
    }
    if (line.amount <= 0) return fail("INVALID_INPUT", "Payout amounts must be positive.");
  }

  const orderedLines = [...seen]
    .sort((a, b) => a.localeCompare(b))
    .map((lineId) => ({ lineId, amount: input.lines.find((entry) => entry.lineId === lineId)!.amount }));
  const payload = canonicalPayoutPayload({
    workspaceId: input.workspaceId,
    destinationId: input.destination.id,
    destinationVersion: input.expectedDestinationVersion,
    lines: orderedLines,
  });
  const payloadHash = hashString(stableStringify(payload));
  const existing = input.idempotency.find((record) => record.key === input.idempotencyKey && record.actorId === input.actorId);
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      return fail("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different payout.");
    }
    const payout = input.payouts.find((item) => item.id === existing.payoutId);
    if (!payout) return fail("NOT_FOUND", "The payout for this idempotency key is missing.");
    return { ok: true, payout, idempotency: existing, replay: true };
  }

  const ledgerById = new Map(input.ledger.map((line) => [line.id, line]));
  let claimantId: string | null = null;
  for (const requested of orderedLines) {
    const line = ledgerById.get(requested.lineId);
    if (!line || line.workspaceId !== input.workspaceId) {
      return fail("NOT_FOUND", "A selected line is not in this workspace.");
    }
    if (line.reviewState !== "approved") {
      return fail("LINE_NOT_PAYABLE", `Line ${requested.lineId} is ${line.reviewState} and cannot be paid.`);
    }
    if (claimantId && claimantId !== line.claimantId) {
      return fail("INVALID_INPUT", "A payout snapshot can include one recipient.");
    }
    claimantId = line.claimantId;
    const available = availableToReserve(line, input.payouts);
    if (available === 0) return fail("NOTHING_PAYABLE", `Line ${requested.lineId} has no unpaid approved amount.`);
    if (requested.amount !== available) {
      return fail("AMOUNT_MISMATCH", `Line ${requested.lineId} can reserve ${available} cents, not ${requested.amount}.`);
    }
  }

  if (!claimantId || claimantId !== input.destination.claimantId) {
    return fail("DESTINATION_MISMATCH", "The verified destination belongs to a different claimant.");
  }

  const amount = orderedLines.reduce((total, line) => total + line.amount, 0);
  const payout: Payout = {
    id: input.payoutId,
    workspaceId: input.workspaceId,
    claimantId,
    claimId: input.claimId,
    destinationId: input.destination.id,
    destinationVersion: input.destination.version,
    recipientEmail: input.destination.email,
    amount,
    currency: "USD",
    status: "queued",
    senderBatchId: `tpb_${input.payoutId}`,
    senderItemId: `tpi_${input.payoutId}`,
    providerBatchId: null,
    providerItemId: null,
    providerRawStatus: null,
    idempotencyKey: input.idempotencyKey,
    payloadHash,
    createdAt: input.now,
    updatedAt: input.now,
    lastObservationAt: null,
    allocations: orderedLines.map((line, index) => ({
      id: `alloc_${input.payoutId}_${index}`,
      payoutId: input.payoutId,
      lineId: line.lineId,
      amount: line.amount,
      currency: "USD",
      state: "reserved",
    })),
    lineIds: orderedLines.map((line) => line.lineId),
    note: GENERIC_PAYOUT_NOTE,
    lastError: null,
  };
  return {
    ok: true,
    payout,
    replay: false,
    idempotency: { key: input.idempotencyKey, actorId: input.actorId, payloadHash, payoutId: payout.id },
  };
}

export function retryDecision(payout: Payout, nowMs: number): "same_batch" | "reconcile_first" | "not_retryable" {
  if (payout.status === "succeeded" || payout.status === "returned" || payout.status === "failed") return "not_retryable";
  if (payout.status === "queued") return "same_batch";
  const age = nowMs - Date.parse(payout.createdAt);
  if (payout.status === "submitting" || payout.status === "pending" || payout.status === "outcome_unknown") {
    return age <= PAYPAL_DUPLICATE_WINDOW_MS ? "same_batch" : "reconcile_first";
  }
  return "not_retryable";
}

export function mapProviderStatus(raw: string): "succeeded" | "pending" | "failed" | "returned" | "outcome_unknown" {
  switch (raw.toUpperCase()) {
    case "SUCCESS":
      return "succeeded";
    case "PENDING":
    case "PROCESSING":
    case "ONHOLD":
    case "UNCLAIMED":
    case "SUCCESS_PENDING":
      return "pending";
    case "FAILED":
    case "BLOCKED":
    case "DENIED":
      return "failed";
    case "RETURNED":
    case "REFUNDED":
    case "REVERSED":
      return "returned";
    default:
      return "outcome_unknown";
  }
}

function touch(payout: Payout, now: string, patch: Partial<Payout>): Payout {
  return { ...payout, ...patch, updatedAt: now };
}

function setAllocationState(payout: Payout, state: Payout["allocations"][number]["state"]): Payout["allocations"] {
  return payout.allocations.map((allocation) => ({ ...allocation, state }));
}

export function markSubmitting(payout: Payout, now: string): Payout {
  if (payout.status !== "queued" && payout.status !== "outcome_unknown" && payout.status !== "submitting") return payout;
  return touch(payout, now, { status: "submitting" });
}

/** An accepted batch is submission, not payment. Paid is applied only from a matching canonical item. */
export function applySubmitResult(payout: Payout, result: SubmitAdapterResult, now: string): Payout {
  if (result.type === "not_configured") {
    return touch(payout, now, { status: "queued", lastError: result.message });
  }
  if (result.type === "rejected") {
    return touch(payout, now, {
      status: "failed",
      providerRawStatus: "FAILED",
      lastError: result.message,
      allocations: setAllocationState(payout, "released"),
    });
  }
  if (result.type === "uncertain") {
    return touch(payout, now, { status: "outcome_unknown", lastError: result.message });
  }
  if (result.type === "duplicate") {
    return touch(payout, now, {
      status: "pending",
      providerBatchId: result.providerBatchId ?? payout.providerBatchId,
      providerRawStatus: payout.providerRawStatus ?? "DUPLICATE",
      lastError: null,
    });
  }
  return touch(payout, now, {
    status: "pending",
    providerBatchId: result.providerBatchId,
    providerItemId: result.providerItemId ?? payout.providerItemId,
    providerRawStatus: result.rawStatus,
    lastError: null,
  });
}

export function applyCanonical(payout: Payout, item: CanonicalItem): { payout: Payout; applied: boolean; reason: string } {
  if (item.senderBatchId !== payout.senderBatchId || item.senderItemId !== payout.senderItemId) {
    return { payout, applied: false, reason: "SENDER_MISMATCH" };
  }
  if (payout.lastObservationAt && Date.parse(item.observedAt) < Date.parse(payout.lastObservationAt)) {
    return { payout, applied: false, reason: "STALE_OBSERVATION" };
  }
  if (
    payout.lastObservationAt &&
    Date.parse(item.observedAt) === Date.parse(payout.lastObservationAt) &&
    payout.providerRawStatus === item.rawStatus
  ) {
    return { payout, applied: false, reason: "DUPLICATE_OBSERVATION" };
  }

  const amountMatches = item.amount === payout.amount && item.currency.toUpperCase() === payout.currency;
  const destinationMatches = item.receiverEmail.trim().toLowerCase() === payout.recipientEmail.trim().toLowerCase();
  const base = {
    providerBatchId: item.providerBatchId ?? payout.providerBatchId,
    providerItemId: item.providerItemId ?? payout.providerItemId,
    providerRawStatus: item.rawStatus,
    lastObservationAt: item.observedAt,
    updatedAt: item.observedAt,
  };

  if (!amountMatches || !destinationMatches) {
    return {
      applied: true,
      reason: "MISMATCH",
      payout: {
        ...payout,
        ...base,
        status: "outcome_unknown",
        lastError: "Provider item did not match the frozen amount, currency, or destination.",
      },
    };
  }

  const mapped = mapProviderStatus(item.rawStatus);
  if (mapped === "succeeded") {
    return {
      applied: true,
      reason: "SUCCEEDED",
      payout: { ...payout, ...base, status: "succeeded", lastError: null, allocations: setAllocationState(payout, "settled") },
    };
  }
  if (mapped === "failed" || mapped === "returned") {
    return {
      applied: true,
      reason: mapped === "failed" ? "FAILED" : "RETURNED",
      payout: {
        ...payout,
        ...base,
        status: mapped,
        lastError: null,
        allocations: setAllocationState(payout, "released"),
      },
    };
  }
  if (mapped === "outcome_unknown") {
    return {
      applied: true,
      reason: "UNKNOWN",
      payout: {
        ...payout,
        ...base,
        status: "outcome_unknown",
        lastError: "Unrecognized provider status. The allocation stays reserved.",
      },
    };
  }
  return {
    applied: true,
    reason: "PENDING",
    payout: { ...payout, ...base, status: "pending", lastError: null },
  };
}

export function toPublicPayout(payout: Payout, mode: PublicPayout["modeLabel"]): PublicPayout {
  return {
    id: payout.id,
    workspaceId: payout.workspaceId,
    claimantId: payout.claimantId,
    claimId: payout.claimId,
    destinationId: payout.destinationId,
    destinationVersion: payout.destinationVersion,
    recipientMasked: maskEmail(payout.recipientEmail),
    amount: payout.amount,
    currency: payout.currency,
    status: payout.status,
    senderBatchId: payout.senderBatchId,
    senderItemId: payout.senderItemId,
    providerBatchId: payout.providerBatchId,
    providerItemId: payout.providerItemId,
    providerRawStatus: payout.providerRawStatus,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
    lineIds: payout.lineIds,
    allocations: payout.allocations.map((allocation) => ({ ...allocation })),
    note: payout.note,
    lastError: payout.lastError,
    modeLabel: mode,
  };
}

export function payoutBodyContainsSensitiveDetail(body: string): boolean {
  const lowered = body.toLowerCase();
  const forbidden = ["receipt", "diagnosis", "medical", "program", "pantry", "trialpulse claim"];
  return forbidden.some((term) => lowered.includes(term));
}
