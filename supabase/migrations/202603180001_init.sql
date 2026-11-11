-- TrialPulse initial schema. One workspace, USD minor units, private receipts.
-- Apply with the Supabase CLI: supabase db push
create extension if not exists pgcrypto;

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('claimant', 'coordinator', 'finance', 'admin')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id, role)
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  name text not null
);

create table policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  program_id uuid not null references programs (id),
  name text not null
);

create table policy_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  policy_id uuid not null references policies (id),
  version int not null,
  currency text not null check (currency = 'USD'),
  activity_window_days int not null,
  review_sla_hours int not null,
  categories jsonb not null,
  effective_at timestamptz not null,
  unique (policy_id, version)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  program_id uuid not null references programs (id),
  name text not null,
  activity_date date not null
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  activity_id uuid not null references activities (id),
  claimant_id uuid not null references auth.users (id),
  status text not null check (status in ('assigned', 'verified', 'manual', 'missing', 'conflict')),
  unique (activity_id, claimant_id)
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  program_id uuid not null references programs (id),
  claimant_id uuid not null references auth.users (id),
  activity_id uuid not null references activities (id),
  policy_version_id uuid references policy_versions (id),
  public_id text not null,
  revision int not null default 1,
  review_status text not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, public_id)
);

create index claims_program_status_submitted_idx
  on claims (program_id, review_status, submitted_at);

create table claim_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  claim_id uuid not null references claims (id),
  category text not null,
  description text not null,
  claimed_amount int not null check (claimed_amount >= 0),
  approved_amount int not null default 0 check (approved_amount >= 0),
  currency text not null check (currency = 'USD'),
  expense_date date,
  review_state text not null check (review_state in ('draft', 'submitted', 'needs_clarification', 'approved', 'declined')),
  revision int not null default 1,
  receipt_id uuid,
  policy_version_id uuid references policy_versions (id)
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  claim_id uuid not null references claims (id),
  object_key text not null,
  mime_type text not null,
  width int,
  height int,
  content_hash text not null,
  perceptual_hash text,
  revision int not null default 1,
  created_at timestamptz not null default now()
);

create table extracted_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  receipt_id uuid not null references receipts (id),
  field_name text not null,
  candidate_value text,
  corrected_value text,
  region jsonb,
  source_revision int not null,
  corrected_at_revision int,
  status text not null,
  extractor_version text,
  unique (receipt_id, field_name)
);

create table review_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  line_id uuid not null references claim_lines (id),
  code text not null,
  severity text not null,
  message text not null,
  candidate_claim_id uuid,
  score numeric,
  reasons jsonb
);

create table review_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  line_id uuid not null references claim_lines (id),
  actor_id uuid not null references auth.users (id),
  outcome text not null,
  amount int not null,
  reason text not null,
  policy_version_id uuid,
  created_at timestamptz not null default now()
);

create table payout_destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  claimant_id uuid not null references auth.users (id),
  version int not null,
  email text not null,
  status text not null check (status in ('verified', 'pending')),
  unique (id, version)
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  claimant_id uuid not null,
  claim_id uuid not null references claims (id),
  destination_id uuid not null,
  destination_version int not null,
  recipient_email text not null,
  amount int not null check (amount > 0),
  currency text not null check (currency = 'USD'),
  status text not null,
  sender_batch_id text not null unique,
  sender_item_id text not null unique,
  provider_batch_id text,
  provider_item_id text,
  provider_raw_status text,
  idempotency_key text not null,
  payload_hash text not null,
  note text not null,
  last_error text,
  last_observation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payouts_provider_batch_idx on payouts (provider_batch_id);
create index payouts_provider_item_idx on payouts (provider_item_id);

create table payout_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  payout_id uuid not null references payouts (id),
  line_id uuid not null references claim_lines (id),
  amount int not null check (amount > 0),
  currency text not null check (currency = 'USD'),
  state text not null check (state in ('reserved', 'settled', 'released'))
);

create index payout_allocations_active_idx
  on payout_allocations (line_id)
  where state <> 'released';

