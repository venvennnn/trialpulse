import Link from "next/link";
import { Logo } from "@/components/icons";

export default function HomePage() {
  return (
    <main className="home">
      <div className="brand" style={{ marginBottom: 28 }}>
        <Logo size={36} />
        <div>
          <strong>TrialPulse</strong>
          <span>NGO volunteer expense reimbursement</span>
        </div>
      </div>
      <h1>Approve the fare. Leave the rest under review.</h1>
      <p className="lede">
        Coordinators decide each receipt line. Finance can pay the approved amount immediately, and the volunteer still sees what is waiting.
      </p>
      <div className="cards" style={{ marginTop: 28 }}>
        <article className="card stack">
          <span className="mode-badge">Demo · Simulated</span>
          <h2>Public demo</h2>
          <p>No provider keys and no database. Seeded receipts, local decisions, and a labeled simulated payout.</p>
          <Link className="primary" href="/demo/review" style={{ textAlign: "center", textDecoration: "none" }}>Open the review desk</Link>
        </article>
        <article className="card stack">
          <span className="mode-badge sandbox">PayPal Sandbox</span>
          <h2>Sandbox workspace</h2>
          <p>Signed-in roles, private receipts, Gemini extraction, and a real Standard Payouts sandbox request to one verified test recipient.</p>
          <Link className="secondary" href="/app" style={{ textAlign: "center", textDecoration: "none" }}>Open the workspace</Link>
        </article>
      </div>
    </main>
  );
}
