create extension if not exists pgcrypto;

-- =====================================================
-- SUPERFIRULAI - SINGLE SOURCE OF TRUTH FOR SUPABASE
-- Safe-first schema for both:
-- 1) fresh databases
-- 2) existing databases that need legacy compatibility patches
-- =====================================================

-- =====================================================
-- AIRDROP
-- =====================================================
create table if not exists public.airdrop_registrations (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  telegram_username text not null,
  x_username text not null,
  signed_message text not null,
  signature text not null,
  nonce text not null,
  turnstile_ok boolean not null default false,
  status text not null default 'pending',
  reason text,
  approved_at timestamptz,
  claim_requested_at timestamptz,
  claimed_at timestamptz,
  claim_tx text,
  airdrop_amount numeric(30,9),
  created_at timestamptz not null default now(),

  constraint airdrop_wallet_unique unique (wallet),
  constraint airdrop_telegram_unique unique (telegram_username),
  constraint airdrop_x_unique unique (x_username),
  constraint airdrop_nonce_unique unique (nonce),
  constraint airdrop_status_check check (
    status in (
      'pending',
      'approved',
      'rejected',
      'claim_processing',
      'claimed',
      'airdrop_sent'
    )
  ),
  constraint airdrop_wallet_length_check check (char_length(wallet) between 32 and 64),
  constraint airdrop_telegram_format_check check (telegram_username ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint airdrop_x_format_check check (x_username ~ '^[A-Za-z0-9_]{1,15}$'),
  constraint airdrop_nonce_length_check check (char_length(nonce) >= 8),
  constraint airdrop_amount_positive_check check (airdrop_amount is null or airdrop_amount > 0)
);

alter table public.airdrop_registrations
  add column if not exists approved_at timestamptz,
  add column if not exists claim_requested_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_tx text,
  add column if not exists airdrop_amount numeric(30,9);

alter table public.airdrop_registrations
  drop constraint if exists airdrop_status_check;

alter table public.airdrop_registrations
  add constraint airdrop_status_check
  check (
    status in (
      'pending',
      'approved',
      'rejected',
      'claim_processing',
      'claimed',
      'airdrop_sent'
    )
  );

alter table public.airdrop_registrations
  drop constraint if exists airdrop_amount_positive_check;

alter table public.airdrop_registrations
  add constraint airdrop_amount_positive_check
  check (
    airdrop_amount is null
    or airdrop_amount > 0
  );

-- Legacy normalization: if old rows already have claim metadata, make sure they are not left as plain approved.
update public.airdrop_registrations
set status = 'claimed'
where status = 'airdrop_sent'
  and (claimed_at is not null or claim_tx is not null);

create index if not exists idx_airdrop_created_at
  on public.airdrop_registrations (created_at desc);

create index if not exists idx_airdrop_status
  on public.airdrop_registrations (status);

create index if not exists idx_airdrop_approved_at
  on public.airdrop_registrations (approved_at desc);

create index if not exists idx_airdrop_claim_requested_at
  on public.airdrop_registrations (claim_requested_at desc);

create index if not exists idx_airdrop_claimed_at
  on public.airdrop_registrations (claimed_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'i'
      and c.relname = 'idx_airdrop_claim_tx'
      and n.nspname = 'public'
  ) then
    if not exists (
      select claim_tx
      from public.airdrop_registrations
      where claim_tx is not null
      group by claim_tx
      having count(*) > 1
    ) then
      execute 'create unique index idx_airdrop_claim_tx on public.airdrop_registrations (claim_tx) where claim_tx is not null';
    else
      raise notice 'Skipped unique index idx_airdrop_claim_tx because duplicate claim_tx values already exist.';
    end if;
  end if;
end $$;

create or replace function public.airdrop_approve(p_wallet text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.airdrop_registrations
  set
    status = 'approved',
    approved_at = now(),
    reason = null
  where wallet = p_wallet
    and status = 'pending';

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.airdrop_reject(
  p_wallet text,
  p_reason text default 'Duplicate or invalid registration'
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.airdrop_registrations
  set
    status = 'rejected',
    reason = p_reason
  where wallet = p_wallet
    and status in ('pending', 'approved');

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.airdrop_claim_start(p_wallet text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.airdrop_registrations
  set
    status = 'claim_processing',
    claim_requested_at = now()
  where wallet = p_wallet
    and status = 'approved';

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.airdrop_claim_complete(
  p_wallet text,
  p_claim_tx text,
  p_airdrop_amount numeric
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.airdrop_registrations
  set
    status = 'claimed',
    claimed_at = now(),
    claim_tx = p_claim_tx,
    airdrop_amount = p_airdrop_amount
  where wallet = p_wallet
    and status in ('claim_processing', 'approved');

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.airdrop_claim_reset(p_wallet text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  update public.airdrop_registrations
  set
    status = 'approved',
    claim_requested_at = null
  where wallet = p_wallet
    and status = 'claim_processing';

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.airdrop_approve(text) from public, anon, authenticated;
revoke execute on function public.airdrop_reject(text, text) from public, anon, authenticated;
revoke execute on function public.airdrop_claim_start(text) from public, anon, authenticated;
revoke execute on function public.airdrop_claim_complete(text, text, numeric) from public, anon, authenticated;
revoke execute on function public.airdrop_claim_reset(text) from public, anon, authenticated;

create or replace view public.v_airdrop_status_counts as
select status, count(*)::bigint as total
from public.airdrop_registrations
group by status
order by status;

create or replace view public.v_airdrop_claimed as
select
  wallet,
  x_username,
  telegram_username,
  claimed_at,
  claim_tx,
  airdrop_amount
from public.airdrop_registrations
where status in ('claimed', 'airdrop_sent')
order by claimed_at desc nulls last;

create or replace view public.v_airdrop_approved_pending_claim as
select
  wallet,
  x_username,
  telegram_username,
  approved_at,
  created_at
from public.airdrop_registrations
where status = 'approved'
order by approved_at asc nulls last, created_at asc;

create or replace view public.v_airdrop_pending_review as
select
  wallet,
  x_username,
  telegram_username,
  created_at,
  reason
from public.airdrop_registrations
where status = 'pending'
order by created_at asc;

create or replace view public.v_airdrop_rejected as
select
  wallet,
  x_username,
  telegram_username,
  reason,
  created_at
from public.airdrop_registrations
where status = 'rejected'
order by created_at desc;

revoke all on public.v_airdrop_status_counts from anon, authenticated;
revoke all on public.v_airdrop_claimed from anon, authenticated;
revoke all on public.v_airdrop_approved_pending_claim from anon, authenticated;
revoke all on public.v_airdrop_pending_review from anon, authenticated;
revoke all on public.v_airdrop_rejected from anon, authenticated;

alter table public.airdrop_registrations enable row level security;

drop policy if exists "deny all public reads" on public.airdrop_registrations;
drop policy if exists "deny all public inserts" on public.airdrop_registrations;
drop policy if exists "deny all public updates" on public.airdrop_registrations;
drop policy if exists "deny all public deletes" on public.airdrop_registrations;

create policy "deny all public reads"
  on public.airdrop_registrations for select to public
  using (false);

create policy "deny all public inserts"
  on public.airdrop_registrations for insert to public
  with check (false);

create policy "deny all public updates"
  on public.airdrop_registrations for update to public
  using (false)
  with check (false);

create policy "deny all public deletes"
  on public.airdrop_registrations for delete to public
  using (false);

comment on table public.airdrop_registrations is
'Airdrop registrations and claim lifecycle for SuperFirulai.';

comment on column public.airdrop_registrations.status is
'Allowed values: pending, approved, rejected, claim_processing, claimed, airdrop_sent.';

comment on column public.airdrop_registrations.airdrop_amount is
'Amount of FIRU assigned/sent for the approved claim.';

-- =====================================================
-- ROUNDS
-- =====================================================
create table if not exists public.round_registrations (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  sender_wallet text not null,
  project_wallet text not null,
  tx_hash text not null,
  round text not null,
  sol_amount numeric(20,9),
  payment_token text default 'SOL',
  payment_amount numeric(30,9),
  payment_amount_usd numeric(30,9),
  token_price_usd numeric(30,9),
  firu_price_usd numeric(30,9),
  firu_allocation numeric(30,0) not null,
  telegram_username text,
  x_username text,
  tx_block_time timestamptz,
  tx_slot bigint,
  raw_validation jsonb,
  distribution_tx text,
  distribution_sent_at timestamptz,
  delivery_status text not null default 'pending',
  delivery_tx text,
  delivered_at timestamptz,
  delivery_notes text,
  created_at timestamptz not null default now(),

  constraint round_registrations_tx_unique unique (tx_hash),
  constraint round_registrations_round_check check (round in ('round1', 'round2', 'round3')),
  constraint round_registrations_payment_token_check check (
    payment_token is null
    or payment_token in ('SOL', 'USDT', 'USDC')
  ),
  constraint round_registrations_payment_amount_positive check (
    payment_amount is null
    or payment_amount > 0
  ),
  constraint round_registrations_payment_amount_usd_positive check (
    payment_amount_usd is null
    or payment_amount_usd >= 0
  ),
  constraint round_registrations_token_price_usd_positive check (
    token_price_usd is null
    or token_price_usd > 0
  ),
  constraint round_registrations_firu_price_usd_positive check (
    firu_price_usd is null
    or firu_price_usd > 0
  ),
  constraint round_registrations_allocation_positive check (firu_allocation > 0),
  constraint round_registrations_tg_format check (
    telegram_username is null
    or telegram_username ~ '^[A-Za-z0-9_]{3,32}$'
  ),
  constraint round_registrations_x_format check (
    x_username is null
    or x_username ~ '^[A-Za-z0-9_]{1,15}$'
  ),
  constraint round_registrations_delivery_status_check check (
    delivery_status in ('pending', 'processing', 'delivered', 'failed', 'cancelled')
  )
);

alter table public.round_registrations
  add column if not exists payment_token text,
  add column if not exists payment_amount numeric(30,9),
  add column if not exists payment_amount_usd numeric(30,9),
  add column if not exists token_price_usd numeric(30,9),
  add column if not exists firu_price_usd numeric(30,9),
  add column if not exists delivery_status text,
  add column if not exists delivery_tx text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_notes text;

alter table public.round_registrations
  alter column delivery_status set default 'pending';

alter table public.round_registrations
  drop constraint if exists round_registrations_round_check;

alter table public.round_registrations
  add constraint round_registrations_round_check
  check (
    round in ('round1', 'round2', 'round3')
  );

update public.round_registrations
set payment_token = 'SOL'
where payment_token is null
  and (sol_amount is not null or payment_amount is null);

update public.round_registrations
set payment_amount = sol_amount
where payment_amount is null
  and sol_amount is not null;

update public.round_registrations
set delivery_status = case
  when coalesce(distribution_tx, delivery_tx) is not null
    or coalesce(distribution_sent_at, delivered_at) is not null then 'delivered'
  else 'pending'
end
where delivery_status is null
   or delivery_status not in ('pending', 'processing', 'delivered', 'failed', 'cancelled');

alter table public.round_registrations
  drop constraint if exists round_registrations_payment_token_check;

alter table public.round_registrations
  add constraint round_registrations_payment_token_check
  check (
    payment_token is null
    or payment_token in ('SOL', 'USDT', 'USDC')
  );

alter table public.round_registrations
  drop constraint if exists round_registrations_payment_amount_positive;

alter table public.round_registrations
  add constraint round_registrations_payment_amount_positive
  check (
    payment_amount is null
    or payment_amount > 0
  );

alter table public.round_registrations
  drop constraint if exists round_registrations_payment_amount_usd_positive;

alter table public.round_registrations
  add constraint round_registrations_payment_amount_usd_positive
  check (
    payment_amount_usd is null
    or payment_amount_usd >= 0
  );

alter table public.round_registrations
  drop constraint if exists round_registrations_token_price_usd_positive;

alter table public.round_registrations
  add constraint round_registrations_token_price_usd_positive
  check (
    token_price_usd is null
    or token_price_usd > 0
  );

alter table public.round_registrations
  drop constraint if exists round_registrations_firu_price_usd_positive;

alter table public.round_registrations
  add constraint round_registrations_firu_price_usd_positive
  check (
    firu_price_usd is null
    or firu_price_usd > 0
  );

alter table public.round_registrations
  drop constraint if exists round_registrations_delivery_status_check;

alter table public.round_registrations
  add constraint round_registrations_delivery_status_check
  check (
    delivery_status in ('pending', 'processing', 'delivered', 'failed', 'cancelled')
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'round_registrations_tx_unique'
  ) then
    if not exists (
      select tx_hash
      from public.round_registrations
      where tx_hash is not null
      group by tx_hash
      having count(*) > 1
    ) then
      alter table public.round_registrations
        add constraint round_registrations_tx_unique unique (tx_hash);
    else
      raise notice 'Skipped unique constraint round_registrations_tx_unique because duplicate tx_hash values already exist.';
    end if;
  end if;
end $$;

create index if not exists idx_round_wallet
  on public.round_registrations (wallet);

create index if not exists idx_round_sender_wallet
  on public.round_registrations (sender_wallet);

create index if not exists idx_round_payment_token
  on public.round_registrations (payment_token);

create index if not exists idx_round_tx_hash
  on public.round_registrations (tx_hash);

create index if not exists idx_round_created_at
  on public.round_registrations (created_at desc);

create index if not exists idx_round_distribution_tx
  on public.round_registrations (distribution_tx);

create index if not exists idx_round_delivery_status
  on public.round_registrations (delivery_status);

create index if not exists idx_round_delivery_tx
  on public.round_registrations (delivery_tx);

create index if not exists idx_round_delivered_at
  on public.round_registrations (delivered_at desc);

create index if not exists idx_round_round_created_at
  on public.round_registrations (round, created_at desc);

create index if not exists idx_round_round_wallet
  on public.round_registrations (round, wallet);

create or replace view public.v_round_pending_delivery as
select
  id,
  wallet,
  sender_wallet,
  round,
  payment_token,
  payment_amount,
  payment_amount_usd,
  firu_allocation,
  tx_hash,
  created_at,
  delivery_status
from public.round_registrations
where delivery_status in ('pending', 'processing', 'failed')
order by created_at asc;

create or replace view public.v_round_delivered as
select
  id,
  wallet,
  sender_wallet,
  round,
  payment_token,
  payment_amount,
  payment_amount_usd,
  firu_allocation,
  tx_hash,
  delivery_tx,
  delivered_at,
  delivery_status,
  created_at
from public.round_registrations
where delivery_status = 'delivered'
order by delivered_at desc nulls last, created_at desc;

create or replace view public.v_round_delivery_status_counts as
select
  delivery_status,
  count(*)::bigint as total
from public.round_registrations
group by delivery_status
order by delivery_status;

revoke all on public.v_round_pending_delivery from anon, authenticated;
revoke all on public.v_round_delivered from anon, authenticated;
revoke all on public.v_round_delivery_status_counts from anon, authenticated;

alter table public.round_registrations enable row level security;

drop policy if exists "deny all round reads" on public.round_registrations;
drop policy if exists "deny all round inserts" on public.round_registrations;
drop policy if exists "deny all round updates" on public.round_registrations;
drop policy if exists "deny all round deletes" on public.round_registrations;

create policy "deny all round reads"
  on public.round_registrations for select to public
  using (false);

create policy "deny all round inserts"
  on public.round_registrations for insert to public
  with check (false);

create policy "deny all round updates"
  on public.round_registrations for update to public
  using (false)
  with check (false);

create policy "deny all round deletes"
  on public.round_registrations for delete to public
  using (false);

comment on table public.round_registrations is
'Round 1 and Round 2 purchase registrations for SuperFirulai.';

comment on column public.round_registrations.payment_token is
'Token used to pay: SOL, USDT or USDC.';

comment on column public.round_registrations.payment_amount is
'Amount paid in the selected token.';

comment on column public.round_registrations.payment_amount_usd is
'Estimated USD value of the payment at registration time.';

comment on column public.round_registrations.token_price_usd is
'Estimated USD price of the token used to pay.';

comment on column public.round_registrations.firu_price_usd is
'FIRU price applied to that purchase.';

-- =====================================================
-- CLEAN READ-ONLY VIEWS FOR DASHBOARD
-- =====================================================
drop view if exists public.v_airdrop_clean;
drop view if exists public.v_round_clean;

create or replace view public."00_airdrop_limpio" as
select
  id,
  wallet,
  telegram_username,
  x_username,
  status,
  reason,
  created_at,
  approved_at,
  claim_requested_at,
  claimed_at,
  claim_tx,
  airdrop_amount
from public.airdrop_registrations
order by created_at desc;

create or replace view public."01_rounds_limpio" as
select
  id,
  wallet,
  round,
  payment_token,
  payment_amount,
  payment_amount_usd,
  firu_allocation,
  tx_hash,
  created_at,
  delivery_status,
  delivery_tx,
  delivered_at
from public.round_registrations
order by created_at desc;

comment on view public."00_airdrop_limpio" is
'Vista limpia de lectura para revisar registros de airdrop en el panel.';

comment on view public."01_rounds_limpio" is
'Vista limpia de lectura para revisar rounds en el panel.';

revoke all on public."00_airdrop_limpio" from anon, authenticated;
revoke all on public."01_rounds_limpio" from anon, authenticated;
