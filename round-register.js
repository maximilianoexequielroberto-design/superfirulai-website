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

function isMobileDevice() {
  return MOBILE_RE.test(navigator.userAgent || "");
}

function isInPhantomBrowser() {
  return !!(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);
}

function currentUrl() {
  return window.location.href.split("#")[0] + "#rounds";
}

function openInPhantom() {
  const target = encodeURIComponent(currentUrl());
  const ref = encodeURIComponent(window.location.origin);
  window.location.href = `${PHANTOM_DEEPLINK_BASE}${target}?ref=${ref}`;
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
    .sf-copy-shell{display:flex;align-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;overflow:hidden}
    .sf-copy-shell .sf-input{flex:1;min-width:0}
    .sf-copy-btn{flex:0 0 auto;min-width:110px;height:52px;border:none;border-left:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#fff;font:inherit;font-weight:800;cursor:pointer;transition:background .18s ease,color .18s ease}
    .sf-copy-btn:hover{background:rgba(255,255,255,.1)}
    .sf-copy-btn.copied{background:rgba(33,203,126,.18);color:#8bf0b2}
    .sf-hash-warning{display:grid;gap:8px;padding:14px 16px;border-radius:16px;background:rgba(255,216,125,.08);border:1px solid rgba(255,216,125,.22);color:#ffe39d;font-size:13px;line-height:1.55}
    .sf-hash-warning strong{color:#fff}
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
    .sf-progress{padding:14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)} .sf-progress-head{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;margin-bottom:8px} .sf-progress-head strong{color:#fff}.sf-progress-head span{color:#9db7e8;font-weight:800}.sf-progress-bar{height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}.sf-progress-fill{height:100%;width:0%;background:linear-gradient(90deg,#18a3ff,#ffd665);transition:width .4s ease} @media (max-width:640px){.sf-row,.sf-row-tight,.sf-summary,.sf-action-grid,.sf-price-grid{grid-template-columns:1fr}}
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
      <div id="sfRoundWalletMsg" class="sf-round-note warn"><strong>Wallet not connected.</strong> Connect Phantom for automatic SOL purchase. For USDT and USDC, you must submit the confirmed transaction hash to register the payment.</div>

      <div class="sf-progress"><div class="sf-progress-head"><strong id="sfProgressText">Loading...</strong><span id="sfProgressPercent">0%</span></div><div class="sf-progress-bar"><div class="sf-progress-fill" id="sfProgressFill"></div></div></div>

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
          <span class="sf-help" id="sfAmountHint">Use this for live estimate. Automatic buy is only available for SOL right now.</span><span class="sf-help" id="sfAmountRange">Loading limits...</span><span class="sf-help" id="sfAmountValidation"></span>
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
            <input class="sf-input" id="sfTxHash" inputmode="text" autocomplete="off" placeholder="Paste the confirmed Solana transaction hash" />
          </div>
          <span class="sf-help">For USDT and USDC this step is required. Without submitting the hash, the payment is not automatically registered.</span>
        </label>
        <label class="sf-field">
          <span class="sf-label">Destination wallet / token account</span>
          <div class="sf-copy-shell">
            <input class="sf-input" id="sfDestinationAddress" readonly />
            <button type="button" class="sf-copy-btn" id="sfCopyDestination">Copy</button>
          </div>
          <span class="sf-help">Send only on Solana. SOL uses the project wallet. USDT and USDC use the official token destination shown here.</span>
        </label>
      </div>

      <div class="sf-hash-warning" id="sfHashWarning">
        <div><strong>USDT / USDC important:</strong> after sending funds, paste the confirmed transaction hash to complete and register the payment.</div>
        <div>Payments sent without submitting the transaction hash will not be automatically processed.</div>
      </div>

      <div class="sf-summary">
        <div class="sf-mini"><strong>Automatic SOL</strong><span>Connect Phantom, confirm the payment and let the app register the purchase automatically.</span></div>
        <div class="sf-mini"><strong>Stablecoin flow</strong><span>Copy the official USDT or USDC destination, send funds on Solana, then paste the confirmed transaction hash.</span></div>
        <div class="sf-mini"><strong>Live allocation</strong><span>Your FIRU allocation is calculated automatically from the verified payment and the active round price.</span></div>
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
  const copyDestinationBtn = root.querySelector("#sfCopyDestination");
  const hashWarningEl = root.querySelector("#sfHashWarning");
  const destinationShortEl = root.querySelector("#sfDestinationShort");
  const roundMetaEl = root.querySelector("#sfRoundMeta");
  const amountHintEl = root.querySelector("#sfAmountHint");
  const amountRangeEl = root.querySelector("#sfAmountRange");
  const amountValidationEl = root.querySelector("#sfAmountValidation");
  const liveTokenPriceEl = root.querySelector("#sfLiveTokenPrice");
  const estimatedUsdEl = root.querySelector("#sfEstimatedUsd");
  const estimatedFiruEl = root.querySelector("#sfEstimatedFiru");
  const connectBtn = root.querySelector("#sfRoundConnect");
  const openBtn = root.querySelector("#sfRoundOpenPhantom");
  const autoBuyBtn = root.querySelector("#sfRoundAutoBuy");
  const submitBtn = root.querySelector("#sfRoundSubmit");

  let provider = null;
  let walletAddress = "";
  let roundConfig = null;


  function copyToClipboardWithFallback(value) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
    }
    return fallbackCopy(value);
  }

  function fallbackCopy(value) {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    if (!ok) throw new Error("copy_failed");
  }

  function getTokenLimits(selectedToken) {
    const minSol = Number(roundConfig?.limits?.minSol || 0);
    const maxSol = Number(roundConfig?.limits?.maxSol || 0);
    const solToken = getTokenMeta(roundConfig, "SOL");
    const solPrice = Number(solToken?.livePriceUsd || 0);

    if (selectedToken === "SOL") {
      return {
        min: minSol,
        max: maxSol,
        suffix: "SOL",
        decimals: 4,
      };
    }

    return {
      min: minSol * solPrice,
      max: maxSol * solPrice,
      suffix: selectedToken,
      decimals: 2,
    };
  }

  function getAmountValidation() {
    const selectedToken = tokenEl.value;
    const amount = Number(amountEl.value || 0);
    const selectedRound = getSelectedRoundMeta(roundConfig, roundEl.value);

    if (!selectedRound?.enabled || selectedRound?.soldOut) {
      return selectedRound?.soldOut ? "This round is sold out." : "This round is currently closed.";
    }

    if (!Number.isFinite(amount) || amount <= 0) return "";

    const limits = getTokenLimits(selectedToken);
    if (amount < limits.min) {
      return `Minimum amount for ${limits.suffix} is ${formatCompact(limits.min, limits.decimals)} ${limits.suffix}.`;
    }
    if (amount > limits.max) {
      return `Maximum amount for ${limits.suffix} is ${formatCompact(limits.max, limits.decimals)} ${limits.suffix}.`;
    }
    return "";
  }

  function setMsg(message, tone = "warn") {
    walletMsg.className = `sf-round-note ${tone}`;
    walletMsg.innerHTML = message;
  }

  function updateRoundMeta() {
    const meta = getSelectedRoundMeta(roundConfig, roundEl.value);
    const selectedToken = tokenEl.value;
    if (!meta) {
      roundMetaEl.textContent = "Round config unavailable.";
      if (amountRangeEl) amountRangeEl.textContent = "Limits unavailable.";
      return;
    }
    const pieces = [];
    pieces.push(meta.enabled ? "Open" : "Closed");
    pieces.push(`FIRU $${formatCompact(meta.firuPriceUsd, 6)}`);
    const limits = getTokenLimits(selectedToken);
    pieces.push(`Min ${formatCompact(limits.min, limits.decimals)} ${limits.suffix}`);
    pieces.push(`Max ${formatCompact(limits.max, limits.decimals)} ${limits.suffix}`);
    if (typeof meta.remainingSol === "number") {
      if (selectedToken === "SOL") {
        pieces.push(meta.soldOut ? "Sold out" : `Remaining ${formatCompact(meta.remainingSol, 4)} SOL`);
      } else {
        const solToken = getTokenMeta(roundConfig, "SOL");
        const solPrice = Number(solToken?.livePriceUsd || 0);
        const remainingStable = Number(meta.remainingSol || 0) * solPrice;
        pieces.push(meta.soldOut ? "Sold out" : `Remaining ${formatCompact(remainingStable, 2)} ${selectedToken}`);
      }
    }
    roundMetaEl.textContent = pieces.join(" · ");
    if (amountRangeEl) {
      amountRangeEl.textContent = `Allowed range: ${formatCompact(limits.min, limits.decimals)} ${limits.suffix} to ${formatCompact(limits.max, limits.decimals)} ${limits.suffix}.`;
    }
    if (amountHintEl) {
      amountHintEl.textContent = selectedToken === "SOL"
        ? "Automatic buy is available for SOL. USDT and USDC still require the confirmed transaction hash."
        : `${selectedToken} uses manual registration: send funds on Solana, then paste the confirmed transaction hash.`;
    }
  }


  function updateProgress() {
    const meta = getSelectedRoundMeta(roundConfig, roundEl.value);
    const textEl = root.querySelector("#sfProgressText");
    const percentEl = root.querySelector("#sfProgressPercent");
    const fillEl = root.querySelector("#sfProgressFill");
    if (!meta || !textEl || !percentEl || !fillEl) return;
    const sold = Number(meta.raisedFiru || 0);
    const cap = Number(meta.tokenCap || 0);
    const percent = cap > 0 ? Math.min((sold / cap) * 100, 100) : 0;
    textEl.textContent = sold.toLocaleString("en-US") + " / " + cap.toLocaleString("en-US") + " FIRU sold";
    percentEl.textContent = percent.toFixed(1) + "%";
    fillEl.style.width = percent + "%";
  }

  function updateTokenDetails() {
    const selectedToken = tokenEl.value;
    const limits = getTokenLimits(selectedToken);
    amountEl.placeholder = formatCompact(limits.min, limits.decimals);
    const token = getTokenMeta(roundConfig, selectedToken);
    if (!token) {
      destinationEl.value = "";
      destinationShortEl.textContent = "-";
      liveTokenPriceEl.textContent = "-";
      estimatedUsdEl.textContent = "-";
      estimatedFiruEl.textContent = "-";
      if (hashWarningEl) hashWarningEl.style.display = "grid";
      updateProgress();
      return;
    }

    destinationEl.value = token.destinationAddress || "";
    destinationShortEl.textContent = short(token.destinationAddress || "");
    liveTokenPriceEl.textContent = `$${formatCompact(token.livePriceUsd, 6)}`;
    if (hashWarningEl) {
      if (selectedToken === "SOL") {
        hashWarningEl.innerHTML = `<div><strong>SOL options:</strong> use Phantom automatic buy for the fastest flow, or paste a confirmed transaction hash as manual fallback.</div><div>For USDT and USDC, hash submission stays required until stablecoin automatic payments are enabled.</div>`;
      } else {
        hashWarningEl.innerHTML = `<div><strong>${selectedToken} required flow:</strong> copy the official destination, send ${selectedToken} on Solana, then paste the confirmed transaction hash to complete and register the payment.</div><div>Payments sent without submitting the transaction hash will not be automatically processed.</div>`;
      }
    }
    updateEstimate();
    updateProgress();
  }

  function updateEstimate() {
    const token = getTokenMeta(roundConfig, tokenEl.value);
    const round = getSelectedRoundMeta(roundConfig, roundEl.value);
    const amount = Number(amountEl.value || 0);

    if (!token || !round || !Number.isFinite(amount) || amount <= 0) {
      estimatedUsdEl.textContent = "-";
      estimatedFiruEl.textContent = "-";
      if (amountValidationEl) amountValidationEl.textContent = "";
      return;
    }

    const usdValue = amount * Number(token.livePriceUsd || 0);
    const estimatedFiru = round.firuPriceUsd > 0 ? usdValue / Number(round.firuPriceUsd) : 0;

    estimatedUsdEl.textContent = `$${formatCurrency(usdValue, 2)}`;
    estimatedFiruEl.textContent = formatCompact(estimatedFiru, 0);
    if (amountValidationEl) {
      amountValidationEl.textContent = getAmountValidation();
      amountValidationEl.style.color = amountValidationEl.textContent ? "#ffb2b2" : "#8bf0b2";
    }
  }

  function setReady() {
    const token = tokenEl.value;
    const selectedRound = getSelectedRoundMeta(roundConfig, roundEl.value);
    const amount = Number(amountEl.value || 0);
    const amountInvalid = Boolean(getAmountValidation());
    const amountReady = walletAddress && token === "SOL" && Number.isFinite(amount) && amount > 0 && !amountInvalid && selectedRound?.enabled && !selectedRound?.soldOut;
    const manualReady = txEl.value.trim().length > 20 && !amountInvalid && selectedRound?.enabled && !selectedRound?.soldOut;
    autoBuyBtn.disabled = !amountReady;
    submitBtn.disabled = !manualReady;
    autoBuyBtn.textContent = token === "SOL" ? "Buy SOL with Phantom" : "Automatic buy only for SOL";
    submitBtn.textContent = token === "SOL" ? "Register TX Hash" : `Register ${token} TX Hash`;
  }

  [tokenEl, amountEl, txEl, roundEl].forEach((el) => el.addEventListener("input", () => {
    updateRoundMeta();
    updateTokenDetails();
    setReady();
  }));

  copyDestinationBtn?.addEventListener("click", async () => {
    const value = destinationEl.value.trim();
    if (!value) return;
    try {
      await copyToClipboardWithFallback(value);
      copyDestinationBtn.textContent = "Copied!";
      copyDestinationBtn.classList.add("copied");
      setTimeout(() => {
        copyDestinationBtn.textContent = "Copy";
        copyDestinationBtn.classList.remove("copied");
      }, 1400);
    } catch {
      setMsg("Could not copy the destination address. Copy it manually.", "error");
    }
  });

  openBtn.addEventListener("click", openInPhantom);
  if (isMobileDevice() && !isInPhantomBrowser()) {
    openBtn.classList.add("show");
    openBtn.textContent = "OPEN IN PHANTOM APP";
    connectBtn.textContent = "OPEN IN PHANTOM";
    setMsg("<strong>📱 Mobile detected.</strong> Open Phantom and continue inside Phantom's in-app browser to connect your wallet and complete the purchase.", "warn");
  }

  (async () => {
    try {
      roundConfig = await fetchRoundConfig();
      updateRoundMeta();
      updateTokenDetails();
      updateProgress();
      setReady();
    } catch (err) {
      roundMetaEl.textContent = "Could not load round configuration.";
      setMsg(err?.message || "Could not load round configuration.", "error");
    }
  })();

  if (isMobileDevice() && isInPhantomBrowser()) {
    setMsg("<strong>Inside Phantom.</strong> Tap Connect Wallet below, or wait a moment while we try to connect automatically.", "warn");
    setTimeout(async () => {
      if (walletAddress) return;
      try {
        await ensureConnected();
      } catch (_) {
        // user can still connect manually
      }
    }, 900);
  }

  async function ensureConnected() {
    provider = provider || await getPhantomProvider();

    if (!provider) {
      if (isMobileDevice()) {
        openBtn.classList.add("show");
        openBtn.textContent = "OPEN IN PHANTOM APP";
        throw new Error("Open Phantom to continue.");
      }
      throw new Error("Phantom wallet was not found on this device.");
    }

    const resp = await provider.connect({ onlyIfTrusted: false });
    walletAddress = resp.publicKey.toString();
    connectBtn.textContent = "Wallet Connected";
    setMsg(`<strong>Wallet connected:</strong> ${short(walletAddress)}. Use automatic buy for SOL, or for USDT / USDC send funds on Solana and register the confirmed transaction hash.`, "ok");
    setReady();
    return provider;
  }

  connectBtn.addEventListener("click", async () => {
    if (isMobileDevice() && !isInPhantomBrowser()) {
      connectBtn.textContent = "OPENING PHANTOM...";
      openInPhantom();
      return;
    }

    try {
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting...";
      await ensureConnected();
    } catch (err) {
      connectBtn.textContent = isMobileDevice() && !isInPhantomBrowser() ? "OPEN IN PHANTOM" : "Connect Wallet";
      setMsg(err?.message || "Could not connect the wallet.", "error");
    } finally {
      connectBtn.disabled = false;
      if (walletAddress) connectBtn.textContent = "Wallet Connected";
    }
  });

  async function registerRoundPurchase(txHash) {
    const payload = {
      wallet: walletAddress || null,
      tx_hash: txHash,
      round: roundEl.value,
      payment_token: tokenEl.value,
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
      updateProgress();
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
      updateProgress();
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
        const tx_hash = txEl.value.trim();
      if (!tx_hash || tx_hash.length < 20) {
        setMsg("Paste a valid transaction hash.", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Validating...";
      setMsg(`Checking the ${tokenEl.value} transaction on Solana and registering your purchase...`, "warn");

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
      autoBuyBtn.disabled = true;
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register TX Hash";
      setReady();
      setMsg(err?.message || "Could not register the purchase.", "error");
    }
  });
}
