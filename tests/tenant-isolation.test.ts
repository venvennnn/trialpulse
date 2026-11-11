import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/money";
import { planPayout } from "@/domain/payouts";
import { assertCanReadObject, receiptObjectKey, rejectDemoAuthority } from "@/domain/tenant";
import { WorkspaceStore } from "@/server/memory";
import type { Destination, LedgerLine } from "@/domain/types";

describe("tenant isolation", () => {
  it("rejects foreign claims, receipt keys, and payouts", () => {
    const store = new WorkspaceStore();
    store.claims.set("claim_a", { id: "claim_a", workspaceId: "ws_a" });
    const key = store.putReceipt("ws_a", "receipt_a", "fare.png");
    store.payouts.set("pay_a", {
      id: "pay_a",
      workspaceId: "ws_a",
      claimantId: "maya",
      claimId: "claim_a",
      destinationId: "dest",
      destinationVersion: 1,
      recipientEmail: "maya.chen.demo@sandbox.test",
      amount: 2400,
      currency: "USD",
      status: "pending",
      senderBatchId: "tpb_pay_a",
      senderItemId: "tpi_pay_a",
      providerBatchId: null,
      providerItemId: null,
      providerRawStatus: null,
      idempotencyKey: "k",
      payloadHash: "h",
      createdAt: "2025-01-18T00:00:00.000Z",
      updatedAt: "2025-01-18T00:00:00.000Z",
      lastObservationAt: null,
      allocations: [],
      lineIds: [],
      note: "Volunteer reimbursement",
      lastError: null,
    });

    expect(store.getClaim("ws_b", "claim_a")).toBeNull();
    expect(store.getPayout("ws_b", "pay_a")).toBeNull();
    expect(() => store.readReceipt("ws_b", key)).toThrow(DomainError);
    expect(store.readReceipt("ws_a", key).receiptId).toBe("receipt_a");
    expect(receiptObjectKey("ws_a", "receipt_a", "../secret.png")).not.toContain("..");
    expect(() => assertCanReadObject("ws_b", "ws_a/receipt_a/fare.png")).toThrow(DomainError);
    expect(() => rejectDemoAuthority({ mode: "demo", id: "pay_a" })).toThrow(/Demo identifiers/);
  });

  it("does not plan a payout against another workspace destination", () => {
    const destination: Destination = {
      id: "dest_b",
      workspaceId: "ws_b",
      claimantId: "maya",
      version: 1,
      email: "maya.chen.demo@sandbox.test",
      status: "verified",
    };
    const line: LedgerLine = {
      id: "fare",
      workspaceId: "ws_a",
      claimId: "claim_a",
      claimantId: "maya",
      reviewState: "approved",
      claimedAmount: 2400,
      approvedAmount: 2400,
      currency: "USD",
      revision: 1,
    };
    const result = planPayout({
      workspaceId: "ws_a",
      actorId: "alex",
      payoutId: "pay",
      claimId: "claim_a",
      destination,
      expectedDestinationVersion: 1,
      lines: [{ lineId: "fare", amount: 2400 }],
      ledger: [line],
      payouts: [],
      idempotencyKey: "k",
      idempotency: [],
      now: "2025-01-18T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });
});
