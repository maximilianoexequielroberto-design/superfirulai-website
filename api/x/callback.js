import { exchangeCodeForTokens, verifyXFollow } from "../../lib/x-auth.js";

const COOKIE_NAME = "sf_x_oauth";

function parseCookies(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      const key = part.slice(0, index).trim();
      const value = decodeURIComponent(part.slice(index + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function renderBridgePage({ message, origin, returnTo }) {
  const safeMessage = escapeScriptJson(message);
  const safeOrigin = escapeScriptJson(origin || "*");
  const safeReturnTo = escapeScriptJson(returnTo || "/");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SuperFirulai X verification</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body{margin:0;font-family:Inter,Arial,sans-serif;background:#07101f;color:#eef4ff;display:grid;place-items:center;min-height:100vh;padding:24px}
    .card{width:min(100%,460px);padding:24px;border-radius:22px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(13,21,44,.96),rgba(8,12,24,.96));box-shadow:0 22px 60px rgba(0,0,0,.35)}
    h1{margin:0 0 10px;font-size:22px}
    p{margin:0;color:#c7d6f5;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <h1>${message.ok ? "X verification complete" : "X verification failed"}</h1>
    <p>${message.ok ? "You can return to the SuperFirulai page now. This window should close automatically." : String(message.error || "The X verification could not be completed.")}</p>
  </div>
  <script>
    (function () {
      const payload = ${safeMessage};
      const origin = ${safeOrigin};
      const returnTo = ${safeReturnTo};

      try {
        localStorage.setItem("sf_x_oauth_result", JSON.stringify(payload));
      } catch (_) {}

      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(payload, origin);
        } catch (_) {}
        setTimeout(() => window.close(), 120);
        return;
      }

      if (returnTo) {
        setTimeout(() => window.location.replace(returnTo), 120);
      }
    })();
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const cookies = parseCookies(req.headers.cookie);
  let cookiePayload = null;

  try {
    const raw = cookies[COOKIE_NAME];
    if (raw) {
      cookiePayload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    }
  } catch (_) {
    cookiePayload = null;
  }

  const origin = String(cookiePayload?.origin || "").trim();
  const returnTo = String(cookiePayload?.returnTo || origin || "/").trim();

  const finish = (message) => {
    res.setHeader("Set-Cookie", clearCookieHeader());
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(message.ok ? 200 : 400).send(renderBridgePage({ message, origin, returnTo }));
  };

  const queryError = String(req.query?.error || "").trim();
  if (queryError) {
    return finish({
      source: "superfirulai-x-oauth",
      ok: false,
      error: String(req.query?.error_description || queryError || "X authorization was cancelled.")
    });
  }

  try {
    const state = String(req.query?.state || "").trim();
    const code = String(req.query?.code || "").trim();
    const expectedState = String(cookiePayload?.state || "").trim();
    const codeVerifier = String(cookiePayload?.codeVerifier || "").trim();
    const createdAt = Number(cookiePayload?.createdAt || 0);

    if (!state || !code || !expectedState || !codeVerifier) {
      throw new Error("X OAuth callback is incomplete");
    }

    if (Math.abs(Date.now() - createdAt) > 10 * 60 * 1000) {
      throw new Error("X login expired. Start again.");
    }

    if (state !== expectedState) {
      throw new Error("X login state mismatch. Start again.");
    }

    const tokenSet = await exchangeCodeForTokens({
      code,
      codeVerifier
    });

    const accessToken = String(tokenSet?.access_token || "").trim();
    if (!accessToken) {
      throw new Error("X did not return an access token");
    }

    const verification = await verifyXFollow({ accessToken });

    return finish({
      source: "superfirulai-x-oauth",
      ok: true,
      payload: {
        accessToken,
        expiresIn: Number(tokenSet?.expires_in || 0),
        scope: String(tokenSet?.scope || "").trim(),
        userId: verification.userId,
        username: verification.username,
        targetUserId: verification.targetUserId,
        targetUsername: verification.targetUsername,
        isFollowing: verification.isFollowing,
        verificationMode: verification.verificationMode,
        checkedAt: verification.checkedAt
      }
    });
  } catch (error) {
    return finish({
      source: "superfirulai-x-oauth",
      ok: false,
      error: error instanceof Error ? error.message : "X verification failed"
    });
  }
}
