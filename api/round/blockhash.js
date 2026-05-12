import { Connection } from "@solana/web3.js";
import { applySecurityHeaders, serverError } from "../_security.js";

const DEFAULT_PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";

function getServerRpcUrl() {
  return String(
    process.env.SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL_PUBLIC ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    DEFAULT_PUBLIC_RPC_URL
  ).trim() || DEFAULT_PUBLIC_RPC_URL;
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const connection = new Connection(getServerRpcUrl(), "confirmed");
    const latest = await connection.getLatestBlockhash("confirmed");

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      source: "server"
    });
  } catch (error) {
    console.error("round blockhash error", error);
    return serverError(res, "Could not load latest blockhash", error);
  }
}
