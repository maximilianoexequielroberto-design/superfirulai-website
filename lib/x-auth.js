import crypto from "crypto";

const X_API_BASE = "https://api.x.com/2";
const X_AUTH_BASE = "https://x.com/i/oauth2/authorize";
const DEFAULT_TARGET_USERNAME = "superfirulai";
const DEFAULT_X_SCOPES = ["tweet.read", "users.read", "follows.read"];
const MAX_TARGET_FOLLOWER_PAGES = 10;
const MAX_SOURCE_FOLLOWING_PAGES = 5;
const X_USERNAME_RE = /^[A-Za-z0-9_]{1,15}$/;

function stripSpaces(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function firstSegment(value) {
  return String(value || "").split(/[/?#]/)[0] || "";
}

export function normalizeXHandle(value) {
  const cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(x\.com|twitter\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");
  return firstSegment(cleaned).toLowerCase();
}

export function assertValidXHandle(value, label = "X username") {
  const normalized = normalizeXHandle(value);
  if (!X_USERNAME_RE.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function ensureEnv(name, value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${name} is not configured`);
  }
  return normalized;
}

export function getXConfig() {
  return {
    clientId: ensureEnv("X_CLIENT_ID", process.env.X_CLIENT_ID),
    clientSecret: ensureEnv("X_CLIENT_SECRET", process.env.X_CLIENT_SECRET),
    bearerToken: ensureEnv("X_BEARER_TOKEN", process.env.X_BEARER_TOKEN),
    callbackUrl: ensureEnv("X_CALLBACK_URL", process.env.X_CALLBACK_URL),
    targetUsername: normalizeXHandle(process.env.X_TARGET_USERNAME || DEFAULT_TARGET_USERNAME) || DEFAULT_TARGET_USERNAME,
    targetUserId: String(process.env.X_TARGET_USER_ID || "").trim(),
    scopes: DEFAULT_X_SCOPES
  };
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail.trim();
  if (typeof payload.title === "string" && payload.title.trim()) return payload.title.trim();
  if (typeof payload.error_description === "string" && payload.error_description.trim()) return payload.error_description.trim();
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
  if (Array.isArray(payload.errors) && payload.errors.length) {
    const first = payload.errors[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first.message === "string" && first.message.trim()) return first.message.trim();
  }
  return fallback;
}

async function xFetchJson(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    cache: "no-store"
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const message = typeof data === "string"
      ? data
      : parseErrorMessage(data, `X request failed with status ${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export function createPkcePair() {
  const state = toBase64Url(crypto.randomBytes(24));
  const codeVerifier = toBase64Url(crypto.randomBytes(48));
  const codeChallenge = toBase64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { state, codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

export function buildXAuthorizeUrl({ clientId, callbackUrl, state, codeChallenge, scopes = DEFAULT_X_SCOPES }) {
  const url = new URL(X_AUTH_BASE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForTokens({ code, codeVerifier }) {
  const config = getXConfig();
  const form = new URLSearchParams();
  form.set("code", String(code || "").trim());
  form.set("grant_type", "authorization_code");
  form.set("client_id", config.clientId);
  form.set("redirect_uri", config.callbackUrl);
  form.set("code_verifier", String(codeVerifier || "").trim());

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  return xFetchJson(`${X_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });
}

export async function fetchAuthenticatedXUser(accessToken) {
  const data = await xFetchJson(`${X_API_BASE}/users/me?user.fields=created_at,description,public_metrics,verified`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!data?.data?.id || !data?.data?.username) {
    throw new Error("X did not return the authenticated user");
  }

  return {
    id: String(data.data.id),
    username: normalizeXHandle(data.data.username),
    name: String(data.data.name || "").trim(),
    verified: Boolean(data.data.verified),
    publicMetrics: data.data.public_metrics || null
  };
}

export async function fetchXUserByUsername(username, bearerToken = getXConfig().bearerToken) {
  const normalized = assertValidXHandle(username);
  const params = new URLSearchParams();
  params.set("user.fields", "created_at,description,public_metrics,verified");
  const data = await xFetchJson(`${X_API_BASE}/users/by/username/${encodeURIComponent(normalized)}?${params.toString()}`, {
    headers: {
      "Authorization": `Bearer ${bearerToken}`
    }
  });

  if (!data?.data?.id || !data?.data?.username) {
    throw new Error(`X user lookup failed for @${normalized}`);
  }

  return {
    id: String(data.data.id),
    username: normalizeXHandle(data.data.username),
    name: String(data.data.name || "").trim(),
    verified: Boolean(data.data.verified),
    publicMetrics: data.data.public_metrics || null
  };
}

export async function getTargetXAccount() {
  const config = getXConfig();
  if (config.targetUserId) {
    return {
      id: config.targetUserId,
      username: config.targetUsername
    };
  }
  const target = await fetchXUserByUsername(config.targetUsername, config.bearerToken);
  return {
    id: target.id,
    username: target.username
  };
}

async function checkFollowerPages({ targetUserId, sourceUserId, bearerToken }) {
  let paginationToken = "";
  let scannedPages = 0;

  while (scannedPages < MAX_TARGET_FOLLOWER_PAGES) {
    const params = new URLSearchParams();
    params.set("max_results", "1000");
    params.set("user.fields", "username");
    if (paginationToken) params.set("pagination_token", paginationToken);

    const data = await xFetchJson(`${X_API_BASE}/users/${encodeURIComponent(targetUserId)}/followers?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${bearerToken}`
      }
    });

    scannedPages += 1;
    const users = Array.isArray(data?.data) ? data.data : [];
    if (users.some((entry) => String(entry?.id || "").trim() === sourceUserId)) {
      return { isFollowing: true, mode: "target_followers", scannedPages };
    }

    paginationToken = String(data?.meta?.next_token || "").trim();
    if (!paginationToken) break;
  }

  return { isFollowing: false, mode: "target_followers", scannedPages };
}

async function checkFollowingPages({ sourceUserId, targetUserId, accessToken }) {
  let paginationToken = "";
  let scannedPages = 0;

  while (scannedPages < MAX_SOURCE_FOLLOWING_PAGES) {
    const params = new URLSearchParams();
    params.set("max_results", "1000");
    params.set("user.fields", "username");
    if (paginationToken) params.set("pagination_token", paginationToken);

    const data = await xFetchJson(`${X_API_BASE}/users/${encodeURIComponent(sourceUserId)}/following?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    scannedPages += 1;
    const users = Array.isArray(data?.data) ? data.data : [];
    if (users.some((entry) => String(entry?.id || "").trim() === targetUserId)) {
      return { isFollowing: true, mode: "source_following", scannedPages };
    }

    paginationToken = String(data?.meta?.next_token || "").trim();
    if (!paginationToken) break;
  }

  return { isFollowing: false, mode: "source_following", scannedPages };
}

export async function verifyXFollow({ accessToken, expectedUsername = "" }) {
  const normalizedExpectedUsername = expectedUsername ? assertValidXHandle(expectedUsername, "Expected X username") : "";
  const config = getXConfig();
  const user = await fetchAuthenticatedXUser(accessToken);

  if (normalizedExpectedUsername && user.username !== normalizedExpectedUsername) {
    throw new Error("The connected X account does not match the username in the form");
  }

  const target = await getTargetXAccount();

  let followCheck = await checkFollowerPages({
    targetUserId: target.id,
    sourceUserId: user.id,
    bearerToken: config.bearerToken
  });

  if (!followCheck.isFollowing) {
    const fallbackCheck = await checkFollowingPages({
      sourceUserId: user.id,
      targetUserId: target.id,
      accessToken
    });
    if (fallbackCheck.isFollowing) {
      followCheck = fallbackCheck;
    }
  }

  return {
    ok: true,
    user,
    userId: user.id,
    username: user.username,
    targetUserId: target.id,
    targetUsername: target.username,
    isFollowing: followCheck.isFollowing,
    verificationMode: followCheck.mode,
    scannedPages: followCheck.scannedPages,
    checkedAt: new Date().toISOString()
  };
}

export async function fetchXFollowersCount() {
  const config = getXConfig();
  const profile = await fetchXUserByUsername(config.targetUsername, config.bearerToken);
  const followersCount = Number(profile?.publicMetrics?.followers_count || 0);
  return {
    username: profile.username,
    followersCount: Number.isFinite(followersCount) ? followersCount : 0,
    checkedAt: new Date().toISOString()
  };
}
