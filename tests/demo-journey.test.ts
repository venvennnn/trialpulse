import { describe, expect, it } from "vitest";
import { claimSummary, addSample, applySimulatedResult, approveChecked, beginCapture, declineChecked, queueClaims, queuePayout, rotateDestination, setSimulation, submitDraft, toggleLine, selectClaim } from "@/demo/logic";
import { createSeedState, HERO_CLAIM_ID } from "@/demo/seed";
import { formatUsd } from "@/domain/money";

describe("public demo journey without credentials", () => {
  it("submits $40, pays $24, leaves $16 in review, then pays exactly $16", () => {
    let state = createSeedState();
    expect(state.seedLoaded).toBe(true);
    expect(queueClaims(state)).toHaveLength(12);
    expect(formatUsd(4000)).toBe("$40.00");

    state = beginCapture(state, "act_pantry");
    const draftId = state.ui.draftClaimId;
    if (!draftId) throw new Error("draft missing");
    state = addSample(state, draftId, "train");
    state = addSample(state, draftId, "supplies");
    state = submitDraft(state, draftId);
    const submitted = state.claims.find((claim) => claim.id === draftId);
    if (!submitted) throw new Error("claim missing");
    expect(submitted.lines.reduce((total, line) => total + line.claimedAmount, 0)).toBe(4000);
    expect(submitted.policyVersionId).toBeTruthy();
    const fare = submitted.lines.find((line) => line.category === "transit");
    const supplies = submitted.lines.find((line) => line.category === "supplies");
    expect(fare?.flags.some((flag) => flag.code === "eligible")).toBe(true);
    expect(supplies?.flags.some((flag) => flag.code === "possible_duplicate" && flag.candidateClaimId === "TP-1037")).toBe(true);
    expect(state.ui.checkedLineIds).toEqual([fare?.id]);

    state = approveChecked(state, draftId);
    const afterApproval = state.claims.find((claim) => claim.id === draftId)!;
    expect(afterApproval.lines.find((line) => line.id === fare?.id)?.reviewState).toBe("approved");
    expect(afterApproval.lines.find((line) => line.id === supplies?.id)?.reviewState).toBe("submitted");

    state = queuePayout(state, draftId);
    const firstCount = state.payouts.filter((payout) => payout.claimId === draftId);
    expect(firstCount).toHaveLength(1);
    expect(firstCount[0]?.amount).toBe(2400);
    expect(firstCount[0]?.status).toBe("pending");
    expect(firstCount[0]?.lineIds).toEqual([fare?.id]);
    state = queuePayout(state, draftId);
    expect(state.payouts.filter((payout) => payout.claimId === draftId)).toHaveLength(1);

    const summaryBefore = claimSummary(state, draftId);
    expect(summaryBefore?.paid).toBe(0);
    expect(summaryBefore?.inProgress).toBe(2400);
    expect(summaryBefore?.underReview).toBe(1600);

    state = applySimulatedResult(state, firstCount[0]!.id);
    const paid = claimSummary(state, draftId);
    expect(paid?.paid).toBe(2400);
    expect(paid?.underReview).toBe(1600);
    expect(state.payouts.find((payout) => payout.id === firstCount[0]?.id)?.providerRawStatus).toBe("SUCCESS");
    expect(state.timeline.some((entry) => entry.detail.includes("Demo · Simulated"))).toBe(true);

    state = selectClaim(state, draftId);
    state = toggleLine(state, supplies!.id);
    state = approveChecked(state, draftId, "Shelf log shows this is a separate purchase.");
    expect(state.judgements.some((item) => item.judgement === "dismissed" && item.candidateClaimId === "TP-1037")).toBe(true);
    state = queuePayout(state, draftId);
    const second = state.payouts.filter((payout) => payout.claimId === draftId && payout.id !== firstCount[0]?.id);
    expect(second).toHaveLength(1);
    expect(second[0]?.amount).toBe(1600);
    expect(second[0]?.lineIds).toEqual([supplies?.id]);
    const frozenEmail = firstCount[0]?.recipientEmail;
    state = rotateDestination(state);
    expect(state.payouts.find((payout) => payout.id === firstCount[0]?.id)?.recipientEmail).toBe(frozenEmail);
    expect(state.destination.version).toBe(2);
    expect(state.claims.find((claim) => claim.id === HERO_CLAIM_ID)).toBeTruthy();
  });

  it("never puts a declined line into a payout snapshot", () => {
    let state = createSeedState();
    state = beginCapture(state, "act_food");
    const draftId = state.ui.draftClaimId!;
    state = addSample(state, draftId, "supplies");
    state = submitDraft(state, draftId);
    const lineId = state.claims.find((claim) => claim.id === draftId)!.lines[0]!.id;
    state = selectClaim(state, draftId);
    state = toggleLine(state, lineId);
    state = declineChecked(state, draftId, "Same receipt as TP-1037.");
    const declined = queuePayout(state, draftId);
    expect(declined.lastError).toMatch(/No approved unpaid lines/);
    expect(declined.payouts.some((payout) => payout.lineIds.includes(lineId))).toBe(false);
  });

  it("can leave a simulated payout pending or failed without marking it paid", () => {
    let state = setSimulation(createSeedState(), "processing");
    state = beginCapture(state, "act_pantry");
    const draftId = state.ui.draftClaimId!;
    state = addSample(state, draftId, "train");
    state = submitDraft(state, draftId);
    state = approveChecked(state, draftId);
    state = queuePayout(state, draftId);
    const payoutId = state.ui.lastPayoutId!;
    state = applySimulatedResult(state, payoutId);
    expect(state.payouts.find((payout) => payout.id === payoutId)?.status).toBe("pending");
    expect(claimSummary(state, draftId)?.paid).toBe(0);
    state = setSimulation(state, "failure");
    state = applySimulatedResult(state, payoutId);
    expect(state.payouts.find((payout) => payout.id === payoutId)?.status).toBe("failed");
    expect(claimSummary(state, draftId)?.paid).toBe(0);
    expect(claimSummary(state, draftId)?.approvedUnpaid).toBe(2400);
  });
});
