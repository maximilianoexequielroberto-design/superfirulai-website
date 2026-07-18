# SuperFirulai website

Official informational website for SuperFirulai ($FIRU) on Solana, post-launch. Static single-page site plus one Vercel serverless endpoint for live community stats.

## Structure

- `/index.html` — the whole site: hero, about, buy, analytics, security, tokenomics, roadmap, community, TaskOn, FAQ and footer. Single file, no build step.
- `/api/community-stats.js` — returns live holders count (via Solana RPC), X followers and Telegram members. Called from `index.html` on page load.
- `/api/_security.js` — shared security headers helper used by the API route.
- `/token/firu-logo.png` — token logo, also used as favicon.
- `/token/firu-metadata.json` — token metadata.
- `/hero-desktop-image.png`, `/hero-mobile-image.png` — hero artwork (responsive swap in CSS).
- `/superfirulai-social.jpg` — Open Graph / Twitter card image.
- `/game/` — standalone mini-game, unrelated to the main site.

## Official links used on the site

- Website: https://superfirulai.com
- Contract Address (Solana): `7HvY2dyYYtzkjU1u9kniGyuTe41KwVxDCefywaTVf8rV`
- Jupiter, Raydium, Binance Web3, OKX Web3, CoinEx Onchain, GMGN — buy links
- DexScreener, Solscan — analytics
- StakePoint, De.Fi Scanner — security verification
- X: https://x.com/superfirulai
- Telegram channel: https://t.me/superfirulai
- Telegram community: https://t.me/superfirulaicommunity
- TaskOn: https://taskon.xyz/quest/337685846

If any of these change, update the corresponding `href` values directly in `index.html` (search for the platform name) and in the footer.

## Editing tokenomics

Tokenomics percentages and amounts are hardcoded in the `#tokenomics` section of `index.html`. Update both the percentage cards and the `.tokenomics-bar` widths if the distribution changes.

## Environment variables

Only `api/community-stats.js` needs configuration. See `.env.example`:

- `SOLANA_RPC_URL` / `SOLANA_RPC_URL_PUBLIC` — RPC endpoint used to read holder count.
- `TOKEN_MINT_ADDRESS` — the $FIRU mint address.
- `HOLDERS_COUNT`, `X_FOLLOWERS_COUNT`, `TOTAL_SUPPLY`, `TELEGRAM_MEMBERS_FALLBACK` — fallback values shown if live lookups fail.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — optional, enables a live Telegram member count instead of the fallback.

## Local development

```
npm install
npm run dev
```

## Deploying

This project is set up for Vercel. Push to the connected branch/repo, or run `vercel --prod` from this directory.

## Removed in this version

The previous prelaunch flow (Register Airdrop, Buy Round, Claim, wallet connection, and their Supabase-backed API routes) was fully removed now that $FIRU has launched. If you still need that historical code, retrieve it from git history before this change. Note: the Supabase tables `airdrop_registrations` and `round_registrations` are no longer used by the site and can be dropped from the Supabase project directly (this repo no longer references them).
