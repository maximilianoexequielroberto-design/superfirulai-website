import { applySecurityHeaders, enforceRateLimit, serverError } from "../_security.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeWallet(value) {
  return String(value || "").trim();
}

function isValidWallet(value) {
  const normalized = normalizeWallet(value);
  return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(normalized);
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function getOwnershipStatus(row) {
  const deliveryStatus = String(row?.delivery_status || "pending").toLowerCase();
  if (deliveryStatus === "delivered") {
    return "Delivered";
  }
  if (deliveryStatus === "processing") {
    return "Processing";
  }
  if (deliveryStatus === "failed") {
    return "Retry pending";
  }
  if (deliveryStatus === "cancelled") {
    return "Cancelled";
  }
  return "Reserved";
}

export default async function handler(req, res) {
  applySecurityHeaders(res);

  if (!enforceRateLimit(req, res, { scope: "round-history", limit: 30, windowMs: 60_000 })) {
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const wallet = normalizeWallet(req.query?.wallet);
    if (!wallet) {
      return res.status(400).json({ error: "Wallet is required" });
    }
    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: "Wallet format is invalid" });
    }

    const { data, error } = await supabase
      .from("round_registrations")
      .select([
        "id",
        "wallet",
        "sender_wallet",
        "round",
        "payment_token",
        "payment_amount",
        "payment_amount_usd",
        "firu_allocation",
        "tx_hash",
        "delivery_status",
        "delivery_tx",
        "delivered_at",
        "created_at"
      ].join(","))
      .or(`wallet.eq.${wallet},sender_wallet.eq.${wallet}`)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const purchases = (data || []).map((row) => ({
      id: row.id,
      wallet: row.wallet,
      sender_wallet: row.sender_wallet,
      round: row.round,
      payment_token: row.payment_token,
      payment_amount: toNumber(row.payment_amount),
      payment_amount_usd: toNumber(row.payment_amount_usd),
      firu_allocation: Math.round(toNumber(row.firu_allocation)),
      tx_hash: row.tx_hash,
      delivery_status: String(row.delivery_status || "pending"),
      delivery_tx: row.delivery_tx || null,
      delivered_at: row.delivered_at || null,
      created_at: row.created_at || null,
      ownership_status: getOwnershipStatus(row)
    }));

    const summary = purchases.reduce((acc, row) => {
      acc.total_purchases += 1;
      acc.total_paid_usd += toNumber(row.payment_amount_usd);
      acc.total_firu += toNumber(row.firu_allocation);
      if (String(row.delivery_status).toLowerCase() === "delivered") {
        acc.delivered_firu += toNumber(row.firu_allocation);
      } else {
        acc.reserved_firu += toNumber(row.firu_allocation);
      }
      return acc;
    }, {
      wallet,
      total_purchases: 0,
      total_paid_usd: 0,
      total_firu: 0,
      reserved_firu: 0,
      delivered_firu: 0,
      latest_purchase_at: purchases[0]?.created_at || null
    });

    return res.status(200).json({
      wallet,
      summary: {
        ...summary,
        total_firu: Math.round(summary.total_firu),
        reserved_firu: Math.round(summary.reserved_firu),
        delivered_firu: Math.round(summary.delivered_firu)
      },
      purchases
    });
  } catch (error) {
    return serverError(res, "Could not load purchase history", error);
  }
}
