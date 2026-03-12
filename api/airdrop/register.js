import nacl from "tweetnacl";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyTurnstile(token, ip) {
  const form = new FormData();
  form.append("secret", process.env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });

  const data = await resp.json();
  return !!data.success;
}

function verifyWalletSignature({ wallet, message, signature }) {
  const publicKey = bs58.decode(wallet);
  const sigBytes = bs58.decode(signature);
  const msgBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgBytes, sigBytes, publicKey);
}

function normalizeHandle(v) {
  return String(v || "").trim().replace(/^@/, "").toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      wallet,
      telegram_username,
      x_username,
      signed_message,
      signature,
      nonce,
      turnstileToken
    } = req.body || {};

    if (!wallet || !telegram_username || !x_username || !signed_message || !signature || !nonce || !turnstileToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const turnstileOk = await verifyTurnstile(
      turnstileToken,
      req.headers["x-forwarded-for"] || ""
    );

    if (!turnstileOk) {
      return res.status(400).json({ error: "Captcha validation failed" });
    }

    const isValidSignature = verifyWalletSignature({
      wallet,
      message: signed_message,
      signature
    });

    if (!isValidSignature) {
      return res.status(400).json({ error: "Invalid wallet signature" });
    }

    const tg = normalizeHandle(telegram_username);
    const xh = normalizeHandle(x_username);

    const duplicateChecks = await Promise.all([
      supabase.from("airdrop_registrations").select("id").eq("wallet", wallet).maybeSingle(),
      supabase.from("airdrop_registrations").select("id").eq("telegram_username", tg).maybeSingle(),
      supabase.from("airdrop_registrations").select("id").eq("x_username", xh).maybeSingle(),
      supabase.from("airdrop_registrations").select("id").eq("nonce", nonce).maybeSingle()
    ]);

    if (duplicateChecks[0].data) return res.status(409).json({ error: "Wallet already registered" });
    if (duplicateChecks[1].data) return res.status(409).json({ error: "Telegram already registered" });
    if (duplicateChecks[2].data) return res.status(409).json({ error: "X account already registered" });
    if (duplicateChecks[3].data) return res.status(409).json({ error: "Nonce already used" });

    const { error } = await supabase.from("airdrop_registrations").insert({
      wallet,
      telegram_username: tg,
      x_username: xh,
      signed_message,
      signature,
      nonce,
      turnstile_ok: true,
      status: "pending"
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      ok: true,
      message: "Airdrop registration verified"
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error"
    });
  }
}
