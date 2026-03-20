// CONFIG.JS CORREGIDO (TOKEN CAP)
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const ROUND_1_TOKEN_CAP = Number(process.env.ROUND_1_TOKEN_CAP || 0);
    const ROUND_2_TOKEN_CAP = Number(process.env.ROUND_2_TOKEN_CAP || 0);

    const { data } = await supabase
      .from("round_registrations")
      .select("round, firu_allocation");

    let raisedFiruRound1 = 0;
    let raisedFiruRound2 = 0;

    (data || []).forEach((row) => {
      if (row.round === "round1") {
        raisedFiruRound1 += Number(row.firu_allocation || 0);
      }
      if (row.round === "round2") {
        raisedFiruRound2 += Number(row.firu_allocation || 0);
      }
    });

    const remainingRound1 = Math.max(0, ROUND_1_TOKEN_CAP - raisedFiruRound1);
    const remainingRound2 = Math.max(0, ROUND_2_TOKEN_CAP - raisedFiruRound2);

    return res.json({
      rounds: {
        round1: {
          enabled: process.env.ROUND_1_ENABLED === "true",
          firuPriceUsd: Number(process.env.ROUND_1_FIRU_PRICE),
          tokenCap: ROUND_1_TOKEN_CAP,
          raisedFiru: raisedFiruRound1,
          remainingFiru: remainingRound1,
          soldOut: remainingRound1 <= 0
        },
        round2: {
          enabled: process.env.ROUND_2_ENABLED === "true",
          firuPriceUsd: Number(process.env.ROUND_2_FIRU_PRICE),
          tokenCap: ROUND_2_TOKEN_CAP,
          raisedFiru: raisedFiruRound2,
          remainingFiru: remainingRound2,
          soldOut: remainingRound2 <= 0
        }
      }
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
