import crypto from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";

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

function verifyWalletSignature({ wallet, message, signature }) {
  const publicKey = bs58.decode(wallet);
  const sigBytes = bs58.decode(signature);
  const msgBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgBytes, sigBytes, publicKey);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
      .select("wallet,status,claim_tx,claimed_at,airdrop_amount")
      .eq("wallet", wallet)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message || "Could not load claim record" });
    }

    if (!data) {
      return res.status(404).json({ error: "This wallet is not registered for the airdrop" });
    }

    if (data.status === "claimed" || data.claimed_at || data.claim_tx) {
      return res.status(409).json({
        error: "This wallet already claimed $FIRU.",
        claimTx: data.claim_tx,
        airdropAmount: data.airdrop_amount || DEFAULT_AIRDROP_AMOUNT
      });
    }

    if (data.status === "pending") {
      return res.status(409).json({ error: "This wallet is still pending review." });
    }

    if (data.status === "rejected") {
      return res.status(409).json({ error: "This wallet was rejected for the airdrop." });
    }

    if (!["approved", "claim_processing"].includes(String(data.status || ""))) {
      return res.status(409).json({ error: `This wallet cannot claim from status: ${data.status || "unknown"}.` });
    }

    const amount = Number(data.airdrop_amount || DEFAULT_AIRDROP_AMOUNT);
    const claimTx = `test-claim-${Date.now()}-${String(wallet).slice(0, 8)}`;

    if (data.status === "approved") {
      const { error: startError } = await supabase.rpc("airdrop_claim_start", { p_wallet: wallet });
      if (startError) {
        return res.status(500).json({ error: startError.message || "Could not start claim" });
      }
    }

    const { error: completeError } = await supabase.rpc("airdrop_claim_complete", {
      p_wallet: wallet,
      p_claim_tx: claimTx,
      p_airdrop_amount: amount
    });

    if (completeError) {
      await supabase.rpc("airdrop_claim_reset", { p_wallet: wallet }).catch(() => {});
      return res.status(500).json({ error: completeError.message || "Could not complete claim" });
    }

    return res.status(200).json({
      ok: true,
      wallet,
      status: "claimed",
      claimTx,
      airdropAmount: amount,
      message: "Airdrop claim confirmed in test mode."
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error"
    });
  }
}