create table idempotency_keys (
  actor_id uuid not null,
  idem_key text not null,
  payload_hash text not null,
  payout_id uuid not null references payouts (id),
  primary key (actor_id, idem_key)
);

create table outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  job_type text not null,
  dedupe_key text not null,
  payload jsonb not null,
  state text not null check (state in ('pending', 'leased', 'succeeded', 'failed', 'dead')),
  attempts int not null default 0,
  lease_expires_at timestamptz,
  lease_owner text,
  last_error text,
  created_at timestamptz not null default now()
);

create unique index outbox_jobs_open_dedupe_idx
  on outbox_jobs (dedupe_key)
  where state in ('pending', 'leased', 'failed');

create table webhook_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  sender_batch_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Locks lines in id order and reserves only the unpaid unreserved approved amount.
create or replace function reserve_payout(
  p_workspace uuid,
  p_actor uuid,
  p_destination uuid,
  p_destination_version int,
  p_claim uuid,
  p_lines jsonb,
  p_idempotency_key text,
  p_payload_hash text,
  p_payout_id uuid,
  p_recipient_email text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_existing_hash text;
  v_line record;
  v_amount int;
  v_requested int;
  v_reserved int;
  v_total int := 0;
  v_claimant uuid;
  v_line_id uuid;
begin
  if not exists (
    select 1 from memberships
    where workspace_id = p_workspace and user_id = p_actor and role in ('finance', 'admin')
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select payout_id, payload_hash into v_existing, v_existing_hash
  from idempotency_keys
  where actor_id = p_actor and idem_key = p_idempotency_key;
  if found then
    if v_existing_hash <> p_payload_hash then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'replay', true, 'payout_id', v_existing);
  end if;

  if not exists (
    select 1 from payout_destinations
    where id = p_destination and version = p_destination_version and workspace_id = p_workspace and status = 'verified'
  ) then
    return jsonb_build_object('ok', false, 'code', 'DESTINATION_MISMATCH');
  end if;

  for v_line in
    select cl.*
    from claim_lines cl
    join jsonb_array_elements(p_lines) as requested(item) on cl.id = (requested.item->>'lineId')::uuid
    where cl.workspace_id = p_workspace
    order by cl.id
    for update
  loop
    v_requested := (select (item->>'amount')::int from jsonb_array_elements(p_lines) item where (item->>'lineId')::uuid = v_line.id);
    if v_line.review_state <> 'approved' then
      return jsonb_build_object('ok', false, 'code', 'LINE_NOT_PAYABLE');
    end if;
    select coalesce(sum(amount), 0) into v_reserved
    from payout_allocations
    where line_id = v_line.id and state <> 'released';
    v_amount := v_line.approved_amount - v_reserved;
    if v_amount <= 0 then
      return jsonb_build_object('ok', false, 'code', 'NOTHING_PAYABLE');
    end if;
    if v_requested <> v_amount then
      return jsonb_build_object('ok', false, 'code', 'AMOUNT_MISMATCH');
    end if;
    if v_claimant is null then
      select claimant_id into v_claimant from claims where id = v_line.claim_id and workspace_id = p_workspace;
    end if;
    v_total := v_total + v_requested;
    v_line_id := v_line.id;
  end loop;

  if v_total <= 0 then
    return jsonb_build_object('ok', false, 'code', 'NOTHING_PAYABLE');
  end if;

  insert into payouts (
    id, workspace_id, claimant_id, claim_id, destination_id, destination_version, recipient_email,
    amount, currency, status, sender_batch_id, sender_item_id, idempotency_key, payload_hash, note
  ) values (
    p_payout_id, p_workspace, v_claimant, p_claim, p_destination, p_destination_version, p_recipient_email,
    v_total, 'USD', 'queued', 'tpb_' || p_payout_id::text, 'tpi_' || p_payout_id::text, p_idempotency_key, p_payload_hash,
    'Volunteer reimbursement'
  );

  insert into payout_allocations (workspace_id, payout_id, line_id, amount, currency, state)
  select p_workspace, p_payout_id, (item->>'lineId')::uuid, (item->>'amount')::int, 'USD', 'reserved'
  from jsonb_array_elements(p_lines) item
  order by (item->>'lineId')::uuid;

  insert into idempotency_keys (actor_id, idem_key, payload_hash, payout_id)
  values (p_actor, p_idempotency_key, p_payload_hash, p_payout_id);

  insert into outbox_jobs (workspace_id, job_type, dedupe_key, payload, state)
  values (p_workspace, 'submit_payout', 'submit:' || p_payout_id::text, jsonb_build_object('payoutId', p_payout_id), 'pending');

  insert into audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_workspace, p_actor, 'payout.reserved', 'payout', p_payout_id::text, jsonb_build_object('amount', v_total));

  return jsonb_build_object('ok', true, 'replay', false, 'payout_id', p_payout_id);
