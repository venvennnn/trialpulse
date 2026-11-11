import { sumBalances } from "@/domain/balances";
import { decideLine } from "@/domain/decisions";
import { rankDuplicates, type DuplicateQuery } from "@/domain/duplicates";
import { parseUsdToCents } from "@/domain/money";
import { VOLUNTEER_POLICY_V1, evaluatePolicy } from "@/domain/policy";
import { applyCanonical, applySubmitResult, availableToReserve, planPayout, type CanonicalItem } from "@/domain/payouts";
import type { LedgerLine } from "@/domain/types";
import { formatUsd } from "@/domain/money";
import { GENERIC_FARE, RIVERSIDE, SUPPLIES } from "./geometry";
import { ALEX_ID, DEMO_WORKSPACE_ID, HERO_CLAIM_ID, MAYA_ID, POLICY_ID, createSeedState } from "./seed";
import type { DemoClaim, DemoLine, DemoReceipt, DemoRole, DemoState, SimulationMode } from "./types";

export function freshSeed(): DemoState {
  return createSeedState();
}

function consumeForcedError(state: DemoState): DemoState | null {
  if (!state.forceError) return null;
  return { ...state, forceError: false, lastError: "The action could not be completed. Nothing was changed." };
}

function advance(state: DemoState, minutes = 1): DemoState {
  return { ...state, clock: new Date(Date.parse(state.clock) + minutes * 60_000).toISOString(), lastError: null };
}

function withError(state: DemoState, message: string): DemoState {
  return { ...state, lastError: message };
}

function toLedger(claim: DemoClaim, line: DemoLine): LedgerLine {
  return {
    id: line.id,
    workspaceId: claim.workspaceId,
    claimId: claim.id,
    claimantId: claim.claimantId,
    reviewState: line.reviewState,
    claimedAmount: line.claimedAmount,
    approvedAmount: line.approvedAmount,
    currency: "USD",
    revision: line.revision,
  };
}

export function selectionFor(claim: DemoClaim): DemoState["ui"] {
  const open = claim.lines.filter((line) => line.reviewState === "submitted" || line.reviewState === "needs_clarification");
  const ready = open.filter((line) => line.flags.some((flag) => flag.code === "eligible") && !line.flags.some((flag) => flag.severity === "exception"));
  const focused = ready[0] ?? open[0] ?? claim.lines[0] ?? null;
  return {
    activeClaimId: claim.id,
    focusedLineId: focused?.id ?? null,
    checkedLineIds: ready.map((line) => line.id),
    expandedLineIds: claim.lines.filter((line) => line.flags.some((flag) => flag.code === "possible_duplicate")).map((line) => line.id),
    draftClaimId: claim.submittedAt ? null : claim.id,
    payoutAttempt: "attempt_1",
    lastPayoutId: null,
  };
}

function replaceClaim(state: DemoState, claim: DemoClaim): DemoState {
  return { ...state, claims: state.claims.map((item) => (item.id === claim.id ? claim : item)) };
}

export function setRole(state: DemoState, role: DemoRole): DemoState {
  return { ...state, role };
}

export function setSimulation(state: DemoState, simulation: SimulationMode): DemoState {
  return { ...state, simulation };
}

export function setForceError(state: DemoState, forceError: boolean): DemoState {
  return { ...state, forceError };
}

export function dismissError(state: DemoState): DemoState {
  return { ...state, lastError: null };
}

export function selectClaim(state: DemoState, claimId: string): DemoState {
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) return withError(state, "Claim not found.");
  return {
    ...state,
    lastError: null,
    ui: { ...selectionFor(claim), payoutAttempt: state.ui.payoutAttempt, lastPayoutId: state.ui.lastPayoutId, draftClaimId: state.ui.draftClaimId },
  };
}

export function focusLine(state: DemoState, lineId: string): DemoState {
  return { ...state, ui: { ...state.ui, focusedLineId: lineId } };
}

export function toggleLine(state: DemoState, lineId: string): DemoState {
  const claim = state.claims.find((item) => item.id === state.ui.activeClaimId);
  const line = claim?.lines.find((item) => item.id === lineId);
  if (!line || (line.reviewState !== "submitted" && line.reviewState !== "needs_clarification")) return state;
  const checked = state.ui.checkedLineIds.includes(lineId)
    ? state.ui.checkedLineIds.filter((id) => id !== lineId)
    : [...state.ui.checkedLineIds, lineId];
  return { ...state, ui: { ...state.ui, checkedLineIds: checked, focusedLineId: lineId } };
}

