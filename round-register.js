import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL
} from "https://esm.sh/@solana/web3.js@1.98.4";

const MOBILE_RE = /Android|iPhone|iPad|iPod/i;
const PHANTOM_DEEPLINK_BASE = "https://phantom.app/ul/browse/";
const CONFIG_ENDPOINT = "/api/round/config";
const TOKEN_ORDER = ["SOL", "USDT", "USDC"];

function short(address) {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";
}

function stripSpaces(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function firstSegment(value) {
  return String(value || "").split(/[/?#]/)[0] || "";
}

function normalizeTelegramHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^t\.me\//i, "")
    .replace(/^telegram\.me\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned).toLowerCase();
}

function normalizeXHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(x\.com|twitter\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned).toLowerCase();
}

function isMobileDevice() {
  return MOBILE_RE.test(navigator.userAgent || "");
}

function currentUrl() {
  return window.location.href.split("#")[0] + "#rounds";
}

function openInPhantom() {
  const target = encodeURIComponent(currentUrl());
  window.location.href = `${PHANTOM_DEEPLINK_BASE}${target}`;
}

async function getPhantomProvider() {
  const direct = window.phantom?.solana || window.solana;
  if (direct?.isPhantom) return direct;

  for (let i = 0; i < 25; i++) {
    const provider = window.phantom?.solana || window.solana;
    if (provider?.isPhantom) return provider;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return null;
}

function injectStyles() {
  if (document.getElementById("sf-round-styles")) return;
  const style = document.createElement("style");
  style.id = "sf-round-styles";
  style.textContent = `
    .sf-round-form{display:grid;gap:12px;position:relative;z-index:1}
    .sf-round-note{color:#c9d5f3;font-size:14px;line-height:1.6;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 16px}
    .sf-round-note strong{color:#fff}
    .sf-round-note.ok{color:#8bf0b2}
    .sf-round-note.warn{color:#ffd87d}
    .sf-round-note.error{color:#ffb2b2}
    .sf-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .sf-row-tight{display:grid;grid-template-columns:1fr 180px 180px;gap:12px}
    .sf-field{display:grid;gap:8px}
    .sf-label{font-size:13px;font-weight:800;letter-spacing:.02em;color:#fff}
    .sf-handle-shell,.sf-input-shell{display:flex;align-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;overflow:hidden}
    .sf-prefix{flex:0 0 auto;padding:0 14px;height:52px;display:inline-flex;align-items:center;justify-content:center;color:#8fb3ff;font-weight:800;border-right:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-input,.sf-select{width:100%;padding:14px;border:none;background:transparent;color:#fff;outline:none;font:inherit}
    .sf-input-shell:focus-within,.sf-handle-shell:focus-within{border-color:rgba(81,151,255,.7);box-shadow:0 0 0 3px rgba(81,151,255,.16)}
    .sf-help{font-size:12px;color:#8ca6d8;line-height:1.45}
    .sf-round-actions{display:grid;gap:10px}
    .sf-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sf-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:4px}
    .sf-mini{padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
    .sf-mini strong{display:block;color:#fff;font-size:13px;margin-bottom:4px}
    .sf-mini span{display:block;color:#9db7e8;font-size:12px;line-height:1.45}
    .sf-open-phantom{display:none}
    .sf-open-phantom.show{display:inline-flex}
    .sf-price-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .sf-metric{padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
    .sf-metric strong{display:block;color:#fff;font-size:13px;margin-bottom:4px}
    .sf-metric span{display:block;color:#9db7e8;font-size:12px;line-height:1.45}
    @media (max-width:640px){.sf-row,.sf-row-tight,.sf-summary,.sf-action-grid,.sf-price-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function fetchRoundConfig() {
  const resp = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error || "Could not load round config");
  }
  return data;
}

function getSelectedRoundMeta(config, value) {
  const rounds = config?.rounds || {};
  return rounds[value] || null;
}

function getTokenMeta(config, token) {
  return config?.tokens?.find((item) => item.symbol === token) || null;
}

function formatCurrency(value, digits = 2) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCompact(value, digits = 6) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits
  });
}

export function mountRoundRegister(selector) {
  const root = document.querySelector(selector);
  if (!root) return;

  injectStyles();
  root.innerHTML = `
    <form class="sf-round-form" novalidate>
      <div id="sfRoundWalletMsg" class="sf-round-note warn"><strong>Wallet not connected.</strong> Connect Phantom for automatic SOL purchase. Manual TX hash registration remains available for SOL, USDT and USDC.</div>

      <div class="sf-row-tight">
        <label class="sf-field">
          <span class="sf-label">Payment token</span>
          <div class="sf-input-shell">
            <select class="sf-select" id="sfTokenSelect">
              <option value="SOL">SOL</option>
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
          <span class="sf-help">Accepted on Solana only. Order: SOL, USDT, USDC.</span>
        </label>

        <label class="sf-field">
          <span class="sf-label">Amount</span>
          <div class="sf-input-shell">
            <input class="sf-input" id="sfBuyAmount" inputmode="decimal" autocomplete="off" placeholder="0.10" />
          </div>
          <span class="sf-help">Use this for live estimate. Automatic buy is only available for SOL.</span>
        </label>

        <label class="sf-field">
          <span class="sf-label">Round</span>
          <div class="sf-input-shell">
            <select class="sf-select" id="sfRoundSelect">
              <option value="round1">Round 1</option>
              <option value="round2">Round 2</option>
            </select>
          </div>
          <span class="sf-help" id="sfRoundMeta">Loading round configuration...</span>
        </label>
      </div>

      <div class="sf-price-grid">
        <div class="sf-metric"><strong>Live token price</strong><span id="sfLiveTokenPrice">-</span></div>
        <div class="sf-metric"><strong>Estimated market value</strong><span id="sfEstimatedUsd">-</span></div>
        <div class="sf-metric"><strong>Estimated FIRU</strong><span id="sfEstimatedFiru">-</span></div>
        <div class="sf-metric"><strong>Official destination</strong><span id="sfDestinationShort">-</span></div>
      </div>

      <div class="sf-row">
        <label class="sf-field">
          <span class="sf-label">Transaction hash</span>
          <div class="sf-input-shell">
            <input class="sf-input" id="sfTxHash" inputmode="text" autocomplete="off" placeholder="Paste the Solana transaction hash" />
          </div>
          <span class="sf-help">Manual fallback for SOL, and the required flow for USDT and USDC.</span>
        </label>
        <label class="sf-field">
          <span class="sf-label">Destination wallet / token account</span>
          <div class="sf-input-shell">
            <input class="sf-input" id="sfDestinationAddress" readonly />
          </div>
          <span class="sf-help">Send only on Solana. SOL uses the project wallet. USDT and USDC use the official token destination shown here.</span>
        </label>
      </div>

      <div class="sf-row">
        <label class="sf-field">
          <span class="sf-label">Telegram</span>
          <div class="sf-handle-shell"><span class="sf-prefix">t.me/</span><input class="sf-input" id="sfRoundTelegram" placeholder="usuario" maxlength="32" /></div>
          <span class="sf-help">Solo usuario, sin @ ni t.me/</span>
        </label>
        <label class="sf-field">
          <span class="sf-label">X</span>
          <div class="sf-handle-shell"><span class="sf-prefix">@</span><input class="sf-input" id="sfRoundX" placeholder="usuario" maxlength="15" /></div>
          <span class="sf-help">Solo usuario, sin @ ni x.com/</span>
        </label>
      </div>

      <div class="sf-summary">
        <div class="sf-mini"><strong>Automatic SOL</strong><span>Use Phantom for one-click SOL payments and instant registration after confirmation.</span></div>
        <div class="sf-mini"><strong>Manual stablecoins</strong><span>Send USDT or USDC on Solana, then paste the final transaction hash to register.</span></div>
        <div class="sf-mini"><strong>Live price engine</strong><span>Allocation is calculated from the live market price at verification time.</span></div>
      </div>

      <div class="sf-round-actions">
        <button type="button" class="btn btn-gold" id="sfRoundConnect">Connect Wallet</button>
        <button type="button" class="btn btn-dark sf-open-phantom" id="sfRoundOpenPhantom">Open in Phantom</button>
        <div class="sf-action-grid">
          <button type="button" class="btn btn-blue" id="sfRoundAutoBuy" disabled>Buy SOL with Phantom</button>
          <button type="button" class="btn btn-dark" id="sfRoundSubmit" disabled>Register TX Hash</button>
        </div>
      </div>
    </form>
  `;

  const walletMsg = root.querySelector("#sfRoundWalletMsg");
  const tokenEl = root.querySelector("#sfTokenSelect");
  const amountEl = root.querySelector("#sfBuyAmount");
  const txEl = root.querySelector("#sfTxHash");
  const roundEl = root.querySelector("#sfRoundSelect");
  const destinationEl = root.querySelector("#sfDestinationAddress");
  const destinationShortEl = root.querySelector("#sfDestinationShort");
  const roundMetaEl = root.querySelector("#sfRoundMeta");
  const liveTokenPriceEl = root.querySelector("#sfLiveTokenPrice");
  const estimatedUsdEl = root.querySelector("#sfEstimatedUsd");
  const estimatedFiruEl = root.querySelector("#sfEstimatedFiru");
  const tgEl = root.querySelector("#sfRoundTelegram");
  const xEl = root.querySelector("#sfRoundX");
  const connectBtn = root.querySelector("#sfRoundConnect");
  const openBtn = root.querySelector("#sfRoundOpenPhantom");
  const autoBuyBtn = root.querySelector("#sfRoundAutoBuy");
  const submitBtn = root.querySelector("#sfRoundSubmit");

  let provider = null;
  let walletAddress = "";
  let roundConfig = null;

  function setMsg(message, tone = "warn") {
    walletMsg.className = `sf-round-note ${tone}`;
    walletMsg.innerHTML = message;
  }

  function cleanSocialInputs() {
    tgEl.value = normalizeTelegramHandle(tgEl.value);
    xEl.value = normalizeXHandle(xEl.value);
  }

  function updateRoundMeta() {
    const meta = getSelectedRoundMeta(roundConfig, roundEl.value);
    if (!meta) {
      roundMetaEl.textContent = "Round config unavailable.";
      return;
    }
    const pieces = [];
    pieces.push(meta.enabled ? "Open" : "Closed");
    pieces.push(`FIRU $${formatCompact(meta.firuPriceUsd, 6)}`);
    pieces.push(`Min ${formatCompact(roundConfig?.limits?.minSol || 0, 4)} SOL`);
    pieces.push(`Max ${formatCompact(roundConfig?.limits?.maxSol || 0, 4)} SOL`);
    if (typeof meta.remainingSol === "number") {
      pieces.push(meta.soldOut ? "Sold out" : `Remaining ${formatCompact(meta.remainingSol, 4)} SOL`);
    }
    roundMetaEl.textContent = pieces.join(" · ");
  }

  function updateTokenDetails() {
    const token = getTokenMeta(roundConfig, tokenEl.value);
    if (!token) {
      destinationEl.value = "";
      destinationShortEl.textContent = "-";
      liveTokenPriceEl.textContent = "-";
      estimatedUsdEl.textContent = "-";
      estimatedFiruEl.textContent = "-";
      return;
    }

    destinationEl.value = token.destinationAddress || "";
    destinationShortEl.textContent = short(token.destinationAddress || "");
    liveTokenPriceEl.textContent = `$${formatCompact(token.livePriceUsd, 6)}`;
    updateEstimate();
  }

  function updateEstimate() {
    const token = getTokenMeta(roundConfig, tokenEl.value);
    const round = getSelectedRoundMeta(roundConfig, roundEl.value);
    const amount = Number(amountEl.value || 0);

    if (!token || !round || !Number.isFinite(amount) || amount <= 0) {
      estimatedUsdEl.textContent = "-";
      estimatedFiruEl.textContent = "-";
      return;
    }

    const usdValue = amount * Number(token.livePriceUsd || 0);
    const estimatedFiru = round.firuPriceUsd > 0 ? usdValue / Number(round.firuPriceUsd) : 0;

    estimatedUsdEl.textContent = `$${formatCurrency(usdValue, 2)}`;
    estimatedFiruEl.textContent = formatCompact(estimatedFiru, 0);
  }

  function setReady() {
    const token = tokenEl.value;
    const selectedRound = getSelectedRoundMeta(roundConfig, roundEl.value);
    const amountReady = walletAddress && token === "SOL" && Number(amountEl.value || 0) > 0 && selectedRound?.enabled && !selectedRound?.soldOut;
    const manualReady = txEl.value.trim().length > 20 && selectedRound?.enabled && !selectedRound?.soldOut;
    autoBuyBtn.disabled = !amountReady;
    submitBtn.disabled = !manualReady;
    autoBuyBtn.textContent = token === "SOL" ? "Buy SOL with Phantom" : "Automatic buy only for SOL";
  }

  [tokenEl, amountEl, txEl, roundEl, tgEl, xEl].forEach((el) => el.addEventListener("input", () => {
    cleanSocialInputs();
    updateRoundMeta();
    updateTokenDetails();
    setReady();
  }));

  openBtn.addEventListener("click", openInPhantom);
  if (isMobileDevice() && !(window.phantom?.solana?.isPhantom || window.solana?.isPhantom)) {
    openBtn.classList.add("show");
  }

  (async () => {
    try {
      roundConfig = await fetchRoundConfig();
      updateRoundMeta();
      updateTokenDetails();
      setReady();
    } catch (err) {
      roundMetaEl.textContent = "Could not load round configuration.";
      setMsg(err?.message || "Could not load round configuration.", "error");
    }
  })();

  async function ensureConnected() {
    provider = provider || await getPhantomProvider();

    if (!provider) {
      openBtn.classList.add("show");
      throw new Error("Phantom wallet was not found on this device.");
    }

    const resp = await provider.connect({ onlyIfTrusted: false });
    walletAddress = resp.publicKey.toString();
    connectBtn.textContent = "Wallet Connected";
    setMsg(`<strong>Wallet connected:</strong> ${short(walletAddress)}. Use automatic buy for SOL or register any valid SOL / USDT / USDC transaction hash manually.`, "ok");
    setReady();
    return provider;
  }

  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting...";
      await ensureConnected();
    } catch (err) {
      connectBtn.textContent = "Connect Wallet";
      setMsg(err?.message || "Could not connect the wallet.", "error");
    } finally {
      connectBtn.disabled = false;
      if (walletAddress) connectBtn.textContent = "Wallet Connected";
    }
  });

  async function registerRoundPurchase(txHash) {
    cleanSocialInputs();
    const payload = {
      wallet: walletAddress || null,
      tx_hash: txHash,
      round: roundEl.value,
      payment_token: tokenEl.value,
      telegram: tgEl.value,
      x: xEl.value
    };

    const resp = await fetch("/api/round/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Round registration failed");
    }

    if (data?.round_status) {
      const meta = roundConfig?.rounds?.[roundEl.value];
      if (meta) {
        meta.raisedSol = data.round_status.raised_sol;
        meta.remainingSol = data.round_status.remaining_sol;
        meta.soldOut = Boolean(data.round_status.sold_out);
      }
      updateRoundMeta();
      setReady();
    }

    return data;
  }

  autoBuyBtn.addEventListener("click", async () => {
    try {
      if (tokenEl.value !== "SOL") {
        throw new Error("Automatic buy is only available for SOL. Use manual TX registration for USDT and USDC.");
      }

      await ensureConnected();

      const round = getSelectedRoundMeta(roundConfig, roundEl.value);
      const token = getTokenMeta(roundConfig, "SOL");
      const amount = Number(amountEl.value || 0);

      if (!round?.enabled || round?.soldOut) throw new Error(round?.soldOut ? "This round is sold out." : "This round is currently closed.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid SOL amount.");
      if (!roundConfig?.projectReceiveWallet) throw new Error("Project wallet is not configured.");

      if (amount < Number(roundConfig?.limits?.minSol || 0)) {
        throw new Error(`Minimum purchase is ${formatCompact(roundConfig.limits.minSol, 4)} SOL.`);
      }
      if (amount > Number(roundConfig?.limits?.maxSol || 0)) {
        throw new Error(`Maximum purchase is ${formatCompact(roundConfig.limits.maxSol, 4)} SOL.`);
      }
      if (typeof round?.remainingSol === "number" && amount > Number(round.remainingSol || 0)) {
        throw new Error(round.soldOut
          ? "This round is sold out."
          : `Only ${formatCompact(round.remainingSol, 4)} SOL remains in this round.`);
      }

      autoBuyBtn.disabled = true;
      autoBuyBtn.textContent = "Preparing...";
      setMsg("Preparing Phantom transaction...", "warn");

      const connection = new Connection(roundConfig.rpcUrl || "https://api.mainnet-beta.solana.com", "confirmed");
      const recentBlockhash = await connection.getLatestBlockhash("confirmed");

      const transaction = new Transaction({
        feePayer: new PublicKey(walletAddress),
        recentBlockhash: recentBlockhash.blockhash
      }).add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(walletAddress),
          toPubkey: new PublicKey(roundConfig.projectReceiveWallet),
          lamports: Math.round(amount * LAMPORTS_PER_SOL)
        })
      );

      autoBuyBtn.textContent = "Waiting for approval...";
      const { signature } = await provider.signAndSendTransaction(transaction);

      txEl.value = signature;
      autoBuyBtn.textContent = "Confirming...";
      setMsg("Transaction sent. Waiting for confirmation on Solana...", "warn");

      await connection.confirmTransaction(
        {
          signature,
          blockhash: recentBlockhash.blockhash,
          lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
        },
        "confirmed"
      );

      autoBuyBtn.textContent = "Registering...";
      const data = await registerRoundPurchase(signature);
      if (data?.round_status) {
        const meta = roundConfig?.rounds?.[roundEl.value];
        if (meta) {
          meta.raisedSol = data.round_status.raised_sol;
          meta.remainingSol = data.round_status.remaining_sol;
          meta.soldOut = Boolean(data.round_status.sold_out);
        }
      }
      updateRoundMeta();
      setReady();

      setMsg(
        `<strong>Purchase registered.</strong> ${data.payment_amount} ${data.payment_token} verified · ${formatCurrency(data.payment_amount_usd, 2)} market value · ${formatCompact(data.firu_allocation, 0)} FIRU allocated.`,
        "ok"
      );

      autoBuyBtn.textContent = "Purchased";
      submitBtn.textContent = "Registered";
      amountEl.disabled = true;
      txEl.disabled = true;
      tokenEl.disabled = true;
      roundEl.disabled = true;
      tgEl.disabled = true;
      xEl.disabled = true;
      autoBuyBtn.disabled = true;
      submitBtn.disabled = true;
    } catch (err) {
      autoBuyBtn.disabled = false;
      autoBuyBtn.textContent = tokenEl.value === "SOL" ? "Buy SOL with Phantom" : "Automatic buy only for SOL";
      setReady();
      setMsg(err?.message || "Could not complete the automatic Phantom purchase.", "error");
    }
  });

  submitBtn.addEventListener("click", async () => {
    try {
      cleanSocialInputs();
      const tx_hash = txEl.value.trim();
      if (!tx_hash || tx_hash.length < 20) {
        setMsg("Paste a valid transaction hash.", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Validating...";
      setMsg("Checking the transaction on Solana and registering your purchase...", "warn");

      const data = await registerRoundPurchase(tx_hash);

      setMsg(
        `<strong>Purchase registered.</strong> ${data.payment_amount} ${data.payment_token} verified · ${formatCurrency(data.payment_amount_usd, 2)} market value · ${formatCompact(data.firu_allocation, 0)} FIRU allocated.`,
        "ok"
      );

      submitBtn.textContent = "Registered";
      amountEl.disabled = true;
      txEl.disabled = true;
      tokenEl.disabled = true;
      roundEl.disabled = true;
      tgEl.disabled = true;
      xEl.disabled = true;
      autoBuyBtn.disabled = true;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register TX Hash";
      setReady();
      setMsg(err?.message || "Could not register the purchase.", "error");
    }
  });
}
