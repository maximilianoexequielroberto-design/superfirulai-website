import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { applySecurityHeaders, enforceRateLimit, serverError } from "../_security.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const ROUND_RECEIVER_WALLET = String(process.env.ROUND_RECEIVER_WALLET || "").trim();
const ROUND_RECEIVER_USDT_ATA = String(process.env.ROUND_RECEIVER_USDT_ATA || "").trim();
const ROUND_RECEIVER_USDC_ATA = String(process.env.ROUND_RECEIVER_USDC_ATA || "").trim();
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkLZ6K2JmQ94Yb9zt";
const TX_TIMEOUT_MS = 15000;
const DEFAULT_TX_MAX_AGE_HOURS = 24 * 7;

const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{3,32}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const SOL_EQ_EPSILON = 1e-9;
const FIRU_EPSILON = 1e-9;
const SOL_PAYMENT_TOLERANCE = 0.00001;
const STABLE_PAYMENT_TOLERANCE = 0.01;

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

function normalizeXHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(x\.com|twitter\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned).toLowerCase();
}

function getRoundTokenCap(roundKey) {
  return Number(process.env[`${roundKey}_TOKEN_CAP`] || 0);
}

function getRoundConfig(round) {
  const id = String(round || "").toLowerCase();
  const match = id.match(/^(?:round)?(\d+)$/);
  const number = match ? Number(match[1]) : 0;
  if (!number || number < 1) return null;
  if (number === 3 && String(process.env.ROUND_3_ENABLED || "false").trim().toLowerCase() !== "true") return null;
  if (number > 3) return null;
  const key = `ROUND_${number}`;
  return {
    key,
    round: `round${number}`,
    roundNumber: number,
    label: `Round ${number}`,
    enabled: String(process.env[`${key}_ENABLED`] || (number === 2 ? "false" : "true")).toLowerCase() !== "false",
    firuPriceUsd: Number(process.env[`${key}_FIRU_PRICE`] || 0),
    tokenCap: getRoundTokenCap(key)
  };
}

function getPricingSecret() {
  return String(
    process.env.ROUND_PRICING_SECRET ||
    process.env.NONCE_SECRET ||
    ""
  ).trim();
}

function verifyRoundQuote(quote, roundConfig) {
  const secret = getPricingSecret();
  if (!secret) {
    throw new Error("ROUND_PRICING_SECRET or NONCE_SECRET is required for round pricing quotes");
  }

  const payload = quote && typeof quote === "object" ? { ...quote } : null;
  const signature = String(payload?.signature || "").trim();
  if (!payload || !signature) {
    throw new Error("Missing round pricing quote");
  }
  delete payload.signature;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  if (expected.length !== signature.length) {
    throw new Error("Invalid round pricing quote signature");
  }
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new Error("Invalid round pricing quote signature");
  }

  const now = Date.now();
  const issuedAt = Date.parse(payload.issuedAt || "");
  const expiresAt = Date.parse(payload.expiresAt || "");
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
    throw new Error("Invalid round pricing quote window");
  }
  if (now > expiresAt) {
    throw new Error("Round pricing quote expired. Refresh the page and try again.");
  }
  if (issuedAt - now > 30_000) {
    throw new Error("Round pricing quote is not valid yet");
  }

  const quoteRound = payload?.rounds?.[roundConfig.round];
  if (!quoteRound) {
    throw new Error("Round pricing quote does not include the selected round");
  }

  const prices = payload?.prices || {};
  const tokenPriceUsd = Number(prices.SOL || 0);
  const usdtPriceUsd = Number(prices.USDT || 0);
  const usdcPriceUsd = Number(prices.USDC || 0);
  if (!(tokenPriceUsd > 0) || !(usdtPriceUsd > 0) || !(usdcPriceUsd > 0)) {
    throw new Error("Round pricing quote is missing token prices");
  }

  return payload;
}

async function rpcCall(method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TX_TIMEOUT_MS);

  try {
    const resp = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      throw new Error(data?.error?.message || `Solana RPC ${method} failed`);
    }
    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validateBase58(value) {
  return typeof value === "string" && SOLANA_ADDRESS_RE.test(value.trim());
}

