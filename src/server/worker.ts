import { sumBalances } from "@/domain/balances";
import { applyCanonical, applySubmitResult, planPayout, type SubmitAdapterResult } from "@/domain/payouts";
import type { Destination, LedgerLine } from "@/domain/types";
import { readPayPalConfig, type PayPalFetcher } from "./paypal";

export interface FixtureReport {
  usedLiveSandbox: false;
  paidOnlyAfterCanonicalMatch: boolean;
  uncertainStaysReserved: boolean;
  simulatedPaidCents: number;
  remains: string[];
  lines: string[];
}

export function runFixtureScenario(now = "2025-01-18T21:00:00.000Z"): FixtureReport {
  const destination: Destination = {
    id: "dest_fixture",
    workspaceId: "ws_fixture",
    claimantId: "usr_fixture",
    version: 1,
    email: "fixture.recipient@sandbox.test",
    status: "verified",
  };
  const fare: LedgerLine = {
    id: "ln_fare",
    workspaceId: "ws_fixture",
    claimId: "claim_fixture",
    claimantId: "usr_fixture",
    reviewState: "approved",
    claimedAmount: 2400,
    approvedAmount: 2400,
    currency: "USD",
    revision: 2,
  };
  const supplies: LedgerLine = {
    id: "ln_supplies",
    workspaceId: "ws_fixture",
    claimId: "claim_fixture",
    claimantId: "usr_fixture",
    reviewState: "submitted",
    claimedAmount: 1600,
    approvedAmount: 0,
    currency: "USD",
    revision: 1,
  };
  const planned = planPayout({
    workspaceId: "ws_fixture",
    actorId: "usr_finance",
    payoutId: "pay_fixture",
    claimId: "claim_fixture",
    destination,
    expectedDestinationVersion: 1,
    lines: [{ lineId: fare.id, amount: 2400 }],
    ledger: [fare, supplies],
    payouts: [],
    idempotencyKey: "fixture-1",
    idempotency: [],
    now,
  });
  if (!planned.ok) throw new Error(planned.message);
  const accepted: SubmitAdapterResult = {
    type: "accepted",
    providerBatchId: "BATCH-FIXTURE",
    providerItemId: "ITEM-FIXTURE",
    rawStatus: "SUCCESS",
  };
  const submitted = applySubmitResult(planned.payout, accepted, now);
  const paidTooEarly = sumBalances([fare, supplies], [submitted]).paid === 0;
  const matched = applyCanonical(submitted, {
    senderBatchId: submitted.senderBatchId,
    senderItemId: submitted.senderItemId,
    providerBatchId: "BATCH-FIXTURE",
    providerItemId: "ITEM-FIXTURE",
    amount: 2400,
    currency: "USD",
    receiverEmail: destination.email,
    rawStatus: "SUCCESS",
    observedAt: "2025-01-18T21:05:00.000Z",
  });
  const uncertain = applySubmitResult(planned.payout, { type: "uncertain", message: "timeout" }, now);
  const reserved = uncertain.allocations.every((allocation) => allocation.state === "reserved") && uncertain.status === "outcome_unknown";
  const lines = [
    "Fixture PayPal adapter: no live Sandbox call was made.",
    `Accepted batch stayed unpaid until the canonical item matched: ${paidTooEarly && matched.payout.status === "succeeded"}.`,
    `Uncertain submit kept the ${uncertain.amount} cents reserved: ${reserved}.`,
    "Still required against a real Sandbox sender: OAuth, POST /v1/payments/payouts, item GET, and webhook signature verification.",
  ];
  return {
    usedLiveSandbox: false,
    paidOnlyAfterCanonicalMatch: paidTooEarly && matched.payout.status === "succeeded" && matched.payout.amount === 2400,
    uncertainStaysReserved: reserved,
    simulatedPaidCents: matched.payout.status === "succeeded" ? matched.payout.amount : 0,
    remains: [
      "Confirm PAYPAL_SENDER_EMAIL can submit Standard Payouts in Sandbox.",
      "Confirm SANDBOX_RECIPIENT_EMAIL is the controlled personal Sandbox account.",
      "Send a $0.01 or policy-approved sandbox item and reconcile GET /v1/payments/payouts-item/{id} to SUCCESS.",
      "Deliver one verified webhook and one duplicate event id.",
    ],
    lines,
  };
}

/** Confirms the sender can obtain a Sandbox token. Does not create a payout. */
export async function checkSenderCredentials(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: PayPalFetcher = fetch as PayPalFetcher,
): Promise<{ ok: boolean; detail: string }> {
  const config = readPayPalConfig(env);
  if (!config) return { ok: false, detail: "PayPal Sandbox credentials are absent. No payout was submitted." };
  try {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    const response = await fetchImpl(`${config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) return { ok: false, detail: `Sender token request failed (${response.status}). No payout was submitted.` };
    return { ok: true, detail: `Sender ${config.senderEmail} received a Sandbox token. No payout was submitted.` };
  } catch {
    return { ok: false, detail: "Sender token request did not complete. No payout was submitted." };
  }
}
