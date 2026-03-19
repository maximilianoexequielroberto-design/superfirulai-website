import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RPC = process.env.SOLANA_RPC_URL;
const DEST = process.env.PROJECT_RECEIVE_WALLET;

async function getTx(tx) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [tx, { encoding: "jsonParsed" }]
    })
  });
  return (await r.json()).result;
}

export default async function handler(req, res) {
  try {
    const { tx_hash, receive_wallet, round } = req.body;

    const tx = await getTx(tx_hash);
    if (!tx) return res.status(400).json({ error: "Invalid transaction" });

    // validate destination
    const found = tx.transaction.message.accountKeys.find(k => k.pubkey === DEST);
    if (!found) return res.status(400).json({ error: "Wrong destination wallet" });

    // calc sol
    let sol = 0;
    try {
      sol = (tx.meta.preBalances[0] - tx.meta.postBalances[0]) / 1e9;
    } catch {}

    if (sol <= 0) return res.status(400).json({ error: "Invalid SOL amount" });

    const price = round === "1"
      ? Number(process.env.ROUND_1_TOKENS_PER_SOL)
      : Number(process.env.ROUND_2_TOKENS_PER_SOL);

    const firu = sol * price;

    await supabase.from("round_registrations").insert([
      { tx_hash, wallet_receive: receive_wallet, sol_amount: sol, firu_allocation: firu, round }
    ]);

    res.json({ success: true, sol, firu });

  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
}