function requireEnvAddress(name) {
  const value = String(process.env[name] || "").trim();
  if (!validateBase58(value)) {
    throw new Error(`${name} is missing or invalid`);
  }
  return value;
}

function getDestinationAddress(token, projectWallet) {
  if (token === "SOL") return projectWallet;
  if (token === "USDT") return requireEnvAddress("ROUND_RECEIVER_USDT_ATA");
  if (token === "USDC") return requireEnvAddress("ROUND_RECEIVER_USDC_ATA");
  return "";
}

function getAccountKeys(tx) {
  return (tx?.transaction?.message?.accountKeys || []).map((entry) =>
    typeof entry === "string" ? entry : entry?.pubkey || ""
  );
}

function getSenderWallet(tx) {
  return getAccountKeys(tx)[0] || "";
}

function collectAllInstructions(tx) {
  const items = [];
  for (const instruction of tx?.transaction?.message?.instructions || []) {
    items.push(instruction);
  }
  for (const group of tx?.meta?.innerInstructions || []) {
    for (const instruction of group.instructions || []) {
      items.push(instruction);
    }
  }
  return items;
}

function extractSolPayment(tx, destinationWallet) {
  let lamports = 0;
  for (const instruction of collectAllInstructions(tx)) {
    const parsed = instruction?.parsed;
    const info = parsed?.info || {};
    if ((parsed?.type === "transfer" || parsed?.type === "transferWithSeed") && info.destination === destinationWallet) {
      const value = Number(info.lamports || 0);
      if (value > 0) lamports += value;
    }
  }
  return lamports / 1e9;
}

function extractSplPayment(tx, destinationAta, mintAddress) {
  const keys = getAccountKeys(tx);
  const ataIndex = keys.findIndex((key) => key === destinationAta);
  if (ataIndex === -1) {
    return 0;
  }

  const pre = tx?.meta?.preTokenBalances || [];
  const post = tx?.meta?.postTokenBalances || [];

  const preEntry = pre.find((entry) => entry.accountIndex === ataIndex && entry.mint === mintAddress);
  const postEntry = post.find((entry) => entry.accountIndex === ataIndex && entry.mint === mintAddress);

  const preRaw = Number(preEntry?.uiTokenAmount?.amount || 0);
  const postRaw = Number(postEntry?.uiTokenAmount?.amount || 0);
  const decimals = Number(postEntry?.uiTokenAmount?.decimals ?? preEntry?.uiTokenAmount?.decimals ?? 0);

  if (postRaw <= preRaw) return 0;
  return (postRaw - preRaw) / Math.pow(10, decimals);
}

