# SuperFirulai website

Static landing page plus Vercel serverless API for the official SuperFirulai website, airdrop registration, claim checks, community stats, and the active round registration flow.

## Source of truth and editing rule

This repo must stay aligned with the latest frozen continuity state for SuperFirulai.

Operational rule:
- make surgical changes only
- do not touch frozen design, hero framing, top buttons, menu structure, or approved section layouts unless explicitly requested
- if documentation and older notes conflict, the latest frozen continuity state wins

## Current active project structure

Main active files in the current site:

- `/index.html` — main landing page, sections, menus, and modal shells
- `/wallet-provider.js` — wallet detection, connect/disconnect helpers, and Phantom mobile deep-link flow
- `/airdrop-register.js` — frontend airdrop registration flow
- `/claim-status.js` — frontend claim-status and claim action flow
- `/round-register.js` — frontend round registration / buy flow
- `/api/airdrop/nonce.js` — nonce + challenge generator used before wallet signature
- `/api/airdrop/register.js` — airdrop registration backend
- `/api/airdrop/claim-status.js` — airdrop claim-status backend
- `/api/airdrop/claim.js` — current test/manual airdrop claim backend that marks rows as claimed in Supabase
- `/api/community-stats.js` — community stats endpoint, holders count, X manual count, and Telegram live counter
- `/api/round/config.js` — public config for round pricing, limits, receiver wallets, progress, and remaining allocation
- `/api/round/register.js` — round validation + registration backend
- `/api/round/history.js` — round history lookup for wallet-based delivery status
- `/api/round-register.js` — compatibility re-export for `/api/round/register.js`
- `/scripts/distribute-firu.js` — manual FIRU distribution helper script
- `/supabase/schema.sql` — project database schema reference

## Current approved operating model

### Airdrop

- Official airdrop amount: **12,500 FIRU** per approved wallet
- Current campaign limit: **first 100 approved wallets**
- Registration is **manual-review based**
- Telegram in the form is **manual username + confirmation checkbox**, not real-time Telegram verification
- X in the form is a **manual username field**, not OAuth or live follow verification
- Claim flow is currently **test/manual**:
  - the claim endpoint marks the row as `claimed` in Supabase
  - token delivery is still handled manually by the operator
  - approved claims are communicated as manual project delivery after claim, without promising an automatic or fixed-time on-chain send

### Rounds

- Round 1 is official and enabled
- Round 2 is official but remains disabled until explicit activation
- Purchased round allocations are communicated as **manual delivery on launch day** to the same buyer wallet used during purchase
- Future rounds may exist only if officially announced later; they must not be presented as already confirmed

## Frozen round configuration

Current frozen values for the active setup:

- `ROUND_RECEIVER_WALLET` = main public Solana receiver wallet
- `ROUND_RECEIVER_USDT_ATA` = USDT receiver ATA
- `ROUND_RECEIVER_USDC_ATA` = USDC receiver ATA
- `ROUND_1_ENABLED=true`
- `ROUND_2_ENABLED=false`
- `ROUND_1_FIRU_PRICE=0.000168`
- `ROUND_2_FIRU_PRICE=0.000269`
- `ROUND_1_TOKEN_CAP=25000000`
- `ROUND_2_TOKEN_CAP=25000000`
- `ROUND_MIN=0.1`
- `ROUND_MAX=2`
- `CLAIM_LIVE` = used by the current airdrop claim flow according to the deployed backend configuration

Round 2 stays published but disabled until explicit activation.

## Integration and removal notes

Current integration direction:

- Hostinger domain + GitHub source + Vercel hosting
- Supabase backend datastore
- Solana + Phantom wallet flow
- Telegram live member count is handled separately by `/api/community-stats.js`

Important removed/legacy items that must **not** be reintroduced casually:

- `api/x/`
- `lib/`
- `api/telegram/verify.js`
- X OAuth / live follow verification
- Telegram real-time verification in the airdrop form

`api/telegram/` remains lowercase if it exists in future work. Do not rename it to `api/Telegram/`.

## Environment variables

### Required core variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOLANA_RPC_URL`
- `ROUND_RECEIVER_WALLET`
- `ROUND_1_FIRU_PRICE`
- `ROUND_2_FIRU_PRICE`
- `ROUND_MIN`
- `ROUND_MAX`

### Required for the airdrop flow

- `TURNSTILE_SECRET_KEY`
- `TURNSTILE_SITE_KEY`
- `AIRDROP_AMOUNT_FIRU`

### Required only for the distribution script

