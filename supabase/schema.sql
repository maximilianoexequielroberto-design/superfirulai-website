create extension if not exists pgcrypto;

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
  airdrop_amount numeric(30,0),
  created_at timestamptz not null default now(),

  constraint airdrop_wallet_unique unique (wallet),
  constraint airdrop_telegram_unique unique (telegram_username),
  constraint airdrop_x_unique unique (x_username),
  constraint airdrop_nonce_unique unique (nonce),
  constraint airdrop_status_check check (status in ('pending', 'approved', 'rejected', 'claimed', 'airdrop_sent')),
  constraint airdrop_wallet_length_check check (char_length(wallet) between 32 and 64),
  constraint airdrop_telegram_format_check check (telegram_username ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint airdrop_x_format_check check (x_username ~ '^[A-Za-z0-9_]{1,15}$'),
  constraint airdrop_nonce_length_check check (char_length(nonce) >= 8)
);

alter table public.airdrop_registrations
  add column if not exists approved_at timestamptz,
  add column if not exists claim_requested_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_tx text,
  add column if not exists airdrop_amount numeric(30,0);

update public.airdrop_registrations
set status = 'claimed'
where status = 'airdrop_sent'
  and (claimed_at is not null or claim_tx is not null);

create index if not exists idx_airdrop_created_at on public.airdrop_registrations (created_at desc);
create index if not exists idx_airdrop_status on public.airdrop_registrations (status);
create index if not exists idx_airdrop_approved_at on public.airdrop_registrations (approved_at desc);
create index if not exists idx_airdrop_claimed_at on public.airdrop_registrations (claimed_at desc);

alter table public.airdrop_registrations enable row level security;

drop policy if exists "deny all public reads" on public.airdrop_registrations;
drop policy if exists "deny all public inserts" on public.airdrop_registrations;
drop policy if exists "deny all public updates" on public.airdrop_registrations;
drop policy if exists "deny all public deletes" on public.airdrop_registrations;

create policy "deny all public reads" on public.airdrop_registrations for select to public using (false);
create policy "deny all public inserts" on public.airdrop_registrations for insert to public with check (false);
create policy "deny all public updates" on public.airdrop_registrations for update to public using (false) with check (false);
create policy "deny all public deletes" on public.airdrop_registrations for delete to public using (false);

create table if not exists public.round_registrations (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  sender_wallet text not null,
  project_wallet text not null,
  tx_hash text not null,
  round text not null,
  sol_amount numeric(20,9),
  payment_token text not null default 'SOL',
  payment_amount numeric(30,9) not null default 0,
  payment_amount_usd numeric(30,9) not null default 0,
  token_price_usd numeric(20,9) not null default 0,
  firu_price_usd numeric(20,9) not null default 0,
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
  constraint round_registrations_round_check check (round in ('round1', 'round2')),
  constraint round_registrations_payment_token_check check (payment_token in ('SOL', 'USDT', 'USDC')),
  constraint round_registrations_amount_positive check (payment_amount > 0),
  constraint round_registrations_usd_positive check (payment_amount_usd > 0),
  constraint round_registrations_price_positive check (token_price_usd > 0 and firu_price_usd > 0),
  constraint round_registrations_allocation_positive check (firu_allocation > 0),
  constraint round_registrations_tg_format check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint round_registrations_x_format check (x_username is null or x_username ~ '^[A-Za-z0-9_]{1,15}$'),
  constraint round_registrations_delivery_status_check check (delivery_status in ('pending', 'processing', 'delivered', 'failed', 'cancelled'))
);

alter table public.round_registrations
  add column if not exists payment_token text not null default 'SOL',
  add column if not exists payment_amount numeric(30,9) not null default 0,
  add column if not exists payment_amount_usd numeric(30,9) not null default 0,
  add column if not exists token_price_usd numeric(20,9) not null default 0,
  add column if not exists firu_price_usd numeric(20,9) not null default 0,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists delivery_tx text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_notes text;

update public.round_registrations
set delivery_status = case
  when coalesce(distribution_tx, delivery_tx) is not null or coalesce(distribution_sent_at, delivered_at) is not null then 'delivered'
  else 'pending'
end
where delivery_status is null
   or delivery_status not in ('pending', 'processing', 'delivered', 'failed', 'cancelled');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'round_registrations_delivery_status_check'
  ) then
    alter table public.round_registrations
      add constraint round_registrations_delivery_status_check
      check (delivery_status in ('pending', 'processing', 'delivered', 'failed', 'cancelled'));
  end if;
end $$;

create index if not exists idx_round_delivery_status on public.round_registrations (delivery_status);
create index if not exists idx_round_delivery_tx on public.round_registrations (delivery_tx);
create index if not exists idx_round_delivered_at on public.round_registrations (delivered_at desc);

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
select delivery_status, count(*)::bigint as total
from public.round_registrations
group by delivery_status
order by delivery_status;

create index if not exists idx_round_wallet on public.round_registrations (wallet);
create index if not exists idx_round_sender_wallet on public.round_registrations (sender_wallet);
create index if not exists idx_round_payment_token on public.round_registrations (payment_token);
create index if not exists idx_round_created_at on public.round_registrations (created_at desc);
create index if not exists idx_round_distribution_tx on public.round_registrations (distribution_tx);

alter table public.round_registrations enable row level security;

drop policy if exists "deny all round reads" on public.round_registrations;
drop policy if exists "deny all round inserts" on public.round_registrations;
drop policy if exists "deny all round updates" on public.round_registrations;
drop policy if exists "deny all round deletes" on public.round_registrations;

create policy "deny all round reads" on public.round_registrations for select to public using (false);
create policy "deny all round inserts" on public.round_registrations for insert to public with check (false);
create policy "deny all round updates" on public.round_registrations for update to public using (false) with check (false);
create policy "deny all round deletes" on public.round_registrations for delete to public using (false);
