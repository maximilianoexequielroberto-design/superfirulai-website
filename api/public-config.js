const TURNSTILE_SITE_KEY_FALLBACK = "0x4AAAAAACpwkm3WDkKZBlBv";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || TURNSTILE_SITE_KEY_FALLBACK).trim() || TURNSTILE_SITE_KEY_FALLBACK;

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  return res.status(200).json({
    turnstileSiteKey
  });
}
