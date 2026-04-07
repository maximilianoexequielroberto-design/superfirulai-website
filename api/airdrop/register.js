import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";
import { assertValidXHandle } from "../../lib/x-auth.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{3,32}$/;
const NONCE_TTL_MS = 5 * 60 * 1000;
const TELEGRAM_AUTH_MAX_AGE_SEC = 10 * 60;
const TELEGRAM_API_BASE = "https://api.telegram.org";

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

function getExpectedMessage({ wallet, nonce, timestamp }) {
  return [
    "SuperFirulai Airdrop Registration",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`
  ].join("\n");
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

function buildTelegramCheckString(auth) {
  return Object.keys(auth)
    .filter((key) => auth[key] !== undefined && auth[key] !== null && key !== "hash")
    .sort()
    .map((key) => `${key}=${auth[key]}`)
    .join("\n");
}

function verifyTelegramLogin(auth) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    throw new Error("Telegram bot token is not configured");
  }

  const payload = auth && typeof auth === "object" ? auth : {};
  const hash = String(payload.hash || "").trim();
  const authDate = Number(payload.auth_date || 0);
  const userId = Number(payload.id || 0);

  if (!hash || !authDate || !userId) {
    throw new Error("Telegram verification is incomplete");
  }

  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > TELEGRAM_AUTH_MAX_AGE_SEC) {
    throw new Error("Telegram verification expired. Verify again.");
  }

  const checkString = buildTelegramCheckString({
    auth_date: authDate,
    first_name: payload.first_name,
    id: userId,
    last_name: payload.last_name,
    photo_url: payload.photo_url,
    username: payload.username
  });

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (expectedHash !== hash) {
    throw new Error("Telegram login signature is invalid");
  }

  return {
    id: userId,
    username: normalizeTelegramHandle(payload.username || ""),
    auth_date: authDate,
    first_name: String(payload.first_name || "").trim(),
    last_name: String(payload.last_name || "").trim(),
    photo_url: String(payload.photo_url || "").trim(),
    hash
  };
}

async function getTelegramMembership(userId) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    throw new Error("Telegram chat is not configured");
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${encodeURIComponent(userId)}`;
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || "Could not verify Telegram membership");
  }

  const status = String(data?.result?.status || "").toLowerCase();
  const restrictedIsMember = Boolean(data?.result?.is_member);
  const activeStatuses = new Set(["creator", "administrator", "member"]);
  const isMember = activeStatuses.has(status) || (status === "restricted" && restrictedIsMember);

  return { isMember, status };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      wallet,
      telegram_username,
      telegram_auth,
      x_username,
      signed_message,
      signature,
      nonce,
      timestamp,
      challenge,
      turnstileToken
    } = req.body || {};

    if (!wallet || !telegram_username || !telegram_auth || !x_username || !signed_message || !signature || !nonce || !timestamp || !challenge || !turnstileToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const tg = normalizeTelegramHandle(telegram_username);
    const xh = assertValidXHandle(x_username, "X username");

    if (!TELEGRAM_HANDLE_RE.test(tg)) {
      return res.status(400).json({ error: "Invalid Telegram username" });
    }

    const telegramAuth = verifyTelegramLogin(telegram_auth);
    if (!telegramAuth.username) {
      return res.status(400).json({ error: "Your Telegram account needs a public username to register." });
    }

    if (tg !== telegramAuth.username) {
      return res.status(400).json({ error: "Telegram username mismatch. Verify the same Telegram account again." });
    }

    const membership = await getTelegramMembership(telegramAuth.id);
    if (!membership.isMember) {
      return res.status(403).json({ error: "Join SuperFirulai Community on Telegram before registering." });
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
      message: "Airdrop registration verified"
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error"
    });
  }
}
