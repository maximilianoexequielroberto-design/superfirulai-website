import { applySecurityHeaders, withMethods, rateLimit, serverError } from "../_security.js";

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.SOLANA_RPC_URL_PUBLIC ||
  "https://api.mainnet-beta.solana.com";

async function fetchLatestBlockhash() {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "superfirulai-round-blockhash",
      method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }]
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.error || !data?.result?.value?.blockhash) {
    const message = data?.error?.message || `RPC request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data.result.value;
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (!withMethods(req, res, ["GET"])) return;
  if (!rateLimit(req, res, { bucket: "round_blockhash", limit: 90, windowMs: 60_000 })) return;

  try {
    const value = await fetchLatestBlockhash();

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      blockhash: value.blockhash,
      lastValidBlockHeight: value.lastValidBlockHeight,
      commitment: "confirmed",
      rpc: "mainnet-beta",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("round_blockhash_error", error);
    return serverError(res, "Could not load Solana blockhash.");
  }
}
