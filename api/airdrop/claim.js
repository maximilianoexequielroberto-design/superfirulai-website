import nacl from "tweetnacl";
import bs58 from "bs58";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLAIM_TTL_MS = 5 * 60 * 1000;

function normalizeWallet(value) {
  return String(value || "").trim();
}

function looksLikeSolanaWallet(wallet) {
  return wallet.length >= 32 && wallet.length <= 64;
}

function parseBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function getExpectedMessage({ wallet, timestamp }) {
  return [
    "SuperFirulai Airdrop Claim",
    `Wallet: ${wallet}`,
    `Timestamp: ${timestamp}`
  ].join("\n");
}

function verifyWalletSignature({ wallet, message, signature }) {
  const publicKey = bs58.decode(wallet);
  const sigBytes = bs58.decode(signature);
  const msgBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgBytes, sigBytes, publicKey);
}

function buildClaimTx(wallet) {
  return `test_claim_${Date.now()}_${wallet.slice(0, 8)}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const claimLive = parseBool(process.env.CLAIM_LIVE, false);
    if (!claimLive) {
      return res.status(400).json({ error: "Claim is not live yet" });
    }

    const { wallet, signed_message, signature, timestamp } = req.body || {};
    const normalizedWallet = normalizeWallet(wallet);

    if (!normalizedWallet || !signed_message || !signature || !timestamp) {
      return res.status(400).json({ error: "Missing required claim fields" });
    }

    if (!looksLikeSolanaWallet(normalizedWallet)) {
      return res.status(400).json({ error: "Invalid wallet format" });
    }

    const issuedAt = Date.parse(timestamp);
    if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > CLAIM_TTL_MS) {
      return res.status(400).json({ error: "Claim signature expired. Please try again." });
    }

    const expectedMessage = getExpectedMessage({ wallet: normalizedWallet, timestamp });
    if (signed_message !== expectedMessage) {
      return res.status(400).json({ error: "Claim message mismatch" });
    }

    const isValidSignature = verifyWalletSignature({
      wallet: normalizedWallet,
      message: signed_message,
      signature
    });

    if (!isValidSignature) {
      return res.status(400).json({ error: "Invalid wallet signature" });
    }

    const { data, error } = await supabase
      .from("airdrop_registrations")
      .select("wallet,status,claimed_at,claim_tx,airdrop_amount")
      .eq("wallet", normalizedWallet)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message || "Could not load claim record" });
    }

    if (!data) {
      return res.status(404).json({ error: "This wallet is not registered for the airdrop" });
    }

    if (data.claimed_at || data.claim_tx || data.status === "claimed" || data.status === "airdrop_sent") {
      return res.status(409).json({ error: "This wallet already claimed the airdrop" });
    }

    if (data.status !== "approved") {
      return res.status(400).json({ error: "This wallet is not approved for claim yet" });
    }

    const claimTx = buildClaimTx(normalizedWallet);
    const airdropAmount = Number(data.airdrop_amount || process.env.AIRDROP_AMOUNT || 12500);

    const { error: updateError } = await supabase
      .from("airdrop_registrations")
      .update({
        status: "claimed",
        claim_requested_at: new Date().toISOString(),
        claimed_at: new Date().toISOString(),
        claim_tx: claimTx,
        airdrop_amount: airdropAmount
      })
      .eq("wallet", normalizedWallet)
      .eq("status", "approved");

    if (updateError) {
      return res.status(500).json({ error: updateError.message || "Could not update claim status" });
    }

    return res.status(200).json({
      ok: true,
      wallet: normalizedWallet,
      state: "claimed",
      status: "claimed",
      claimTx,
      airdropAmount,
      message: "Airdrop claimed successfully"
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error"
    });
  }
}
