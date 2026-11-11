import { describe, expect, it } from "vitest";
import { sumBalances } from "@/domain/balances";
import {
  PAYPAL_DUPLICATE_WINDOW_MS,
  applyCanonical,
  applySubmitResult,
  availableToReserve,
  planPayout,
  retryDecision,
  toPublicPayout,
} from "@/domain/payouts";
import type { Destination, IdempotencyRecord, LedgerLine, Payout } from "@/domain/types";

const now = "2025-01-18T21:00:00.000Z";
const destination: Destination = {
  id: "dest_maya",
  workspaceId: "ws_a",
  claimantId: "maya",
  version: 1,
  email: "maya.chen.demo@sandbox.test",
  status: "verified",
};

function line(id: string, review: LedgerLine["reviewState"], approved: number, claimed = approved): LedgerLine {
  return {
    id,
    workspaceId: "ws_a",
    claimId: "TP-1042",
    claimantId: "maya",
    reviewState: review,
    claimedAmount: claimed,
    approvedAmount: approved,
    currency: "USD",
    revision: 2,
  };
}

function plan(lines: { lineId: string; amount: number }[], ledger: LedgerLine[], payouts: Payout[] = [], key = "key-1", dest = destination) {
  return planPayout({
    workspaceId: "ws_a",
    actorId: "alex",
    payoutId: "pay_1",
    claimId: "TP-1042",
    destination: dest,
    expectedDestinationVersion: dest.version,
    lines,
    ledger,
    payouts,
    idempotencyKey: key,
    idempotency: payouts.flatMap((payout): IdempotencyRecord[] =>
      payout.idempotencyKey
        ? [{ key: payout.idempotencyKey, actorId: "alex", payloadHash: payout.payloadHash, payoutId: payout.id }]
        : [],
    ),
    now,
  });
}

describe("payout retries and reservations", () => {
  it("reserves the approved fare once and refuses a declined or open line", () => {
    const ledger = [line("fare", "approved", 2400, 2400), line("supplies", "submitted", 0, 1600), line("bad", "declined", 0, 500)];
    const first = plan([{ lineId: "fare", amount: 2400 }, { lineId: "supplies", amount: 1600 }], ledger);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.code).toBe("LINE_NOT_PAYABLE");

    const declined = plan([{ lineId: "bad", amount: 500 }], ledger);
    expect(declined.ok).toBe(false);

    const fare = plan([{ lineId: "fare", amount: 2400 }], ledger);
    expect(fare.ok).toBe(true);
    if (!fare.ok) return;
    expect(fare.payout.amount).toBe(2400);
    expect(fare.payout.lineIds).toEqual(["fare"]);
    expect(fare.payout.allocations.every((allocation) => allocation.state === "reserved")).toBe(true);
    expect(fare.payout.senderBatchId).toBe("tpb_pay_1");
    expect(fare.payout.note).toBe("Volunteer reimbursement");

    const replay = planPayout({
      workspaceId: "ws_a",
      actorId: "alex",
      payoutId: "pay_other",
      claimId: "TP-1042",
      destination,
      expectedDestinationVersion: 1,
      lines: [{ lineId: "fare", amount: 2400 }],
      ledger,
      payouts: [fare.payout],
      idempotencyKey: "key-1",
      idempotency: [fare.idempotency],
      now,
    });
    expect(replay.ok && replay.replay && replay.payout.id).toBe("pay_1");
    expect(availableToReserve(ledger[0], [fare.payout])).toBe(0);
  });

  it("keeps an unknown outcome reserved and reuses the sender batch id inside 30 days", () => {
    const ledger = [line("fare", "approved", 2400)];
    const created = plan([{ lineId: "fare", amount: 2400 }], ledger);
    if (!created.ok) throw new Error("plan failed");
    const unknown = applySubmitResult(created.payout, { type: "uncertain", message: "timeout" }, now);
    expect(unknown.status).toBe("outcome_unknown");
    expect(unknown.allocations[0]?.state).toBe("reserved");
    expect(retryDecision(unknown, Date.parse(now))).toBe("same_batch");
    expect(unknown.senderBatchId).toBe(created.payout.senderBatchId);
    const later = Date.parse(now) + PAYPAL_DUPLICATE_WINDOW_MS + 1000;
    expect(retryDecision(unknown, later)).toBe("reconcile_first");
    const balances = sumBalances(ledger, [unknown]);
    expect(balances.paid).toBe(0);
    expect(balances.inProgress).toBe(2400);
  });

  it("releases a definitive failure and allows a new operation, while a mismatched item stays unknown", () => {
    const ledger = [line("fare", "approved", 2400)];
    const created = plan([{ lineId: "fare", amount: 2400 }], ledger);
    if (!created.ok) throw new Error("plan failed");
    const rejected = applySubmitResult(created.payout, { type: "rejected", message: "receiver invalid" }, now);
    expect(rejected.status).toBe("failed");
    expect(rejected.allocations[0]?.state).toBe("released");
    expect(availableToReserve(ledger[0], [rejected])).toBe(2400);

    const accepted = applySubmitResult(created.payout, { type: "accepted", providerBatchId: "B1", providerItemId: "I1", rawStatus: "SUCCESS" }, now);
    expect(accepted.status).toBe("pending");
    const mismatch = applyCanonical(accepted, {
      senderBatchId: accepted.senderBatchId,
      senderItemId: accepted.senderItemId,
      providerBatchId: "B1",
      providerItemId: "I1",
      amount: 1600,
      currency: "USD",
      receiverEmail: destination.email,
      rawStatus: "SUCCESS",
      observedAt: "2025-01-18T21:10:00.000Z",
    });
    expect(mismatch.payout.status).toBe("outcome_unknown");
    expect(mismatch.payout.allocations[0]?.state).toBe("reserved");
    const pub = toPublicPayout(accepted, "PayPal Sandbox");
    expect(JSON.stringify(pub)).not.toContain(destination.email);
    expect(pub.recipientMasked).toBe("m••••@sandbox.test");
    expect(pub.modeLabel).toBe("PayPal Sandbox");
  });

  it("keeps the original destination when a newer version is issued", () => {
    const ledger = [line("fare", "approved", 2400)];
    const created = plan([{ lineId: "fare", amount: 2400 }], ledger);
    if (!created.ok) throw new Error("plan failed");
    const nextDest = { ...destination, version: 2, email: "maya.v2.demo@sandbox.test" };
    const stale = plan([{ lineId: "fare", amount: 2400 }], ledger, [created.payout], "key-2", nextDest);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("NOTHING_PAYABLE");
    expect(created.payout.destinationVersion).toBe(1);
    expect(created.payout.recipientEmail).toBe(destination.email);
  });
});
