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

function toRawAmount(firuAllocation, decimals) {
  const allocation = Number(firuAllocation || 0);
  if (!(allocation > 0)) {
    return 0n;
  }
  return BigInt(Math.round(allocation * 10 ** decimals));
}

async function markDelivered(rowId, signature, deliveredAt) {
  const payload = {
    distribution_tx: signature,
    distribution_sent_at: deliveredAt,
    delivery_tx: signature,
    delivered_at: deliveredAt,
    delivery_status: "delivered",
    delivery_notes: null
  };

  const firstAttempt = await supabase
    .from("round_registrations")
    .update(payload)
    .eq("id", rowId);

  if (firstAttempt.error) {
    const secondAttempt = await supabase
      .from("round_registrations")
      .update(payload)
      .eq("id", rowId);

    if (secondAttempt.error) {
      throw secondAttempt.error;
    }
  }
}

async function main() {
  required("TOKEN_MINT_ADDRESS", TOKEN_MINT_ADDRESS);
  required("TREASURY_PRIVATE_KEY_JSON", TREASURY_PRIVATE_KEY_JSON);

  const connection = new Connection(RPC_URL, "confirmed");
  const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(TREASURY_PRIVATE_KEY_JSON)));
  const mint = new PublicKey(TOKEN_MINT_ADDRESS);
  const treasuryAta = await getAssociatedTokenAddress(mint, treasury.publicKey);
  const mintInfo = await getMint(connection, mint);
  const treasuryBalanceInfo = await connection.getTokenAccountBalance(treasuryAta);
  const treasuryRawBalance = BigInt(treasuryBalanceInfo?.value?.amount || "0");

  const { data, error } = await supabase
    .from("round_registrations")
    .select("id, wallet, firu_allocation, delivery_status, delivery_tx, distribution_tx")
    .in("delivery_status", ["pending", "failed"])
    .gt("firu_allocation", 0)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data?.length) {
    console.log("No pending round allocations found.");
    return;
  }

  let remainingRawBalance = treasuryRawBalance;

  for (const row of data) {
    let signature = null;

    try {
      if (!row.wallet) {
        console.log(`Skipping row ${row.id}: wallet missing.`);
        continue;
      }

      if (row.delivery_tx || row.distribution_tx) {
        console.log(`Skipping row ${row.id}: delivery transaction already recorded.`);
        continue;
      }

      const amount = toRawAmount(row.firu_allocation, mintInfo.decimals);
      if (!(amount > 0n)) {
        throw new Error("Invalid FIRU allocation amount");
      }

      if (remainingRawBalance < amount) {
        throw new Error("Treasury token balance is insufficient for pending distribution");
      }

      const { data: lockRows, error: lockError } = await supabase
        .from("round_registrations")
        .update({ delivery_status: "processing", delivery_notes: null })
        .eq("id", row.id)
        .in("delivery_status", ["pending", "failed"])
        .is("delivery_tx", null)
        .is("distribution_tx", null)
        .select("id");

      if (lockError) throw lockError;
      if (!lockRows?.length) {
        console.log(`Skipping row ${row.id}: another process already took this allocation.`);
        continue;
      }

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

      signature = await sendAndConfirmTransaction(connection, transaction, [treasury], {
        commitment: "confirmed"
      });
      remainingRawBalance -= amount;

      const deliveredAt = new Date().toISOString();
      await markDelivered(row.id, signature, deliveredAt);
      console.log(`Distributed ${row.firu_allocation} FIRU to ${row.wallet}: ${signature}`);
    } catch (error) {
      const message = error?.message || String(error);
      console.error(`Delivery failed for row ${row.id}:`, message);

      if (signature) {
        try {
          const deliveredAt = new Date().toISOString();
          await markDelivered(row.id, signature, deliveredAt);
          console.log(`Recovered delivery state for row ${row.id} after post-send update issue.`);
          continue;
        } catch (recoveryError) {
          const recoveryMessage = recoveryError?.message || String(recoveryError);
          console.error(`CRITICAL: token transfer for row ${row.id} was sent but the database could not be updated:`, recoveryMessage);
          await supabase
            .from("round_registrations")
            .update({
              delivery_status: "processing",
              delivery_notes: `MANUAL_REVIEW_REQUIRED: tx sent (${signature}) but delivery confirmation could not be saved automatically. ${recoveryMessage}`
            })
            .eq("id", row.id);
          continue;
        }
      }

      await supabase
        .from("round_registrations")
        .update({
          delivery_status: "failed",
          delivery_notes: message
        })
        .eq("id", row.id)
        .is("delivery_tx", null)
        .is("distribution_tx", null);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
