import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { buildPayoutRequest, createPayPalAdapter, parseCanonicalItem, verifyPayPalWebhook } from "@/server/paypal";
import { prepareEvidence, rotateRgba, jpegOrientation } from "@/server/media";
import { GENERIC_PAYOUT_NOTE } from "@/domain/payouts";
import type { Payout } from "@/domain/types";
import { runFixtureScenario } from "@/server/worker";
import { mapRegion } from "@/domain/regions";
import { RIVERSIDE } from "@/demo/geometry";
import { readFileSync } from "node:fs";
import { claimTiming, evaluationReport, simulate } from "@/eval/metrics";

const payout: Payout = {
  id: "pay_1",
  workspaceId: "ws",
  claimantId: "maya",
  claimId: "TP-1042",
  destinationId: "dest",
  destinationVersion: 1,
  recipientEmail: "maya.chen.demo@sandbox.test",
  amount: 2400,
  currency: "USD",
  status: "queued",
  senderBatchId: "tpb_pay_1",
  senderItemId: "tpi_pay_1",
  providerBatchId: null,
  providerItemId: null,
  providerRawStatus: null,
  idempotencyKey: "k",
  payloadHash: "h",
  createdAt: "2025-01-18T21:00:00.000Z",
  updatedAt: "2025-01-18T21:00:00.000Z",
  lastObservationAt: null,
  allocations: [],
  lineIds: ["fare"],
  note: GENERIC_PAYOUT_NOTE,
  lastError: null,
};

describe("provider adapters and evidence geometry", () => {
  it("builds a generic payout body and reconciles a canonical item", async () => {
    const body = buildPayoutRequest(payout);
    expect(body.items[0]?.amount).toEqual({ value: "24.00", currency: "USD" });
    expect(body.items[0]?.note).toBe("Volunteer reimbursement");
    expect(JSON.stringify(body).toLowerCase()).not.toContain("receipt");
    expect(body.sender_batch_header.sender_batch_id).toBe("tpb_pay_1");

    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith("/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "token" }), text: async () => "" };
      }
      if (url.endsWith("/v1/payments/payouts")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ batch_header: { payout_batch_id: "BATCH1", batch_status: "PENDING", sender_batch_header: { sender_batch_id: "tpb_pay_1" } }, items: [{ payout_item_id: "ITEM1", transaction_status: "SUCCESS" }] }),
          text: async () => "",
        };
      }
      return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
    };
    const adapter = createPayPalAdapter(
      { baseUrl: "https://api-m.sandbox.paypal.com", clientId: "id", clientSecret: "secret", webhookId: "wh", senderEmail: "sender@sandbox.test" },
      fetchImpl,
    );
    const submitted = await adapter.submit(payout);
    expect(submitted.type).toBe("accepted");
    if (submitted.type === "accepted") {
      expect(submitted.rawStatus).toBe("SUCCESS");
      expect(submitted.providerBatchId).toBe("BATCH1");
    }
    const missing = createPayPalAdapter(null);
    expect((await missing.submit(payout)).type).toBe("not_configured");

    const canonical = parseCanonicalItem(
      {
        payout_item_id: "ITEM1",
        transaction_status: "SUCCESS",
        payout_batch_id: "BATCH1",
        sender_batch_id: "tpb_pay_1",
        time_processed: "2025-01-18T21:05:00.000Z",
        payout_item: { sender_item_id: "tpi_pay_1", receiver: "maya.chen.demo@sandbox.test", amount: { value: "24.00", currency: "USD" } },
      },
      payout,
    );
    expect(canonical?.amount).toBe(2400);
    const verified = await verifyPayPalWebhook({
      config: { baseUrl: "https://api-m.sandbox.paypal.com", clientId: "id", clientSecret: "secret", webhookId: "wh", senderEmail: "sender@sandbox.test" },
      headers: { authAlgo: "SHA256withRSA", certUrl: "https://example.test/cert", transmissionId: "t", transmissionSig: "s", transmissionTime: "time" },
      event: { id: "WH" },
      fetchImpl: async (url: string) => {
        if (url.endsWith("/v1/oauth2/token")) return { ok: true, status: 200, json: async () => ({ access_token: "token" }), text: async () => "" };
        return { ok: true, status: 200, json: async () => ({ verification_status: "SUCCESS" }), text: async () => "" };
      },
    });
    expect(verified.ok).toBe(true);
    expect((await verifyPayPalWebhook({ config: null, headers: { authAlgo: null, certUrl: null, transmissionId: null, transmissionSig: null, transmissionTime: null }, event: {} })).ok).toBe(false);
  });

  it("strips image metadata and maps receipt regions through letterboxing", async () => {
    const png = new PNG({ width: 8, height: 8 });
    png.data.fill(255);
    const prepared = await prepareEvidence(PNG.sync.write(png));
    if ("error" in prepared) throw new Error(prepared.error);
    expect(prepared.metadataStripped).toBe(true);
    expect(prepared.contentHash).toHaveLength(64);
    const pixels = new Uint8Array(8 * 4);
    pixels[0] = 10;
    const rotated = rotateRgba(pixels, 2, 1, 6);
    expect(rotated.width).toBe(1);
    expect(rotated.height).toBe(2);
    const jpegBytes = jpeg.encode({ data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]), width: 2, height: 2 }, 80).data;
    const exif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, ..."Exif".split("").map((char) => char.charCodeAt(0)), 0, 0]);
    expect(jpegOrientation(exif)).toBe(1);
    const cleaned = await prepareEvidence(jpegBytes);
    if ("error" in cleaned) throw new Error(cleaned.error);
    expect(Buffer.from(cleaned.bytes).includes(Buffer.from("Exif"))).toBe(false);

    const mapped = mapRegion(RIVERSIDE.regions.total, { width: 640, height: 560 }, { width: RIVERSIDE.width, height: RIVERSIDE.height });
    expect(mapped.x).toBeGreaterThan(0);
    expect(mapped.width).toBeCloseTo(RIVERSIDE.regions.total.width * RIVERSIDE.width);
    const fitted = mapRegion(RIVERSIDE.regions.total, { width: RIVERSIDE.width, height: RIVERSIDE.height }, RIVERSIDE);
    expect(fitted.y).toBeCloseTo(400);
    expect(fitted.height).toBeCloseTo(48);
  });

  it("runs the payout fixture without Sandbox and compares approval strategies", () => {
    const fixture = runFixtureScenario();
    expect(fixture.usedLiveSandbox).toBe(false);
    expect(fixture.paidOnlyAfterCanonicalMatch).toBe(true);
    expect(fixture.uncertainStaysReserved).toBe(true);
    expect(fixture.remains.length).toBeGreaterThan(0);
    const line = simulate("line");
    const whole = simulate("whole");
    const heroLine = claimTiming("TP-1042", "line");
    const heroWhole = claimTiming("TP-1042", "whole");
    expect(line.incorrectCents).toBe(0);
    expect(whole.incorrectCents).toBe(0);
    expect(heroLine.hoursToFirst).toBe(3);
    expect(heroWhole.hoursToFirst).toBe(27);
    expect(heroLine.unresolvedAtCheckpoint).toBe(1600);
    expect(heroWhole.unresolvedAtCheckpoint).toBe(4000);
    const report = evaluationReport();
    expect(report).toContain("3/3");
    expect(report).toContain("simulated");
    const sql = readFileSync(new URL("../supabase/migrations/202603180001_init.sql", import.meta.url), "utf8");
    expect(sql).toContain("reserve_payout");
    expect(sql.toLowerCase()).toContain("row level security");
    expect(sql).toContain("sender_batch_id");
  });
});
