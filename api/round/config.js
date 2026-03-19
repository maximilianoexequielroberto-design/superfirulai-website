export default async function handler(req, res) {
  const round1Enabled = String(process.env.ROUND_1_ENABLED || "true").toLowerCase() !== "false";
  const round2Enabled = String(process.env.ROUND_2_ENABLED || "true").toLowerCase() !== "false";

  const payload = {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    projectReceiveWallet: String(process.env.PROJECT_RECEIVE_WALLET || "").trim(),
    rounds: {
      round1: {
        enabled: round1Enabled,
        minSol: Number(process.env.ROUND_1_MIN_SOL || 0),
        tokensPerSol: Number(process.env.ROUND_1_TOKENS_PER_SOL || 0)
      },
      round2: {
        enabled: round2Enabled,
        minSol: Number(process.env.ROUND_2_MIN_SOL || 0),
        tokensPerSol: Number(process.env.ROUND_2_TOKENS_PER_SOL || 0)
      }
    }
  };

  if (!payload.projectReceiveWallet) {
    return res.status(500).json({ error: "Project receive wallet is not configured" });
  }

  return res.status(200).json(payload);
}
