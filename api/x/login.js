import { buildXAuthorizeUrl, createPkcePair, getXConfig } from "../../lib/x-auth.js";

const COOKIE_NAME = "sf_x_oauth";
const COOKIE_MAX_AGE_SEC = 10 * 60;

function buildSiteOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`;
}

function serializeCookie(name, value, { maxAgeSec = COOKIE_MAX_AGE_SEC } = {}) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    "Secure"
  ].join("; ");
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = getXConfig();
    const siteOrigin = buildSiteOrigin(req);
    const returnToRaw = String(req.query?.return_to || "").trim();
    const returnTo = returnToRaw.startsWith(siteOrigin) ? returnToRaw : siteOrigin;
    const { state, codeVerifier, codeChallenge } = createPkcePair();
    const authorizeUrl = buildXAuthorizeUrl({
      clientId: config.clientId,
      callbackUrl: config.callbackUrl,
      state,
      codeChallenge,
      scopes: config.scopes
    });

    const cookiePayload = Buffer.from(JSON.stringify({
      state,
      codeVerifier,
      createdAt: Date.now(),
      origin: siteOrigin,
      returnTo
    })).toString("base64url");

    res.setHeader("Set-Cookie", serializeCookie(COOKIE_NAME, cookiePayload));
    res.setHeader("Cache-Control", "no-store");
    res.writeHead(302, { Location: authorizeUrl });
    return res.end();
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not start X login"
    });
  }
}