end;
$$;

alter table workspaces enable row level security;
alter table memberships enable row level security;
alter table programs enable row level security;
alter table policies enable row level security;
alter table policy_versions enable row level security;
alter table activities enable row level security;
alter table attendance enable row level security;
alter table claims enable row level security;
alter table claim_lines enable row level security;
alter table receipts enable row level security;
alter table extracted_fields enable row level security;
alter table review_flags enable row level security;
alter table review_decisions enable row level security;
alter table payout_destinations enable row level security;
alter table payouts enable row level security;
alter table payout_allocations enable row level security;
alter table idempotency_keys enable row level security;
alter table outbox_jobs enable row level security;
alter table webhook_events enable row level security;
alter table audit_events enable row level security;

create policy memberships_self on memberships
  for select using (user_id = auth.uid() or exists (
    select 1 from memberships admin
    where admin.user_id = auth.uid() and admin.workspace_id = memberships.workspace_id and admin.role = 'admin'
  ));

create policy workspace_member_read on workspaces
  for select using (exists (select 1 from memberships m where m.workspace_id = workspaces.id and m.user_id = auth.uid()));

create policy claims_read on claims
  for select using (
    exists (
      select 1 from memberships m
      where m.workspace_id = claims.workspace_id and m.user_id = auth.uid()
        and (m.role in ('coordinator', 'finance', 'admin') or claims.claimant_id = auth.uid())
    )
  );

create policy claims_insert on claims
  for insert with check (
    claimant_id = auth.uid()
    and exists (select 1 from memberships m where m.workspace_id = claims.workspace_id and m.user_id = auth.uid() and m.role in ('claimant', 'admin'))
  );

create policy lines_read on claim_lines
  for select using (
    exists (
      select 1 from claims c
      join memberships m on m.workspace_id = c.workspace_id and m.user_id = auth.uid()
      where c.id = claim_lines.claim_id
        and (m.role in ('coordinator', 'finance', 'admin') or c.claimant_id = auth.uid())
    )
  );

create policy payouts_read on payouts
  for select using (
    exists (
      select 1 from memberships m
      where m.workspace_id = payouts.workspace_id and m.user_id = auth.uid()
        and (m.role in ('finance', 'admin', 'coordinator') or payouts.claimant_id = auth.uid())
    )
  );

create policy receipts_read on receipts
  for select using (
    exists (
      select 1 from memberships m
      where m.workspace_id = receipts.workspace_id and m.user_id = auth.uid()
    )
  );

-- Private bucket. Path: {workspace_id}/{receipt_id}/{file}
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_storage_read on storage.objects
  for select using (
    bucket_id = 'receipts'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
        and m.workspace_id::text = (storage.foldername(name))[1]
    )
  );

revoke all on function reserve_payout(uuid, uuid, uuid, int, uuid, jsonb, text, text, uuid, text) from public;
grant execute on function reserve_payout(uuid, uuid, uuid, int, uuid, jsonb, text, text, uuid, text) to authenticated, service_role;

create policy receipts_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
        and m.workspace_id::text = (storage.foldername(name))[1]
        and m.role in ('claimant', 'coordinator', 'admin')
    )
  );
