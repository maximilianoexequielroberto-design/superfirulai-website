import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wallet, tx_hash, telegram, x_user } = req.body;

  if (!wallet || !tx_hash) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const { error } = await supabase.from("round_participants").insert([
    {
      wallet,
      tx_hash,
      telegram,
      x_user,
      created_at: new Date()
    }
  ]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ success: true });
}
