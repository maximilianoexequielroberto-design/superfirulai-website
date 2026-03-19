# SuperFirulai Production-Ready Site

This package includes:
- premium landing page
- verified airdrop with Phantom signature
- Cloudflare Turnstile verification
- Supabase persistence
- Round 1 / Round 2 purchase registration by TX hash
- on-chain validation against Solana RPC
- automatic SOL amount and FIRU allocation calculation
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
- `ROUND_1_TOKENS_PER_SOL`
- `ROUND_2_TOKENS_PER_SOL`

Optional:
- `ROUND_1_ENABLED`
- `ROUND_2_ENABLED`
- `ROUND_1_MIN_SOL`
- `ROUND_2_MIN_SOL`
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
- The transaction must include a SOL transfer to `PROJECT_RECEIVE_WALLET`.
- `scripts/distribute-firu.js` is meant to be run only after your token mint exists and you have funded the treasury.
