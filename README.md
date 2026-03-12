# SuperFirulai Full Verified Project

## Sube estos archivos al root del repo
- index.html
- superfirulai-hero.webp
- superfirulai-tokenomics.webp
- favicon.png
- airdrop-register.js
- package.json

## Sube esta carpeta al repo
- api/airdrop/nonce.js
- api/airdrop/register.js

## En Supabase
1. Abre SQL Editor
2. Ejecuta `supabase.sql`

## En Cloudflare Turnstile
1. Crea un site
2. Copia:
   - Site Key
   - Secret Key

## En Vercel Environment Variables
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TURNSTILE_SECRET_KEY

## En `airdrop-register.js`
Reemplaza:
- YOUR_TURNSTILE_SITE_KEY
por tu site key real

## Estructura final
index.html
superfirulai-hero.webp
superfirulai-tokenomics.webp
favicon.png
airdrop-register.js
package.json
api/airdrop/nonce.js
api/airdrop/register.js
