import type { Cents } from "./money";

export interface CategoryRule {
  cap: Cents;
  requiresEvidence: boolean;
  label: string;
}

export interface PolicyVersion {
  id: string;
  version: number;
  currency: "USD";
  activityWindowDays: number;
  reviewSlaHours: number;
  categories: Record<string, CategoryRule>;
}

/** One NGO, one program, one USD policy version for the initial release. */
export const VOLUNTEER_POLICY_V1: PolicyVersion = {
  id: "pol_volunteer_usd_v1",
  version: 1,
  currency: "USD",
  activityWindowDays: 1,
  reviewSlaHours: 48,
  categories: {
    transit: { cap: 4000, requiresEvidence: true, label: "Transit" },
    supplies: { cap: 2500, requiresEvidence: true, label: "Supplies" },
    meals: { cap: 1500, requiresEvidence: true, label: "Meals" },
  },
};

export type PolicyFlagCode =
  | "eligible"
  | "invalid_category"
  | "attendance"
  | "date_window"
  | "unreadable_date"
  | "currency_mismatch"
  | "missing_evidence"
  | "over_cap"
  | "arithmetic";

export interface PolicyFlag {
  code: PolicyFlagCode;
  severity: "info" | "exception";
  message: string;
  cap?: Cents;
}

export interface PolicyInput {
  category: string;
  claimedAmount: Cents;
  currency: string;
  expenseDate: string | null;
  activityDate: string;
  attendance: "assigned" | "verified" | "manual" | "missing" | "conflict";
  hasEvidence: boolean;
  receiptTotal: Cents | null;
  receiptCurrency: string | null;
  dateUnreadable: boolean;
}

export function daysBetween(isoDateA: string, isoDateB: string): number {
  const a = Date.parse(`${isoDateA.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${isoDateB.slice(0, 10)}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/**
 * Deterministic policy checks. They suggest eligibility and never record a decision.
 * Duplicate similarity is a separate signal and is not applied here.
 */
export function evaluatePolicy(
  policy: PolicyVersion,
  input: PolicyInput,
): { flags: PolicyFlag[]; suggested: "eligible" | "review" } {
  const flags: PolicyFlag[] = [];
  const rule = policy.categories[input.category];
  if (!rule) {
    flags.push({
      code: "invalid_category",
      severity: "exception",
      message: "This category is not covered by the active policy.",
    });
  }
  if (input.attendance === "missing" || input.attendance === "conflict") {
    flags.push({
      code: "attendance",
      severity: "exception",
      message: "Attendance is missing or conflicts with the activity roster.",
    });
  }
  if (input.dateUnreadable || !input.expenseDate) {
    flags.push({
      code: "unreadable_date",
      severity: "exception",
      message: "The receipt date could not be read.",
    });
  } else if (Math.abs(daysBetween(input.expenseDate, input.activityDate)) > policy.activityWindowDays) {
    flags.push({
      code: "date_window",
      severity: "exception",
      message: `Expense date is outside the ${policy.activityWindowDays}-day activity window.`,
    });
  }
  if (input.currency !== policy.currency || (input.receiptCurrency && input.receiptCurrency !== policy.currency)) {
    flags.push({
      code: "currency_mismatch",
      severity: "exception",
      message: `This policy pays ${policy.currency} only.`,
    });
  }
  if (rule?.requiresEvidence && !input.hasEvidence) {
    flags.push({
      code: "missing_evidence",
      severity: "exception",
      message: `A receipt is required for ${rule.label.toLowerCase()}.`,
    });
  }
  if (rule && input.claimedAmount > rule.cap) {
    flags.push({
      code: "over_cap",
      severity: "exception",
      message: `${rule.label} cap is ${(rule.cap / 100).toFixed(2)} ${policy.currency}.`,
      cap: rule.cap,
    });
  }
  if (input.receiptTotal != null && input.receiptTotal !== input.claimedAmount) {
    flags.push({
      code: "arithmetic",
      severity: "exception",
      message: "Claimed amount does not match the receipt total.",
    });
  }
  if (flags.some((flag) => flag.severity === "exception") || !rule) {
    return { flags, suggested: "review" };
  }
  flags.push({
    code: "eligible",
    severity: "info",
    message: `${rule.label} for an assigned activity is inside the policy cap and date window.`,
  });
  return { flags, suggested: "eligible" };
}
