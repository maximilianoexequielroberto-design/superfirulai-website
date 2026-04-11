export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  return res.status(200).json({
    turnstileSiteKey
  });
}
