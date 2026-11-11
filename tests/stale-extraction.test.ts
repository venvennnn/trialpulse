import { describe, expect, it } from "vitest";
import { applyExtraction, correctField, effectiveFieldValue, replaceAttachment, type StoredField } from "@/domain/extraction";
import { finishExtractionJob } from "@/server/extraction-job";
import { parseGeminiReceipt } from "@/server/gemini";

const job = { id: "job_1", receiptId: "r1", contentHash: "abc", revision: 2 };

describe("stale extraction", () => {
  it("ignores an older revision and preserves the claimant correction", () => {
    let fields: StoredField[] = [
      {
        name: "total",
        candidateValue: "24.00",
        correctedValue: "24.00",
        region: { x: 0.1, y: 0.7, width: 0.5, height: 0.08 },
        sourceRevision: 2,
        correctedAtRevision: 2,
        status: "corrected",
      },
    ];
    const stale = applyExtraction(fields, job, {
      receiptId: "r1",
      contentHash: "abc",
      revision: 1,
      extractorVersion: "gemini-test",
      fields: [{ name: "total", value: "99.00", region: null, unreadable: false, ambiguous: false }],
    });
    expect(stale.status).toBe("stale");
    expect(effectiveFieldValue(stale.fields[0]!)).toBe("24.00");

    const applied = applyExtraction(fields, job, {
      receiptId: "r1",
      contentHash: "abc",
      revision: 2,
      extractorVersion: "gemini-test",
      fields: [{ name: "total", value: "16.00", region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, unreadable: false, ambiguous: false }],
    });
    expect(applied.status).toBe("applied");
    expect(applied.fields[0]?.candidateValue).toBe("16.00");
    expect(effectiveFieldValue(applied.fields[0]!)).toBe("24.00");

    const replaced = replaceAttachment(fields);
    const late = finishExtractionJob({
      fields: replaced.fields,
      job: { ...job, revision: 3, contentHash: "new" },
      provider: {
        receiptId: "r1",
        contentHash: "abc",
        revision: 2,
        extractorVersion: "gemini-test",
        fields: [{ name: "total", value: "99.00", region: null, unreadable: false, ambiguous: false }],
      },
    });
    expect(late.status).toBe("stale");
    expect(late.fields).toEqual([]);
    expect(replaced.history[0]?.correctedValue).toBe("24.00");
  });

  it("keeps the existing claim when extraction output is invalid", () => {
    const fields = correctField(
      [{ name: "total", candidateValue: "24.00", correctedValue: null, region: null, sourceRevision: 1, correctedAtRevision: null, status: "candidate" }],
      "total",
      "24.00",
      1,
    );
    const failed = finishExtractionJob({
      fields,
      job: { id: "j", receiptId: "r", contentHash: "h", revision: 1 },
      provider: { error: "Gemini output did not match the receipt schema." },
    });
    expect(failed.status).toBe("failed");
    expect(effectiveFieldValue(failed.fields[0]!)).toBe("24.00");
    const parsed = parseGeminiReceipt("not json", { receiptId: "r", contentHash: "h", revision: 1 });
    expect("error" in parsed).toBe(true);
  });

  it("accepts a schema-valid Gemini payload and drops an invalid region", () => {
    const text = JSON.stringify({
      vendor: { value: "Riverside Rail", region: { x: 0.1, y: 0.1, width: 0.4, height: 0.1 } },
      receiptDate: { value: "2025-01-18" },
      reference: { value: null, unreadable: true },
      currency: { value: "USD" },
      total: { value: 24, region: { x: 2, y: 0, width: 0.2, height: 0.2 } },
      category: { value: "transit" },
    });
    const parsed = parseGeminiReceipt(text, { receiptId: "r", contentHash: "h", revision: 3 });
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.fields.find((field) => field.name === "total")?.region).toBeNull();
    expect(parsed.fields.find((field) => field.name === "vendor")?.value).toBe("Riverside Rail");
    expect(parsed.fields.find((field) => field.name === "reference")?.unreadable).toBe(true);
  });
});