function formatAmount(num, digits = 6) {
  return Number(num || 0).toFixed(digits).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function toWholeFiruAmount(amount) {
  if (!(amount > 0)) return 0;
  return Math.floor(Number(amount));
}

function getTxAgeMs(tx) {
  if (!tx?.blockTime) return null;
  return Date.now() - (Number(tx.blockTime) * 1000);
}

function getTxMaxAgeMs() {
  const hours = Number(process.env.ROUND_TX_MAX_AGE_HOURS || DEFAULT_TX_MAX_AGE_HOURS);
  if (!(hours > 0)) return null;
  return hours * 60 * 60 * 1000;
}

function getRoundTxNotBeforeMs() {
  const raw = String(process.env.ROUND_TX_NOT_BEFORE || "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertTransactionIsWithinCurrentWindow(tx) {
  const txAgeMs = getTxAgeMs(tx);
  const maxAgeMs = getTxMaxAgeMs();
  const notBeforeMs = getRoundTxNotBeforeMs();

  if (txAgeMs !== null && maxAgeMs !== null && txAgeMs > maxAgeMs) {
    const maxHours = Number(process.env.ROUND_TX_MAX_AGE_HOURS || DEFAULT_TX_MAX_AGE_HOURS);
    throw new Error(`Transaction is too old for the current round window. Only transactions from the last ${formatAmount(maxHours, 0)} hours can be registered.`);
  }

  if (tx?.blockTime && notBeforeMs !== null && (Number(tx.blockTime) * 1000) < notBeforeMs) {
    throw new Error("Transaction is older than the current accepted round start window.");
  }
}

async function getRoundRaisedFiru(round) {
  const { data, error } = await supabase
    .from("round_registrations")
    .select("firu_allocation")
    .eq("round", round)
    .neq("delivery_status", "cancelled");

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + Number(row?.firu_allocation || 0), 0);
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!enforceRateLimit(req, res, { scope: "round-register", limit: 10, windowMs: 60_000 })) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }

  try {
    if (!ROUND_RECEIVER_WALLET) {
      return res.status(500).json({ error: "Round receiver wallet is not configured" });
    }

    const { wallet, tx_hash, round, payment_token, telegram, x, quote, requested_amount } = req.body || {};
    if (!tx_hash || !round || !payment_token || !quote) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const token = String(payment_token || "").toUpperCase();
    if (!["SOL", "USDT", "USDC"].includes(token)) {
      return res.status(400).json({ error: "Unsupported payment token" });
    }

    const roundConfig = getRoundConfig(round);
    if (!roundConfig) {
      return res.status(400).json({ error: "Invalid round" });
    }
    if (!roundConfig.enabled) {
      return res.status(400).json({ error: "This round is closed" });
    }
    if (!(roundConfig.firuPriceUsd > 0)) {
      return res.status(500).json({ error: "Round FIRU price is not configured" });
    }

    const quotePayload = verifyRoundQuote(quote, roundConfig);

    if (quotePayload.priceSource !== "live") {
      return res.status(409).json({
        error: "Live pricing is unavailable. Buy is temporarily paused. Refresh and try again later."
      });
    }

    const quoteRound = quotePayload.rounds?.[roundConfig.round] || {};

    if (Boolean(quoteRound.enabled) !== Boolean(roundConfig.enabled)) {
      return res.status(409).json({ error: "Round state changed. Refresh the page and try again." });
    }
    if (Number(quoteRound.firuPriceUsd || 0) !== Number(roundConfig.firuPriceUsd || 0)) {
      return res.status(409).json({ error: "Round price changed. Refresh the page and try again." });
    }

    const minSol = Number(quotePayload?.limits?.minSol || 0);
    const maxSol = Number(quotePayload?.limits?.maxSol || 0);

    const txHash = String(tx_hash).trim();
    const requestedPaymentAmount = Number(requested_amount || 0);
    const telegramUsername = telegram ? normalizeTelegramHandle(telegram) : null;
    const xUsername = x ? normalizeXHandle(x) : null;

    if (telegramUsername && !TELEGRAM_HANDLE_RE.test(telegramUsername)) {
      return res.status(400).json({ error: "Invalid Telegram username" });
    }
    if (xUsername && !X_HANDLE_RE.test(xUsername)) {
      return res.status(400).json({ error: "Invalid X username" });
    }

    const { data: existing, error: existingError } = await supabase
      .from("round_registrations")
      .select("id")
      .eq("tx_hash", txHash)
      .limit(1);

    if (existingError) throw existingError;
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "Transaction already used" });
    }

    const tx = await rpcCall("getTransaction", [
      txHash,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
    ]);

    if (!tx) {
      return res.status(400).json({ error: "Transaction not found" });
    }
    if (tx?.meta?.err) {
      return res.status(400).json({ error: "Transaction failed on-chain" });
    }

    assertTransactionIsWithinCurrentWindow(tx);

    const senderWallet = getSenderWallet(tx);
    const inputWallet = String(wallet || "").trim();
    if (inputWallet && senderWallet && inputWallet !== senderWallet) {
      return res.status(400).json({ error: "Connected wallet does not match the sender wallet" });
    }

    const usdcMint = String(process.env.USDC_MINT_ADDRESS || DEFAULT_USDC_MINT).trim();
    const usdtMint = String(process.env.USDT_MINT_ADDRESS || DEFAULT_USDT_MINT).trim();
    const tokenMint = token === "USDT" ? usdtMint : token === "USDC" ? usdcMint : null;
    const destinationAddress = getDestinationAddress(token, ROUND_RECEIVER_WALLET, tokenMint);

    const paymentAmount = token === "SOL"
      ? extractSolPayment(tx, destinationAddress)
      : extractSplPayment(tx, destinationAddress, tokenMint);

    if (!(paymentAmount > 0)) {
      return res.status(400).json({ error: `No ${token} payment to the official destination was found in this transaction` });
    }

    const paymentTolerance = token === "SOL" ? SOL_PAYMENT_TOLERANCE : STABLE_PAYMENT_TOLERANCE;
    if (Number.isFinite(requestedPaymentAmount) && requestedPaymentAmount > 0) {
      const paymentDelta = Math.abs(paymentAmount - requestedPaymentAmount);
      if (paymentDelta > paymentTolerance) {
        return res.status(400).json({
          error: `${token} payment does not match the amount entered. Sent ${formatAmount(paymentAmount, token === "SOL" ? 6 : 2)} ${token}, expected ${formatAmount(requestedPaymentAmount, token === "SOL" ? 6 : 2)} ${token}.`
        });
      }
    }

    const quotedTokenPriceUsd = Number(quotePayload?.prices?.[token] || 0);
    const quotedSolPriceUsd = Number(quotePayload?.prices?.SOL || 0);

    if (!(quotedTokenPriceUsd > 0)) {
      return res.status(500).json({ error: `Quoted price for ${token} is unavailable` });
    }
    if (!(quotedSolPriceUsd > 0)) {
      return res.status(500).json({ error: "Quoted SOL price is unavailable" });
    }

    const paymentAmountUsd = paymentAmount * quotedTokenPriceUsd;
    const paymentAmountSolEquivalent = token === "SOL"
      ? paymentAmount
      : paymentAmountUsd / quotedSolPriceUsd;

    if (paymentAmountSolEquivalent < minSol - SOL_EQ_EPSILON) {
      return res.status(400).json({ error: `Minimum purchase is ${formatAmount(minSol)} SOL` });
    }
    if (maxSol > 0 && paymentAmountSolEquivalent > maxSol + SOL_EQ_EPSILON) {
      return res.status(400).json({ error: `Maximum purchase is ${formatAmount(maxSol)} SOL` });
    }

    const firuAllocation = toWholeFiruAmount(paymentAmountUsd / roundConfig.firuPriceUsd);
    if (!(firuAllocation > 0)) {
      return res.status(400).json({ error: "Payment is too small to allocate at least 1 FIRU" });
    }

    const roundRaisedFiru = await getRoundRaisedFiru(roundConfig.round);
    const remainingFiruBefore = Math.max(roundConfig.tokenCap - roundRaisedFiru, 0);

    if (roundConfig.tokenCap > 0) {
      if (roundRaisedFiru >= roundConfig.tokenCap - FIRU_EPSILON) {
        return res.status(400).json({
          error: `${roundConfig.label} is sold out`,
          round_status: {
            cap_tokens: Math.round(roundConfig.tokenCap),
            raised_firu: Math.round(roundRaisedFiru),
            remaining_firu: 0,
            sold_out: true
          }
        });
      }

      if (firuAllocation > remainingFiruBefore + FIRU_EPSILON) {
        return res.status(400).json({
          error: `Only ${Math.floor(remainingFiruBefore).toLocaleString("en-US")} FIRU remains in ${roundConfig.label}`,
          round_status: {
            cap_tokens: Math.round(roundConfig.tokenCap),
            raised_firu: Math.round(roundRaisedFiru),
            remaining_firu: Math.max(Math.floor(remainingFiruBefore), 0),
            sold_out: false
          }
        });
      }
    }

    const insertPayload = {
      wallet: inputWallet || senderWallet,
      sender_wallet: senderWallet,
      project_wallet: ROUND_RECEIVER_WALLET,
      tx_hash: txHash,
      round: roundConfig.round,
      sol_amount: Number(paymentAmountSolEquivalent.toFixed(9)),
      payment_token: token,
      payment_amount: paymentAmount,
      payment_amount_usd: paymentAmountUsd,
      token_price_usd: quotedTokenPriceUsd,
      firu_price_usd: roundConfig.firuPriceUsd,
      firu_allocation: firuAllocation,
      telegram_username: telegramUsername,
      x_username: xUsername,
      tx_block_time: tx?.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
      tx_slot: tx?.slot || null,
      raw_validation: {
        token,
        destinationAddress,
        tokenMint,
        minSol,
        maxSol,
        senderWallet,
        pricingMode: "quoted_realtime",
        quoteIssuedAt: quotePayload.issuedAt,
        quoteExpiresAt: quotePayload.expiresAt,
        quotePriceSource: quotePayload.priceSource,
        requestedPaymentAmount,
        paymentTolerance,
        quotedTokenPriceUsd,
        quotedSolPriceUsd,
        paymentAmountSolEquivalent,
        roundTokenCap: roundConfig.tokenCap,
        roundRaisedFiruBefore: roundRaisedFiru,
        roundRemainingFiruBefore: remainingFiruBefore,
        txAgeMs: getTxAgeMs(tx)
      }
    };

    const { data: insertedRows, error: insertError } = await supabase
      .from("round_registrations")
      .insert([insertPayload])
      .select("id")
      .limit(1);

    if (insertError) throw insertError;

    const insertedId = insertedRows?.[0]?.id;
    const raisedFiruAfter = await getRoundRaisedFiru(roundConfig.round);
    const remainingFiruAfter = roundConfig.tokenCap > 0 ? Math.max(roundConfig.tokenCap - raisedFiruAfter, 0) : null;
    const soldOutAfter = roundConfig.tokenCap > 0 ? remainingFiruAfter <= FIRU_EPSILON : false;

    if (roundConfig.tokenCap > 0 && raisedFiruAfter > roundConfig.tokenCap + FIRU_EPSILON) {
      if (insertedId) {
        await supabase
          .from("round_registrations")
          .update({
            delivery_status: "cancelled",
            delivery_notes: "Auto-cancelled because the round cap was reached by another nearly simultaneous purchase."
          })
          .eq("id", insertedId);
      }

      const currentRaised = await getRoundRaisedFiru(roundConfig.round);
      const currentRemaining = Math.max(roundConfig.tokenCap - currentRaised, 0);
      return res.status(409).json({
        error: `This round just sold out during validation. Please try again with a new transaction only if official remaining allocation is still available.`,
        round_status: {
          cap_tokens: Math.round(roundConfig.tokenCap),
          raised_firu: Math.round(currentRaised),
          remaining_firu: Math.max(Math.floor(currentRemaining), 0),
          sold_out: currentRemaining <= FIRU_EPSILON
        }
      });
    }

    await supabase
      .from("round_registrations")
      .update({
        raw_validation: {
          ...insertPayload.raw_validation,
          roundRaisedFiruAfter: raisedFiruAfter,
          roundRemainingFiruAfter: remainingFiruAfter,
          soldOutAfter
        }
      })
      .eq("id", insertedId);

    return res.status(200).json({
      success: true,
      wallet: inputWallet || senderWallet,
      sender_wallet: senderWallet,
      payment_token: token,
      payment_amount: Number(formatAmount(paymentAmount, 9)),
      payment_amount_usd: Number(paymentAmountUsd.toFixed(6)),
      payment_amount_sol_equivalent: Number(paymentAmountSolEquivalent.toFixed(9)),
      token_price_usd: Number(quotedTokenPriceUsd.toFixed(6)),
      sol_price_usd: Number(quotedSolPriceUsd.toFixed(6)),
      pricing_mode: "quoted_realtime",
      price_source: quotePayload.priceSource,
      quote_issued_at: quotePayload.issuedAt,
      quote_expires_at: quotePayload.expiresAt,
      firu_price_usd: roundConfig.firuPriceUsd,
      firu_allocation: firuAllocation,
      round: roundConfig.round,
      destination_address: destinationAddress,
      tx_hash: txHash,
      round_status: {
        cap_tokens: roundConfig.tokenCap > 0 ? Math.round(roundConfig.tokenCap) : null,
        raised_firu: Math.round(raisedFiruAfter),
        remaining_firu: remainingFiruAfter === null ? null : Math.max(Math.floor(remainingFiruAfter), 0),
        sold_out: soldOutAfter
      }
    });
  } catch (error) {
    return serverError(res, "Could not register round purchase", error);
  }
}
