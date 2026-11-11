# TrialPulse

TrialPulse lets an NGO reimburse volunteers one receipt line at a time. A coordinator can approve a $24 train fare while a $16 supplies line stays under review, and finance can pay only the approved amount.

The public demo needs no Supabase, Gemini, or PayPal credentials. The sandbox workspace uses those providers with one NGO, one program, one USD policy, one Sandbox sender, and one verified test recipient.

Runtime: Node.js 22. Package manager: npm 10.9.9. App framework: Next.js 15.5.29 (App Router) and React 19.

## Public demo

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Public demo** goes to `/demo/review`. State is stored in `localStorage` under `trialpulse.demo.v1`. The banner says when the seed is loaded. **Reset demo** restores it.
- **Sandbox workspace** goes to `/app`. Without credentials it explains which variables are missing. It does not load demo claims.

Demo payouts are labeled **Demo · Simulated**. Sandbox payouts are labeled **PayPal Sandbox**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | `next lint` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest acceptance tests |
| `npm run eval` | Pilot manifest metrics. Writes `eval/pilot-manifest.json` |
| `npm run seed` | Creates the Supabase workspace, operator, claimant, policy, and verified recipient. Exits 2 when env is missing |
| `npm run worker -- --fixture` | Runs the payout state machine with fixtures and prints what still needs a live Sandbox check. Exits 0 |
| `npm run worker` | Without credentials, prints the fixture report and exits 2. With credentials, checks the sender token only (it does not submit a payout) |

## Environment

Copy `.env.example` to `.env.local`. Leave it empty for the demo.

