SUPERFIRULAI FINAL IMAGE-BASED PACK

WHAT TO UPLOAD TO GITHUB
- index.html
- superfirulai-official.webp
- favicon.png
- airdrop-register.js
- package.json
- api/community-stats.js
- api/airdrop/nonce.js
- api/airdrop/register.js

WHAT THIS VERSION DOES
- Uses the official reference image as the main homepage
- Keeps buttons and functions inside that visual layout using hotspots
- Opens premium modals for Tokenomics, Airdrop, Roadmap, Community and Buy
- Keeps verified airdrop working with Phantom + Turnstile + Supabase
- Keeps live/configurable community stats working through /api/community-stats

VERCEL VARIABLES REQUIRED
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TURNSTILE_SECRET_KEY
- TELEGRAM_MEMBERS_FALLBACK
- X_FOLLOWERS_COUNT
- HOLDERS_COUNT
- TOTAL_SUPPLY

OPTIONAL FOR LIVE TELEGRAM
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

RECOMMENDED VALUES
- TELEGRAM_MEMBERS_FALLBACK = 65
- X_FOLLOWERS_COUNT = 101
- HOLDERS_COUNT = 0
- TOTAL_SUPPLY = 1000000000
