import { applySecurityHeaders, serverError } from "../_security.js";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

function getSupabaseClient() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const DEFAULT_PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";

const QUOTE_TTL_MS = Math.max(Number(process.env.ROUND_PRICE_QUOTE_TTL_MS || 15 * 60 * 1000), 60_000);

function getFallbackPrices() {
  return {
    SOL: Number(process.env.FALLBACK_SOL_PRICE_USD || 155),
    USDT: Number(process.env.FALLBACK_USDT_PRICE_USD || 1),
    USDC: Number(process.env.FALLBACK_USDC_PRICE_USD || 1)
  };
}

function getPricingSecret() {
  return String(process.env.ROUND_PRICING_SECRET || process.env.NONCE_SECRET || "").trim();
}

function signRoundQuote(payload) {
  const secret = getPricingSecret();
  if (!secret) throw new Error("ROUND_PRICING_SECRET or NONCE_SECRET is required");
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Primary: Binance — free, no key, very fast
async function getSolPriceFromBinance() {
  const resp = await fetchWithTimeout(
    "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
    { headers: { accept: "application/json" } },
    4000
  );
  if (!resp.ok) throw new Error(`binance_http_${resp.status}`);
  const data = await resp.json();
  const price = Number(data?.price || 0);
  if (!(price > 0)) throw new Error("binance_payload_invalid");
  return price;
}

// Fallback: CoinGecko (with optional API key)
async function getSolPriceFromCoinGecko() {
  const apiKey = String(process.env.COINGECKO_API_KEY || "").trim();
  const headers = { accept: "application/json" };
  if (apiKey) headers["x-cg-demo-api-key"] = apiKey;
  const resp = await fetchWithTimeout(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    { headers },
    4000
  );
  if (!resp.ok) throw new Error(`coingecko_http_${resp.status}`);
  const data = await resp.json();
  const price = Number(data?.solana?.usd || 0);
  if (!(price > 0)) throw new Error("coingecko_payload_invalid");
  return price;
}

async function getLivePrices() {
  // USDT and USDC are stablecoins — always ~$1
  const stables = { USDT: 1, USDC: 1 };

  // 1. Try Binance (primary — fastest)
  try {
    const SOL = await getSolPriceFromBinance();
    console.log("prices: binance live SOL =", SOL);
    return { prices: { SOL, ...stables }, source: "live" };
  } catch (err) {
    console.warn("Binance price failed:", err.message);
  }

  // 2. Try CoinGecko (secondary)
  try {
    const SOL = await getSolPriceFromCoinGecko();
    console.log("prices: coingecko live SOL =", SOL);
    return { prices: { SOL, ...stables }, source: "live" };
  } catch (err) {
    console.warn("CoinGecko price failed:", err.message);
  }

  // 3. Hardcoded fallback
  console.warn("prices: using env/hardcoded fallback");
  return { prices: getFallbackPrices(), source: "fallback" };
}

function getAta(owner, mint) {
  return getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(owner),
    false
  ).toBase58();
}

function getDestinationAddress(symbol, owner, mint) {
  const explicitUsdtAta = String(process.env.ROUND_RECEIVER_USDT_ATA || "").trim();
  const explicitUsdcAta = String(process.env.ROUND_RECEIVER_USDC_ATA || "").trim();
  if (symbol === "SOL") return owner;
  if (symbol === "USDT") return explicitUsdtAta || getAta(owner, mint);
  if (symbol === "USDC") return explicitUsdcAta || getAta(owner, mint);
  return "";
}

