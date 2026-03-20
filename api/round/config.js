import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

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

export default async function handler(req, res) {
  try {
    const projectReceiveWallet = String(process.env.PROJECT_RECEIVE_WALLET || "").trim();
    if (!projectReceiveWallet) {
      return res.status(500).json({ error: "Project receive wallet is not configured" });
    }

    const usdcMint = String(process.env.USDC_MINT_ADDRESS || DEFAULT_USDC_MINT).trim();
    const usdtMint = String(process.env.USDT_MINT_ADDRESS || DEFAULT_USDT_MINT).trim();
    const prices = await getLivePrices();

    const payload = {
      rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      projectReceiveWallet,
      limits: {
        minUsd: Number(process.env.ROUND_MIN || 0),
        maxUsd: Number(process.env.ROUND_MAX || 0)
      },
      rounds: {
        round1: {
          enabled: String(process.env.ROUND_1_ENABLED || "true").toLowerCase() !== "false",
          firuPriceUsd: Number(process.env.ROUND_1_FIRU_PRICE || 0)
        },
        round2: {
          enabled: String(process.env.ROUND_2_ENABLED || "true").toLowerCase() !== "false",
          firuPriceUsd: Number(process.env.ROUND_2_FIRU_PRICE || 0)
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
          destinationAddress: getAta(projectReceiveWallet, usdtMint)
        },
        {
          symbol: "USDC",
          mint: usdcMint,
          livePriceUsd: prices.USDC,
          destinationAddress: getAta(projectReceiveWallet, usdcMint)
        }
      ]
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error("round config error", error);
    return res.status(500).json({ error: "Could not load round configuration" });
  }
}