- `TOKEN_MINT_ADDRESS`
- `AIRDROP_APPROVED_LIMIT` (use `100` for the current campaign, or `0` / `off` / `unlimited` for no limit)
- `TREASURY_PRIVATE_KEY_JSON`

### Optional but recommended

- `NONCE_SECRET`
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

## Current round / buy logic

- Round 1 and Round 2 use FIRU prices from Vercel environment variables
- `ROUND_MIN` and `ROUND_MAX` are interpreted as **SOL-equivalent per purchase**
- `ROUND_1_TOKEN_CAP` and `ROUND_2_TOKEN_CAP` are interpreted as **FIRU token caps per round**
- SOL goes to `ROUND_RECEIVER_WALLET`
- USDT / USDC go to their configured ATA if explicitly provided; otherwise the API derives the ATA from `ROUND_RECEIVER_WALLET`
- `/api/round/config` returns the public runtime configuration used by the frontend
- `/api/round/register` validates on-chain payment details before saving the registration
- `/api/round/register` uses live pricing with fallback prices when external price lookup fails
- current backend protection should reject oversubscription conflicts instead of silently allowing a round cap overrun

## Current airdrop logic

- `/api/airdrop/nonce` creates a nonce + challenge payload used before wallet signature
- `/api/airdrop/register` validates the challenge, wallet signature, Turnstile token, and uniqueness checks before saving the registration
- `/api/airdrop/claim-status` checks whether a wallet is pending, approved, rejected, or already claimed
- `/api/airdrop/claim.js` is the active test/manual claim endpoint for the current flow
- the frontend claim flow must not simulate fake preview success; it should reflect the real backend response

## Community stats logic

- Telegram member count can be read live through `/api/community-stats.js` using `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- X count is treated as manual unless the project explicitly restores a paid/live integration later
- holders stay locked at 0 during `PROJECT_STAGE=prelaunch`; after launch, the site can switch to live on-chain holder tracking when the mint + RPC are configured

## Distribution script note

`/scripts/distribute-firu.js` is a manual operator tool, not a public API flow.

It should be used carefully because round delivery and airdrop delivery remain manual operations. Always verify:
- treasury balance
- receiver wallet
- delivery status in Supabase
- transaction result before any rerun

## Deploy

1. Push the repo to GitHub
2. In Vercel, configure the environment variables listed above
3. Redeploy
4. Test these endpoints after deploy:
   - `/api/round/config`
   - `/api/round/register`
   - `/api/round/history`
   - `/api/community-stats`
   - `/api/airdrop/nonce`
   - `/api/airdrop/register`
   - `/api/airdrop/claim-status`
   - `/api/airdrop/claim`

## Maintenance rule

When updating docs, env files, or deployment notes, keep them aligned with the real active behavior of:

- `/api/round/config.js`
- `/api/round/register.js`
- `/api/round/history.js`
- `/api/community-stats.js`
- `/api/airdrop/register.js`
- `/api/airdrop/claim-status.js`
- `/api/airdrop/claim.js`
- `/scripts/distribute-firu.js`
- `/supabase/schema.sql`

If a future cleanup removes or changes one of those files, update this README in the same patch.


Turnstile on the frontend reads the public site key from `/api/public-config`, so future site-key changes can be done in Vercel without editing frontend files.


## UI and stage controls

The frontend can now react to these Vercel variables without changing `index.html` again:

- `PROJECT_STAGE=prelaunch|launch|postlaunch`
- `ROADMAP_ACTIVE_PHASE=register|buy|claim`
- `AIRDROP_UI_STATE=live|closed|hidden`
- `BUY_UI_STATE=coming-soon|live|hidden`
- `CLAIM_UI_STATE=hidden|manual|live`
- `ROUND_3_ENABLED=false|true`

When `ROUND_3_ENABLED=true`, the round API can also expose `ROUND_3_FIRU_PRICE` and `ROUND_3_TOKEN_CAP` for a future third round.


## Additional hardening in the current base

- Round registration now uses a signed short-lived pricing quote from `/api/round/config` so the UI estimate and backend validation stay aligned during registration.
- Round registration rejects transactions outside the accepted round time window using `ROUND_TX_MAX_AGE_HOURS` and optional `ROUND_TX_NOT_BEFORE`.
- Airdrop claim now records a manual claim request (`claim_processing`) instead of marking wallets as claimed automatically before manual distribution happens.
- `scripts/distribute-firu.js` now aborts if the loaded distribution wallet does not match the expected community distribution wallet.
