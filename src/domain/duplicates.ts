import type { Cents } from "./money";

/** Explainable weights. A similarity score never finalizes a claim decision. */
export const DUPLICATE_WEIGHTS = {
  image: 0.35,
  merchant: 0.25,
  amount: 0.2,
  date: 0.15,
  reference: 0.05,
} as const;

export interface DuplicateQuery {
  workspaceId: string;
  receiptId: string;
  claimId: string;
  lineId: string;
  claimantId: string;
  contentHash: string;
  perceptualHash: string | null;
  merchant: string;
  reference: string | null;
  currency: string;
  amount: Cents;
  expenseDate: string;
  category: string;
  /** Passenger identity for transit hard-negatives. Same-day same-fare tickets from different people are not duplicates. */
  passengerKey: string | null;
}

export interface RankedDuplicate {
  candidate: DuplicateQuery;
  score: number;
  reasons: string[];
}

const DATE_WINDOW_DAYS = 3;
const FLAG_THRESHOLD = 0.62;

export function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function tokenSimilarity(a: string, b: string): number {
  const left = new Set(normalizeTokens(a));
  const right = new Set(normalizeTokens(b));
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function averageHash(gray: Uint8Array, width: number, height: number): string {
  if (width < 1 || height < 1 || gray.length < width * height) {
    throw new Error("averageHash needs grayscale pixels.");
  }
  const cells: number[] = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const x0 = Math.floor((x * width) / 8);
      const x1 = Math.floor(((x + 1) * width) / 8);
      const y0 = Math.floor((y * height) / 8);
      const y1 = Math.floor(((y + 1) * height) / 8);
      let sum = 0;
      let count = 0;
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          sum += gray[py * width + px] ?? 0;
          count += 1;
        }
      }
      cells.push(count === 0 ? 0 : sum / count);
    }
  }
  const mean = cells.reduce((total, value) => total + value, 0) / cells.length;
  const bits = cells.map((value) => (value >= mean ? "1" : "0")).join("");
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingHex(a: string, b: string): number {
  const length = Math.max(a.length, b.length);
  let distance = 0;
  for (let i = 0; i < length; i += 1) {
    const left = Number.parseInt(a[i] ?? "0", 16);
    const right = Number.parseInt(b[i] ?? "0", 16);
    let xor = left ^ right;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

function dayDiff(a: string, b: string): number {
  const left = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const right = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  return Math.abs(Math.round((left - right) / 86_400_000));
}

function imageScore(query: DuplicateQuery, candidate: DuplicateQuery): { score: number; reason: string | null } {
  if (query.contentHash && query.contentHash === candidate.contentHash) {
    return { score: 1, reason: "Identical file contents" };
  }
  if (query.perceptualHash && candidate.perceptualHash) {
    const distance = hammingHex(query.perceptualHash, candidate.perceptualHash);
    const score = Math.max(0, 1 - distance / 16);
    if (distance <= 6) return { score, reason: "Image looks like a resized or recompressed copy" };
    if (score >= 0.55) return { score, reason: "Similar receipt image" };
    return { score, reason: null };
  }
  return { score: 0, reason: null };
}

/**
 * Rank duplicate candidates inside one workspace.
 * Same-day, same-fare transit receipts from different passengers are hard negatives
 * unless the file itself matches.
 */
export function rankDuplicates(query: DuplicateQuery, candidates: DuplicateQuery[]): RankedDuplicate[] {
  const ranked: RankedDuplicate[] = [];
  for (const candidate of candidates) {
    if (candidate.workspaceId !== query.workspaceId) continue;
    if (candidate.receiptId === query.receiptId) continue;
    if (candidate.currency !== query.currency) continue;
    const dates = dayDiff(query.expenseDate, candidate.expenseDate);
    const image = imageScore(query, candidate);
    const identicalFile = query.contentHash === candidate.contentHash;
    if (!identicalFile && dates > DATE_WINDOW_DAYS) continue;

    const hardNegative =
      !identicalFile &&
      image.score < 0.85 &&
      query.category === "transit" &&
      candidate.category === "transit" &&
      dates === 0 &&
      query.amount === candidate.amount &&
      query.passengerKey !== null &&
      candidate.passengerKey !== null &&
      query.passengerKey !== candidate.passengerKey;
    if (hardNegative) continue;

    const merchant = tokenSimilarity(query.merchant, candidate.merchant);
    const amount =
      query.amount === candidate.amount
        ? 1
        : Math.max(0, 1 - Math.abs(query.amount - candidate.amount) / Math.max(query.amount, 1));
    const dateScore = dates === 0 ? 1 : dates === 1 ? 0.7 : dates === 2 ? 0.4 : 0.2;
    const reference = query.reference && candidate.reference && query.reference === candidate.reference ? 1 : 0;
    const score =
      DUPLICATE_WEIGHTS.image * image.score +
      DUPLICATE_WEIGHTS.merchant * merchant +
      DUPLICATE_WEIGHTS.amount * amount +
      DUPLICATE_WEIGHTS.date * dateScore +
      DUPLICATE_WEIGHTS.reference * reference;
    if (!identicalFile && score < FLAG_THRESHOLD) continue;
    const reasons = [
      image.reason,
      merchant >= 0.8 ? "Same merchant" : null,
      query.amount === candidate.amount ? "Same amount" : null,
      dates === 0 ? "Same date" : dates <= DATE_WINDOW_DAYS ? "Close expense dates" : null,
      reference ? "Same receipt reference" : null,
    ].filter((reason): reason is string => Boolean(reason));
    ranked.push({ candidate, score, reasons });
  }
  ranked.sort((a, b) => b.score - a.score || a.candidate.claimId.localeCompare(b.candidate.claimId));
  return ranked;
}

export function recallAtK(rankedIds: string[], relevantIds: string[], k: number): { hit: number; relevant: number } {
  const top = new Set(rankedIds.slice(0, k));
  const hit = relevantIds.filter((id) => top.has(id)).length;
  return { hit, relevant: relevantIds.length };
}
