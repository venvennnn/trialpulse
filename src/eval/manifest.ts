import type { DuplicateQuery } from "@/domain/duplicates";

export interface ManifestLine {
  id: string;
  amount: number;
  category: string;
  immediate: "approve" | "hold" | "decline";
  final: "approve" | "decline";
}

export interface ManifestClaim {
  id: string;
  group: string;
  submittedHour: number;
  reviewHour: number;
  resolvedHour: number | null;
  paymentLagHours: number;
  lines: ManifestLine[];
}

export interface ManifestDuplicateCase {
  id: string;
  query: DuplicateQuery;
  candidates: DuplicateQuery[];
  relevantIds: string[];
  legitimateIds: string[];
}

function query(partial: DuplicateQuery): DuplicateQuery {
  return partial;
}

const base = {
  workspaceId: "ws_harborlight",
  currency: "USD",
  expenseDate: "2025-01-18",
  merchant: "Community Supplies",
  category: "supplies",
  passengerKey: null,
  amount: 1600,
};

export function buildManifest() {
  const suppliesQuery = query({
    ...base,
    receiptId: "r-query",
    claimId: "TP-2001",
    lineId: "L1",
    claimantId: "u1",
    contentHash: "supplies-query",
    perceptualHash: "aaaaaaaaaaaaaaaa",
    reference: "4418",
  });
  const relevant = [0, 1, 2].map((index) =>
    query({
      ...base,
      receiptId: `r-rel-${index}`,
      claimId: `TP-REL-${index}`,
      lineId: "L",
      claimantId: `u-rel-${index}`,
      contentHash: `supplies-rel-${index}`,
      perceptualHash: index === 0 ? "aaaaaaaaaaaaaaaa" : "aaaaaaaaaaaaaaab",
      reference: index === 2 ? "4418" : "4490",
    }),
  );
  const hardNegative = query({
    workspaceId: "ws_harborlight",
    receiptId: "r-fare-other",
    claimId: "TP-FARE-OTHER",
    lineId: "L",
    claimantId: "u-other",
    contentHash: "fare-other",
    perceptualHash: "0123456789abcdef",
    merchant: "Riverside Rail",
    reference: "T-9",
    currency: "USD",
    amount: 2400,
    expenseDate: "2025-01-18",
    category: "transit",
    passengerKey: "passenger-b",
  });
  const fareQuery = query({
    ...hardNegative,
    receiptId: "r-fare-query",
    claimId: "TP-FARE-QUERY",
    claimantId: "u-maya",
    contentHash: "fare-maya",
    passengerKey: "passenger-a",
    perceptualHash: "fedcba9876543210",
  });
  const oldReceipt = query({
    ...base,
    receiptId: "r-old",
    claimId: "TP-OLD",
    lineId: "L",
    claimantId: "u-old",
    contentHash: "old",
    perceptualHash: "0000000000000000",
    expenseDate: "2024-11-01",
    reference: "1",
    amount: 500,
  });

  const claims: ManifestClaim[] = [
    {
      id: "TP-1042",
      group: "riverside-mixed",
      submittedHour: 0,
      reviewHour: 2,
      resolvedHour: 26,
      paymentLagHours: 1,
      lines: [
        { id: "fare", amount: 2400, category: "transit", immediate: "approve", final: "approve" },
        { id: "supplies", amount: 1600, category: "supplies", immediate: "hold", final: "approve" },
      ],
    },
  ];

  for (let index = 0; index < 23; index += 1) {
    const kind = index % 5;
    const amount = 800 + index * 50;
    if (kind === 0) {
      claims.push({
        id: `TP-${1100 + index}`,
        group: "eligible-single",
        submittedHour: index,
        reviewHour: index + 3,
        resolvedHour: null,
        paymentLagHours: 1,
        lines: [{ id: "only", amount, category: "transit", immediate: "approve", final: "approve" }],
      });
    } else if (kind === 1) {
      claims.push({
        id: `TP-${1100 + index}`,
        group: "mixed",
        submittedHour: index,
        reviewHour: index + 4,
        resolvedHour: index + 30,
        paymentLagHours: 2,
        lines: [
          { id: "ok", amount: 1200, category: "transit", immediate: "approve", final: "approve" },
          { id: "hold", amount: 900, category: "supplies", immediate: "hold", final: "approve" },
        ],
      });
    } else if (kind === 2) {
      claims.push({
        id: `TP-${1100 + index}`,
        group: "duplicate-decline",
        submittedHour: index,
        reviewHour: index + 5,
        resolvedHour: index + 20,
        paymentLagHours: 1,
        lines: [{ id: "dup", amount: 1600, category: "supplies", immediate: "hold", final: "decline" }],
      });
    } else if (kind === 3) {
      claims.push({
        id: `TP-${1100 + index}`,
        group: "policy-exception",
        submittedHour: index,
        reviewHour: index + 2,
        resolvedHour: index + 12,
        paymentLagHours: 1,
        lines: [{ id: "cap", amount: 4000, category: "meals", immediate: "decline", final: "decline" }],
      });
    } else {
      claims.push({
        id: `TP-${1100 + index}`,
        group: "eligible-supplies",
        submittedHour: index,
        reviewHour: index + 1,
        resolvedHour: null,
        paymentLagHours: 1,
        lines: [{ id: "sup", amount: 1100, category: "supplies", immediate: "approve", final: "approve" }],
      });
    }
  }

  const duplicateCases: ManifestDuplicateCase[] = [
    {
      id: "supplies-cluster",
      query: suppliesQuery,
      candidates: [...relevant, hardNegative, oldReceipt],
      relevantIds: relevant.map((item) => item.claimId),
      legitimateIds: [],
    },
    {
      id: "same-day-fares",
      query: fareQuery,
      candidates: [hardNegative, ...relevant],
      relevantIds: [],
      legitimateIds: [hardNegative.claimId],
    },
  ];

  return {
    version: "2026.1",
    currency: "USD",
    notes: "Illustrative pilot manifest. Receipts are synthetic. No clinical data.",
    claims,
    duplicateCases,
  };
}