function getRoundNumber(roundKey) {
  const match = String(roundKey || "").toLowerCase().match(/^round(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function getRoundConfig(roundKey) {
  const number = getRoundNumber(roundKey);
  if (!number) return null;
  const envPrefix = `ROUND_${number}`;
  const tokenCap = Number(process.env[`${envPrefix}_TOKEN_CAP`] || 0);
  return {
    key: roundKey,
    label: `Round ${number}`,
    enabled: String(process.env[`${envPrefix}_ENABLED`] || (number === 2 ? "false" : "true")).toLowerCase() !== "false",
    firuPriceUsd: Number(process.env[`${envPrefix}_FIRU_PRICE`] || 0),
    tokenCap
  };
}

function getPublicRpcUrl() {
  return (
    String(process.env.SOLANA_RPC_URL_PUBLIC || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_PUBLIC_RPC_URL).trim() ||
    DEFAULT_PUBLIC_RPC_URL
  );
}

async function getRaisedFiruByRound(round) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn("round config: Supabase not configured. Using raisedFiru=0.");
    return 0;
  }
  try {
    const { data, error } = await supabase
      .from("round_registrations")
      .select("firu_allocation,delivery_status")
      .eq("round", round);
    if (error) throw error;
    return (data || []).reduce((sum, row) => {
      if (String(row?.delivery_status || "").toLowerCase() === "cancelled") return sum;
      return sum + Number(row?.firu_allocation || 0);
    }, 0);
  } catch (error) {
    console.error(`round config: could not load raised FIRU for ${round}.`, error);
    return 0;
  }
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const projectReceiveWallet = String(process.env.ROUND_RECEIVER_WALLET || "").trim();
    if (!projectReceiveWallet) {
      return res.status(500).json({ error: "Round receiver wallet is not configured" });
    }

    const usdcMint = String(process.env.USDC_MINT_ADDRESS || DEFAULT_USDC_MINT).trim();
    const usdtMint = String(process.env.USDT_MINT_ADDRESS || DEFAULT_USDT_MINT).trim();
    const { prices, source } = await getLivePrices();

    const roundKeys = ["round1", "round2"];
    const round3Enabled = String(process.env.ROUND_3_ENABLED || "false").trim().toLowerCase() === "true";
    if (round3Enabled) roundKeys.push("round3");

    const raisedPairs = await Promise.all(
      roundKeys.map(async (roundKey) => [roundKey, await getRaisedFiruByRound(roundKey)])
    );
    const raisedMap = Object.fromEntries(raisedPairs);
    const rounds = Object.fromEntries(
      roundKeys.map((roundKey) => {
        const cfg = getRoundConfig(roundKey);
        const raisedFiru = Number(raisedMap[roundKey] || 0);
        return [roundKey, {
          ...cfg,
          raisedFiru: Math.round(raisedFiru),
          remainingFiru: cfg.tokenCap > 0 ? Math.max(Math.round(cfg.tokenCap - raisedFiru), 0) : null,
          soldOut: cfg.tokenCap > 0 ? raisedFiru >= cfg.tokenCap : false
        }];
      })
    );

    const quoteIssuedAt = new Date().toISOString();
    const quoteExpiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString();
    const quotePayload = {
      version: 1,
      issuedAt: quoteIssuedAt,
      expiresAt: quoteExpiresAt,
      priceSource: source,
      prices,
      rounds: Object.fromEntries(
        Object.entries(rounds).map(([key, value]) => [
          key,
          { firuPriceUsd: value.firuPriceUsd, enabled: value.enabled, tokenCap: value.tokenCap }
        ])
      ),
      limits: {
        minSol: Number(process.env.ROUND_MIN || 0),
        maxSol: Number(process.env.ROUND_MAX || 0)
      }
    };

    const payload = {
      rpcUrl: getPublicRpcUrl(),
      projectReceiveWallet,
      limits: quotePayload.limits,
      pricingMode: "quoted_realtime",
      quote: { ...quotePayload, signature: signRoundQuote(quotePayload) },
      priceSource: source,
      rounds,
      tokens: [
        { symbol: "SOL", mint: null, livePriceUsd: prices.SOL, destinationAddress: projectReceiveWallet },
        { symbol: "USDT", mint: usdtMint, livePriceUsd: prices.USDT, destinationAddress: getDestinationAddress("USDT", projectReceiveWallet, usdtMint) },
        { symbol: "USDC", mint: usdcMint, livePriceUsd: prices.USDC, destinationAddress: getDestinationAddress("USDC", projectReceiveWallet, usdcMint) }
      ]
    };

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("round config error", error);
    return serverError(res, "Could not load round configuration", error);
  }
}
