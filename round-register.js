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
    .sf-row{display:grid;grid-template-columns:1fr 160px;gap:12px}
    .sf-row-amount{display:grid;grid-template-columns:1fr 1fr;gap:12px}
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
    @media (max-width:640px){.sf-row,.sf-summary,.sf-row-amount,.sf-action-grid{grid-template-columns:1fr}}
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

function isPositiveAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function mountRoundRegister(selector) {
  const root = document.querySelector(selector);
  if (!root) return;

  injectStyles();
  root.innerHTML = `
    <form class="sf-round-form" novalidate>
      <div id="sfRoundWalletMsg" class="sf-round-note warn"><strong>Wallet not connected.</strong> Connect Phantom or buy automatically with Phantom. Manual TX hash registration is still available.</div>

      <div class="sf-row-amount">
        <label class="sf-field">
          <span class="sf-label">SOL amount</span>
          <div class="sf-input-shell">
            <input class="sf-input" id="sfBuyAmount" inputmode="decimal" autocomplete="off" placeholder="0.50" />
          </div>
          <span class="sf-help">For automatic purchase with Phantom. You can still paste a TX hash manually below.</span>
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

      <div class="sf-row">
        <label class="sf-field">
          <span class="sf-label">Transaction hash</span>
          <div class="sf-input-shell">
            <input class="sf-input" id="sfTxHash" inputmode="text" autocomplete="off" placeholder="Paste the Solana transaction hash" />
          </div>
          <span class="sf-help">Manual fallback: use the final confirmed payment transaction sent to the official project wallet.</span>
        </label>
        <label class="sf-field">
          <span class="sf-label">Project wallet</span>
          <div class="sf-input-shell">
            <input class="sf-input" id="sfProjectWallet" readonly />
          </div>
          <span class="sf-help">This is the official wallet that receives SOL for the presale.</span>
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
        <div class="sf-mini"><strong>Automatic buy</strong><span>Buy with Phantom and we will register the transaction automatically after confirmation.</span></div>
        <div class="sf-mini"><strong>Manual fallback</strong><span>You can also send SOL from any wallet and paste the TX hash manually.</span></div>
        <div class="sf-mini"><strong>No reuse</strong><span>Each transaction hash can only be registered once.</span></div>
      </div>

      <div class="sf-round-actions">
        <button type="button" class="btn btn-gold" id="sfRoundConnect">Connect Wallet</button>
        <button type="button" class="btn btn-dark sf-open-phantom" id="sfRoundOpenPhantom">Open in Phantom</button>
        <div class="sf-action-grid">
          <button type="button" class="btn btn-blue" id="sfRoundAutoBuy" disabled>Buy with Phantom</button>
          <button type="button" class="btn btn-dark" id="sfRoundSubmit" disabled>Register TX Hash</button>
        </div>
      </div>
    </form>
  `;

  const walletMsg = root.querySelector("#sfRoundWalletMsg");
  const amountEl = root.querySelector("#sfBuyAmount");
  const txEl = root.querySelector("#sfTxHash");
  const roundEl = root.querySelector("#sfRoundSelect");
  const projectWalletEl = root.querySelector("#sfProjectWallet");
  const roundMetaEl = root.querySelector("#sfRoundMeta");
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
    if (meta.enabled) {
      pieces.push("Open");
    } else {
      pieces.push("Closed");
    }
    if (meta.minSol > 0) {
      pieces.push(`Min ${meta.minSol} SOL`);
    }
    if (meta.tokensPerSol > 0) {
      pieces.push(`${Number(meta.tokensPerSol).toLocaleString("en-US")} FIRU per SOL`);
    }
    roundMetaEl.textContent = pieces.join(" · ");
  }

  function setReady() {
    const amountReady = walletAddress && isPositiveAmount(amountEl.value) && getSelectedRoundMeta(roundConfig, roundEl.value)?.enabled;
    const manualReady = walletAddress && txEl.value.trim() && roundEl.value;
    autoBuyBtn.disabled = !amountReady;
    submitBtn.disabled = !manualReady;
  }

  [amountEl, txEl, roundEl, tgEl, xEl].forEach((el) => el.addEventListener("input", () => {
    cleanSocialInputs();
    updateRoundMeta();
    setReady();
  }));

  openBtn.addEventListener("click", openInPhantom);
  if (isMobileDevice() && !(window.phantom?.solana?.isPhantom || window.solana?.isPhantom)) {
    openBtn.classList.add("show");
  }

  (async () => {
    try {
      roundConfig = await fetchRoundConfig();
      projectWalletEl.value = roundConfig.projectReceiveWallet || "";
      updateRoundMeta();
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
    setMsg(`<strong>Wallet connected:</strong> ${short(walletAddress)}. You can buy automatically with Phantom or paste a TX hash manually.`, "ok");
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
    const round = roundEl.value;
    const telegram = tgEl.value;
    const x = xEl.value;

    const resp = await fetch("/api/round/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: walletAddress, tx_hash: txHash, round, telegram, x })
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Round registration failed");
    }

    return data;
  }

  autoBuyBtn.addEventListener("click", async () => {
    try {
      await ensureConnected();

      const meta = getSelectedRoundMeta(roundConfig, roundEl.value);
      if (!meta?.enabled) {
        throw new Error("This round is currently closed.");
      }

      const amount = Number(amountEl.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid SOL amount.");
      }
      if (meta.minSol > 0 && amount < meta.minSol) {
        throw new Error(`Minimum payment for ${roundEl.value.toUpperCase()} is ${meta.minSol} SOL.`);
      }
      if (!roundConfig?.projectReceiveWallet) {
        throw new Error("Project wallet is not configured.");
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

      setMsg(
        `<strong>Purchase registered.</strong> ${data.sol_amount} SOL verified · ${Number(data.firu_allocation || 0).toLocaleString("en-US")} FIRU allocated.`,
        "ok"
      );

      autoBuyBtn.textContent = "Purchased";
      submitBtn.textContent = "Registered";
      amountEl.disabled = true;
      txEl.disabled = true;
      roundEl.disabled = true;
      tgEl.disabled = true;
      xEl.disabled = true;
      autoBuyBtn.disabled = true;
      submitBtn.disabled = true;
    } catch (err) {
      autoBuyBtn.disabled = false;
      autoBuyBtn.textContent = "Buy with Phantom";
      setReady();
      setMsg(err?.message || "Could not complete the automatic Phantom purchase.", "error");
    }
  });

  submitBtn.addEventListener("click", async () => {
    try {
      await ensureConnected();
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
        `<strong>Purchase registered.</strong> ${data.sol_amount} SOL verified · ${Number(data.firu_allocation || 0).toLocaleString("en-US")} FIRU allocated.`,
        "ok"
      );

      submitBtn.textContent = "Registered";
      amountEl.disabled = true;
      txEl.disabled = true;
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
