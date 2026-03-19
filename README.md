# SuperFirulai ($FIRU)

Production-ready base for:
- verified airdrop registration
- presale round registration by transaction hash
- Supabase persistence
- Phantom signature verification
- future FIRU distribution script

## Required environment variables

### Shared
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NONCE_SECRET`
- `TURNSTILE_SECRET_KEY`
- `SOLANA_RPC_URL`
- `PROJECT_RECEIVE_WALLET`

### Airdrop / frontend
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)
- `HOLDERS_COUNT` (optional)
- `X_FOLLOWERS_COUNT` (optional)
- `TOTAL_SUPPLY` (optional)

### Rounds
- `ROUND_1_ENABLED=true`
- `ROUND_2_ENABLED=true`
- `ROUND_1_TOKENS_PER_SOL`
- `ROUND_2_TOKENS_PER_SOL`
- `ROUND_1_MIN_SOL` (optional)
- `ROUND_2_MIN_SOL` (optional)

### Distribution script
- `TOKEN_MINT_ADDRESS`
- `TREASURY_PRIVATE_KEY_JSON`

## Deploy
1. Run `supabase/schema.sql` in Supabase SQL editor.
2. Set the environment variables in Vercel.
3. Deploy.
4. Test airdrop registration.
5. Test a round purchase using a real SOL transfer to `PROJECT_RECEIVE_WALLET`.
