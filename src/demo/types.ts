import type { Region } from "@/domain/regions";
import type { Destination, IdempotencyRecord, Payout, ReviewState } from "@/domain/types";

export type DemoRole = "volunteer" | "coordinator" | "finance";
export type SimulationMode = "processing" | "success" | "failure";

export interface DemoFlag {
  code: string;
  severity: "info" | "exception";
  message: string;
  candidateClaimId?: string;
  merchant?: string;
  descriptor?: string;
  expenseDate?: string;
  amount?: number;
  receiptId?: string;
  reasons?: string[];
}

export interface DemoLine {
  id: string;
  category: string;
  title: string;
  detail: string;
  claimedAmount: number;
  approvedAmount: number;
  currency: "USD";
  expenseDate: string | null;
  reviewState: ReviewState;
  revision: number;
  receiptId: string | null;
  highlightField: string | null;
  policyVersionId: string;
  flags: DemoFlag[];
  requiresOverrideReason: boolean;
  clarification: string | null;
  reply: string | null;
}

export interface DemoReceipt {
  id: string;
  claimId: string;
  fileName: string;
  src: string;
  width: number;
  height: number;
  contentHash: string;
  perceptualHash: string | null;
  merchant: string;
  reference: string | null;
  alt: string;
  regions: Record<string, Region>;
  fields: { name: string; label: string; value: string }[];
  kind: "receipt" | "document";
}

export interface DemoClaim {
  id: string;
  workspaceId: string;
  claimantId: string;
  claimantName: string;
  activityId: string;
  activityName: string;
  activityDate: string;
  programId: string;
  programName: string;
  submittedAt: string | null;
  dueAt: string | null;
  lastActionAt: string;
  createdAt: string;
  revision: number;
  policyVersionId: string | null;
  lines: DemoLine[];
  receiptOrder: string[];
}

export interface DemoActivity {
  id: string;
  name: string;
  date: string;
  site: string;
}

export interface TimelineEntry {
  id: string;
  claimId: string;
  at: string;
  label: string;
  detail: string;
  tone: "neutral" | "good" | "exception" | "danger";
}

export interface DuplicateJudgement {
  lineId: string;
  candidateClaimId: string;
  judgement: "confirmed" | "dismissed";
  actorId: string;
  at: string;
  reason: string;
}

export interface DemoState {
  version: 1;
  clock: string;
  seedLoaded: true;
  role: DemoRole;
  simulation: SimulationMode;
  forceError: boolean;
  lastError: string | null;
  seq: number;
  destination: Destination;
  activities: DemoActivity[];
  claims: DemoClaim[];
  receipts: DemoReceipt[];
  payouts: Payout[];
  idempotency: IdempotencyRecord[];
  timeline: TimelineEntry[];
  judgements: DuplicateJudgement[];
  ui: {
    activeClaimId: string;
    focusedLineId: string | null;
    checkedLineIds: string[];
    expandedLineIds: string[];
    draftClaimId: string | null;
    payoutAttempt: string;
    lastPayoutId: string | null;
  };
}
