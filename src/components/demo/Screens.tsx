"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useDemo } from "@/demo/context";
import { formatAge, formatShortDate } from "@/demo/format";
import {
  addSample,
  applySimulatedResult,
  approveChecked,
  beginCapture,
  claimSummary,
  clarifyChecked,
  correctDraftLine,
  declineChecked,
  dismissError,
  focusLine,
  keepUnderReview,
  payableLines,
  queuePayout,
  replyToClarification,
  restoreHero,
  rotateDestination,
  selectClaim,
  setForceError,
  setSimulation,
  submitDraft,
  toggleExpanded,
  toggleLine,
} from "@/demo/logic";
import { toReviewView } from "@/demo/present";
import { maskEmail } from "@/domain/mask";
import { formatUsd } from "@/domain/money";
import { ReviewDesk } from "../review/ReviewDesk";

export function ReviewScreen() {
  const demo = useDemo();
  const router = useRouter();
  if (!demo.state) return null;
  const view = toReviewView(demo.state);
  const claimId = demo.state.ui.activeClaimId;
  return (
    <ReviewDesk
      view={view}
      busy={demo.busy}
      error={demo.state.lastError}
      onDismissError={() => demo.replace(dismissError(demo.state!))}
      onSelectClaim={(id) => demo.replace(selectClaim(demo.state!, id))}
      onToggleLine={(id) => demo.replace(toggleLine(demo.state!, id))}
      onFocusLine={(id) => demo.replace(focusLine(demo.state!, id))}
      onToggleExpand={(id) => demo.replace(toggleExpanded(demo.state!, id))}
      onApprove={async (reason) => {
        const next = await demo.run((state) => approveChecked(state, claimId, reason));
        if (next && !next.lastError) router.push(`/demo/finance?claim=${claimId}`);
      }}
      onDecline={(reason) => demo.run((state) => declineChecked(state, claimId, reason))}
      onClarify={(reason) => demo.run((state) => clarifyChecked(state, claimId, reason))}
      onKeep={() => demo.run((state) => keepUnderReview(state, claimId))}
    />
  );
}

export function CaptureScreen() {
  const demo = useDemo();
  const router = useRouter();
  const state = demo.state;
  if (!state) return null;
  const draft = state.claims.find((claim) => claim.id === state.ui.draftClaimId && !claim.submittedAt) ?? null;
  return (
    <div className="stack">
      <div className="page-head">
        <h1>New claim</h1>
        <p>Add the train fare and the supplies receipt. Extraction in the public demo is seeded. A photo that cannot be read stays on the claim for manual entry.</p>
      </div>
      {state.lastError ? <div className="alert" role="alert">{state.lastError}</div> : null}
      <section className="card">
        <label className="field">Activity
          <select
            aria-label="Activity"
            value={draft?.activityId ?? ""}
            onChange={(event) => demo.run((current) => beginCapture(current, event.target.value))}
            disabled={demo.busy}
          >
            <option value="">Choose an activity</option>
            {state.activities.map((activity) => (
              <option key={activity.id} value={activity.id}>{activity.name} · {formatShortDate(activity.date)}</option>
            ))}
          </select>
        </label>
        <div className="action-row">
          <button type="button" className="secondary" disabled={!draft || demo.busy} onClick={() => draft && demo.run((current) => addSample(current, draft.id, "train"))}>Use sample train receipt</button>
          <button type="button" className="secondary" disabled={!draft || demo.busy} onClick={() => draft && demo.run((current) => addSample(current, draft.id, "supplies"))}>Use sample supplies receipt</button>
          <button type="button" className="secondary" disabled={!draft || demo.busy} onClick={() => draft && demo.run((current) => addSample(current, draft.id, "unreadable"))}>Try an unreadable photo</button>
        </div>
        <label className="field">Or upload a receipt
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={!draft || demo.busy}
            onChange={() => draft && demo.run((current) => addSample(current, draft.id, "unreadable"))}
          />
        </label>
        <p className="muted">Uploads in the public demo do not leave this browser and are not sent to Gemini. Use manual entry, or open the Sandbox workspace for real extraction.</p>
      </section>
      {draft?.lines.map((line) => (
        <section key={line.id} className="card">
          <h2>{line.title}</h2>
          {line.flags[0] ? <p className="alert" role="status">{line.flags[0].message}</p> : <p className="ok-note">Seeded fields are ready. Correct anything that looks wrong before you submit.</p>}
          <div className="cards">
            <label className="field">Amount (USD)
              <input defaultValue={line.claimedAmount ? (line.claimedAmount / 100).toFixed(2) : ""} key={`${line.id}-amt`} onBlur={(event) => demo.replace(correctDraftLine(demo.state!, draft.id, line.id, { amount: event.target.value }))} />
            </label>
            <label className="field">Category
              <select defaultValue={line.category} key={`${line.id}-cat`} onChange={(event) => demo.replace(correctDraftLine(demo.state!, draft.id, line.id, { category: event.target.value }))}>
                <option value="">Choose</option>
                <option value="transit">Transit</option>
                <option value="supplies">Supplies</option>
                <option value="meals">Meals</option>
              </select>
            </label>
            <label className="field">Expense date
              <input type="date" defaultValue={line.expenseDate ?? ""} key={`${line.id}-date`} onChange={(event) => demo.replace(correctDraftLine(demo.state!, draft.id, line.id, { expenseDate: event.target.value }))} />
            </label>
          </div>
        </section>
      ))}
      <button
        type="button"
        className="primary"
        disabled={!draft || draft.lines.length === 0 || demo.busy}
        onClick={async () => {
          if (!draft) return;
          const next = await demo.run((current) => submitDraft(current, draft.id));
          if (next && !next.lastError) router.push("/demo/review");
        }}
      >
        {demo.busy ? "Submitting…" : "Submit claim"}
      </button>
    </div>
  );
}

