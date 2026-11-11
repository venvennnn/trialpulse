"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatUsd } from "@/domain/money";
import { mapRegion } from "@/domain/regions";
import type { ReviewView, ThumbModel } from "@/demo/present";
import { IconCheck, IconSearch } from "../icons";

export function ReviewDesk({
  view,
  busy,
  error,
  onDismissError,
  onSelectClaim,
  onToggleLine,
  onFocusLine,
  onToggleExpand,
  onApprove,
  onDecline,
  onClarify,
  onKeep,
}: {
  view: ReviewView;
  busy: boolean;
  error: string | null;
  onDismissError: () => void;
  onSelectClaim: (id: string) => void;
  onToggleLine: (id: string) => void;
  onFocusLine: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onApprove: (reason: string) => void;
  onDecline: (reason: string) => void;
  onClarify: (reason: string) => void;
  onKeep: () => void;
}) {
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState("all");
  const [reason, setReason] = useState("all");
  const [queueOpen, setQueueOpen] = useState(true);
  const [tab, setTab] = useState<"one" | "all">("one");
  const [fileId, setFileId] = useState<string | null>(view.focusedFileId);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "approve" | "decline" | "clarify">(null);
  const evidenceButton = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => setFileId(view.focusedFileId), [view.focusedFileId]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const apply = () => setQueueOpen(!media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!dialog && !drawer) return;
    const root = dialogRef.current;
    const previously = document.activeElement as HTMLElement | null;
    const returnToEvidence = evidenceButton.current;
    const items = () =>
      [...(root?.querySelectorAll<HTMLElement>("button, input, textarea, select, [href]") ?? [])].filter((el) => !el.hasAttribute("disabled"));
    items()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDialog(null);
        setDrawer(false);
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const target = drawer ? returnToEvidence : previously;
      window.setTimeout(() => {
        requestAnimationFrame(() => target?.focus());
      }, 30);
    };
  }, [dialog, drawer]);

  useEffect(() => {
    const active = document.querySelector<HTMLElement>('[data-testid="claim-queue"] [aria-current="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [view.claim?.id]);

  const programs = ["all", ...new Set(view.queue.map((item) => item.program))];
  const filtered = view.queue.filter((item) => {
    const haystack = `${item.id} ${item.name} ${item.activity}`.toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (program !== "all" && item.program !== program) return false;
    if (reason !== "all" && !item.reason.includes(reason)) return false;
    return true;
  });
  const file = view.files.find((item) => item.id === fileId) ?? view.files[0] ?? null;
  const selectedLabel = formatUsd(view.selectedCents);
  const reviewLabel = formatUsd(view.reviewCents);
  const needsReason = view.lines.some((line) => line.checked && line.needsReason);

  function requestApprove() {
    if (view.selectedCents <= 0) return;
    if (needsReason) setDialog("approve");
    else onApprove("");
  }

  return (
    <div>
      <div className="page-head">
        <h1>Coordinator Review Desk</h1>
        <p>Review volunteer expense claims, check eligibility, and approve reimbursements.</p>
      </div>
      <button type="button" className="secondary queue-toggle" aria-expanded={queueOpen} onClick={() => setQueueOpen((open) => !open)}>
        {queueOpen ? "Hide claims queue" : `Show claims queue (${view.queue.length})`}
      </button>
      <div className="desk">
        <section className="panel" hidden={!queueOpen} aria-label="Claims queue">
          <div className="panel-h">
            <h2>Claims Queue <span className="count">{filtered.length}</span></h2>
          </div>
          <div className="queue-tools">
            <label className="sr-only" htmlFor="queue-search">Search claims</label>
            <input id="queue-search" className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, claim, activity" />
          </div>
          <div className="filters">
            <select aria-label="Program" value={program} onChange={(event) => setProgram(event.target.value)}>
              {programs.map((item) => <option key={item} value={item}>{item === "all" ? "All programs" : item}</option>)}
            </select>
            <select aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="all">All reasons</option>
              <option value="possible_duplicate">Possible duplicate</option>
              <option value="eligible">Eligible</option>
              <option value="over_cap">Over cap</option>
              <option value="unreadable_date">Unreadable date</option>
            </select>
          </div>
          <div className="queue-list" data-testid="claim-queue">
            {filtered.length === 0 ? <p className="empty">No claims match these filters.</p> : null}
            {filtered.map((item) => (
              <button key={item.id} type="button" className={item.active ? "q-card active" : "q-card"} aria-current={item.active ? "true" : undefined} onClick={() => onSelectClaim(item.id)}>
                <div className="q-top"><span className="q-id">{item.id}</span><span className="q-amt">{item.amount}</span></div>
                <p className="q-name">{item.name}</p>
                <div className="q-top"><p className="q-activity wrap">{item.activity}</p><span className={`pill ${item.tone}`}>{item.status}</span></div>
                <p className="age">{item.age} since last action</p>
              </button>
            ))}
          </div>
        </section>

        <section className="panel viewer-column" aria-label="Receipt evidence">
          <ReceiptPane file={file} files={view.files} tab={tab} setTab={setTab} activeRegionId={view.activeRegionId} onPick={setFileId} />
        </section>

        <section className="panel decision" aria-label="Claim decision">
          <div className="decision-scroll">
            {error ? <div className="alert" role="alert">{error} <button type="button" className="linkish" onClick={onDismissError}>Dismiss</button></div> : null}
            {view.claim ? (
              <>
                <div className="claim-kicker">
                  <h2>Claim {view.claim.id}</h2>
                  <span className="pill">{view.claim.status}</span>
                </div>
                <div className="meta-row">
                  <span>{view.claim.claimant}</span>
                  <span>Volunteer</span>
                  <span>{view.claim.date}</span>
                  <span className="wrap">{view.claim.activity}</span>
                  <span>Claim total {view.claim.total}</span>
                </div>
                <p className="section-label">Expense items ({view.lines.length})</p>
                <p className="muted">Review each line item and set a decision.</p>
                {view.lines.map((line) => (
                  <article key={line.id} className={line.focused ? "line focused" : "line"}>
                    <div className="line-main">
                      <input className="check" type="checkbox" checked={line.checked} disabled={line.disabled || busy} aria-label={`Select ${line.title}`} onChange={() => onToggleLine(line.id)} />
                      <button type="button" className="text-btn line-copy" onClick={() => { onFocusLine(line.id); onToggleExpand(line.id); }}>
                        <strong>{line.title}</strong>
                        <span className="sub wrap">{line.detail}</span>
                      </button>
                      <strong className="money">{line.amount}</strong>
                      {line.badge ? <span className={`pill ${line.badge.tone}`}>{line.badge.label}</span> : null}
                    </div>
                    {line.expanded && line.duplicate ? (
                      <div className="callout" data-testid="supplies-duplicate">
                        <strong>Possible duplicate</strong>
                        <p>{line.duplicate.message}</p>
                        <div className="compare">
                          <Thumb thumb={line.duplicate.left} />
                          <Thumb thumb={line.duplicate.right} />
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
                <button ref={evidenceButton} type="button" className="secondary mobile-only" data-evidence-return="" onClick={() => setDrawer(true)}>View evidence</button>
              </>
            ) : <p className="empty">Select a claim from the queue.</p>}
          </div>
          <div className="action-bar">
            <p className="quiet-totals">
              <span><strong>{formatUsd(view.submittedCents)}</strong> submitted</span>
              <span aria-hidden="true">·</span>
              <span><strong>{selectedLabel}</strong> selected</span>
              <span aria-hidden="true">·</span>
              <span><strong>{reviewLabel}</strong> under review</span>
            </p>
            <div className="action-row">
              <button type="button" className="primary" data-testid="approve" disabled={busy || view.selectedCents <= 0} onClick={requestApprove}>
                {busy ? "Saving…" : <><IconCheck /> Approve {selectedLabel}</>}
              </button>
              {view.reviewCents > 0 ? <p className="stays" data-testid="stays-under-review">{reviewLabel} stays under review</p> : null}
              <button type="button" className="secondary" aria-expanded={menu} disabled={busy} onClick={() => setMenu((open) => !open)}>Keep under review</button>
            </div>
            {menu ? (
              <div role="menu" className="stack">
                <button type="button" className="menu-item" onClick={() => { setMenu(false); onKeep(); }}>Keep selected lines under review</button>
                <button type="button" className="menu-item" disabled={view.selectedCents <= 0} onClick={() => { setMenu(false); setDialog("clarify"); }}>Request clarification</button>
                <button type="button" className="menu-item" disabled={view.selectedCents <= 0} onClick={() => { setMenu(false); setDialog("decline"); }}>Decline selected</button>
              </div>
            ) : null}
            {view.selectedCents <= 0 ? <p className="muted" id="approve-hint">Select a line to enable approval.</p> : null}
          </div>
        </section>
      </div>
      {drawer ? (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={(node) => { dialogRef.current = node; }}>
            <div className="spread"><h2 id={titleId}>Receipt evidence</h2><button type="button" className="secondary" onMouseDown={(event) => event.preventDefault()} onClick={() => setDrawer(false)}>Close</button></div>
            <ReceiptPane file={file} files={view.files} tab={tab} setTab={setTab} activeRegionId={view.activeRegionId} onPick={setFileId} />
          </div>
        </div>
      ) : null}
      {dialog ? (
        <div className="dialog-backdrop">
          <form
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            ref={(node) => { dialogRef.current = node; }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const text = String(data.get("reason") || "");
              if (dialog === "approve") onApprove(text);
              if (dialog === "decline") onDecline(text);
              if (dialog === "clarify") onClarify(text);
              setDialog(null);
            }}
          >
            <h2 id={titleId}>{dialog === "approve" ? "Reason for this approval" : dialog === "decline" ? "Reason for declining" : "What should the volunteer clarify?"}</h2>
            <label className="field">Reason
              <textarea name="reason" required rows={4} />
            </label>
            <div className="action-row">
              <button className="primary" type="submit" disabled={busy}>Save decision</button>
              <button className="secondary" type="button" onClick={() => setDialog(null)}>Cancel</button>
            </div>
          </form>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">{busy ? "Saving decision" : error || ""}</p>
    </div>
  );
}

function Thumb({ thumb }: { thumb: ThumbModel }) {
  return (
    <figure className="thumb">
      <img src={thumb.src} alt={thumb.alt} />
      <figcaption>
        <strong>{thumb.merchant}</strong>
        <span>{thumb.who}</span>
        <span>{thumb.descriptor}</span>
        <span>{thumb.date}</span>
        <span>Total {thumb.total}</span>
      </figcaption>
    </figure>
  );
}

function ReceiptPane({
  file,
  files,
  tab,
  setTab,
  activeRegionId,
  onPick,
}: {
  file: ReviewView["files"][number] | null;
  files: ReviewView["files"];
  tab: "one" | "all";
  setTab: (tab: "one" | "all") => void;
  activeRegionId: string | null;
  onPick: (id: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setBox({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    setBox({ width: node.clientWidth, height: node.clientHeight });
    return () => observer.disconnect();
  }, [file?.id, tab]);
  if (!file) return <p className="empty">No evidence on this claim.</p>;
  const fit = box.width > 0 ? mapRegion({ x: 0, y: 0, width: 1, height: 1 }, box, file) : null;
  return (
    <>
      <div className="viewer-h">
        <div className="tabs" role="tablist">
          <button type="button" className="tab" role="tab" aria-selected={tab === "one"} onClick={() => setTab("one")}>Receipt (1 of 1)</button>
          <button type="button" className="tab" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>All files ({files.length})</button>
        </div>
        <div className="zoom-row" style={{ padding: 0 }}>
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}><IconSearch /></button>
          <button type="button" className="secondary" onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}>Zoom in</button>
        </div>
      </div>
      {tab === "all" ? (
        <div className="compare" style={{ padding: 12 }}>
          {files.map((item) => (
            <button key={item.id} type="button" className="thumb" onClick={() => { onPick(item.id); setTab("one"); }}>
              <img src={item.src} alt="" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="stage"
          ref={stageRef}
          data-testid="receipt-stage"
          tabIndex={0}
          aria-label="Receipt image. Use plus and minus to zoom."
          onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(2.5, value + 0.25));
            if (event.key === "-" || event.key === "_") setZoom((value) => Math.max(1, value - 0.25));
          }}
        >
          {fit ? (
            <div className="fit" style={{ left: fit.x, top: fit.y, width: fit.width * zoom, height: fit.height * zoom }}>
              <img src={file.src} alt={file.alt} width={file.width} height={file.height} />
              {file.regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className="region-hit"
                  data-testid={region.id === activeRegionId ? "field-highlight" : undefined}
                  aria-pressed={region.id === activeRegionId}
                  aria-label={`${region.label} field`}
                  style={{ left: `${region.region.x * 100}%`, top: `${region.region.y * 100}%`, width: `${region.region.width * 100}%`, height: `${region.region.height * 100}%` }}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
