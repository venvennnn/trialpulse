import { describe, expect, it } from "vitest";
import { averageHash, hammingHex, rankDuplicates, recallAtK, type DuplicateQuery } from "@/domain/duplicates";
import { duplicateReport } from "@/eval/metrics";

function fare(id: string, passenger: string, hash = `hash-${id}`): DuplicateQuery {
  return {
    workspaceId: "ws",
    receiptId: `r-${id}`,
    claimId: id,
    lineId: "L",
    claimantId: passenger,
    contentHash: hash,
    perceptualHash: passenger === "maya" ? "1111111111111111" : passenger === "daniel" ? "2222222222222222" : "3333333333333333",
    merchant: "Riverside Rail",
    reference: "one-way",
    currency: "USD",
    amount: 2400,
    expenseDate: "2025-01-18",
    category: "transit",
    passengerKey: passenger,
  };
}

describe("duplicate evidence", () => {
  it("does not flag same-day same-fare receipts from different passengers", () => {
    const query = fare("TP-1042", "maya", "hash-maya");
    const ranked = rankDuplicates(query, [fare("TP-1041", "daniel", "hash-daniel"), fare("TP-1032", "chris", "hash-chris")]);
    expect(ranked).toHaveLength(0);
  });

  it("flags an identical file and a close recompression, and ignores another workspace", () => {
    const query = fare("TP-1042", "maya", "same-file");
    query.perceptualHash = "aaaaaaaaaaaaaaaa";
    const copy = fare("TP-copy", "maya", "same-file");
    copy.perceptualHash = "aaaaaaaaaaaaaaab";
    const resized = fare("TP-resized", "other", "different-file");
    resized.perceptualHash = "aaaaaaaaaaaaaaab";
    resized.passengerKey = "other";
    const foreign = fare("TP-foreign", "maya", "same-file");
    foreign.workspaceId = "ws_other";
    const ranked = rankDuplicates(query, [copy, resized, foreign]);
    expect(ranked.map((item) => item.candidate.claimId)).toContain("TP-copy");
    expect(ranked.map((item) => item.candidate.claimId)).not.toContain("TP-foreign");
    expect(ranked[0]?.reasons.join(" ")).toMatch(/Identical file contents|Same merchant/);
    const recall = recallAtK(ranked.map((item) => item.candidate.claimId), ["TP-copy", "TP-resized"], 3);
    expect(recall).toEqual({ hit: 2, relevant: 2 });
  });

  it("reports pilot recall at 3 and a zero legitimate flag rate", () => {
    const report = duplicateReport();
    expect(report.recallAt3).toEqual({ hit: 3, relevant: 3 });
    expect(report.legitimateFlagRate).toEqual({ flagged: 0, legitimate: 1 });
    expect(report.reviewRate.claims).toBeGreaterThanOrEqual(24);
    expect(report.reviewRate.review).toBeGreaterThan(0);
    expect(report.reviewRate.claims).toBeLessThanOrEqual(30);
  });

  it("hashes grayscale pixels", () => {
    const width = 8;
    const height = 8;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i += 1) gray[i] = i % 2 === 0 ? 255 : 0;
    const hash = averageHash(gray, width, height);
    expect(hash).toHaveLength(16);
    expect(hammingHex(hash, hash)).toBe(0);
    expect(hammingHex(hash, "0000000000000000")).toBeGreaterThan(0);
  });
});
