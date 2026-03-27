# SuperFirulai website

Static landing page + Vercel serverless API for the SuperFirulai website, airdrop registration, claim-status checks, and round registration flow.

## Active project structure

Main active files in the current site:

- `/index.html` — main landing page and section layout
- `/wallet-provider.js` — wallet detection and deep-link helpers
- `/airdrop-register.js` — frontend airdrop registration flow
- `/claim-status.js` — frontend claim-status check flow
- `/round-register.js` — frontend round registration / buy flow
- `/api/airdrop/nonce.js` — nonce + challenge generator
- `/api/airdrop/register.js` — airdrop registration backend
- `/api/airdrop/claim-status.js` — claim-status backend
- `/api/round/config.js` — public config for round pricing, limits, destinations, and progress
- `/api/round/register.js` — round validation + registration backend
- `/api/round-register.js` — compatibility re-export for `/api/round/register.js`
- `/scripts/distribute-firu.js` — manual distribution script for FIRU delivery
- `/supabase/schema.sql` — project database schema reference

Legacy / not part of the active mounted flow:

- `/app.js` — legacy file kept in the repo for reference only. The current site is mounted from `/index.html` with the modular frontend files listed above.

## Environment variables

### Required

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOLANA_RPC_URL`
- `ROUND_RECEIVER_WALLET`
- `ROUND_1_FIRU_PRICE`
- `ROUND_2_FIRU_PRICE`
- `ROUND_MIN`
- `ROUND_MAX`

### Required only for distribution script

- `TOKEN_MINT_ADDRESS`
- `TREASURY_PRIVATE_KEY_JSON`

### Optional but recommended

- `SUPABASE_ANON_KEY`
- `NONCE_SECRET`
- `TURNSTILE_SECRET_KEY`
- `ROUND_RECEIVER_USDT_ATA`
- `ROUND_RECEIVER_USDC_ATA`
- `ROUND_1_TOKEN_CAP`
- `ROUND_2_TOKEN_CAP`
- `ROUND_1_ENABLED`
- `ROUND_2_ENABLED`
- `CLAIM_LIVE`
- `USDT_MINT_ADDRESS`
- `USDC_MINT_ADDRESS`
- `SOLANA_RPC_URL_PUBLIC`
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `FALLBACK_SOL_PRICE_USD`
- `FALLBACK_USDT_PRICE_USD`
- `FALLBACK_USDC_PRICE_USD`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `HOLDERS_COUNT`
- `X_FOLLOWERS_COUNT`
- `TOTAL_SUPPLY`
- `TELEGRAM_MEMBERS_FALLBACK`
- `PROJECT_RECEIVE_WALLET` (legacy compatibility alias; prefer `ROUND_RECEIVER_WALLET`)

## Current round / buy logic

- Round 1 and Round 2 use FIRU prices from Vercel environment variables.
- `ROUND_MIN` and `ROUND_MAX` are interpreted as **SOL-equivalent per purchase**.
- `ROUND_1_TOKEN_CAP` and `ROUND_2_TOKEN_CAP` are interpreted as **FIRU token caps per round**.
- Round caps are enforced by querying `round_registrations` in Supabase and summing `firu_allocation` by round.
- SOL goes to `ROUND_RECEIVER_WALLET`.
- USDT / USDC go to their configured ATA if explicitly provided; otherwise the API derives the ATA from `ROUND_RECEIVER_WALLET`.
- `/api/round/config` returns the public runtime configuration used by the frontend.
- `/api/round/register` validates on-chain payment details before saving the registration.

## Current airdrop logic

- `/api/airdrop/nonce` creates a nonce + challenge payload used before wallet signature.
- `/api/airdrop/register` validates the challenge, wallet signature, Turnstile token, and uniqueness checks before saving the registration.
- `/api/airdrop/claim-status` checks whether a wallet is pending, approved, rejected, or already claimed.
- `CLAIM_LIVE` controls whether approved wallets are treated as claim-enabled by the status endpoint.
- The current frontend claim flow checks eligibility/status, but the final live claim execution endpoint is not yet mounted in this repo.

## Deploy

1. Push the repo to GitHub.
2. In Vercel, configure the environment variables listed above.
3. Redeploy.
4. Test these endpoints after deploy:
   - `/api/round/config`
   - `/api/round/register`
   - `/api/airdrop/nonce`
   - `/api/airdrop/register`
   - `/api/airdrop/claim-status`

## Important maintenance note

This repo reflects the current active modular flow. If you update documentation or environment files, keep them aligned with:

- `/api/round/config.js`
- `/api/round/register.js`
- `/api/airdrop/register.js`
- `/api/airdrop/claim-status.js`
- `/supabase/schema.sql`

