const DEFAULT_HOLDERS = 2418;
const DEFAULT_X_FOLLOWERS = 61;
const DEFAULT_TELEGRAM_MEMBERS = 24;
const DEFAULT_TOTAL_SUPPLY = 1000000000;
const DEFAULT_COMMITMENT = "finalized";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const FALLBACK_REFRESH_MS = 120000;

function parseAddressList(value) {
  return new Set(
    String(value || "")
      .split(/[\n,; ]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `RPC ${method} returned an error`);
  }

  return payload.result;
}

async function fetchMintProgramOwner(rpcUrl, mintAddress, commitment) {
  const result = await rpcRequest(rpcUrl, "getAccountInfo", [
    mintAddress,
    {
      commitment,
      encoding: "base64"
    }
  ]);

  return result?.value?.owner || TOKEN_PROGRAM_ID;
}

async function fetchLiveHolders({ rpcUrl, mintAddress, commitment, excludedWallets, excludedTokenAccounts }) {
  const programId = await fetchMintProgramOwner(rpcUrl, mintAddress, commitment);
  const normalizedProgramId = programId === TOKEN_2022_PROGRAM_ID ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const accounts = await rpcRequest(rpcUrl, "getProgramAccounts", [
    normalizedProgramId,
    {
      commitment,
      encoding: "jsonParsed",
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: mintAddress
          }
        }
      ]
    }
  ]);

  const uniqueOwners = new Set();

  for (const entry of accounts || []) {
    const tokenAccount = String(entry?.pubkey || "").trim();
    if (excludedTokenAccounts.has(tokenAccount)) continue;

    const info = entry?.account?.data?.parsed?.info;
    if (!info) continue;

    const owner = String(info.owner || "").trim();
    const amount = String(info.tokenAmount?.amount || "0").trim();

    if (!owner || excludedWallets.has(owner)) continue;

    try {
      if (BigInt(amount) <= 0n) continue;
    } catch {
      continue;
    }

    uniqueOwners.add(owner);
  }

  return {
    holders: uniqueOwners.size,
    tokenProgramId: normalizedProgramId
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fallbackXFollowers = Number(process.env.X_FOLLOWERS_COUNT || DEFAULT_X_FOLLOWERS);
  const totalSupply = Number(process.env.TOTAL_SUPPLY || DEFAULT_TOTAL_SUPPLY);
  const fallbackHolders = Number(process.env.HOLDERS_COUNT || DEFAULT_HOLDERS);
  const commitment = String(process.env.HOLDERS_RPC_COMMITMENT || DEFAULT_COMMITMENT).trim() || DEFAULT_COMMITMENT;

  let telegramMembers = Number(process.env.TELEGRAM_MEMBERS_FALLBACK || DEFAULT_TELEGRAM_MEMBERS);
  let xFollowers = fallbackXFollowers;
  let xFollowersMode = "fallback";
  let xFollowersUpdatedAt = new Date().toISOString();
  let xFollowersError = null;

  let holders = fallbackHolders;
  let holdersMode = "fallback";
  let holdersUpdatedAt = new Date().toISOString();
  let holdersError = null;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const rpcUrl = String(process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC_URL_PUBLIC || "").trim();
  const mintAddress = String(process.env.TOKEN_MINT_ADDRESS || "").trim();
  const excludedWallets = parseAddressList(process.env.HOLDERS_EXCLUDED_WALLETS);
  const excludedTokenAccounts = parseAddressList(process.env.HOLDERS_EXCLUDED_TOKEN_ACCOUNTS);

  try {
    if (token && chatId) {
      const url = `https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data && data.ok && typeof data.result === "number") {
        telegramMembers = data.result;
      }
    }
  } catch {
    // fallback to env/default
  }

  xFollowersMode = "manual";
  xFollowersUpdatedAt = new Date().toISOString();
  xFollowersError = null;

  try {
    if (rpcUrl && mintAddress) {
      const live = await fetchLiveHolders({
        rpcUrl,
        mintAddress,
        commitment,
        excludedWallets,
        excludedTokenAccounts
      });
      holders = live.holders;
      holdersMode = "live";
      holdersUpdatedAt = new Date().toISOString();
    }
  } catch (error) {
    holdersError = error instanceof Error ? error.message : "holders unavailable";
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  return res.status(200).json({
    holders,
    holdersMode,
    holdersUpdatedAt,
    holdersError,
    holdersRefreshMs: FALLBACK_REFRESH_MS,
    telegramMembers,
    xFollowers,
    xFollowersMode,
    xFollowersUpdatedAt,
    xFollowersError,
    totalSupply
  });
}
