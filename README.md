# SuperFirulai Production-Ready Site

This package includes:
- premium landing page
- verified airdrop with Phantom signature
- Cloudflare Turnstile verification
- Supabase persistence
- Round 1 / Round 2 purchase registration by TX hash
- on-chain validation against Solana RPC
- automatic live payment valuation and FIRU allocation calculation
- FIRU distribution base script using ATA

## Required environment variables

Copy `.env.example` values into your Vercel project settings.

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NONCE_SECRET`
- `TURNSTILE_SECRET_KEY`
- `SOLANA_RPC_URL`
- `PROJECT_RECEIVE_WALLET`
- `ROUND_1_FIRU_PRICE`
- `ROUND_2_FIRU_PRICE`
- `ROUND_MIN`
- `ROUND_MAX`

Optional:
- `ROUND_1_ENABLED`
- `ROUND_2_ENABLED`
- `HOLDERS_COUNT`
- `X_FOLLOWERS_COUNT`
- `TOTAL_SUPPLY`
- `TELEGRAM_MEMBERS_FALLBACK`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TOKEN_MINT_ADDRESS`
- `TREASURY_PRIVATE_KEY_JSON`

## Deploy

1. Upload this project to GitHub.
2. Import it in Vercel.
3. Add the environment variables from `.env.example`.
4. Run the SQL in `supabase/schema.sql`.
5. Redeploy.

## Notes

- The airdrop flow requires Phantom + wallet signature + Turnstile captcha.
- The round flow validates the submitted Solana transaction on-chain.
- The sending wallet in the transaction must match the connected Phantom wallet.
- The transaction must include a valid payment transfer to the configured project destination wallet/ATA for SOL, USDT, or USDC.
- `scripts/distribute-firu.js` is meant to be run only after your token mint exists and you have funded the treasury.


## Multitoken rounds

The rounds flow now supports payments on Solana using these tokens in this order:

1. SOL
2. USDT
3. USDC

Allocation is calculated with live market pricing at verification time:

- SOL uses live SOL/USD
- USDT uses live USDT/USD
- USDC uses live USDC/USD

Formula:
`FIRU allocation = (payment amount * live token price in USD) / FIRU price in USD`
