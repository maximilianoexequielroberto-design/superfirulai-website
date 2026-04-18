import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction
} from "@solana/web3.js";
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

  if (req.method && req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const wallet = String(req.body?.wallet || "").trim();
    const lamports = Number(req.body?.lamports || 0);
    const receiverWallet = String(process.env.ROUND_RECEIVER_WALLET || "").trim();

    if (!wallet) {
      return res.status(400).json({ error: "Wallet is required" });
    }

    if (!Number.isFinite(lamports) || lamports <= 0 || !Number.isInteger(lamports)) {
      return res.status(400).json({ error: "Lamports must be a positive integer" });
    }

    if (!receiverWallet) {
      return res.status(500).json({ error: "ROUND_RECEIVER_WALLET is not configured" });
    }

    const connection = new Connection(getServerRpcUrl(), "confirmed");
    const sender = new PublicKey(wallet);
    const recipient = new PublicKey(receiverWallet);
    const latest = await connection.getLatestBlockhash("confirmed");

    const messageV0 = new TransactionMessage({
      payerKey: sender,
      recentBlockhash: latest.blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: sender,
          toPubkey: recipient,
          lamports
        })
      ]
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);

    const simulation = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: false,
      commitment: "confirmed"
    });

    if (simulation?.value?.err) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(400).json({
        error: "Transaction simulation failed",
        details: simulation.value.err,
        logs: simulation.value.logs || []
      });
    }

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(200).json({
      ok: true,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      receiverWallet
    });
  } catch (error) {
    console.error("round simulate error", error);
    return serverError(res, "Could not validate the transaction on the server", error);
  }
}
