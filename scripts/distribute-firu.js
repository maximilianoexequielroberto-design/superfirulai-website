import { createClient } from "@supabase/supabase-js";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TOKEN_MINT_ADDRESS = process.env.TOKEN_MINT_ADDRESS;
const TREASURY_PRIVATE_KEY_JSON = process.env.TREASURY_PRIVATE_KEY_JSON;

function required(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  required("TOKEN_MINT_ADDRESS", TOKEN_MINT_ADDRESS);
  required("TREASURY_PRIVATE_KEY_JSON", TREASURY_PRIVATE_KEY_JSON);

  const connection = new Connection(RPC_URL, "confirmed");
  const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(TREASURY_PRIVATE_KEY_JSON)));
  const mint = new PublicKey(TOKEN_MINT_ADDRESS);
  const treasuryAta = await getAssociatedTokenAddress(mint, treasury.publicKey);
  const mintInfo = await getMint(connection, mint);

  const { data, error } = await supabase
    .from("round_registrations")
    .select("id, wallet, firu_allocation, delivery_status")
    .in("delivery_status", ["pending", "failed"])
    .gt("firu_allocation", 0)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data?.length) {
    console.log("No pending round allocations found.");
    return;
  }

  for (const row of data) {
    try {
      if (!row.wallet) {
        console.log(`Skipping row ${row.id}: wallet missing.`);
        continue;
      }

      const { error: markProcessingError } = await supabase
        .from("round_registrations")
        .update({ delivery_status: "processing", delivery_notes: null })
        .eq("id", row.id);

      if (markProcessingError) throw markProcessingError;

      const destinationOwner = new PublicKey(row.wallet);
      const destinationAta = await getAssociatedTokenAddress(mint, destinationOwner);

      const transaction = new Transaction();
      const destinationInfo = await connection.getAccountInfo(destinationAta);
      if (!destinationInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            treasury.publicKey,
            destinationAta,
            destinationOwner,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      const amount = BigInt(Math.round(Number(row.firu_allocation) * 10 ** mintInfo.decimals));
      transaction.add(
        createTransferInstruction(
          treasuryAta,
          destinationAta,
          treasury.publicKey,
          amount,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await sendAndConfirmTransaction(connection, transaction, [treasury], {
        commitment: "confirmed"
      });

      const deliveredAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("round_registrations")
        .update({
          distribution_tx: signature,
          distribution_sent_at: deliveredAt,
          delivery_tx: signature,
          delivered_at: deliveredAt,
          delivery_status: "delivered",
          delivery_notes: null
        })
        .eq("id", row.id);

      if (updateError) throw updateError;
      console.log(`Distributed ${row.firu_allocation} FIRU to ${row.wallet}: ${signature}`);
    } catch (error) {
      console.error(`Delivery failed for row ${row.id}:`, error?.message || error);
      await supabase
        .from("round_registrations")
        .update({
          delivery_status: "failed",
          delivery_notes: error?.message || String(error)
        })
        .eq("id", row.id);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
