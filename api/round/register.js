import { createClient } from "@supabase/supabase-js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const PROJECT_RECEIVE_WALLET = String(
  process.env.ROUND_RECEIVER_WALLET || process.env.PROJECT_RECEIVE_WALLET || ""
).trim();
const ROUND_RECEIVER_USDT_ATA = String(process.env.ROUND_RECEIVER_USDT_ATA || "").trim();
const ROUND_RECEIVER_USDC_ATA = String(process.env.ROUND_RECEIVER_USDC_ATA || "").trim();
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkLZ6K2JmQ94Yb9zt";
const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=solana,tether,usd-coin&vs_currencies=usd";
const TX_TIMEOUT_MS = 15000;

function getFallbackPrices() {
  return {
    SOL: Number(process.env.FALLBACK_SOL_PRICE_USD || 90.84),
    USDT: Number(process.env.FALLBACK_USDT_PRICE_USD || 1),
    USDC: Number(process.env.FALLBACK_USDC_PRICE_USD || 1)
  };
}
const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{3,32}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const SOL_EQ_EPSILON = 1e-9;
const FIRU_EPSILON = 1e-9;

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
  const isRound1 = id === "round1" || id === "1";
  const key = isRound1 ? "ROUND_1" : id === "round2" || id === "2" ? "ROUND_2" : null;
  if (!key) return null;

  return {
    key,
    round: isRound1 ? "round1" : "round2",
    enabled: String(process.env[`${key}_ENABLED`] || "true").toLowerCase() !== "false",
    firuPriceUsd: Number(process.env[`${key}_FIRU_PRICE`] || 0),
    tokenCap: getRoundTokenCap(key)
  };
}

async function fetchLivePrices() {
  try {
    const resp = await fetch(PRICE_URL, {
      headers: {
        accept: "application/json",
        "user-agent": "SuperFirulai/1.0"
      }
    });

    if (!resp.ok) {
      throw new Error(`price_http_${resp.status}`);
    }

    const data = await resp.json();
    const prices = {
      SOL: Number(data?.solana?.usd || 0),
      USDT: Number(data?.tether?.usd || 0),
      USDC: Number(data?.["usd-coin"]?.usd || 0)
    };

    if (!(prices.SOL > 0) || !(prices.USDT > 0) || !(prices.USDC > 0)) {
      throw new Error("price_payload_invalid");
    }

    return prices;
  } catch (error) {
    console.error("live price fallback", error);
    return getFallbackPrices();
  }
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

function getAta(owner, mint) {
  return getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(owner),
    false
  ).toBase58();
}