export function FinanceScreen({ claimId }: { claimId?: string }) {
  const demo = useDemo();
  const router = useRouter();
  const state = demo.state;
  const [confirmed, setConfirmed] = useState(false);
  if (!state) return null;
  const id = claimId || state.ui.activeClaimId;
  const payable = payableLines(state, id);
  const total = payable.reduce((sum, item) => sum + item.amount, 0);
  const stages = stageSummary(state);
  return (
    <div className="stack">
      <div className="page-head">
        <span className="mode-badge">Demo · Simulated</span>
        <h1>Finance confirmation</h1>
        <p>Confirm the frozen amount, currency, lines, and masked recipient before submitting.</p>
      </div>
      <section className="card">
        <h2>Unpaid approved amounts</h2>
        <table className="table">
          <thead><tr><th>Stage</th><th>Amount</th><th>Oldest</th></tr></thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.label}><td>{stage.label}</td><td>{formatUsd(stage.amount)}</td><td>{stage.age}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      {state.lastError ? <div className="alert" role="alert">{state.lastError}</div> : null}
      {payable.length === 0 ? (
        <section className="card empty">No approved lines are waiting for payout on {id}. Approve a line from the review desk first.</section>
      ) : (
        <section className="card stack">
          <p className="stat" data-testid="payout-amount">{formatUsd(total)}</p>
          <p>Currency USD</p>
          <p>Recipient {maskEmail(state.destination.email)} · destination v{state.destination.version}</p>
          <ul>
            {payable.map((item) => <li key={item.line.id}>{item.line.id} · {item.line.title} · {formatUsd(item.amount)}</li>)}
          </ul>
          <label className="spread"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm this payout snapshot</label>
          <button
            type="button"
            className="primary"
            data-testid="submit-payout"
            disabled={!confirmed || demo.busy || total <= 0}
            onClick={async () => {
              const next = await demo.run((current) => queuePayout(current, id));
              if (next?.ui.lastPayoutId && !next.lastError) router.push(`/demo/payouts/${next.ui.lastPayoutId}`);
            }}
          >
            {demo.busy ? "Submitting…" : `Submit payout ${formatUsd(total)}`}
          </button>
          {!confirmed ? <p className="muted">Confirm the snapshot to enable submission.</p> : null}
        </section>
      )}
    </div>
  );
}