| Name | Use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and user-scoped server calls |
| `SUPABASE_SERVICE_ROLE_KEY` | Seed, webhooks, and the worker. Server only |
| `SUPABASE_STORAGE_BUCKET` | Private bucket, default `receipts` |
| `TRIALPULSE_WORKSPACE_ID` | Workspace created by the seed |
| `GEMINI_API_KEY` | Server-side receipt extraction |
| `GEMINI_MODEL` | Default `gemini-2.0-flash` |
| `PAYPAL_CLIENT_ID` | Sandbox REST app for the controlled sender |
| `PAYPAL_CLIENT_SECRET` | Sandbox REST secret |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` |
| `PAYPAL_WEBHOOK_ID` | Sandbox webhook id used to verify signatures |
| `PAYPAL_SENDER_EMAIL` | Controlled Sandbox **sender** business account. Payouts must be enabled on this account |
| `SANDBOX_RECIPIENT_EMAIL` | Controlled Sandbox **recipient**. The only verified destination in v1 |
| `SANDBOX_OPERATOR_EMAIL` / `SANDBOX_OPERATOR_PASSWORD` | Operator with coordinator and finance roles |
| `SANDBOX_CLAIMANT_EMAIL` / `SANDBOX_CLAIMANT_PASSWORD` | Claimant account |
| `WORKER_SECRET` | Reserved for a hosted worker trigger |
| `APP_BASE_URL` | Public origin, used when you register the webhook |

`NEXT_PUBLIC_*` values are inlined at build time. Set them before `npm run build` on the host.

Apply the schema before seeding:

```bash
supabase db push
# or run supabase/migrations/202603180001_init.sql in the SQL editor
npm run seed
```

The migration creates tenant tables, row level security, a private `receipts` bucket, and `reserve_payout`. That function locks claim lines in id order and reserves only the unpaid, unreserved, approved amount. Amounts are integer cents. PayPal decimal strings are converted only at the provider boundary.

Receipt object keys are `{workspaceId}/{receiptId}/{file}`.

## Worker

The worker is a separate process so a web restart does not drop a payout:

```bash
npm run worker -- --fixture
npm run worker
```

On Railway, run the web service with `npm run build && npm start` and a second service with `npm run worker`. On Vercel, host the Next.js app and run the worker elsewhere. Jobs live in `outbox_jobs` with a lease expiry, so a crashed worker can pick the job up again.

Webhook endpoint: `POST /api/webhooks/paypal`. Events are verified with `PAYPAL_WEBHOOK_ID`, stored by event id, and only schedule a refresh. The ledger changes when a canonical item read matches the frozen amount, currency, and destination.

## Two-minute demo

1. Open `/demo/review`. The banner says the seed is loaded. Claim **TP-1042** for Maya Chen, Community Pantry Shift, is selected. The $24 train fare is checked and the receipt total has a teal outline. The $16 supplies line is expanded against TP-1037.
2. The action bar reads **$40.00 submitted · $24.00 selected · $16.00 under review**. Choose **Approve $24.00**. The note beside it says **$16.00 stays under review**.
3. On the finance screen, check the snapshot (USD, the train line, masked recipient) and submit. The confirmation is labeled **Demo · Simulated** and is still in progress.
4. Apply the simulated success. Open the volunteer claim. It shows **$24.00 paid** and **$16.00 under review**.
5. Switch to Coordinator, select the supplies line, approve it with a reason, and submit the next payout. The second snapshot is **$16.00** and does not include the fare. A declined line never appears in a snapshot.

To submit the claim yourself instead of using the seeded review: **Settings → Replay TP-1042 is not required**. Use **New claim** after switching to Volunteer, attach the sample train and supplies receipts, and submit. Reset demo clears local edits.

## What was verified

These commands were run in this workspace on Node v22.23.4:

```bash
npx vitest run
npx tsc --noEmit
npx next lint
npx next build
npm run worker -- --fixture
npm run eval
```

Vitest covers tenant isolation, stale extraction, duplicate evidence (including same-day same-fare hard negatives and pilot recall at 3), payout retries, and out-of-order provider events. The demo journey test submits a $40 claim, approves $24, simulates the provider result, leaves $16 under review, then creates a second payout of exactly $16. Declined lines are rejected. An accepted batch is not marked paid until the canonical item matches. An uncertain submit stays reserved. A duplicate webhook id does not reconcile twice.

No PayPal Sandbox call was made. Credentials were absent. `npm run worker -- --fixture` is the record of that, and it lists the live checks still required:

- Confirm `PAYPAL_SENDER_EMAIL` can submit Standard Payouts in Sandbox.
- Confirm `SANDBOX_RECIPIENT_EMAIL` is the controlled personal Sandbox account.
- Submit one sandbox payout and reconcile `GET /v1/payments/payouts-item/{id}` until the item is `SUCCESS` for the same amount, currency, and receiver.
- Deliver one verified webhook and one duplicate event id.

Do not treat a simulated **Paid** badge as a Sandbox success. Sandbox success is the canonical item on `GET /api/payouts/:id` after that item read.

The pilot manifest (`npm run eval`) uses simulated hours, not provider latency. It reports duplicate recall at 3, the legitimate-claim flag rate, the review rate, and line-level versus whole-claim time to first reimbursement for TP-1042. Line-level pays the $24 at hour 3 and still has $16 unresolved. Whole-claim waits until hour 27. Incorrect approved cents are 0 for both strategies when they follow the manifest.

## Deployment

**Railway.** Two services from this repo, both with the same env vars except the worker does not need `NEXT_PUBLIC_*` exposed to a browser.

- Web: `npm ci && npm run build && npm start`
- Worker: `npm run worker`

Register `https://<web-host>/api/webhooks/paypal` in the PayPal Sandbox app and put that webhook id in `PAYPAL_WEBHOOK_ID`.

**Vercel.** Import the repo for the web app. Set the env vars before building. Run the worker as a Railway or other always-on process. Vercel cron is not required for correctness because the worker leases `outbox_jobs`.

## Product boundaries

Example names, receipts, and timings in the demo are illustrative. The clinical-research note in the specification is not implemented: diagnoses, treatment, and outcomes do not belong in this reimbursement ledger. Participant compensation would be a separate policy and a separate study.

PayPal notes are the generic string `Volunteer reimbursement`. Receipt text, program names, and health information are not sent to PayPal.

## Design

The coordinator desk follows `design/reference/trialpulse-review.png`: white canvas, pale gray borders, navy text, teal actions, amber only for the duplicate exception. At a narrow width the queue collapses, evidence opens in a dialog, and the action bar respects the safe area.
