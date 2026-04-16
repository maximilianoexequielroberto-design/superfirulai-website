import crypto from "crypto";
import { applySecurityHeaders, enforceRateLimit } from "../_security.js";

const NONCE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!enforceRateLimit(req, res, { scope: "airdrop-nonce", limit: 20, windowMs: 60_000 })) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }

  const secret = String(process.env.NONCE_SECRET || "").trim();
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
