import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";
import { applySecurityHeaders, enforceRateLimit, serverError } from "../_security.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLAIM_TTL_MS = 5 * 60 * 1000;
const DEFAULT_AIRDROP_AMOUNT = Number(
  process.env.AIRDROP_AMOUNT_FIRU || process.env.AIRDROP_AMOUNT || 12500
);

function parseBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function getExpectedMessage({ wallet, nonce, timestamp }) {
  return [
    "SuperFirulai Airdrop Claim",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`
  ].join("\n");
}


function getChallengeSecret() {
  return String(process.env.NONCE_SECRET || "").trim();
}

function verifyChallenge({ nonce, timestamp, challenge }) {
  const secret = getChallengeSecret();
  if (!secret) {
    throw new Error("NONCE_SECRET is required for claim verification");
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${nonce}.${timestamp}`)
    .digest("hex");

  const provided = String(challenge || "");
  if (expected.length !== provided.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function isLikelyBase58(value, { minLength = 1, maxLength = 256 } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length < minLength || normalized.length > maxLength) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(normalized);
}

function verifyWalletSignature({ wallet, message, signature }) {
  if (!isLikelyBase58(wallet, { minLength: 32, maxLength: 64 })) {
    throw new Error("Invalid wallet format");
  }
  if (!isLikelyBase58(signature, { minLength: 64, maxLength: 128 })) {
    throw new Error("Invalid signature format");
  }

  let publicKey;
  let sigBytes;
  try {
    publicKey = bs58.decode(wallet);
    sigBytes = bs58.decode(signature);
  } catch (_) {
    throw new Error("Wallet signature must be valid base58");
  }

  const msgBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgBytes, sigBytes, publicKey);
}

function getClaimResponse(wallet, amount, message) {
  return {
    ok: true,
    wallet,
    status: "claim_processing",
    airdropAmount: amount,
    message
  };
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!enforceRateLimit(req, res, { scope: "airdrop-claim", limit: 8, windowMs: 60_000 })) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }

  if (!parseBool(process.env.CLAIM_LIVE, false)) {
    return res.status(403).json({ error: "Claim is not live yet" });
  }

  try {
    const { wallet, signed_message, signature, nonce, timestamp, challenge } = req.body || {};

    if (!wallet || !signed_message || !signature || !nonce || !timestamp || !challenge) {
      return res.status(400).json({ error: "Missing required claim fields" });
    }

    const issuedAt = Date.parse(timestamp);
    if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > CLAIM_TTL_MS) {
      return res.status(400).json({ error: "Claim nonce expired. Sign again." });
    }

    if (!verifyChallenge({ nonce, timestamp, challenge })) {
      return res.status(400).json({ error: "Invalid claim nonce challenge" });
    }

    const expectedMessage = getExpectedMessage({ wallet, nonce, timestamp });
    if (signed_message !== expectedMessage) {
      return res.status(400).json({ error: "Claim signature message mismatch" });
    }

    const isValidSignature = verifyWalletSignature({ wallet, message: signed_message, signature });
    if (!isValidSignature) {
      return res.status(400).json({ error: "Invalid wallet signature" });
    }

    const { data, error } = await supabase
      .from("airdrop_registrations")
      .select("wallet,status,claim_tx,claimed_at,claim_requested_at,airdrop_amount")
      .eq("wallet", wallet)
      .maybeSingle();

    if (error) {
      return serverError(res, "Could not load claim record", error);
    }

    if (!data) {
      return res.status(404).json({ error: "This wallet is not registered for the airdrop" });
    }

    const amount = Number(data.airdrop_amount || DEFAULT_AIRDROP_AMOUNT);

    if (data.status === "claimed" || data.status === "airdrop_sent" || data.claimed_at || data.claim_tx) {
      return res.status(409).json({
        error: "This wallet already claimed $FIRU.",
        claimTx: data.claim_tx,
        airdropAmount: amount
      });
    }

    if (data.status === "pending") {
      return res.status(409).json({ error: "This wallet is still pending review." });
    }

    if (data.status === "rejected") {
      return res.status(409).json({ error: "This wallet was rejected for the airdrop." });
    }

    if (data.status === "claim_processing") {
      return res.status(200).json(
        getClaimResponse(
          wallet,
          amount,
          "Claim request already received. Manual $FIRU delivery remains pending through the current project distribution flow."
        )
      );
    }

    if (data.status !== "approved") {
      return res.status(409).json({ error: `This wallet cannot claim from status: ${data.status || "unknown"}.` });
    }

    const { data: rpcRows, error: startError } = await supabase.rpc("airdrop_claim_start", { p_wallet: wallet });
    if (startError) {
      return serverError(res, "Could not start claim request", startError);
    }

    if (Number(rpcRows || 0) < 1) {
      const { data: freshRow, error: freshError } = await supabase
        .from("airdrop_registrations")
        .select("status,claim_tx,claimed_at,airdrop_amount")
        .eq("wallet", wallet)
        .maybeSingle();

      if (freshError) {
        return serverError(res, "Could not refresh claim state", freshError);
      }

      if (freshRow?.status === "claim_processing") {
        return res.status(200).json(
          getClaimResponse(
            wallet,
            Number(freshRow.airdrop_amount || amount),
            "Claim request already received. Manual $FIRU delivery remains pending through the current project distribution flow."
          )
        );
      }

      if (freshRow?.status === "claimed" || freshRow?.status === "airdrop_sent" || freshRow?.claimed_at || freshRow?.claim_tx) {
        return res.status(409).json({
          error: "This wallet already claimed $FIRU.",
          claimTx: freshRow.claim_tx,
          airdropAmount: Number(freshRow.airdrop_amount || amount)
        });
      }

      return res.status(409).json({ error: "This wallet is no longer eligible to request the claim." });
    }

    return res.status(200).json(
      getClaimResponse(
        wallet,
        amount,
        "Claim request accepted. Manual $FIRU delivery remains pending through the current project distribution flow."
      )
    );
  } catch (err) {
    return serverError(res, "Could not process claim request", err);
  }
}
