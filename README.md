# SuperFirulai website

Proyecto listo para reemplazo en Vercel con una versión más limpia del sitio.

## Incluye
- `index.html` con hero corregido, navegación premium, monedas flotantes y sección de launch
- `airdrop-register.js` con mejor UX para registro
- `api/airdrop/nonce.js`
- `api/airdrop/register.js`
- `api/community-stats.js`
- `supabase.sql`
- `supabase/schema.sql`
- imágenes necesarias del sitio

## Variables necesarias en Vercel
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TURNSTILE_SECRET_KEY`
- `NONCE_SECRET` (recomendado)
- `TELEGRAM_BOT_TOKEN` (opcional)
- `TELEGRAM_CHAT_ID` (opcional)
- `HOLDERS_COUNT` (opcional)
- `X_FOLLOWERS_COUNT` (opcional)
- `TOTAL_SUPPLY` (opcional)
- `TELEGRAM_MEMBERS_FALLBACK` (opcional)

## Base de datos
Ejecutá `supabase/schema.sql` en Supabase para crear o actualizar la tabla `airdrop_registrations`.

También podés usar `supabase.sql` como versión compacta.
