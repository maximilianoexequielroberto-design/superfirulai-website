import crypto from "crypto";

const NONCE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.NONCE_SECRET || process.env.TURNSTILE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    return res.status(500).json({ error: "Server nonce secret is not configured" });
  }

  const nonce = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const challenge = crypto
    .createHmac("sha256", secret)
    .update(`${nonce}.${timestamp}`)
    .digest("hex");

  return res.status(200).json({
    nonce,
    timestamp,
    challenge,
    expiresAt: new Date(Date.now() + NONCE_TTL_MS).toISOString()
  });
}
