import { formatUsd } from "@/domain/money";
import { formatAge, formatShortDate } from "./format";
import { queueClaims } from "./logic";
import type { DemoLine, DemoState } from "./types";

export interface ThumbModel {
  src: string;
  alt: string;
  merchant: string;
  who: string;
  descriptor: string;
  date: string;
  total: string;
}

export interface ReviewView {
  queue: {
    id: string;
    amount: string;
    name: string;
    activity: string;
    status: string;
    tone: "ok" | "warn" | "neutral" | "bad";
    age: string;
    active: boolean;
    program: string;
    reason: string;
  }[];
  claim: {
    id: string;
    claimant: string;
    activity: string;
    date: string;
    total: string;
    status: string;
  } | null;
  lines: {
    id: string;
    title: string;
    detail: string;
    amount: string;
    cents: number;
    checked: boolean;
    focused: boolean;
    expanded: boolean;
    disabled: boolean;
    needsReason: boolean;
    badge: { label: string; tone: "ok" | "warn" | "neutral" | "bad" } | null;
    duplicate: { message: string; left: ThumbModel; right: ThumbModel } | null;
  }[];
  files: {
    id: string;
    label: string;
    src: string;
    alt: string;
    width: number;
    height: number;
    regions: { id: string; label: string; region: DemoState["receipts"][number]["regions"][string] }[];
  }[];
  focusedFileId: string | null;
  activeRegionId: string | null;
  submittedCents: number;
  selectedCents: number;
  reviewCents: number;
}

function badgeFor(line: DemoLine, paid: boolean): ReviewView["lines"][number]["badge"] {
  if (paid) return { label: "Paid", tone: "ok" };
  if (line.reviewState === "approved") return { label: "Approved", tone: "ok" };
  if (line.reviewState === "declined") return { label: "Declined", tone: "bad" };
  if (line.reviewState === "needs_clarification") return { label: "Needs reply", tone: "warn" };
  const exception = line.flags.find((flag) => flag.severity === "exception");
  if (exception?.code === "possible_duplicate") return { label: "Possible duplicate", tone: "warn" };
  if (exception) return { label: "Needs review", tone: "warn" };
  if (line.flags.some((flag) => flag.code === "eligible")) return { label: "Eligible", tone: "ok" };
  return { label: "In review", tone: "neutral" };
}

export function toReviewView(state: DemoState): ReviewView {
  const queue = queueClaims(state).map((claim) => {
    const open = claim.lines.some((line) => line.reviewState === "needs_clarification");
    const exception = claim.lines.some((line) => line.flags.some((flag) => flag.severity === "exception"));
    const amount = claim.lines.reduce((total, line) => total + line.claimedAmount, 0);
    return {
      id: claim.id,
      amount: formatUsd(amount),
      name: claim.claimantName,
      activity: claim.activityName,
      status: open ? "Needs reply" : "In Review",
      tone: open || exception ? "warn" : "neutral",
      age: formatAge(claim.lastActionAt, state.clock),
      active: claim.id === state.ui.activeClaimId,
      program: claim.programName,
      reason: claim.lines.flatMap((line) => line.flags.map((flag) => flag.code)).join(" "),
    } as const;
  });
  const claim = state.claims.find((item) => item.id === state.ui.activeClaimId) ?? null;
  if (!claim) {
    return {
      queue, claim: null, lines: [], files: [], focusedFileId: null, activeRegionId: null,
      submittedCents: 0, selectedCents: 0, reviewCents: 0,
    };
  }
  const lines = claim.lines.map((line) => {
    const paid = state.payouts.some((payout) => payout.status === "succeeded" && payout.allocations.some((allocation) => allocation.lineId === line.id && allocation.state === "settled"));
    const duplicateFlag = line.flags.find((flag) => flag.code === "possible_duplicate");
    const own = state.receipts.find((receipt) => receipt.id === line.receiptId);
    const other = state.receipts.find((receipt) => receipt.id === duplicateFlag?.receiptId);
    const duplicate = duplicateFlag && own && other
      ? {
          message: duplicateFlag.message,
          left: thumb(own, `This claim (${claim.id})`, duplicateFlag),
          right: thumb(other, `Possible match (${duplicateFlag.candidateClaimId})`, duplicateFlag),
        }
      : null;
    const open = line.reviewState === "submitted" || line.reviewState === "needs_clarification";
    return {
      id: line.id,
      title: line.title,
      detail: line.detail,
      amount: formatUsd(line.claimedAmount),
      cents: line.claimedAmount,
      checked: state.ui.checkedLineIds.includes(line.id),
      focused: state.ui.focusedLineId === line.id,
      expanded: state.ui.expandedLineIds.includes(line.id) || Boolean(duplicate && state.ui.expandedLineIds.includes(line.id)),
      disabled: !open,
      needsReason: line.requiresOverrideReason,
      badge: badgeFor(line, paid),
      duplicate,
    };
  });
  const files = claim.receiptOrder.flatMap((id) => {
    const receipt = state.receipts.find((item) => item.id === id);
    if (!receipt) return [];
    return [{
      id: receipt.id,
      label: receipt.kind === "document" ? "Shift check-in" : receipt.merchant || receipt.fileName,
      src: receipt.src,
      alt: receipt.alt,
      width: receipt.width,
      height: receipt.height,
      regions: Object.entries(receipt.regions).map(([name, region]) => ({
        id: name,
        label: receipt.fields.find((field) => field.name === name)?.label ?? name,
        region,
      })),
    }];
  });
  const focused = claim.lines.find((line) => line.id === state.ui.focusedLineId);
  const submittedCents = claim.lines.reduce((total, line) => total + line.claimedAmount, 0);
  const selectedCents = lines.filter((line) => line.checked && !line.disabled).reduce((total, line) => total + line.cents, 0);
  const reviewCents = lines.filter((line) => !line.disabled && !line.checked).reduce((total, line) => total + line.cents, 0);
  return {
    queue,
    claim: {
      id: claim.id,
      claimant: claim.claimantName,
      activity: claim.activityName,
      date: formatShortDate(claim.activityDate),
      total: formatUsd(submittedCents),
      status: claim.lines.some((line) => line.reviewState === "submitted" || line.reviewState === "needs_clarification") ? "In Review" : "Updated",
    },
    lines,
    files,
    focusedFileId: focused?.receiptId ?? files[0]?.id ?? null,
    activeRegionId: focused?.highlightField ?? null,
    submittedCents,
    selectedCents,
    reviewCents,
  };
}

function thumb(receipt: DemoState["receipts"][number], who: string, flag: DemoLine["flags"][number]): ThumbModel {
  return {
    src: receipt.src,
    alt: receipt.alt,
    merchant: flag.merchant || receipt.merchant,
    who,
    descriptor: flag.descriptor || "Office & Pantry Supplies",
    date: formatShortDate(flag.expenseDate || "2025-01-18"),
    total: formatUsd(flag.amount ?? 1600),
  };
}
