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

  constraint airdrop_status_check
    check (status in ('pending', 'approved', 'rejected', 'airdrop_sent')),

  constraint airdrop_wallet_length_check
    check (char_length(wallet) between 32 and 64),

  constraint airdrop_telegram_format_check
    check (telegram_username ~ '^[A-Za-z0-9_]{3,32}$'),

  constraint airdrop_x_format_check
    check (x_username ~ '^[A-Za-z0-9_]{1,15}$'),

  constraint airdrop_nonce_length_check
    check (char_length(nonce) >= 8)
);

create index if not exists idx_airdrop_created_at
  on public.airdrop_registrations (created_at desc);

create index if not exists idx_airdrop_status
  on public.airdrop_registrations (status);

alter table public.airdrop_registrations enable row level security;

drop policy if exists "deny all public reads" on public.airdrop_registrations;
drop policy if exists "deny all public inserts" on public.airdrop_registrations;
drop policy if exists "deny all public updates" on public.airdrop_registrations;
drop policy if exists "deny all public deletes" on public.airdrop_registrations;

create policy "deny all public reads"
on public.airdrop_registrations
for select
to public
using (false);

create policy "deny all public inserts"
on public.airdrop_registrations
for insert
to public
with check (false);

create policy "deny all public updates"
on public.airdrop_registrations
for update
to public
using (false)
with check (false);

create policy "deny all public deletes"
on public.airdrop_registrations
for delete
to public
using (false);
