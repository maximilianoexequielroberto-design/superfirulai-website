import crypto from "crypto";

const TELEGRAM_AUTH_MAX_AGE_SEC = 10 * 60;
const TELEGRAM_API_BASE = "https://api.telegram.org";

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
    photo_url: String(payload.photo_url || "").trim()
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
    const verified = verifyTelegramLogin(req.body?.auth);
    if (!verified.username) {
      return res.status(400).json({ error: "Your Telegram account needs a public username to continue." });
    }

    const membership = await getTelegramMembership(verified.id);
    if (!membership.isMember) {
      return res.status(403).json({ error: "Join SuperFirulai Community on Telegram before registering." });
    }

    return res.status(200).json({
      ok: true,
      telegram_username: verified.username,
      telegram_user_id: verified.id,
      membership_status: membership.status,
      message: "Telegram verified inside SuperFirulai Community."
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Telegram verification failed"
    });
  }
}
