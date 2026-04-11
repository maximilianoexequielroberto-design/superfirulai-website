import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{3,32}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const NONCE_TTL_MS = 5 * 60 * 1000;

function resolveAirdropApprovedLimit(value) {
  const normalized = String(value ?? "100").trim().toLowerCase();
  if (!normalized) return 100;
  if (["0", "off", "false", "unlimited", "none", "no-limit"].includes(normalized)) {
    return 0;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 100;
  }

  return Math.floor(parsed);
}

const AIRDROP_APPROVED_LIMIT = resolveAirdropApprovedLimit(process.env.AIRDROP_APPROVED_LIMIT);

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
  try {
    const publicKey = bs58.decode(wallet);
    const sigBytes = bs58.decode(signature);
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sigBytes, publicKey);
  } catch {
    return false;
  }
}

function stripSpaces(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function firstSegment(value) {
  return String(value || "").split(/[/?#]/)[0] || "";
}

function normalizeTelegramHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^telegram\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned).toLowerCase();
}

function normalizeXHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(x\.com|twitter\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned).toLowerCase();
}

function assertValidXHandle(value) {
  const normalized = normalizeXHandle(value);
  if (!X_HANDLE_RE.test(normalized)) {
    throw new Error("X username is invalid");
  }
  return normalized;
}

function getExpectedMessage({ wallet, nonce, timestamp }) {
  return [
    "SuperFirulai Airdrop Registration",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`
  ].join("\n");
}

async function getLockedAirdropSlots() {
  const lockedStatuses = ["approved", "claim_processing", "claimed", "airdrop_sent"];
  const { count, error } = await supabase
    .from("airdrop_registrations")
    .select("id", { count: "exact", head: true })
    .in("status", lockedStatuses);

  if (error) throw error;
  return Number(count || 0);
}

function verifyChallenge({ nonce, timestamp, challenge }) {
  const secret = process.env.NONCE_SECRET || process.env.TURNSTILE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${nonce}.${timestamp}`)
    .digest("hex");

  const provided = String(challenge || "");
  if (expected.length !== provided.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
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
      timestamp,
      challenge,
      turnstileToken
    } = req.body || {};

    if (!wallet || !telegram_username || !x_username || !signed_message || !signature || !nonce || !timestamp || !challenge || !turnstileToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const tg = normalizeTelegramHandle(telegram_username);
    const xh = assertValidXHandle(x_username, "X username");

    if (!TELEGRAM_HANDLE_RE.test(tg)) {
      return res.status(400).json({ error: "Invalid Telegram username" });
    }

    const issuedAt = Date.parse(timestamp);
    if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > NONCE_TTL_MS) {
      return res.status(400).json({ error: "Nonce expired. Connect your wallet again." });
    }

    if (!verifyChallenge({ nonce, timestamp, challenge })) {
      return res.status(400).json({ error: "Invalid nonce challenge" });
    }

    const expectedMessage = getExpectedMessage({ wallet, nonce, timestamp });
    if (signed_message !== expectedMessage) {
      return res.status(400).json({ error: "Signed message mismatch" });
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

    const lockedSlots = await getLockedAirdropSlots();
    if (AIRDROP_APPROVED_LIMIT > 0 && lockedSlots >= AIRDROP_APPROVED_LIMIT) {
      return res.status(409).json({
        error: "The current airdrop campaign is full. Please wait for an official future announcement."
      });
    }

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
      const message = String(error.message || "");
      if (/duplicate key|unique/i.test(message)) {
        return res.status(409).json({ error: "Registration already exists" });
      }
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      ok: true,
      message: "Registration received and pending review"
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error"
    });
  }
}
