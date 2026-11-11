export interface WebhookEnvelope {
  id: string;
  provider: "paypal";
  eventType: string;
  senderBatchId: string | null;
  receivedAt: string;
}

export function recordWebhook(seenIds: Set<string>, event: WebhookEnvelope): { duplicate: boolean; shouldReconcile: boolean } {
  if (seenIds.has(event.id)) return { duplicate: true, shouldReconcile: false };
  seenIds.add(event.id);
  return { duplicate: false, shouldReconcile: Boolean(event.senderBatchId) };
}
