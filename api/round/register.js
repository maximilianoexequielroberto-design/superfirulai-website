// REGISTER.JS CORREGIDO (TOKEN CAP)
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const {
      txHash,
      round,
      firuAmount,
      paymentToken,
      paymentAmount
    } = req.body;

    const ROUND_1_TOKEN_CAP = Number(process.env.ROUND_1_TOKEN_CAP || 0);
    const ROUND_2_TOKEN_CAP = Number(process.env.ROUND_2_TOKEN_CAP || 0);

    const cap = round === "round1" ? ROUND_1_TOKEN_CAP : ROUND_2_TOKEN_CAP;

    const { data } = await supabase
      .from("round_registrations")
      .select("firu_allocation")
      .eq("round", round);

    const totalRaised = (data || []).reduce(
      (acc, r) => acc + Number(r.firu_allocation || 0),
      0
    );

    if (totalRaised >= cap) {
      return res.status(400).json({ error: "Round sold out" });
    }

    if (totalRaised + firuAmount > cap) {
      return res.status(400).json({ error: "Exceeds round cap" });
    }

    const { error } = await supabase
      .from("round_registrations")
      .insert([
        {
          tx_hash: txHash,
          round,
          firu_allocation: firuAmount,
          payment_token: paymentToken,
          payment_amount: paymentAmount
        }
      ]);

    if (error) throw error;

    return res.json({ success: true });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
