import { createClient } from "@supabase/supabase-js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkLZ6K2JmQ94Yb9zt";
const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=solana,tether,usd-coin&vs_currencies=usd";

async function getLivePrices() {
  const resp = await fetch(PRICE_URL, {
    headers: { accept: "application/json" }
  });
  const data = await resp.json();

  return {
    SOL: Number(data?.solana?.usd || 0),
    USDT: Number(data?.tether?.usd || 0),
    USDC: Number(data?.["usd-coin"]?.usd || 0)
  };
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
  const capSol = Number(process.env[`${envPrefix}_CAP`] || 0);

  return {
    enabled: String(process.env[`${envPrefix}_ENABLED`] || "true").toLowerCase() !== "false",
    firuPriceUsd: Number(process.env[`${envPrefix}_FIRU_PRICE`] || 0),
    capSol
  };
}

function getRowSolEquivalent(row, fallbackSolPriceUsd) {
  const token = String(row?.payment_token || "").toUpperCase();
  const paymentAmount = Number(row?.payment_amount || 0);
  const paymentAmountUsd = Number(row?.payment_amount_usd || 0);
  const rawValidation = row?.raw_validation || {};
  const referenceSolPriceUsd = Number(
    rawValidation?.referenceSolPriceUsd || rawValidation?.liveSolPriceUsd || fallbackSolPriceUsd || 0
  );

  if (token === "SOL") {
    return paymentAmount > 0 ? paymentAmount : paymentAmountUsd > 0 && referenceSolPriceUsd > 0
      ? paymentAmountUsd / referenceSolPriceUsd
      : 0;
  }

  if (paymentAmountUsd > 0 && referenceSolPriceUsd > 0) {
    return paymentAmountUsd / referenceSolPriceUsd;
  }

  return 0;
}

async function getRaisedSolByRound(round, fallbackSolPriceUsd) {
  const { data, error } = await supabase
    .from("round_registrations")
    .select("payment_token,payment_amount,payment_amount_usd,raw_validation")
    .eq("round", round);

  if (error) throw error;

  return (data || []).reduce((sum, row) => sum + getRowSolEquivalent(row, fallbackSolPriceUsd), 0);
}

export default async function handler(req, res) {
  try {
    const projectReceiveWallet = String(
      process.env.ROUND_RECEIVER_WALLET || process.env.PROJECT_RECEIVE_WALLET || ""
    ).trim();
    if (!projectReceiveWallet) {
      return res.status(500).json({ error: "Project receive wallet is not configured" });
    }

    const usdcMint = String(process.env.USDC_MINT_ADDRESS || DEFAULT_USDC_MINT).trim();
    const usdtMint = String(process.env.USDT_MINT_ADDRESS || DEFAULT_USDT_MINT).trim();
    const prices = await getLivePrices();
    const [round1RaisedSol, round2RaisedSol] = await Promise.all([
      getRaisedSolByRound("round1", prices.SOL),
      getRaisedSolByRound("round2", prices.SOL)
    ]);

    const round1 = getRoundConfig("round1");
    const round2 = getRoundConfig("round2");

    const payload = {
      rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      projectReceiveWallet,
      limits: {
        minSol: Number(process.env.ROUND_MIN || 0),
        maxSol: Number(process.env.ROUND_MAX || 0)
      },
      rounds: {
        round1: {
          ...round1,
          raisedSol: Number(round1RaisedSol.toFixed(9)),
          remainingSol: round1.capSol > 0 ? Number(Math.max(round1.capSol - round1RaisedSol, 0).toFixed(9)) : null,
          soldOut: round1.capSol > 0 ? round1RaisedSol >= round1.capSol : false
        },
        round2: {
          ...round2,
          raisedSol: Number(round2RaisedSol.toFixed(9)),
          remainingSol: round2.capSol > 0 ? Number(Math.max(round2.capSol - round2RaisedSol, 0).toFixed(9)) : null,
          soldOut: round2.capSol > 0 ? round2RaisedSol >= round2.capSol : false
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

    return res.status(200).json(payload);
  } catch (error) {
    console.error("round config error", error);
    return res.status(500).json({ error: "Could not load round configuration" });
  }
}
