import { describe, expect, it } from "vitest";
import { sumBalances } from "@/domain/balances";
import { applyCanonical, planPayout } from "@/domain/payouts";
import { recordWebhook } from "@/domain/webhooks";
import { enqueueJob, leaseJobs, type OutboxJob } from "@/domain/outbox";
import type { Destination, LedgerLine } from "@/domain/types";

const destination: Destination = {
  id: "dest",
  workspaceId: "ws",
  claimantId: "maya",
  version: 1,
  email: "maya.chen.demo@sandbox.test",
  status: "verified",
};

const fare: LedgerLine = {
  id: "fare",
  workspaceId: "ws",
  claimId: "TP-1042",
  claimantId: "maya",
  reviewState: "approved",
  claimedAmount: 2400,
  approvedAmount: 2400,
  currency: "USD",
  revision: 1,
};

function item(raw: string, observedAt: string, amount = 2400) {
  return {
    senderBatchId: "tpb_pay_1",
    senderItemId: "tpi_pay_1",
    providerBatchId: "B",
    providerItemId: "I",
    amount,
    currency: "USD",
    receiverEmail: destination.email,
    rawStatus: raw,
    observedAt,
  };
}

describe("out-of-order provider events", () => {
  it("keeps the latest canonical outcome and does not double-settle a duplicate event", () => {
    const planned = planPayout({
      workspaceId: "ws",
      actorId: "alex",
      payoutId: "pay_1",
      claimId: "TP-1042",
      destination,
      expectedDestinationVersion: 1,
      lines: [{ lineId: "fare", amount: 2400 }],
      ledger: [fare],
      payouts: [],
      idempotencyKey: "k",
      idempotency: [],
      now: "2025-01-18T21:00:00.000Z",
    });
    if (!planned.ok) throw new Error(planned.message);
    const success = applyCanonical(planned.payout, item("SUCCESS", "2025-01-18T21:05:00.000Z"));
    const olderPending = applyCanonical(success.payout, item("PENDING", "2025-01-18T21:01:00.000Z"));
    expect(olderPending.applied).toBe(false);
    expect(olderPending.reason).toBe("STALE_OBSERVATION");
    expect(sumBalances([fare], [olderPending.payout]).paid).toBe(2400);

    const returned = applyCanonical(success.payout, item("RETURNED", "2025-01-18T22:00:00.000Z"));
    expect(returned.payout.status).toBe("returned");
    expect(returned.payout.allocations[0]?.state).toBe("released");
    expect(sumBalances([fare], [returned.payout]).paid).toBe(0);

    const staleSuccess = applyCanonical(returned.payout, item("SUCCESS", "2025-01-18T21:05:00.000Z"));
    expect(staleSuccess.applied).toBe(false);
    expect(sumBalances([fare], [staleSuccess.payout]).paid).toBe(0);

    const seen = new Set<string>();
    const first = recordWebhook(seen, { id: "WH-1", provider: "paypal", eventType: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", senderBatchId: "tpb_pay_1", receivedAt: "2025-01-18T21:06:00.000Z" });
    const second = recordWebhook(seen, { id: "WH-1", provider: "paypal", eventType: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", senderBatchId: "tpb_pay_1", receivedAt: "2025-01-18T21:07:00.000Z" });
    expect(first.shouldReconcile).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.shouldReconcile).toBe(false);

    const duplicateApply = applyCanonical(success.payout, item("SUCCESS", "2025-01-18T21:05:00.000Z"));
    expect(duplicateApply.applied).toBe(false);
    expect(sumBalances([fare], [success.payout]).paid).toBe(2400);
  });

  it("leases an expired job again and preserves a live lease", () => {
    const job: OutboxJob = {
      id: "job_1",
      workspaceId: "ws",
      jobType: "reconcile_payout",
      dedupeKey: "reconcile:pay_1:WH-1",
      payload: {},
      state: "pending",
      attempts: 0,
      leaseExpiresAt: null,
      lastError: null,
      leaseOwner: null,
    };
    const leased = leaseJobs([job], "2025-01-18T21:00:00.000Z", "worker-a", 5, 30_000);
    expect(leased[0]?.state).toBe("leased");
    expect(leased[0]?.attempts).toBe(1);
    const blocked = leaseJobs(leased, "2025-01-18T21:00:10.000Z", "worker-b", 5, 30_000);
    expect(blocked[0]?.leaseOwner).toBe("worker-a");
    const recovered = leaseJobs(leased, "2025-01-18T21:01:00.000Z", "worker-b", 5, 30_000);
    expect(recovered[0]?.leaseOwner).toBe("worker-b");
    expect(recovered[0]?.attempts).toBe(2);
    const again = enqueueJob(recovered, { ...job, id: "job_2", state: "pending" });
    expect(again).toHaveLength(1);
  });
});
