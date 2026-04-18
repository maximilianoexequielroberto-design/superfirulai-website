const { Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } = require("@solana/web3.js");

const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";

function getServerRpcUrl() {
  const candidates = [
    process.env.SOLANA_RPC_URL,
    process.env.SOLANA_RPC_URL_PUBLIC,
    DEFAULT_RPC_URL
  ];

  for (const value of candidates) {
    const rpcUrl = typeof value === "string" ? value.trim() : "";
    if (rpcUrl) return rpcUrl;
  }

  return DEFAULT_RPC_URL;
}

function json(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const wallet = String(req.body?.wallet || "").trim();
    const lamports = Number(req.body?.lamports || 0);
    const receiverWallet = String(process.env.ROUND_RECEIVER_WALLET || "").trim();

    if (!wallet) {
      return json(res, 400, { error: "Wallet is required" });
    }

    if (!Number.isFinite(lamports) || lamports <= 0 || !Number.isInteger(lamports)) {
      return json(res, 400, { error: "Lamports must be a positive integer" });
    }

    if (!receiverWallet) {
      return json(res, 500, { error: "ROUND_RECEIVER_WALLET is not configured" });
    }

    const rpcUrl = getServerRpcUrl();
    const connection = new Connection(rpcUrl, "confirmed");
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
      return json(res, 400, {
        error: "Transaction simulation failed",
        details: simulation.value.err,
        logs: simulation.value.logs || []
      });
    }

    return json(res, 200, {
      ok: true,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      receiverWallet
    });
  } catch (error) {
    console.error("simulate.js error", error);
    return json(res, 500, {
      error: error?.message || "Simulation failed"
    });
  }
};
