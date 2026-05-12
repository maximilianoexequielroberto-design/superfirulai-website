import { applySecurityHeaders, enforceRateLimit, serverError } from "../_security.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeWallet(value) {
  return String(value || "").trim();
}

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function looksLikeSolanaWallet(wallet) {
  return typeof wallet === "string" && SOLANA_ADDRESS_RE.test(wallet.trim());
}

function parseBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (!enforceRateLimit(req, res, { scope: "airdrop-claim-status", limit: 30, windowMs: 60_000 })) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const wallet = normalizeWallet(req.query?.wallet);

    if (!wallet) {
      return res.status(400).json({ error: "Wallet is required" });
    }

    if (!looksLikeSolanaWallet(wallet)) {
      return res.status(400).json({ error: "Invalid wallet format" });
    }

    const { data, error } = await supabase
      .from("airdrop_registrations")
      .select(
        [
          "wallet",
          "status",
          "reason",
          "created_at",
          "approved_at",
          "claim_requested_at",
          "claimed_at",
          "claim_tx",
          "airdrop_amount"
        ].join(",")
      )
      .eq("wallet", wallet)
      .maybeSingle();

    if (error) {
      return serverError(res, "Could not check claim status", error);
    }

    const claimLive = parseBool(process.env.CLAIM_LIVE, false);

    if (!data) {
      return res.status(200).json({
        ok: true,
        wallet,
        state: "not_registered",
        eligible: false,
        claimLive,
        message: "This wallet is not registered for the airdrop."
      });
    }

    const hasClaim = !!(data.claimed_at || data.claim_tx || data.status === "claimed" || data.status === "airdrop_sent");

    if (hasClaim) {
      return res.status(200).json({
        ok: true,
        wallet,
        state: "claimed",
        eligible: false,
        claimLive,
        status: data.status,
        createdAt: data.created_at,
        approvedAt: data.approved_at,
        claimRequestedAt: data.claim_requested_at,
        claimedAt: data.claimed_at,
        claimTx: data.claim_tx,
        airdropAmount: data.airdrop_amount,
        message: "This wallet already claimed $FIRU."
      });
    }

    if (data.status === "claim_processing") {
      return res.status(200).json({
        ok: true,
        wallet,
        state: "claim_processing",
        eligible: false,
        claimLive,
        status: data.status,
        createdAt: data.created_at,
        approvedAt: data.approved_at,
        claimRequestedAt: data.claim_requested_at,
        claimedAt: data.claimed_at,
        claimTx: data.claim_tx,
        airdropAmount: data.airdrop_amount,
        message: "Claim request received. Manual $FIRU delivery remains pending through the current project distribution flow."
      });
    }

    if (data.status === "approved") {
      return res.status(200).json({
        ok: true,
        wallet,
        state: "approved",
        eligible: claimLive,
        claimLive,
        status: data.status,
        createdAt: data.created_at,
        approvedAt: data.approved_at,
        claimRequestedAt: data.claim_requested_at,
        claimedAt: data.claimed_at,
        claimTx: data.claim_tx,
        airdropAmount: data.airdrop_amount,
        message: claimLive
          ? "This wallet is approved and can claim $FIRU."
          : "This wallet is approved. Claim will open after launch."
      });
    }

    if (data.status === "rejected") {
      return res.status(200).json({
        ok: true,
        wallet,
        state: "rejected",
        eligible: false,
        claimLive,
        status: data.status,
        createdAt: data.created_at,
        approvedAt: data.approved_at,
        reason: data.reason,
        message: data.reason
          ? `This wallet was rejected: ${data.reason}`
          : "This wallet was rejected for the airdrop."
      });
    }

    return res.status(200).json({
      ok: true,
      wallet,
      state: "pending",
      eligible: false,
      claimLive,
      status: data.status,
      createdAt: data.created_at,
      approvedAt: data.approved_at,
      claimRequestedAt: data.claim_requested_at,
      claimedAt: data.claimed_at,
      claimTx: data.claim_tx,
      airdropAmount: data.airdrop_amount,
      message: "This wallet is registered and waiting for approval."
    });
  } catch (err) {
    return serverError(res, "Could not check claim status", err);
  }
}
