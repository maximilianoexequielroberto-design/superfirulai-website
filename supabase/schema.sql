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
  created_at timestamptz not null default now(),

  constraint airdrop_wallet_unique unique (wallet),
  constraint airdrop_telegram_unique unique (telegram_username),
  constraint airdrop_x_unique unique (x_username),
  constraint airdrop_nonce_unique unique (nonce),
  constraint airdrop_status_check check (status in ('pending', 'approved', 'rejected', 'airdrop_sent')),
  constraint airdrop_wallet_length_check check (char_length(wallet) between 32 and 64),
  constraint airdrop_telegram_format_check check (telegram_username ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint airdrop_x_format_check check (x_username ~ '^[A-Za-z0-9_]{1,15}$'),
  constraint airdrop_nonce_length_check check (char_length(nonce) >= 8)
);

create index if not exists idx_airdrop_created_at on public.airdrop_registrations (created_at desc);
create index if not exists idx_airdrop_status on public.airdrop_registrations (status);

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
  sol_amount numeric(20,9) not null,
  firu_allocation numeric(30,0) not null,
  telegram_username text,
  x_username text,
  tx_block_time timestamptz,
  tx_slot bigint,
  raw_validation jsonb,
  distribution_tx text,
  distribution_sent_at timestamptz,
  created_at timestamptz not null default now(),

  constraint round_registrations_tx_unique unique (tx_hash),
  constraint round_registrations_round_check check (round in ('round1', 'round2')),
  constraint round_registrations_sol_positive check (sol_amount > 0),
  constraint round_registrations_allocation_positive check (firu_allocation > 0),
  constraint round_registrations_tg_format check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{3,32}$'),
  constraint round_registrations_x_format check (x_username is null or x_username ~ '^[A-Za-z0-9_]{1,15}$')
);

create index if not exists idx_round_wallet on public.round_registrations (wallet);
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
