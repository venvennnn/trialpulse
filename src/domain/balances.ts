import type { Cents } from "./money";
import type { LedgerLine, Payout } from "./types";

export interface LineBalance {
  paid: Cents;
  inProgress: Cents;
  underReview: Cents;
  declined: Cents;
  approvedUnpaid: Cents;
}

export function lineBalance(line: LedgerLine, payouts: Payout[]): LineBalance {
  if (line.reviewState === "declined") {
    return { paid: 0, inProgress: 0, underReview: 0, declined: line.claimedAmount, approvedUnpaid: 0 };
  }
  if (line.reviewState !== "approved") {
    return { paid: 0, inProgress: 0, underReview: line.claimedAmount, declined: 0, approvedUnpaid: 0 };
  }
  let paid = 0;
  let inProgress = 0;
  for (const payout of payouts) {
    for (const allocation of payout.allocations) {
      if (allocation.lineId !== line.id) continue;
      if (allocation.state === "settled") paid += allocation.amount;
      else if (allocation.state === "reserved") inProgress += allocation.amount;
    }
  }
  return {
    paid,
    inProgress,
    underReview: 0,
    declined: 0,
    approvedUnpaid: Math.max(0, line.approvedAmount - paid - inProgress),
  };
}

export function sumBalances(lines: LedgerLine[], payouts: Payout[]): LineBalance & { submitted: Cents } {
  return lines.reduce<LineBalance & { submitted: Cents }>(
    (total, line) => {
      const balance = lineBalance(line, payouts);
      return {
        submitted: total.submitted + line.claimedAmount,
        paid: total.paid + balance.paid,
        inProgress: total.inProgress + balance.inProgress,
        underReview: total.underReview + balance.underReview,
        declined: total.declined + balance.declined,
        approvedUnpaid: total.approvedUnpaid + balance.approvedUnpaid,
      };
    },
    { submitted: 0, paid: 0, inProgress: 0, underReview: 0, declined: 0, approvedUnpaid: 0 },
  );
}