export function toggleExpanded(state: DemoState, lineId: string): DemoState {
  const expanded = state.ui.expandedLineIds.includes(lineId)
    ? state.ui.expandedLineIds.filter((id) => id !== lineId)
    : [...state.ui.expandedLineIds, lineId];
  return { ...state, ui: { ...state.ui, expandedLineIds: expanded, focusedLineId: lineId } };
}

export function claimSummary(state: DemoState, claimId: string) {
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) return null;
  return sumBalances(
    claim.lines.map((line) => toLedger(claim, line)),
    state.payouts,
  );
}

function queries(state: DemoState): DuplicateQuery[] {
  const found: DuplicateQuery[] = [];
  for (const claim of state.claims) {
    for (const line of claim.lines) {
      if (!line.receiptId || !line.expenseDate || line.claimedAmount <= 0) continue;
      const proof = state.receipts.find((item) => item.id === line.receiptId);
      if (!proof || proof.kind !== "receipt") continue;
      found.push({
        workspaceId: claim.workspaceId,
        receiptId: proof.id,
        claimId: claim.id,
        lineId: line.id,
        claimantId: claim.claimantId,
        contentHash: proof.contentHash,
        perceptualHash: proof.perceptualHash,
        merchant: proof.merchant,
        reference: proof.reference,
        currency: "USD",
        amount: line.claimedAmount,
        expenseDate: line.expenseDate,
        category: line.category,
        passengerKey: line.category === "transit" ? claim.claimantId : null,
      });
    }
  }
  return found;
}

function nextPublicId(state: DemoState): string {
  const numbers = state.claims.map((claim) => Number(claim.id.replace("TP-", ""))).filter((value) => Number.isInteger(value));
  return `TP-${Math.max(...numbers) + 1}`;
}

export function beginCapture(state: DemoState, activityId: string): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const existing = state.claims.find((claim) => claim.id === state.ui.draftClaimId && !claim.submittedAt);
  if (existing && existing.activityId === activityId) return { ...state, lastError: null };
  const activity = state.activities.find((item) => item.id === activityId);
  if (!activity) return withError(state, "Choose an activity you attended.");
  const stepped = advance(state);
  const id = nextPublicId(state);
  const claim: DemoClaim = {
    id,
    workspaceId: DEMO_WORKSPACE_ID,
    claimantId: MAYA_ID,
    claimantName: "Maya Chen",
    activityId: activity.id,
    activityName: activity.name,
    activityDate: activity.date,
    programId: "prog_nutrition",
    programName: "Community Nutrition",
    submittedAt: null,
    dueAt: null,
    lastActionAt: stepped.clock,
    createdAt: stepped.clock,
    revision: 1,
    policyVersionId: null,
    lines: [],
    receiptOrder: [],
  };
  return {
    ...stepped,
    claims: [...stepped.claims, claim],
    ui: { ...stepped.ui, draftClaimId: id, activeClaimId: id, focusedLineId: null, checkedLineIds: [], expandedLineIds: [] },
  };
}

