# SuperFirulai — clean deploy package

Contenido incluido:
- `index.html`
- `airdrop-register.js`
- `api/community-stats.js`
- `api/airdrop/nonce.js`
- `api/airdrop/register.js`
- `api/round-register.js`
- `package.json`
- `supabase/schema.sql`
- assets usados por la web actual

Limpieza aplicada:
- eliminados backups viejos de `index.html` y `airdrop-register.js`
- eliminados assets que no usa la versión actual
- eliminados archivos duplicados de documentación y SQL
- quitado el botón visual de audio que ya no se usa
- formulario del airdrop alineado a la UX final:
  - Telegram: `t.me/ [usuario]`
  - X: `@ [usuario]`
  - solo username limpio
- normalización reforzada en backend para evitar duplicados por `@`, `t.me/`, `x.com/` o links pegados
- frontend usando `window.bs58 || window.base58` con el script cargado antes del módulo

Variables de entorno necesarias en Vercel:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_SECRET_KEY`
- `NONCE_SECRET`
- `HOLDERS_COUNT`
- `X_FOLLOWERS_COUNT`
- `TOTAL_SUPPLY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_MEMBERS_FALLBACK`

Base de datos:
1. Abrí Supabase SQL Editor
2. Ejecutá `supabase/schema.sql`

Notas:
- `telegram_username` y `x_username` se guardan normalizados en minúsculas.
- La tabla `airdrop_registrations` tiene `UNIQUE` para wallet, telegram, x y nonce.
- El nonce vence a los 5 minutos.
- El captcha se valida con Cloudflare Turnstile.
