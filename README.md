# SuperFirulai website

Static landing + Vercel serverless API for the SuperFirulai presale and airdrop.

## Environment variables

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOLANA_RPC_URL`
- `ROUND_RECEIVER_WALLET`
- `ROUND_1_FIRU_PRICE`
- `ROUND_2_FIRU_PRICE`
- `ROUND_MIN`
- `ROUND_MAX`

Optional but recommended:

- `ROUND_RECEIVER_USDT_ATA`
- `ROUND_RECEIVER_USDC_ATA`
- `ROUND_1_CAP`
- `ROUND_2_CAP`
- `ROUND_1_ENABLED`
- `ROUND_2_ENABLED`
- `USDT_MINT_ADDRESS`
- `USDC_MINT_ADDRESS`

## Current presale logic

- Round 1 and Round 2 use FIRU prices from Vercel env vars.
- `ROUND_MIN` and `ROUND_MAX` are interpreted as **SOL-equivalent per purchase**.
- `ROUND_1_CAP` and `ROUND_2_CAP` are interpreted as **total SOL-equivalent cap per round**.
- Round caps are enforced automatically by querying `round_registrations` in Supabase.
- SOL goes to `ROUND_RECEIVER_WALLET`.
- USDT / USDC go to their configured ATA if provided; otherwise the API derives the ATA from the wallet.

## Deploy

1. Push to GitHub.
2. In Vercel, configure the env vars above.
3. Redeploy.
4. Test `/api/round/config` and the purchase flow.
