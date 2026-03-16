SuperFirulai - corrected web + backend package

Included:
- index.html
- airdrop-register.js
- api/community-stats.js
- api/airdrop/nonce.js
- api/airdrop/register.js
- package.json
- supabase/schema.sql
- web assets used by the current site

Environment variables required:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TURNSTILE_SECRET_KEY
- NONCE_SECRET
- HOLDERS_COUNT
- X_FOLLOWERS_COUNT
- TOTAL_SUPPLY
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- TELEGRAM_MEMBERS_FALLBACK

Notes:
- The nonce flow now includes timestamp + HMAC challenge and expires after 5 minutes.
- The registration endpoint validates the exact signed message.
- The frontend airdrop flow has better UX and wallet change handling.
- The old stray loadStats call that could break JS was removed.
- Apply supabase/schema.sql in Supabase SQL Editor before using the registration endpoint in production.