function getDestinationAddress(token, projectWallet, tokenMint) {
  if (token === "SOL") return projectWallet;
  if (token === "USDT") return ROUND_RECEIVER_USDT_ATA || getAta(projectWallet, tokenMint);
  if (token === "USDC") return ROUND_RECEIVER_USDC_ATA || getAta(projectWallet, tokenMint);
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

async function getRoundRaisedFiru(round) {
  const { data, error } = await supabase
    .from("round_registrations")
    .select("firu_allocation")
    .eq("round", round);

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + Number(row?.firu_allocation || 0), 0);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!PROJECT_RECEIVE_WALLET) {
      return res.status(500).json({ error: "Project receive wallet is not configured" });
    }

    const { wallet, tx_hash, round, payment_token, telegram, x } = req.body || {};
    if (!tx_hash || !round || !payment_token) {
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

    const minSol = Number(process.env.ROUND_MIN || 0);
    const maxSol = Number(process.env.ROUND_MAX || 0);

    const txHash = String(tx_hash).trim();
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

    const senderWallet = getSenderWallet(tx);
    const inputWallet = String(wallet || "").trim();
    if (inputWallet && senderWallet && inputWallet !== senderWallet) {
      return res.status(400).json({ error: "Connected wallet does not match the sender wallet" });
    }

    const usdcMint = String(process.env.USDC_MINT_ADDRESS || DEFAULT_USDC_MINT).trim();
    const usdtMint = String(process.env.USDT_MINT_ADDRESS || DEFAULT_USDT_MINT).trim();
    const tokenMint = token === "USDT" ? usdtMint : token === "USDC" ? usdcMint : null;
    const destinationAddress = getDestinationAddress(token, PROJECT_RECEIVE_WALLET, tokenMint);

    const paymentAmount = token === "SOL"
      ? extractSolPayment(tx, destinationAddress)
      : extractSplPayment(tx, destinationAddress, tokenMint);

    if (!(paymentAmount > 0)) {
      return res.status(400).json({ error: `No ${token} payment to the official destination was found in this transaction` });
    }

    const livePrices = await fetchLivePrices();
    const tokenPriceUsd = Number(livePrices[token] || 0);
    const solPriceUsd = Number(livePrices.SOL || 0);

    if (!(tokenPriceUsd > 0)) {
      return res.status(500).json({ error: `Live price for ${token} is unavailable` });
    }
    if (!(solPriceUsd > 0)) {
      return res.status(500).json({ error: "Live SOL price is unavailable" });
    }

    const paymentAmountUsd = paymentAmount * tokenPriceUsd;
    const paymentAmountSolEquivalent = token === "SOL"
      ? paymentAmount
      : paymentAmountUsd / solPriceUsd;

    if (paymentAmountSolEquivalent < minSol - SOL_EQ_EPSILON) {
      return res.status(400).json({ error: `Minimum purchase is ${formatAmount(minSol)} SOL` });
    }
    if (maxSol > 0 && paymentAmountSolEquivalent > maxSol + SOL_EQ_EPSILON) {
      return res.status(400).json({ error: `Maximum purchase is ${formatAmount(maxSol)} SOL` });
    }

    const firuAllocation = paymentAmountUsd / roundConfig.firuPriceUsd;
    const roundRaisedFiru = await getRoundRaisedFiru(roundConfig.round);
    const remainingFiruBefore = Math.max(roundConfig.tokenCap - roundRaisedFiru, 0);

    if (roundConfig.tokenCap > 0) {
      if (roundRaisedFiru >= roundConfig.tokenCap - FIRU_EPSILON) {
        return res.status(400).json({
          error: `${roundConfig.round.toUpperCase()} is sold out`,
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
          error: `Only ${Math.floor(remainingFiruBefore).toLocaleString("en-US")} FIRU remains in ${roundConfig.round.toUpperCase()}`,
          round_status: {
            cap_tokens: Math.round(roundConfig.tokenCap),
            raised_firu: Math.round(roundRaisedFiru),
            remaining_firu: Math.max(Math.floor(remainingFiruBefore), 0),
            sold_out: false
          }
        });
      }
    }

    const raisedFiruAfter = roundRaisedFiru + firuAllocation;
    const remainingFiruAfter = roundConfig.tokenCap > 0 ? Math.max(roundConfig.tokenCap - raisedFiruAfter, 0) : null;
    const soldOutAfter = roundConfig.tokenCap > 0 ? remainingFiruAfter <= FIRU_EPSILON : false;

    const insertPayload = {
      wallet: inputWallet || senderWallet,
      sender_wallet: senderWallet,
      project_wallet: PROJECT_RECEIVE_WALLET,
      tx_hash: txHash,
      round: roundConfig.round,
      sol_amount: token === "SOL" ? paymentAmount : null,
      payment_token: token,
      payment_amount: paymentAmount,
      payment_amount_usd: paymentAmountUsd,
      token_price_usd: tokenPriceUsd,
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
        livePriceUsd: tokenPriceUsd,
        liveSolPriceUsd: solPriceUsd,
        referenceSolPriceUsd: solPriceUsd,
        paymentAmountSolEquivalent,
        roundTokenCap: roundConfig.tokenCap,
        roundRaisedFiruBefore: roundRaisedFiru,
        roundRemainingFiruBefore: remainingFiruBefore,
        roundRaisedFiruAfter: raisedFiruAfter,
        roundRemainingFiruAfter: remainingFiruAfter,
        soldOutAfter
      }
    };

    const { error: insertError } = await supabase
      .from("round_registrations")
      .insert([insertPayload]);

    if (insertError) throw insertError;

    return res.status(200).json({
      success: true,
      wallet: inputWallet || senderWallet,
      sender_wallet: senderWallet,
      payment_token: token,
      payment_amount: Number(formatAmount(paymentAmount, 9)),
      payment_amount_usd: Number(paymentAmountUsd.toFixed(6)),
      payment_amount_sol_equivalent: Number(paymentAmountSolEquivalent.toFixed(9)),
      token_price_usd: Number(tokenPriceUsd.toFixed(6)),
      sol_price_usd: Number(solPriceUsd.toFixed(6)),
      firu_price_usd: roundConfig.firuPriceUsd,
      firu_allocation: Math.round(firuAllocation),
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
    console.error("round register error", error);
    return res.status(500).json({ error: error?.message || "Server error" });
  }
}