export function PayoutScreen({ payoutId }: { payoutId: string }) {
  const demo = useDemo();
  const state = demo.state;
  if (!state) return null;
  const payout = state.payouts.find((item) => item.id === payoutId);
  if (!payout) return <p className="empty">That payout is not in this demo.</p>;
  const outcome = state.simulation;
  return (
    <div className="stack">
      <div className="page-head">
        <span className="mode-badge">Demo · Simulated</span>
        <h1>Payout {payout.status === "succeeded" ? "paid" : payout.status}</h1>
        <p>Simulated delay. This is not a live PayPal call. Paid appears only after the simulated provider item succeeds.</p>
      </div>
      <section className="card stack">
        <p className="stat">{formatUsd(payout.amount)} USD</p>
        <p>Lines {payout.lineIds.join(", ")}</p>
        <p>Recipient {maskEmail(payout.recipientEmail)} · frozen destination v{payout.destinationVersion}</p>
        <p>Transfer reference {payout.senderBatchId}</p>
        <p>Provider item {payout.providerItemId ?? "Not assigned"} · status {payout.providerRawStatus ?? payout.status}</p>
        {payout.lastError ? <p className="alert" role="alert">{payout.lastError}</p> : null}
        <div className="seg" role="group" aria-label="Simulated provider result">
          {(["success", "processing", "failure"] as const).map((mode) => (
            <button key={mode} type="button" className="secondary" aria-pressed={state.simulation === mode} onClick={() => demo.replace(setSimulation(state, mode))}>{mode}</button>
          ))}
        </div>
        <button type="button" className="primary" data-testid="apply-simulation" disabled={demo.busy || payout.status === "succeeded"} onClick={() => demo.run((current) => applySimulatedResult(current, payout.id))}>
          {demo.busy ? "Contacting simulator…" : `Apply simulated ${outcome}`}
        </button>
        <Link href={`/demo/claims/${payout.claimId}`}>Return to the volunteer view</Link>
      </section>
    </div>
  );
}

