import { assertCanReadObject, receiptObjectKey } from "@/domain/tenant";
import type { Payout } from "@/domain/types";

export interface StoredRecord {
  id: string;
  workspaceId: string;
}

/** In-memory stand-in that enforces the same workspace predicate the SQL policies encode. */
export class WorkspaceStore {
  claims = new Map<string, StoredRecord>();
  payouts = new Map<string, Payout>();
  objects = new Map<string, { workspaceId: string; receiptId: string }>();

  getClaim(actorWorkspaceId: string, claimId: string): StoredRecord | null {
    const claim = this.claims.get(claimId);
    if (!claim || claim.workspaceId !== actorWorkspaceId) return null;
    return claim;
  }

  getPayout(actorWorkspaceId: string, payoutId: string): Payout | null {
    const payout = this.payouts.get(payoutId);
    if (!payout || payout.workspaceId !== actorWorkspaceId) return null;
    return payout;
  }

  readReceipt(actorWorkspaceId: string, objectKey: string): { workspaceId: string; receiptId: string } {
    assertCanReadObject(actorWorkspaceId, objectKey);
    const found = this.objects.get(objectKey);
    if (!found) {
      const error = new Error("NOT_FOUND");
      error.name = "NotFound";
      throw error;
    }
    return found;
  }

  putReceipt(workspaceId: string, receiptId: string, fileName: string): string {
    const key = receiptObjectKey(workspaceId, receiptId, fileName);
    this.objects.set(key, { workspaceId, receiptId });
    return key;
  }
}
