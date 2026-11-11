import { assertCents, type Cents } from "./money";
import type { ReviewState } from "./types";

export interface DecisionLine {
  id: string;
  reviewState: ReviewState;
  claimedAmount: Cents;
  approvedAmount: Cents;
  revision: number;
  policyVersionId: string;
  requiresOverrideReason: boolean;
}

export interface DecisionRecord {
  lineId: string;
  actorId: string;
  at: string;
  reason: string;
  policyVersionId: string;
  outcome: "approved" | "declined" | "needs_clarification";
  amount: Cents;
}

export type DecisionResult =
  | { ok: true; line: DecisionLine; decision: DecisionRecord }
  | { ok: false; code: "STALE_REVISION" | "INVALID_INPUT"; message: string };

export function decideLine(input: {
  line: DecisionLine;
  expectedRevision: number;
  outcome: DecisionRecord["outcome"];
  amount?: Cents;
  reason: string;
  actorId: string;
  now: string;
  policyCap: Cents | null;
}): DecisionResult {
  if (input.line.revision !== input.expectedRevision) {
    return { ok: false, code: "STALE_REVISION", message: "This line changed. Reload it and decide again." };
  }
  const reason = input.reason.trim();
  if (input.outcome === "declined" || input.outcome === "needs_clarification") {
    if (!reason) return { ok: false, code: "INVALID_INPUT", message: "A reason is required." };
    return {
      ok: true,
      decision: {
        lineId: input.line.id,
        actorId: input.actorId,
        at: input.now,
        reason,
        policyVersionId: input.line.policyVersionId,
        outcome: input.outcome,
        amount: 0,
      },
      line: {
        ...input.line,
        reviewState: input.outcome,
        approvedAmount: 0,
        revision: input.line.revision + 1,
      },
    };
  }
  if (input.amount == null) return { ok: false, code: "INVALID_INPUT", message: "An approved amount is required." };
  try {
    assertCents(input.amount);
  } catch {
    return { ok: false, code: "INVALID_INPUT", message: "Approved amount must be integer cents." };
  }
  if (input.amount <= 0 || input.amount > input.line.claimedAmount) {
    return { ok: false, code: "INVALID_INPUT", message: "Approved amount must be within the claimed amount." };
  }
  if (input.policyCap != null && input.amount > input.policyCap) {
    return { ok: false, code: "INVALID_INPUT", message: "Approved amount is above the policy cap." };
  }
  if ((input.amount < input.line.claimedAmount || input.line.requiresOverrideReason) && !reason) {
    return { ok: false, code: "INVALID_INPUT", message: "A reason is required to approve this exception or a partial amount." };
  }
  return {
    ok: true,
    decision: {
      lineId: input.line.id,
      actorId: input.actorId,
      at: input.now,
      reason: reason || "Eligible under the frozen policy version.",
      policyVersionId: input.line.policyVersionId,
      outcome: "approved",
      amount: input.amount,
    },
    line: {
      ...input.line,
      reviewState: "approved",
      approvedAmount: input.amount,
      revision: input.line.revision + 1,
    },
  };
}