export function ClaimsScreen() {
  const state = useDemo().state;
  if (!state) return null;
  const mine = state.claims.filter((claim) => claim.claimantId === "usr_maya" && claim.submittedAt);
  return (
    <div className="stack">
      <div className="page-head"><h1>My claims</h1><p>Maya Chen · volunteer</p></div>
      {mine.length === 0 ? <p className="empty">No submitted claims yet.</p> : null}
      <div className="cards">
        {mine.map((claim) => {
          const summary = claimSummary(state, claim.id);
          return (
            <Link key={claim.id} href={`/demo/claims/${claim.id}`} className="card">
              <strong>{claim.id}</strong>
              <p className="wrap">{claim.activityName}</p>
              <p>Paid {formatUsd(summary?.paid ?? 0)}</p>
              <p>Under review {formatUsd(summary?.underReview ?? 0)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function ClaimDetailScreen({ id }: { id: string }) {
  const demo = useDemo();
  const state = demo.state;
  const [reply, setReply] = useState("");
  if (!state) return null;
  const claim = state.claims.find((item) => item.id === id);
  if (!claim) return <p className="empty">Claim not found in this demo.</p>;
  const summary = claimSummary(state, id);
  const payouts = state.payouts.filter((payout) => payout.claimId === id);
  return (
    <div className="stack">
      <div className="page-head">
        {payouts.length ? <span className="mode-badge">Demo · Simulated</span> : null}
        <h1>{claim.id}</h1>
        <p className="wrap">{claim.activityName}</p>
      </div>
      <div className="cards">
        <div className="card"><p className="muted">Submitted</p><p className="stat">{formatUsd(summary?.submitted ?? 0)}</p></div>
        <div className="card"><p className="muted">Paid</p><p className="stat" data-testid="paid-amount">{formatUsd(summary?.paid ?? 0)}</p></div>
        <div className="card"><p className="muted">In progress</p><p className="stat">{formatUsd(summary?.inProgress ?? 0)}</p></div>
        <div className="card"><p className="muted">Under review</p><p className="stat" data-testid="under-review-amount">{formatUsd(summary?.underReview ?? 0)}</p></div>
      </div>
      {claim.lines.map((line) => (
        <section key={line.id} className="card">
          <div className="spread"><strong>{line.title}</strong><span>{formatUsd(line.claimedAmount)}</span></div>
          <p>Next action: {nextAction(line.reviewState, state, line.id)}</p>
          {line.clarification ? <p className="alert" role="status">Coordinator asked: {line.clarification}</p> : null}
          {line.reviewState === "needs_clarification" ? (
            <form onSubmit={(event) => { event.preventDefault(); demo.run((current) => replyToClarification(current, id, line.id, reply)); }}>
              <label className="field">Reply<textarea value={reply} onChange={(event) => setReply(event.target.value)} required /></label>
              <button className="primary" type="submit" disabled={demo.busy}>Send reply</button>
            </form>
          ) : null}
          {line.flags.some((flag) => flag.code === "possible_duplicate") ? <p className="muted">A coordinator is checking a possible duplicate. Other volunteers' receipt details stay hidden here.</p> : null}
        </section>
      ))}
      <section className="card">
        <h2>Timeline</h2>
        <ul className="timeline">
          {state.timeline.filter((entry) => entry.claimId === id).map((entry) => (
            <li key={entry.id}><strong>{entry.label}</strong><p className="muted">{entry.detail}</p></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function nextAction(stateName: string, demoState: NonNullable<ReturnType<typeof useDemo>["state"]>, lineId: string) {
  const settled = demoState.payouts.some((payout) => payout.status === "succeeded" && payout.allocations.some((allocation) => allocation.lineId === lineId && allocation.state === "settled"));
  if (settled) return "None. This line is paid.";
  if (stateName === "approved") return "Waiting for finance to submit the payout.";
  if (stateName === "needs_clarification") return "Reply to the coordinator.";
  if (stateName === "declined") return "This line will not be paid.";
  if (stateName === "draft") return "Finish and submit the claim.";
  return "Waiting for a coordinator decision.";
}

export function VolunteersScreen() {
  const state = useDemo().state;
  const people = useMemo(() => {
    if (!state) return [];
    const map = new Map<string, string>();
    for (const claim of state.claims) map.set(claim.claimantId, claim.claimantName);
    return [...map.entries()];
  }, [state]);
  if (!state) return null;
  return (
    <div>
      <div className="page-head"><h1>Volunteers</h1><p>People with claims in the loaded demo seed.</p></div>
      <ul className="card">{people.map(([id, name]) => <li key={id}>{name}</li>)}</ul>
    </div>
  );
}

export function ActivitiesScreen() {
  const state = useDemo().state;
  if (!state) return null;
  return (
    <div className="stack">
      <div className="page-head"><h1>Activities</h1></div>
      {state.activities.map((activity) => (
        <article key={activity.id} className="card"><h2 className="wrap">{activity.name}</h2><p>{formatShortDate(activity.date)} · {activity.site}</p></article>
      ))}
    </div>
  );
}

export function SettingsScreen() {
  const demo = useDemo();
  const state = demo.state;
  if (!state) return null;
  return (
    <div className="stack">
      <div className="page-head"><h1>Settings</h1><p>Demo controls stay in this browser. They do not affect a Sandbox workspace.</p></div>
      <section className="card stack">
        <h2>Simulated payout result</h2>
        <div className="seg">
          {(["success", "processing", "failure"] as const).map((mode) => (
            <button key={mode} type="button" className="secondary" aria-pressed={state.simulation === mode} onClick={() => demo.replace(setSimulation(state, mode))}>{mode}</button>
          ))}
        </div>
        <label className="spread"><input type="checkbox" checked={state.forceError} onChange={(event) => demo.replace(setForceError(state, event.target.checked))} /> Make the next action fail</label>
        <button type="button" className="secondary" onClick={() => demo.replace(rotateDestination(state))}>Issue a new recipient version</button>
        <button type="button" className="secondary" onClick={() => demo.replace(restoreHero(state))}>Replay TP-1042 from the seed</button>
        <button type="button" className="primary" onClick={demo.reset}>Reset demo</button>
      </section>
    </div>
  );
}

function stageSummary(state: NonNullable<ReturnType<typeof useDemo>["state"]>) {
  let approved = 0;
  let review = 0;
  let progress = 0;
  let oldestApproved = state.clock;
  let oldestReview = state.clock;
  for (const claim of state.claims) {
    const summary = claimSummary(state, claim.id);
    if (!summary) continue;
    approved += summary.approvedUnpaid;
    review += summary.underReview;
    progress += summary.inProgress;
    if (summary.approvedUnpaid && claim.lastActionAt < oldestApproved) oldestApproved = claim.lastActionAt;
    if (summary.underReview && claim.lastActionAt < oldestReview) oldestReview = claim.lastActionAt;
  }
  return [
    { label: "Approved, unpaid", amount: approved, age: formatAge(oldestApproved, state.clock) },
    { label: "Under review", amount: review, age: formatAge(oldestReview, state.clock) },
    { label: "Payout in progress", amount: progress, age: "—" },
  ];
}
