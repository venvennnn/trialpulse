import type { Cents } from "./money";

export type Currency = "USD";
export type Role = "claimant" | "coordinator" | "finance" | "admin";

export type ReviewState = "draft" | "submitted" | "needs_clarification" | "approved" | "declined";

export type TransferState =
  | "queued"
  | "submitting"
  | "pending"
  | "succeeded"
  | "failed"
  | "returned"
  | "outcome_unknown";

export type AllocationState = "reserved" | "settled" | "released";

export interface LedgerLine {
  id: string;
  workspaceId: string;
  claimId: string;
  claimantId: string;
  reviewState: ReviewState;
  claimedAmount: Cents;
  approvedAmount: Cents;
  currency: Currency;
  revision: number;
}

export interface Allocation {
  id: string;
  payoutId: string;
  lineId: string;
  amount: Cents;
  currency: Currency;
  state: AllocationState;
}

export interface Payout {
  id: string;
  workspaceId: string;
  claimantId: string;
  claimId: string;
  destinationId: string;
  destinationVersion: number;
  recipientEmail: string;
  amount: Cents;
  currency: Currency;
  status: TransferState;
  senderBatchId: string;
  senderItemId: string;
  providerBatchId: string | null;
  providerItemId: string | null;
  providerRawStatus: string | null;
  idempotencyKey: string;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
  lastObservationAt: string | null;
  allocations: Allocation[];
  lineIds: string[];
  note: string;
  lastError: string | null;
}

export interface IdempotencyRecord {
  key: string;
  actorId: string;
  payloadHash: string;
  payoutId: string;
}

export interface Destination {
  id: string;
  workspaceId: string;
  claimantId: string;
  version: number;
  email: string;
  status: "verified" | "pending";
}

export interface PublicPayout {
  id: string;
  workspaceId: string;
  claimantId: string;
  claimId: string;
  destinationId: string;
  destinationVersion: number;
  recipientMasked: string;
  amount: Cents;
  currency: Currency;
  status: TransferState;
  senderBatchId: string;
  senderItemId: string;
  providerBatchId: string | null;
  providerItemId: string | null;
  providerRawStatus: string | null;
  createdAt: string;
  updatedAt: string;
  lineIds: string[];
  allocations: Allocation[];
  note: string;
  lastError: string | null;
  modeLabel: "Demo · Simulated" | "PayPal Sandbox";
}
