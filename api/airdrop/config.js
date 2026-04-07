import { createClient } from "@supabase/supabase-js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkLZ6K2JmQ94Yb9zt";
const DEFAULT_PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";
const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=solana,tether,usd-coin&vs_currencies=usd";

function getFallbackPrices() {
  return {
    SOL: Number(process.env.FALLBACK_SOL_PRICE_USD || 90.84),
    USDT: Number(process.env.FALLBACK_USDT_PRICE_USD || 1),
    USDC: Number(process.env.FALLBACK_USDC_PRICE_USD || 1)
  };
}

async function getLivePrices() {
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

function getRoundConfig(roundKey) {
  const envPrefix = roundKey === "round1" ? "ROUND_1" : "ROUND_2";
  const tokenCap = Number(process.env[`${envPrefix}_TOKEN_CAP`] || 0);

  return {
    enabled: String(process.env[`${envPrefix}_ENABLED`] || "true").toLowerCase() !== "false",
    firuPriceUsd: Number(process.env[`${envPrefix}_FIRU_PRICE`] || 0),
    tokenCap
  };
}

function getPublicRpcUrl() {
  const publicRpcUrl = String(
    process.env.SOLANA_RPC_URL_PUBLIC ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    DEFAULT_PUBLIC_RPC_URL
  ).trim();

  return publicRpcUrl || DEFAULT_PUBLIC_RPC_URL;
}

async function getRaisedFiruByRound(round) {
  const { data, error } = await supabase
    .from("round_registrations")
    .select("firu_allocation")
    .eq("round", round);

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + Number(row?.firu_allocation || 0), 0);
}

export default async function handler(req, res) {
  try {
    const projectReceiveWallet = String(process.env.ROUND_RECEIVER_WALLET || "").trim();

    if (!projectReceiveWallet) {
      return res.status(500).json({ error: "Round receiver wallet is not configured" });
    }

    const usdcMint = String(process.env.USDC_MINT_ADDRESS || DEFAULT_USDC_MINT).trim();
    const usdtMint = String(process.env.USDT_MINT_ADDRESS || DEFAULT_USDT_MINT).trim();
    const prices = await getLivePrices();

    const [round1RaisedFiru, round2RaisedFiru] = await Promise.all([
      getRaisedFiruByRound("round1"),
      getRaisedFiruByRound("round2")
    ]);

    const round1 = getRoundConfig("round1");
    const round2 = getRoundConfig("round2");

    const payload = {
      rpcUrl: getPublicRpcUrl(),
      projectReceiveWallet,
      limits: {
        minSol: Number(process.env.ROUND_MIN || 0),
        maxSol: Number(process.env.ROUND_MAX || 0)
      },
      rounds: {
        round1: {
          ...round1,
          raisedFiru: Math.round(round1RaisedFiru),
          remainingFiru: round1.tokenCap > 0 ? Math.max(Math.round(round1.tokenCap - round1RaisedFiru), 0) : null,
          soldOut: round1.tokenCap > 0 ? round1RaisedFiru >= round1.tokenCap : false
        },
        round2: {
          ...round2,
          raisedFiru: Math.round(round2RaisedFiru),
          remainingFiru: round2.tokenCap > 0 ? Math.max(Math.round(round2.tokenCap - round2RaisedFiru), 0) : null,
          soldOut: round2.tokenCap > 0 ? round2RaisedFiru >= round2.tokenCap : false
        }
      },
      tokens: [
        {
          symbol: "SOL",
          mint: null,
          livePriceUsd: prices.SOL,
          destinationAddress: projectReceiveWallet
        },
        {
          symbol: "USDT",
          mint: usdtMint,
          livePriceUsd: prices.USDT,
          destinationAddress: getDestinationAddress("USDT", projectReceiveWallet, usdtMint)
        },
        {
          symbol: "USDC",
          mint: usdcMint,
          livePriceUsd: prices.USDC,
          destinationAddress: getDestinationAddress("USDC", projectReceiveWallet, usdcMint)
        }
      ]
    };

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("round config error", error);
    return res.status(500).json({ error: "Could not load round configuration" });
  }
}
