import { centsToPayPalValue, payPalValueToCents } from "@/domain/money";
import { GENERIC_PAYOUT_NOTE, payoutBodyContainsSensitiveDetail, type CanonicalItem, type SubmitAdapterResult } from "@/domain/payouts";
import type { Payout } from "@/domain/types";

export interface PayPalConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  senderEmail: string;
}

export function readPayPalConfig(env: NodeJS.ProcessEnv = process.env): PayPalConfig | null {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  const webhookId = env.PAYPAL_WEBHOOK_ID?.trim();
  const senderEmail = env.PAYPAL_SENDER_EMAIL?.trim();
  if (!clientId || !clientSecret || !webhookId || !senderEmail) return null;
  return {
    baseUrl: (env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com").replace(/\/$/, ""),
    clientId,
    clientSecret,
    webhookId,
    senderEmail,
  };
}

/** Single payout item. The note is generic and carries no receipt, program, or health detail. */
export function buildPayoutRequest(payout: Payout) {
  const body = {
    sender_batch_header: {
      sender_batch_id: payout.senderBatchId,
      email_subject: "You have a payment",
      email_message: "You have received a payout.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: { value: centsToPayPalValue(payout.amount), currency: payout.currency },
        note: GENERIC_PAYOUT_NOTE,
        sender_item_id: payout.senderItemId,
        receiver: payout.recipientEmail,
      },
    ],
  };
  if (payoutBodyContainsSensitiveDetail(JSON.stringify(body))) {
    throw new Error("Payout request included details that must stay off the provider payload.");
  }
  return body;
}

export function parsePayoutCreateResponse(payload: unknown, payout: Payout): SubmitAdapterResult {
  const body = payload as {
    batch_header?: { payout_batch_id?: string; batch_status?: string; sender_batch_header?: { sender_batch_id?: string } };
    items?: { payout_item_id?: string; transaction_status?: string }[];
    name?: string;
    message?: string;
  };
  const batchId = body.batch_header?.payout_batch_id;
  if (!batchId) {
    return { type: "uncertain", message: "PayPal accepted no batch id. The payout stays unresolved." };
  }
  const echoed = body.batch_header?.sender_batch_header?.sender_batch_id;
  if (echoed && echoed !== payout.senderBatchId) {
    return { type: "uncertain", message: "PayPal echoed a different sender batch id." };
  }
  return {
    type: "accepted",
    providerBatchId: batchId,
    providerItemId: body.items?.[0]?.payout_item_id ?? null,
    rawStatus: body.items?.[0]?.transaction_status || body.batch_header?.batch_status || "PENDING",
  };
}

export function parseCanonicalItem(payload: unknown, payout: Payout): CanonicalItem | null {
  const body = payload as {
    payout_item_id?: string;
    transaction_status?: string;
    payout_batch_id?: string;
    sender_batch_id?: string;
    time_processed?: string;
    payout_item?: {
      sender_item_id?: string;
      receiver?: string;
      amount?: { value?: string; currency?: string };
    };
  };
  const amount = body.payout_item?.amount?.value ? payPalValueToCents(body.payout_item.amount.value) : null;
  if (!body.transaction_status || amount == null || !body.payout_item?.receiver) return null;
  return {
    senderBatchId: body.sender_batch_id || payout.senderBatchId,
    senderItemId: body.payout_item.sender_item_id || payout.senderItemId,
    providerBatchId: body.payout_batch_id ?? payout.providerBatchId,
    providerItemId: body.payout_item_id ?? payout.providerItemId,
    amount,
    currency: body.payout_item.amount?.currency || "",
    receiverEmail: body.payout_item.receiver,
    rawStatus: body.transaction_status,
    observedAt: body.time_processed || new Date().toISOString(),
  };
}

