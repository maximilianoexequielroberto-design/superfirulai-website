import crypto from "crypto";
import { PublicKey } from "@solana/web3.js";
import { setSecurityHeaders, handleOptions, serverError } from "../_security.js";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvoterG1dLGHfwDzz4dzjS9sG3JWgRHL5");
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4dtkiNL5Q4bSTy9FLS8L";
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qWZKXxAKnpJzksm2GkZcvTPeL";
const DEFAULT_FIRU_MINT = "7HvY2dyYYtzkjU1u9kniGyuTe41KwVxDCefywaTVf8rV";
const DEFAULT_RECEIVER_WALLET = "6SnSdFkMFSfRMkZEL9UmqZ6z5QTYCbbXRANmzUhEhjjH";
const DEFAULT_USDT_ATA = "5MoFMXTuf54fwZDmt8pZBtwnH6KeQmjNPtytWuNziZSu";
const DEFAULT_USDC_ATA = "BZHNsP3LkLQZ2iovGy5X4YJ7TL9DAgthUrnzKfs9Gapb";

function clean(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function boolEnv(name, fallback = false) {
  const value = clean(process.env[name]).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function numberEnv(name, fallback) {
  const raw = clean(process.env[name]);
  if (!raw) return fallback;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
}

function jsonNumberEnv(name, fallback) {
  const raw = clean(process.env[name]);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
    if (typeof parsed === "string") {
      const asNumber = Number(parsed.replace(",", "."));
      if (Number.isFinite(asNumber)) return asNumber;
    }
  } catch {
    const asNumber = Number(raw.replace(",", "."));
    if (Number.isFinite(asNumber)) return asNumber;
  }

  return fallback;
}

function validPublicKey(value, fallback) {
  const candidate = clean(value, fallback);
  try {
    return new PublicKey(candidate).toBase58();
  } catch {
    return fallback;
  }
}

function getAssociatedTokenAddressSyncSafe(mint, owner) {
  const mintKey = new PublicKey(mint);
  const ownerKey = new PublicKey(owner);
  const [address] = PublicKey.findProgramAddressSync(
    [ownerKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address.toBase58();
}

function getDestinationAddress(symbol, projectReceiveWallet, mint) {
  if (symbol === "SOL") return projectReceiveWallet;

  if (symbol === "USDT") {
    const explicit = validPublicKey(process.env.ROUND_RECEIVER_USDT_ATA, "");
    if (explicit) return explicit;
  }

  if (symbol === "USDC") {
    const explicit = validPublicKey(process.env.ROUND_RECEIVER_USDC_ATA, "");
    if (explicit) return explicit;
  }

  try {
    return getAssociatedTokenAddressSyncSafe(mint, projectReceiveWallet);
  } catch {
    return "";
  }
}

async function fetchJson(url, timeoutMs = 3500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getLivePrices() {
  const result = {
    SOL: null,
    USDT: 1,
    USDC: 1,
    priceSource: "unavailable",
    updatedAt: new Date().toISOString(),
  };

  const coingecko = await fetchJson(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana,tether,usd-coin&vs_currencies=usd",
  );

  const cgSol = Number(coingecko?.solana?.usd);
  if (Number.isFinite(cgSol) && cgSol > 0) {
    result.SOL = cgSol;
    result.USDT = Number(coingecko?.tether?.usd) > 0 ? Number(coingecko.tether.usd) : 1;
    result.USDC = Number(coingecko?.["usd-coin"]?.usd) > 0 ? Number(coingecko["usd-coin"].usd) : 1;
    result.priceSource = "coingecko";
    return result;
  }

  const binance = await fetchJson("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT");
  const binanceSol = Number(binance?.price);
  if (Number.isFinite(binanceSol) && binanceSol > 0) {
    result.SOL = binanceSol;
    result.priceSource = "binance";
    return result;
  }

  return result;
}

async function getRaisedFiruByRound(round) {
  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceKey) return 0;

  try {
    const url = new URL("/rest/v1/round_registrations", supabaseUrl);
    url.searchParams.set("select", "firu_amount,status,round");
    url.searchParams.set("round", `eq.${round}`);

    const response = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!response.ok) return 0;
    const rows = await response.json();

    return rows
      .filter((row) => ["verified", "confirmed", "completed", "pending"].includes(String(row.status || "").toLowerCase()))
      .reduce((total, row) => total + (Number(row.firu_amount) || 0), 0);
  } catch {
    return 0;
  }
}

function getRoundConfig(roundNumber, raisedFiru) {
  const roundKey = `ROUND_${roundNumber}`;
  const round = `round${roundNumber}`;

  const enabled = boolEnv(`${roundKey}_ENABLED`, roundNumber === 1);
  const firuPriceUsd = numberEnv(`${roundKey}_FIRU_PRICE`, roundNumber === 1 ? 0.000168 : roundNumber === 2 ? 0.000269 : 0.00043);
  const tokenCap = jsonNumberEnv(`${roundKey}_TOKEN_CAP`, roundNumber === 1 ? 25000000 : roundNumber === 2 ? 25000000 : 0);
  const soldFiru = Number.isFinite(raisedFiru) ? raisedFiru : 0;
  const remainingFiru = Math.max(0, tokenCap - soldFiru);

  return {
    round,
    roundNumber,
    label: `Round ${roundNumber}`,
    enabled,
    firuPriceUsd,
    tokenCap,
    soldFiru,
    remainingFiru,
    soldPercent: tokenCap > 0 ? Math.min(100, (soldFiru / tokenCap) * 100) : 0,
  };
}

function signRoundQuote(payload) {
  const secret = clean(process.env.ROUND_PRICING_SECRET);
  if (!secret) return "";

  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export default async function handler(req, res) {
  setSecurityHeaders(res, ["GET", "OPTIONS"]);
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");

  if (handleOptions(req, res, ["GET", "OPTIONS"])) return;

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const projectReceiveWallet = validPublicKey(process.env.ROUND_RECEIVER_WALLET, DEFAULT_RECEIVER_WALLET);
    const usdtMint = validPublicKey(process.env.USDT_MINT_ADDRESS, DEFAULT_USDT_MINT);
    const usdcMint = validPublicKey(process.env.USDC_MINT_ADDRESS, DEFAULT_USDC_MINT);
    const saleTokenMint = validPublicKey(process.env.TOKEN_MINT_ADDRESS, DEFAULT_FIRU_MINT);

    const prices = await getLivePrices();
    const raised = await Promise.all([
      getRaisedFiruByRound("round1"),
      getRaisedFiruByRound("round2"),
      getRaisedFiruByRound("round3"),
    ]);

    const rounds = [
      getRoundConfig(1, raised[0]),
      getRoundConfig(2, raised[1]),
      getRoundConfig(3, raised[2]),
    ];

    const issuedAt = Date.now();
    const quotePayload = {
      issuedAt,
      expiresAt: issuedAt + 5 * 60 * 1000,
      priceSource: prices.priceSource,
      prices: {
        SOL: prices.SOL,
        USDT: prices.USDT,
        USDC: prices.USDC,
      },
      rounds: Object.fromEntries(
        rounds.map((round) => [
          round.round,
          {
            enabled: round.enabled,
            firuPriceUsd: round.firuPriceUsd,
            tokenCap: round.tokenCap,
            remainingFiru: round.remainingFiru,
          },
        ]),
      ),
      limits: {
        minSol: numberEnv("ROUND_MIN", 0.1),
        maxSol: numberEnv("ROUND_MAX", 2),
      },
    };

    return res.status(200).json({
      ok: true,
      serverTime: new Date().toISOString(),
      config: {
        projectReceiveWallet,
        minSol: quotePayload.limits.minSol,
        maxSol: quotePayload.limits.maxSol,
        defaultRound: "round1",
        saleTokenMint,
        tokens: [
          {
            symbol: "SOL",
            mint: null,
            livePriceUsd: prices.SOL,
            destinationAddress: projectReceiveWallet,
          },
          {
            symbol: "USDT",
            mint: usdtMint,
            livePriceUsd: prices.USDT,
            destinationAddress: getDestinationAddress("USDT", projectReceiveWallet, usdtMint),
          },
          {
            symbol: "USDC",
            mint: usdcMint,
            livePriceUsd: prices.USDC,
            destinationAddress: getDestinationAddress("USDC", projectReceiveWallet, usdcMint),
          },
        ],
        rounds,
        quote: {
          ...quotePayload,
          signature: signRoundQuote(quotePayload),
        },
      },
    });
  } catch (error) {
    console.error("Round config failed", error);
    return serverError(res, "Could not load round configuration");
  }
}
