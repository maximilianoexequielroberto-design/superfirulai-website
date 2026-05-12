import { applySecurityHeaders, serverError } from "./_security.js";
const DEFAULT_HOLDERS = 0;
const DEFAULT_X_FOLLOWERS = 61;
const DEFAULT_TELEGRAM_MEMBERS = 24;
const DEFAULT_TOTAL_SUPPLY = 1000000000;
const DEFAULT_COMMITMENT = "finalized";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const FALLBACK_REFRESH_MS = 120000;

const RPC_TIMEOUT_MS = 8000;
const TELEGRAM_TIMEOUT_MS = 5000;

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidPublicKey(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && SOLANA_ADDRESS_RE.test(normalized));
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function parseAddressList(value) {
  return new Set(
    String(value || "")
      .split(/[\n,; ]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

async function rpcRequest(rpcUrl, method, params) {
  const response = await fetchJsonWithTimeout(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  }, RPC_TIMEOUT_MS);

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
  applySecurityHeaders(res, { privateResponse: false });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const fallbackXFollowers = Number(process.env.X_FOLLOWERS_COUNT || DEFAULT_X_FOLLOWERS);
  const totalSupply = Number(process.env.TOTAL_SUPPLY || DEFAULT_TOTAL_SUPPLY);
  const fallbackHolders = Number(process.env.HOLDERS_COUNT || DEFAULT_HOLDERS);
  const commitment = String(process.env.HOLDERS_RPC_COMMITMENT || DEFAULT_COMMITMENT).trim() || DEFAULT_COMMITMENT;
  const projectStage = String(process.env.PROJECT_STAGE || "prelaunch").trim().toLowerCase();
  const holdersUnlocked = projectStage !== "prelaunch";

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

  const invalidExcludedWallets = [...excludedWallets].filter((value) => !isValidPublicKey(value));
  const invalidExcludedTokenAccounts = [...excludedTokenAccounts].filter((value) => !isValidPublicKey(value));
  const mintAddressValid = !mintAddress || isValidPublicKey(mintAddress);

  try {
    if (token && chatId) {
      const url = `https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`;
      const resp = await fetchJsonWithTimeout(url, {}, TELEGRAM_TIMEOUT_MS);
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
    if (!holdersUnlocked) {
      holders = 0;
      holdersMode = "prelaunch_locked";
      holdersUpdatedAt = new Date().toISOString();
    } else {
      if (invalidExcludedWallets.length) {
        throw new Error(`Invalid HOLDERS_EXCLUDED_WALLETS entries: ${invalidExcludedWallets.join(", ")}`);
      }

      if (invalidExcludedTokenAccounts.length) {
        throw new Error(`Invalid HOLDERS_EXCLUDED_TOKEN_ACCOUNTS entries: ${invalidExcludedTokenAccounts.join(", ")}`);
      }

      if (rpcUrl && mintAddress && !mintAddressValid) {
        throw new Error("Invalid TOKEN_MINT_ADDRESS");
      }

      if (rpcUrl && mintAddress && mintAddressValid) {
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
    }
  } catch (error) {
    holdersError = error instanceof Error ? error.message : "holders unavailable";
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  return res.status(200).json({
    holders,
    holdersMode,
    projectStage,
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