export interface PayPalFetcher {
  (input: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;
}

export function createPayPalAdapter(config: PayPalConfig | null, fetchImpl: PayPalFetcher = fetch as PayPalFetcher) {
  return {
    configured: Boolean(config),
    async submit(payout: Payout): Promise<SubmitAdapterResult> {
      if (!config) {
        return { type: "not_configured", message: "PayPal Sandbox is not configured. The payout was not submitted." };
      }
      const token = await accessToken(config, fetchImpl);
      if (!token.ok) return token.result;
      let response: Awaited<ReturnType<PayPalFetcher>>;
      try {
        response = await fetchImpl(`${config.baseUrl}/v1/payments/payouts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildPayoutRequest(payout)),
        });
      } catch {
        return { type: "uncertain", message: "The PayPal call failed before a response. The allocation stays reserved." };
      }
      const payload = await response.json().catch(() => null);
      if (response.status === 409) {
        const parsed = payload ? parsePayoutCreateResponse(payload, payout) : null;
        return {
          type: "duplicate",
          providerBatchId: parsed && parsed.type === "accepted" ? parsed.providerBatchId : null,
        };
      }
      if (response.status >= 500 || response.status === 429) {
        return { type: "uncertain", message: `PayPal responded ${response.status}. The allocation stays reserved.` };
      }
      if (!response.ok) {
        const text = payload ? JSON.stringify(payload) : "";
        return { type: "rejected", message: `PayPal rejected the payout (${response.status}). ${text.slice(0, 180)}` };
      }
      return parsePayoutCreateResponse(payload, payout);
    },
    async getItem(payout: Payout): Promise<CanonicalItem | { uncertain: string }> {
      if (!config) return { uncertain: "PayPal Sandbox is not configured." };
      if (!payout.providerItemId) return { uncertain: "The payout has no provider item id yet." };
      const token = await accessToken(config, fetchImpl);
      if (!token.ok) {
        const message = "message" in token.result ? token.result.message : "PayPal token request failed.";
        return { uncertain: message };
      }
      try {
        const response = await fetchImpl(`${config.baseUrl}/v1/payments/payouts-item/${payout.providerItemId}`, {
          headers: { Authorization: `Bearer ${token.token}` },
        });
        if (!response.ok) return { uncertain: `Item lookup returned ${response.status}.` };
        const parsed = parseCanonicalItem(await response.json(), payout);
        if (!parsed) return { uncertain: "Item lookup did not include a comparable amount and receiver." };
        return parsed;
      } catch {
        return { uncertain: "Item lookup failed before a response." };
      }
    },
  };
}

async function accessToken(
  config: PayPalConfig,
  fetchImpl: PayPalFetcher,
): Promise<{ ok: true; token: string } | { ok: false; result: SubmitAdapterResult }> {
  try {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    const response = await fetchImpl(`${config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) {
      return { ok: false, result: { type: "not_configured", message: "PayPal Sandbox refused the sender credentials." } };
    }
    const body = (await response.json()) as { access_token?: string };
    if (!body.access_token) {
      return { ok: false, result: { type: "uncertain", message: "PayPal token response had no access token." } };
    }
    return { ok: true, token: body.access_token };
  } catch {
    return { ok: false, result: { type: "uncertain", message: "PayPal token request failed before a response." } };
  }
}

export interface WebhookHeaders {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
}

export function readWebhookHeaders(headers: Headers): WebhookHeaders {
  return {
    authAlgo: headers.get("paypal-auth-algo"),
    certUrl: headers.get("paypal-cert-url"),
    transmissionId: headers.get("paypal-transmission-id"),
    transmissionSig: headers.get("paypal-transmission-sig"),
    transmissionTime: headers.get("paypal-transmission-time"),
  };
}

/** Fail closed. Events are prompts to refresh; the body is not the ledger. */
export async function verifyPayPalWebhook(input: {
  config: PayPalConfig | null;
  headers: WebhookHeaders;
  event: unknown;
  fetchImpl?: PayPalFetcher;
}): Promise<{ ok: true } | { ok: false; code: "NOT_CONFIGURED" | "INVALID_SIGNATURE" }> {
  if (!input.config) return { ok: false, code: "NOT_CONFIGURED" };
  const { headers } = input;
  if (!headers.authAlgo || !headers.certUrl || !headers.transmissionId || !headers.transmissionSig || !headers.transmissionTime) {
    return { ok: false, code: "INVALID_SIGNATURE" };
  }
  const fetchImpl = input.fetchImpl ?? (fetch as PayPalFetcher);
  const token = await accessToken(input.config, fetchImpl);
  if (!token.ok) return { ok: false, code: "INVALID_SIGNATURE" };
  try {
    const response = await fetchImpl(`${input.config.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: input.config.webhookId,
        webhook_event: input.event,
      }),
    });
    if (!response.ok) return { ok: false, code: "INVALID_SIGNATURE" };
    const body = (await response.json()) as { verification_status?: string };
    return body.verification_status === "SUCCESS" ? { ok: true } : { ok: false, code: "INVALID_SIGNATURE" };
  } catch {
    return { ok: false, code: "INVALID_SIGNATURE" };
  }
}