export function addSample(state: DemoState, claimId: string, sample: "train" | "supplies" | "unreadable"): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim || claim.submittedAt) return withError(state, "Samples can be added to an open draft.");
  if (claim.lines.some((line) => line.id.endsWith(`_${sample}`))) return withError(state, "That sample is already on this claim.");
  const stepped = advance(state);
  const lineId = `ln_${claim.id.toLowerCase()}_${sample}`;
  const receiptId = `rcpt_${claim.id.toLowerCase()}_${sample}`;
  let proof: DemoReceipt;
  let draft: DemoLine;
  if (sample === "train") {
    proof = {
      id: receiptId,
      claimId,
      fileName: "riverside-rail.svg",
      src: RIVERSIDE.src,
      width: RIVERSIDE.width,
      height: RIVERSIDE.height,
      contentHash: `hash_riverside_${claim.id}`,
      perceptualHash: "fedcba9876543210",
      merchant: "Riverside Rail",
      reference: `RIV-${claim.id}`,
      alt: "Sample Riverside Rail receipt totaling $24.00.",
      regions: RIVERSIDE.regions,
      kind: "receipt",
      fields: [
        { name: "vendor", label: "Vendor", value: "Riverside Rail" },
        { name: "receiptDate", label: "Date", value: claim.activityDate },
        { name: "total", label: "Total", value: "$24.00" },
        { name: "category", label: "Category", value: "transit" },
      ],
    };
    draft = baseLine(lineId, proof.id, {
      category: "transit",
      title: "Train fare",
      detail: "Transit to/from volunteer site",
      claimedAmount: 2400,
      expenseDate: claim.activityDate,
    });
  } else if (sample === "supplies") {
    proof = {
      id: receiptId,
      claimId,
      fileName: "community-supplies.svg",
      src: SUPPLIES.src,
      width: SUPPLIES.width,
      height: SUPPLIES.height,
      contentHash: `hash_supplies_${claim.id}`,
      perceptualHash: "aaaaaaaaaaaaaaaa",
      merchant: "Community Supplies",
      reference: `4418-${claim.id}`,
      alt: "Sample Community Supplies receipt totaling $16.00.",
      regions: SUPPLIES.regions,
      kind: "receipt",
      fields: [
        { name: "vendor", label: "Vendor", value: "Community Supplies" },
        { name: "receiptDate", label: "Date", value: claim.activityDate },
        { name: "total", label: "Total", value: "$16.00" },
        { name: "category", label: "Category", value: "supplies" },
      ],
    };
    draft = baseLine(lineId, proof.id, {
      category: "supplies",
      title: "Supplies",
      detail: "Pantry supplies (non-food)",
      claimedAmount: 1600,
      expenseDate: claim.activityDate,
    });
  } else {
    proof = {
      id: receiptId,
      claimId,
      fileName: "unreadable.svg",
      src: "/receipts/unreadable.svg?v=2",
      width: GENERIC_FARE.width,
      height: GENERIC_FARE.height,
      contentHash: `hash_unreadable_${claim.id}`,
      perceptualHash: null,
      merchant: "",
      reference: null,
      alt: "Receipt photo that could not be read. Enter the amount manually.",
      regions: {},
      kind: "receipt",
      fields: [],
    };
    draft = baseLine(lineId, proof.id, {
      category: "",
      title: "Unreadable receipt",
      detail: "Extraction failed. Enter the amount, category, and date.",
      claimedAmount: 0,
      expenseDate: null,
    });
    draft.flags = [
      { code: "unreadable_date", severity: "exception", message: "Extraction failed. Enter the amount, category, and date yourself." },
    ];
  }
  return {
    ...stepped,
    receipts: [...stepped.receipts, proof],
    ui: { ...stepped.ui, focusedLineId: lineId },
    claims: stepped.claims.map((item) =>
      item.id === claimId ? { ...item, revision: item.revision + 1, lines: [...item.lines, draft], receiptOrder: [...item.receiptOrder, proof.id], lastActionAt: stepped.clock } : item,
    ),
  };
}

function baseLine(id: string, receiptId: string, fields: Pick<DemoLine, "category" | "title" | "detail" | "claimedAmount" | "expenseDate">): DemoLine {
  return {
    id,
    ...fields,
    approvedAmount: 0,
    currency: "USD",
    reviewState: "draft",
    revision: 1,
    receiptId,
    highlightField: "total",
    policyVersionId: POLICY_ID,
    flags: [],
    requiresOverrideReason: false,
    clarification: null,
    reply: null,
  };
}

export function correctDraftLine(
  state: DemoState,
  claimId: string,
  lineId: string,
  patch: { amount?: string; category?: string; expenseDate?: string; title?: string },
): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const claim = state.claims.find((item) => item.id === claimId);
  const line = claim?.lines.find((item) => item.id === lineId);
  if (!claim || !line || line.reviewState !== "draft") return withError(state, "Only draft lines can be corrected.");
  const amount = patch.amount != null ? parseUsdToCents(patch.amount) : line.claimedAmount;
  if (amount == null) return withError(state, "Enter an amount like 16.00.");
  const category = patch.category ?? line.category;
  const titles: Record<string, { title: string; detail: string }> = {
    transit: { title: "Train fare", detail: "Transit to/from volunteer site" },
    supplies: { title: "Supplies", detail: "Pantry supplies (non-food)" },
    meals: { title: "Meal", detail: "Meal during the activity" },
  };
  const named = titles[category];
  const next: DemoLine = {
    ...line,
    claimedAmount: amount,
    category,
    title: patch.title || named?.title || line.title,
    detail: named?.detail || line.detail,
    expenseDate: patch.expenseDate === undefined ? line.expenseDate : patch.expenseDate || null,
    revision: line.revision + 1,
    flags: line.flags.filter((flag) => flag.code !== "unreadable_date"),
  };
  return replaceClaim(advance(state), {
    ...claim,
    revision: claim.revision + 1,
    lines: claim.lines.map((item) => (item.id === lineId ? next : item)),
  });
}

