import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const PROJECT_RECEIVE_WALLET = String(process.env.PROJECT_RECEIVE_WALLET || "").trim();
const TX_TIMEOUT_MS = 12000;
const TELEGRAM_HANDLE_RE = /^[A-Za-z0-9_]{3,32}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

function stripSpaces(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function firstSegment(value) {
  return String(value || "").split(/[/?#]/)[0] || "";
}

function normalizeTelegramHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^telegram\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned).toLowerCase();
}

function normalizeXHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(x\.com|twitter\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned).toLowerCase();
}

function getRoundConfig(round) {
  const id = String(round || "").toLowerCase();
  const isRound1 = id === "round1" || id === "1";
  const key = isRound1 ? "ROUND_1" : id === "round2" || id === "2" ? "ROUND_2" : null;
  if (!key) return null;

  return {
    round: isRound1 ? "round1" : "round2",
    enabled: String(process.env[`${key}_ENABLED`] || "true").toLowerCase() !== "false",
    minSol: Number(process.env[`${key}_MIN_SOL`] || 0),
    tokensPerSol: Number(process.env[`${key}_TOKENS_PER_SOL`] || 0)
  };
}

async function rpcCall(method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TX_TIMEOUT_MS);

  try {
    const resp = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      throw new Error(data?.error?.message || `Solana RPC ${method} failed`);
    }
    return data.result;
  } finally {
    clearTimeout(timeout);
  }
}

function collectTransfers(tx) {
  const transfers = [];
  const pushIfTransfer = (instruction) => {
    const parsed = instruction?.parsed;
    const info = parsed?.info || {};
    const type = parsed?.type;
    if (!parsed || !type) return;

    if (type === "transfer" || type === "transferChecked") {
      const source = info.source || info.authority || "";
      const destination = info.destination || "";
      const lamports = Number(info.lamports || 0);
      if (source && destination && lamports > 0) {
        transfers.push({ source, destination, lamports });
      }
    }
  };

  for (const instruction of tx?.transaction?.message?.instructions || []) {
    pushIfTransfer(instruction);
  }
  for (const inner of tx?.meta?.innerInstructions || []) {
    for (const instruction of inner.instructions || []) {
      pushIfTransfer(instruction);
    }
  }
  return transfers;
}

function getSenderWallet(tx) {
  const accountKeys = tx?.transaction?.message?.accountKeys || [];
  const first = accountKeys[0];
  if (!first) return "";
  return typeof first === "string" ? first : first.pubkey || "";
}

function formatAmount(num) {
  return Number(num || 0).toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!PROJECT_RECEIVE_WALLET) {
      return res.status(500).json({ error: "Project receive wallet is not configured" });
    }

    const { wallet, tx_hash, round, telegram, x } = req.body || {};
    if (!wallet || !tx_hash || !round) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const config = getRoundConfig(round);
    if (!config) {
      return res.status(400).json({ error: "Invalid round" });
    }
    if (!config.enabled) {
      return res.status(400).json({ error: `${config.round.toUpperCase()} is currently closed` });
    }
    if (!(config.tokensPerSol > 0)) {
      return res.status(500).json({ error: `${config.round.toUpperCase()} pricing is not configured` });
    }

    const normalizedWallet = String(wallet).trim();
    const normalizedTx = String(tx_hash).trim();
    const tg = telegram ? normalizeTelegramHandle(telegram) : null;
    const xh = x ? normalizeXHandle(x) : null;

    if (tg && !TELEGRAM_HANDLE_RE.test(tg)) {
      return res.status(400).json({ error: "Invalid Telegram username" });
    }
    if (xh && !X_HANDLE_RE.test(xh)) {
      return res.status(400).json({ error: "Invalid X username" });
    }

    const { data: existingTx, error: existingTxError } = await supabase
      .from("round_registrations")
      .select("id")
      .eq("tx_hash", normalizedTx)
      .limit(1);

    if (existingTxError) {
      throw existingTxError;
    }
    if (existingTx?.length) {
      return res.status(400).json({ error: "This transaction hash was already used" });
    }

    const tx = await rpcCall("getTransaction", [normalizedTx, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
    if (!tx) {
      return res.status(400).json({ error: "Transaction not found or not confirmed yet" });
    }
    if (tx.meta?.err) {
      return res.status(400).json({ error: "The transaction failed on-chain" });
    }

    const senderWallet = getSenderWallet(tx);
    if (!senderWallet || senderWallet !== normalizedWallet) {
      return res.status(400).json({ error: "The connected wallet does not match the sending wallet in the transaction" });
    }

    const transfers = collectTransfers(tx);
    const matching = transfers.filter((t) => t.destination === PROJECT_RECEIVE_WALLET && t.source === normalizedWallet);
    const lamports = matching.reduce((sum, item) => sum + item.lamports, 0);
    const solAmount = lamports / 1_000_000_000;

    if (!(solAmount > 0)) {
      return res.status(400).json({ error: "No SOL transfer to the official project wallet was found in this transaction" });
    }
    if (solAmount < config.minSol) {
      return res.status(400).json({ error: `Minimum payment for ${config.round.toUpperCase()} is ${config.minSol} SOL` });
    }

    const firuAllocation = Math.floor(solAmount * config.tokensPerSol);
    const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;

    const insertPayload = {
      wallet: normalizedWallet,
      tx_hash: normalizedTx,
      round: config.round,
      sol_amount: Number(solAmount.toFixed(9)),
      firu_allocation: firuAllocation,
      sender_wallet: senderWallet,
      project_wallet: PROJECT_RECEIVE_WALLET,
      telegram_username: tg,
      x_username: xh,
      tx_block_time: blockTime,
      tx_slot: tx.slot || null,
      raw_validation: {
        matchedTransfers: matching,
        rpc: SOLANA_RPC_URL,
        tokensPerSol: config.tokensPerSol,
        minSol: config.minSol
      }
    };

    const { error: insertError } = await supabase
      .from("round_registrations")
      .insert([insertPayload]);

    if (insertError) {
      if (insertError.code === "23505") {
        return res.status(400).json({ error: "This transaction hash was already used" });
      }
      throw insertError;
    }

    return res.status(200).json({
      success: true,
      round: config.round,
      sol_amount: formatAmount(solAmount),
      firu_allocation: firuAllocation,
      tx_hash: normalizedTx
    });
  } catch (error) {
    console.error("Round register error:", error);
    return res.status(500).json({ error: error?.message || "Internal server error" });
  }
}
