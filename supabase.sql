create extension if not exists pgcrypto;

create table if not exists public.airdrop_registrations (
  id uuid primary key default gen_random_uuid(),
  wallet text not null unique,
  telegram_username text not null unique,
  x_username text not null unique,
  signed_message text not null,
  signature text not null,
  nonce text not null unique,
  turnstile_ok boolean not null default false,
  status text not null default 'pending',
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.airdrop_registrations
  add column if not exists ip_address text,
  add column if not exists user_agent text;

alter table public.airdrop_registrations enable row level security;

drop policy if exists "deny all public reads" on public.airdrop_registrations;
create policy "deny all public reads"
on public.airdrop_registrations
for all
to public
using (false)
with check (false);
