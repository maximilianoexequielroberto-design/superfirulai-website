import { createClient } from "@supabase/supabase-js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { wallet, message, signature } = req.body;

    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    const pubKey = bs58.decode(wallet);

    const valid = nacl.sign.detached.verify(msgBytes, sigBytes, pubKey);

    if (!valid) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const { error } = await supabase
      .from("airdrop_registrations")
      .insert([{ wallet }]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ message: "Registered successfully" });

  } catch {
    res.status(500).json({ error: "Server error" });
  }
}
