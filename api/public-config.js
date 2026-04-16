import { applySecurityHeaders } from "./_security.js";

function normalizeEnum(value, allowed, fallback) {
  const key = String(value || '').trim().toLowerCase();
  return allowed.includes(key) ? key : fallback;
}

function normalizeBoolean(value, fallback = false) {
  const key = String(value || '').trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(key)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(key)) return false;
  return fallback;
}

export default async function handler(req, res) {
  applySecurityHeaders(res, { privateResponse: false });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  const projectStage = normalizeEnum(process.env.PROJECT_STAGE, ["prelaunch", "launch", "postlaunch"], "prelaunch");
  const roadmapActivePhase = normalizeEnum(process.env.ROADMAP_ACTIVE_PHASE, ["register", "buy", "claim"], "register");
  const airdropUiState = normalizeEnum(process.env.AIRDROP_UI_STATE, ["live", "closed", "hidden"], "live");
  const buyUiState = normalizeEnum(process.env.BUY_UI_STATE, ["coming-soon", "live", "hidden"], "live");
  const claimUiState = normalizeEnum(process.env.CLAIM_UI_STATE, ["hidden", "manual", "live"], "manual");
  const round3Enabled = normalizeBoolean(process.env.ROUND_3_ENABLED, false);

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  return res.status(200).json({
    turnstileSiteKey,
    projectStage,
    roadmapActivePhase,
    airdropUiState,
    buyUiState,
    claimUiState,
    round3Enabled
  });
}