export function removeDraftLine(state: DemoState, claimId: string, lineId: string): DemoState {
  const claim = state.claims.find((item) => item.id === claimId);
  const line = claim?.lines.find((item) => item.id === lineId);
  if (!claim || !line || line.reviewState !== "draft") return withError(state, "Only draft lines can be removed.");
  return replaceClaim(advance(state), {
    ...claim,
    lines: claim.lines.filter((item) => item.id !== lineId),
    receiptOrder: claim.receiptOrder.filter((id) => id !== line.receiptId),
  });
}

export function submitDraft(state: DemoState, claimId: string): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) return withError(state, "Claim not found.");
  if (claim.submittedAt) return withError(state, "This claim was already submitted.");
  if (claim.lines.length === 0) return withError(state, "Add at least one receipt line.");
  for (const line of claim.lines) {
    if (!line.category || line.claimedAmount <= 0 || !line.expenseDate) {
      return withError(state, "Each line needs a category, date, and amount. You can type them when extraction fails.");
    }
  }
  const stepped = advance(state);
  const pool = queries(stepped).filter((query) => query.claimId !== claim.id);
  const lines = claim.lines.map((line) => decorateSubmittedLine(stepped, claim, line, pool));
  const due = new Date(Date.parse(stepped.clock) + VOLUNTEER_POLICY_V1.reviewSlaHours * 60 * 60 * 1000).toISOString();
  const submitted: DemoClaim = {
    ...claim,
    submittedAt: stepped.clock,
    dueAt: due,
    lastActionAt: stepped.clock,
    revision: claim.revision + 1,
    policyVersionId: POLICY_ID,
    lines,
  };
  const next = replaceClaim(stepped, submitted);
  const selection = selectionFor(submitted);
  return {
    ...next,
    timeline: [
      {
        id: `tl_${claim.id}_submit_${stepped.seq}`,
        claimId: claim.id,
        at: stepped.clock,
        label: "Claim submitted",
        detail: `${claim.claimantName} submitted ${formatUsd(lines.reduce((total, line) => total + line.claimedAmount, 0))}.`,
        tone: "neutral",
      },
      ...next.timeline,
    ],
    ui: { ...next.ui, ...selection, payoutAttempt: next.ui.payoutAttempt, draftClaimId: null },
  };
}

