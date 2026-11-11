import type { Metadata } from "next";
import Link from "next/link";
import { providerStatus } from "@/server/config";

export const metadata: Metadata = { title: "Sandbox workspace" };

export default function WorkspacePage() {
  const status = providerStatus();
  return (
    <main className="home setup">
      <span className="mode-badge sandbox">PayPal Sandbox</span>
      <h1>Sandbox workspace</h1>
      {status.supabase ? (
        <p className="lede">You are signed in. Claims, receipts, and payouts for this workspace are loaded from Supabase. Provider calls use the server configuration, not the demo.</p>
      ) : (
        <div className="card stack">
          <h2>This workspace is not configured</h2>
          <p>The public demo does not need these values. The sandbox workspace does.</p>
          <ul>
            <li><code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code></li>
            <li><code>GEMINI_API_KEY</code> and <code>GEMINI_MODEL</code></li>
            <li><code>PAYPAL_CLIENT_ID</code>, <code>PAYPAL_CLIENT_SECRET</code>, <code>PAYPAL_WEBHOOK_ID</code>, <code>PAYPAL_SENDER_EMAIL</code></li>
            <li><code>SANDBOX_RECIPIENT_EMAIL</code> for the one verified test recipient</li>
          </ul>
          <p>Apply <code>supabase/migrations/202603180001_init.sql</code>, then run <code>npm run seed</code>.</p>
          <Link href="/demo/review">Use the public demo instead</Link>
        </div>
      )}
    </main>
  );
}
