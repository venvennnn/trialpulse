import { rankDuplicates, recallAtK } from "@/domain/duplicates";
import { buildManifest, type ManifestClaim } from "./manifest";

export interface StrategyResult {
  name: string;
  timeToFirstHours: number | null;
  timeToFullHours: number | null;
  unresolvedCentsAtHour3: number;
  incorrectCents: number;
  pendingCount: number;
  pendingAgeHours: number[];
}

function lineEvents(claim: ManifestClaim, mode: "line" | "whole") {
  const events: { hour: number; amount: number; lineId: string; final: "approve" | "decline" }[] = [];
  const allImmediateApprove = claim.lines.every((line) => line.immediate === "approve");
  for (const line of claim.lines) {
    if (line.final !== "approve") continue;
    if (mode === "line") {
      const hour = line.immediate === "approve" ? claim.reviewHour : claim.resolvedHour;
      if (hour == null) continue;
      events.push({ hour: hour + claim.paymentLagHours, amount: line.amount, lineId: line.id, final: line.final });
    } else if (allImmediateApprove) {
      events.push({ hour: claim.reviewHour + claim.paymentLagHours, amount: line.amount, lineId: line.id, final: line.final });
    } else if (claim.resolvedHour != null) {
      events.push({ hour: claim.resolvedHour + claim.paymentLagHours, amount: line.amount, lineId: line.id, final: line.final });
    }
  }
  return events.sort((a, b) => a.hour - b.hour);
}

export function simulate(mode: "line" | "whole"): StrategyResult {
  const manifest = buildManifest();
  const firsts: number[] = [];
  const fulls: number[] = [];
  let unresolved = 0;
  let incorrect = 0;
  const pendingAgeHours: number[] = [];
  const checkpoint = 3;
  for (const claim of manifest.claims) {
    const payable = lineEvents(claim, mode);
    const finalPayable = claim.lines.filter((line) => line.final === "approve").reduce((total, line) => total + line.amount, 0);
    const paidByCheckpoint = payable.filter((event) => event.hour <= checkpoint).reduce((total, event) => total + event.amount, 0);
    const eventual = payable.reduce((total, event) => total + event.amount, 0);
    incorrect += Math.max(0, eventual - finalPayable);
    if (payable[0]) firsts.push(payable[0].hour - claim.submittedHour);
    if (eventual === finalPayable && payable.length) fulls.push(payable[payable.length - 1].hour - claim.submittedHour);
    unresolved += claim.lines.reduce((total, line) => total + line.amount, 0) - paidByCheckpoint;
    for (const line of claim.lines) {
      if (line.immediate === "approve" && line.final === "approve") {
        const paid = payable.find((event) => event.lineId === line.id);
        if (!paid || paid.hour > checkpoint) pendingAgeHours.push(checkpoint - claim.reviewHour);
      }
    }
  }
  const median = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? null;
  };
  return {
    name: mode === "line" ? "line-level" : "whole-claim",
    timeToFirstHours: median(firsts),
    timeToFullHours: median(fulls),
    unresolvedCentsAtHour3: unresolved,
    incorrectCents: incorrect,
    pendingCount: pendingAgeHours.length,
    pendingAgeHours,
  };
}

export function duplicateReport() {
  const manifest = buildManifest();
  let hit = 0;
  let relevant = 0;
  let legitimate = 0;
  let legitimateFlagged = 0;
  for (const testCase of manifest.duplicateCases) {
    const ranked = rankDuplicates(testCase.query, testCase.candidates);
    const recall = recallAtK(
      ranked.map((item) => item.candidate.claimId),
      testCase.relevantIds,
      3,
    );
    hit += recall.hit;
    relevant += recall.relevant;
    for (const id of testCase.legitimateIds) {
      legitimate += 1;
      if (ranked.some((item) => item.candidate.claimId === id)) legitimateFlagged += 1;
    }
  }
  const reviewClaims = manifest.claims.filter((claim) => claim.lines.some((line) => line.immediate !== "approve"));
  return {
    recallAt3: { hit, relevant },
    legitimateFlagRate: { flagged: legitimateFlagged, legitimate },
    reviewRate: { review: reviewClaims.length, claims: manifest.claims.length },
  };
}

export function claimTiming(claimId: string, mode: "line" | "whole", checkpoint = 3) {
  const claim = buildManifest().claims.find((item) => item.id === claimId);
  if (!claim) throw new Error(`Missing manifest claim ${claimId}`);
  const payable = lineEvents(claim, mode);
  const paidByCheckpoint = payable.filter((event) => event.hour <= checkpoint).reduce((total, event) => total + event.amount, 0);
  const submitted = claim.lines.reduce((total, line) => total + line.amount, 0);
  return {
    hoursToFirst: payable[0] ? payable[0].hour - claim.submittedHour : null,
    hoursToFull: payable.length ? payable[payable.length - 1].hour - claim.submittedHour : null,
    unresolvedAtCheckpoint: submitted - paidByCheckpoint,
    paidByCheckpoint,
  };
}

export function evaluationReport(): string {
  const manifest = buildManifest();
  const line = simulate("line");
  const whole = simulate("whole");
  const heroLine = claimTiming("TP-1042", "line");
  const heroWhole = claimTiming("TP-1042", "whole");
  const duplicates = duplicateReport();
  return [
    `Pilot manifest ${manifest.version} · ${manifest.claims.length} claims · simulated timing`,
    `Duplicate recall@3: ${duplicates.recallAt3.hit}/${duplicates.recallAt3.relevant}`,
    `Legitimate-claim duplicate flag rate: ${duplicates.legitimateFlagRate.flagged}/${duplicates.legitimateFlagRate.legitimate}`,
    `Review rate: ${duplicates.reviewRate.review}/${duplicates.reviewRate.claims}`,
    `TP-1042 line-level hours to first eligible reimbursement: ${heroLine.hoursToFirst}`,
    `TP-1042 whole-claim hours to first eligible reimbursement: ${heroWhole.hoursToFirst}`,
    `TP-1042 line-level unresolved cents at hour 3: ${heroLine.unresolvedAtCheckpoint}`,
    `TP-1042 whole-claim unresolved cents at hour 3: ${heroWhole.unresolvedAtCheckpoint}`,
    `Line-level median hours to first eligible reimbursement: ${line.timeToFirstHours}`,
    `Line-level median hours to full reimbursement: ${line.timeToFullHours}`,
    `Line-level unresolved cents at hour 3: ${line.unresolvedCentsAtHour3}`,
    `Line-level incorrect cents: ${line.incorrectCents}`,
    `Line-level awaiting payment at hour 3: ${line.pendingCount}`,
    `Whole-claim median hours to first eligible reimbursement: ${whole.timeToFirstHours}`,
    `Whole-claim median hours to full reimbursement: ${whole.timeToFullHours}`,
    `Whole-claim unresolved cents at hour 3: ${whole.unresolvedCentsAtHour3}`,
    `Whole-claim incorrect cents: ${whole.incorrectCents}`,
    "Timings are simulated from the manifest, not observed Sandbox latency.",
  ].join("\n");
}