function decorateSubmittedLine(state: DemoState, claim: DemoClaim, line: DemoLine, pool: DuplicateQuery[]): DemoLine {
  const proof = state.receipts.find((item) => item.id === line.receiptId);
  const policy = evaluatePolicy(VOLUNTEER_POLICY_V1, {
    category: line.category,
    claimedAmount: line.claimedAmount,
    currency: "USD",
    expenseDate: line.expenseDate,
    activityDate: claim.activityDate,
    attendance: "assigned",
    hasEvidence: Boolean(proof && proof.kind === "receipt"),
    receiptTotal: line.claimedAmount,
    receiptCurrency: "USD",
    dateUnreadable: !line.expenseDate,
  });
  const query: DuplicateQuery | null = proof && line.expenseDate
    ? {
        workspaceId: claim.workspaceId,
        receiptId: proof.id,
        claimId: claim.id,
        lineId: line.id,
        claimantId: claim.claimantId,
        contentHash: proof.contentHash,
        perceptualHash: proof.perceptualHash,
        merchant: proof.merchant,
        reference: proof.reference,
        currency: "USD",
        amount: line.claimedAmount,
        expenseDate: line.expenseDate,
        category: line.category,
        passengerKey: line.category === "transit" ? claim.claimantId : null,
      }
    : null;
  const ranked = query ? rankDuplicates(query, pool) : [];
  const flags: DemoLine["flags"] = policy.flags.map((flag) => ({ code: flag.code, severity: flag.severity, message: flag.message }));
  const top = ranked[0];
  if (top) {
    const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${top.candidate.expenseDate}T00:00:00Z`),
    );
    flags.push({
      code: "possible_duplicate",
      severity: "exception",
      message: `Matches a prior claim (${top.candidate.claimId}) for similar items at the same store on ${when} (${formatUsd(top.candidate.amount)}). Please verify if this is a separate purchase.`,
      candidateClaimId: top.candidate.claimId,
      merchant: top.candidate.merchant,
      descriptor: "Office & Pantry Supplies",
      expenseDate: top.candidate.expenseDate,
      amount: top.candidate.amount,
      receiptId: top.candidate.receiptId,
      reasons: top.reasons,
    });
  }
  return {
    ...line,
    reviewState: "submitted",
    revision: line.revision + 1,
    flags,
    requiresOverrideReason: flags.some((flag) => flag.severity === "exception"),
    policyVersionId: POLICY_ID,
  };
}

export function approveChecked(state: DemoState, claimId: string, reason = ""): DemoState {
  return decideChecked(state, claimId, "approved", reason);
}

export function declineChecked(state: DemoState, claimId: string, reason: string): DemoState {
  return decideChecked(state, claimId, "declined", reason);
}

export function clarifyChecked(state: DemoState, claimId: string, reason: string): DemoState {
  return decideChecked(state, claimId, "needs_clarification", reason);
}

function decideChecked(state: DemoState, claimId: string, outcome: "approved" | "declined" | "needs_clarification", reason: string): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) return withError(state, "Claim not found.");
  const ids = state.ui.checkedLineIds.filter((id) => claim.lines.some((line) => line.id === id && (line.reviewState === "submitted" || line.reviewState === "needs_clarification")));
  if (ids.length === 0) return withError(state, "Select at least one line that is still open.");
  const capFor = (category: string) => VOLUNTEER_POLICY_V1.categories[category]?.cap ?? null;
  const planned: { id: string; approvedAmount: number; reviewState: DemoLine["reviewState"]; revision: number; reason: string }[] = [];
  for (const id of ids) {
    const line = claim.lines.find((item) => item.id === id)!;
    const result = decideLine({
      line: {
        id: line.id,
        reviewState: line.reviewState,
        claimedAmount: line.claimedAmount,
        approvedAmount: line.approvedAmount,
        revision: line.revision,
        policyVersionId: line.policyVersionId,
        requiresOverrideReason: line.requiresOverrideReason,
      },
      expectedRevision: line.revision,
      outcome,
      amount: outcome === "approved" ? line.claimedAmount : undefined,
      reason,
      actorId: ALEX_ID,
      now: state.clock,
      policyCap: capFor(line.category),
    });
    if (!result.ok) return withError(state, result.message);
    planned.push({
      id,
      approvedAmount: result.line.approvedAmount,
      reviewState: result.line.reviewState,
      revision: result.line.revision,
      reason: result.decision.reason,
    });
  }
  const stepped = advance(state);
  const lines = claim.lines.map((line) => {
    const next = planned.find((item) => item.id === line.id);
    if (!next) return line;
    return { ...line, approvedAmount: next.approvedAmount, reviewState: next.reviewState, revision: next.revision, clarification: outcome === "needs_clarification" ? reason : line.clarification };
  });
  const judgements = [...stepped.judgements];
  if (outcome === "approved" || outcome === "declined") {
    for (const id of ids) {
      const line = claim.lines.find((item) => item.id === id)!;
      const duplicate = line.flags.find((flag) => flag.code === "possible_duplicate" && flag.candidateClaimId);
      if (!duplicate?.candidateClaimId) continue;
      judgements.push({
        lineId: id,
        candidateClaimId: duplicate.candidateClaimId,
        judgement: outcome === "approved" ? "dismissed" : "confirmed",
        actorId: ALEX_ID,
        at: stepped.clock,
        reason,
      });
    }
  }
  const amount = planned.reduce((total, item) => total + (outcome === "approved" ? item.approvedAmount : claim.lines.find((line) => line.id === item.id)!.claimedAmount), 0);
  const label = outcome === "approved" ? `Approved ${formatUsd(amount)}` : outcome === "declined" ? "Line declined" : "Clarification requested";
  const updated = replaceClaim(stepped, { ...claim, lines, lastActionAt: stepped.clock, revision: claim.revision + 1 });
  return {
    ...updated,
    judgements,
    ui: { ...updated.ui, checkedLineIds: updated.ui.checkedLineIds.filter((id) => !ids.includes(id)) },
    timeline: [
      { id: `tl_${claimId}_${outcome}_${stepped.clock}`, claimId, at: stepped.clock, label, detail: reason || "Eligible under the frozen policy version.", tone: outcome === "approved" ? "good" : "exception" },
      ...updated.timeline,
    ],
  };
}

export function keepUnderReview(state: DemoState, claimId: string): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const stepped = advance(state);
  return {
    ...stepped,
    timeline: [
      { id: `tl_keep_${claimId}_${stepped.clock}`, claimId, at: stepped.clock, label: "Kept under review", detail: "No line decision was recorded.", tone: "neutral" },
      ...stepped.timeline,
    ],
  };
}

export function replyToClarification(state: DemoState, claimId: string, lineId: string, message: string): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const claim = state.claims.find((item) => item.id === claimId);
  const line = claim?.lines.find((item) => item.id === lineId);
  if (!claim || !line || line.reviewState !== "needs_clarification") return withError(state, "There is no open question on that line.");
  if (!message.trim()) return withError(state, "Write a reply before sending it.");
  const stepped = advance(state);
  const lines = claim.lines.map((item) =>
    item.id === lineId ? { ...item, reply: message.trim(), reviewState: "submitted" as const, revision: item.revision + 1 } : item,
  );
  return replaceClaim(
    {
      ...stepped,
      timeline: [
        { id: `tl_reply_${lineId}_${stepped.clock}`, claimId, at: stepped.clock, label: "Volunteer replied", detail: message.trim(), tone: "neutral" },
        ...stepped.timeline,
      ],
    },
    { ...claim, lines, lastActionAt: stepped.clock },
  );
}

export function payableLines(state: DemoState, claimId: string) {
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) return [];
  return claim.lines
    .map((line) => ({ line, amount: availableToReserve(toLedger(claim, line), state.payouts) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => a.line.id.localeCompare(b.line.id));
}

export function queuePayout(state: DemoState, claimId: string): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const claim = state.claims.find((item) => item.id === claimId);
  if (!claim) return withError(state, "Claim not found.");
  const payable = payableLines(state, claimId);
  if (payable.length === 0) return withError(state, "No approved unpaid lines are ready for payout.");
  const key = `demo:${claimId}:v${state.destination.version}:${state.ui.payoutAttempt}:${payable.map((item) => item.line.id).join(",")}`;
  const planned = planPayout({
    workspaceId: DEMO_WORKSPACE_ID,
    actorId: ALEX_ID,
    payoutId: `pay_${state.seq + 1}`,
    claimId,
    destination: state.destination,
    expectedDestinationVersion: state.destination.version,
    lines: payable.map((item) => ({ lineId: item.line.id, amount: item.amount })),
    ledger: claim.lines.map((line) => toLedger(claim, line)),
    payouts: state.payouts,
    idempotencyKey: key,
    idempotency: state.idempotency,
    now: state.clock,
  });
  if (!planned.ok) return withError(state, planned.message);
  if (planned.replay) {
    return { ...state, lastError: null, ui: { ...state.ui, lastPayoutId: planned.payout.id } };
  }
  const stepped = advance(state);
  const pending = applySubmitResult(
    planned.payout,
    {
      type: "accepted",
      providerBatchId: `SIMBATCH-${planned.payout.id}`,
      providerItemId: `SIMITEM-${planned.payout.id}`,
      rawStatus: "PENDING",
    },
    stepped.clock,
  );
  return {
    ...stepped,
    seq: stepped.seq + 1,
    payouts: [...stepped.payouts, pending],
    idempotency: [...stepped.idempotency, planned.idempotency],
    ui: { ...stepped.ui, lastPayoutId: pending.id },
    timeline: [
      {
        id: `tl_payout_${pending.id}`,
        claimId,
        at: stepped.clock,
        label: "Payout submitted",
        detail: `Demo · Simulated batch accepted for ${formatUsd(pending.amount)}. Paid is still waiting on the provider item.`,
        tone: "neutral",
      },
      ...stepped.timeline,
    ],
  };
}

export function applySimulatedResult(state: DemoState, payoutId: string): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const payout = state.payouts.find((item) => item.id === payoutId);
  if (!payout || payout.workspaceId !== DEMO_WORKSPACE_ID) return withError(state, "Payout not found.");
  const stepped = advance(state);
  const raw = state.simulation === "success" ? "SUCCESS" : state.simulation === "failure" ? "FAILED" : "PENDING";
  const item: CanonicalItem = {
    senderBatchId: payout.senderBatchId,
    senderItemId: payout.senderItemId,
    providerBatchId: payout.providerBatchId,
    providerItemId: payout.providerItemId,
    amount: payout.amount,
    currency: payout.currency,
    receiverEmail: payout.recipientEmail,
    rawStatus: raw,
    observedAt: stepped.clock,
  };
  const applied = applyCanonical(payout, item);
  const failed = applied.payout.status === "failed" || applied.payout.status === "returned";
  const label =
    applied.payout.status === "succeeded"
      ? `Paid ${formatUsd(applied.payout.amount)}`
      : applied.payout.status === "failed"
        ? "Simulated payout failed"
        : "Still processing";
  return {
    ...stepped,
    payouts: stepped.payouts.map((entry) => (entry.id === payoutId ? applied.payout : entry)),
    ui: failed ? { ...stepped.ui, payoutAttempt: `attempt_${stepped.seq + 1}` } : stepped.ui,
    seq: failed ? stepped.seq + 1 : stepped.seq,
    timeline: [
      {
        id: `tl_sim_${payoutId}_${stepped.clock}`,
        claimId: payout.claimId,
        at: stepped.clock,
        label,
        detail: `Demo · Simulated provider item ${applied.payout.providerRawStatus}. This delay is not a live PayPal call.`,
        tone: applied.payout.status === "succeeded" ? "good" : applied.payout.status === "failed" ? "danger" : "neutral",
      },
      ...stepped.timeline,
    ],
  };
}

export function rotateDestination(state: DemoState): DemoState {
  const forced = consumeForcedError(state);
  if (forced) return forced;
  const stepped = advance(state);
  const version = state.destination.version + 1;
  return {
    ...stepped,
    destination: { ...state.destination, version, email: `maya.v${version}.demo@sandbox.test` },
    ui: { ...stepped.ui, payoutAttempt: `attempt_dest_${version}` },
    timeline: [
      {
        id: `tl_dest_${version}`,
        claimId: state.ui.activeClaimId,
        at: stepped.clock,
        label: "Recipient version updated",
        detail: "New payouts use the new verified destination. Existing snapshots keep the destination they froze.",
        tone: "neutral",
      },
      ...stepped.timeline,
    ],
  };
}

export function restoreHero(state: DemoState): DemoState {
  const fresh = createSeedState();
  const hero = fresh.claims.find((claim) => claim.id === HERO_CLAIM_ID)!;
  const heroReceipts = new Set(hero.receiptOrder);
  return {
    ...state,
    lastError: null,
    claims: [hero, ...state.claims.filter((claim) => claim.id !== HERO_CLAIM_ID)],
    receipts: [...fresh.receipts.filter((receipt) => heroReceipts.has(receipt.id) || receipt.claimId === "TP-1037"), ...state.receipts.filter((receipt) => receipt.claimId !== HERO_CLAIM_ID && receipt.claimId !== "TP-1037")],
    payouts: state.payouts.filter((payout) => payout.claimId !== HERO_CLAIM_ID),
    timeline: [...fresh.timeline.filter((entry) => entry.claimId === HERO_CLAIM_ID), ...state.timeline.filter((entry) => entry.claimId !== HERO_CLAIM_ID)],
    ui: { ...fresh.ui, payoutAttempt: state.ui.payoutAttempt },
  };
}

export function queueClaims(state: DemoState): DemoClaim[] {
  return state.claims
    .filter((claim) => claim.submittedAt && claim.lines.some((line) => line.reviewState === "submitted" || line.reviewState === "needs_clarification"))
    .sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || "") || (a.submittedAt || "").localeCompare(b.submittedAt || ""));
}
