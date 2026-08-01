import { applySecurityHeaders, serverError } from "./_security.js";

// Solana addresses are base58-encoded 32-byte public keys. Validating this
// ourselves (instead of relying on @solana/web3.js) removes an external
// dependency that can fail to install/bundle in some deployments.
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = (() => {
  const map = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i++) map[BASE58_ALPHABET[i]] = i;
  return map;
})();

function base58Decode(input) {
  const str = String(input || "");
  if (!str.length) return null;
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const value = BASE58_MAP[str[i]];
    if (value === undefined) return null;
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    bytes.push(0);
  }
  return bytes.reverse();
}

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

function isValidPublicKey(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  const decoded = base58Decode(normalized);
  return Array.isArray(decoded) && decoded.length === 32;
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
  try {
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
  } catch (fatalError) {
    console.error("community-stats: unexpected failure", fatalError);
    try {
      return res.status(200).json({
        holders: Number(process.env.HOLDERS_COUNT || DEFAULT_HOLDERS),
        holdersMode: "fallback",
        holdersError: fatalError instanceof Error ? fatalError.message : "unexpected error",
        telegramMembers: Number(process.env.TELEGRAM_MEMBERS_FALLBACK || DEFAULT_TELEGRAM_MEMBERS),
        xFollowers: Number(process.env.X_FOLLOWERS_COUNT || DEFAULT_X_FOLLOWERS),
        xFollowersMode: "fallback",
        totalSupply: Number(process.env.TOTAL_SUPPLY || DEFAULT_TOTAL_SUPPLY)
      });
    } catch {
      return serverError(res, "community stats unavailable", fatalError);
    }
  }
}
