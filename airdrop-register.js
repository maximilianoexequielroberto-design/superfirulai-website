const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(input) {
  const source = input instanceof Uint8Array ? input : Uint8Array.from(input || []);
  if (!source.length) return "";

  const digits = [0];

  for (let i = 0; i < source.length; i++) {
    let carry = source[i];

    for (let j = 0; j < digits.length; j++) {
      const value = digits[j] * 256 + carry;
      digits[j] = value % 58;
      carry = Math.floor(value / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  for (let i = 0; i < source.length && source[i] === 0; i++) {
    digits.push(0);
  }

  return digits
    .reverse()
    .map((digit) => BASE58_ALPHABET[digit])
    .join("");
}

const bs58 = {
  encode(input) {
    const native = window.bs58?.encode || window.base58?.encode;
    return native ? native(input) : encodeBase58(input);
  }
};

const TURNSTILE_SITE_KEY = "0x4AAAAAACpwkm3WDkKZBlBv";
import { getAvailableSolanaWallets, getPreferredSolanaProvider, isMobileDevice, openInPreferredWallet, shortAddress } from "./wallet-provider.js";

function getWalletLabel(provider) {
  if (provider?.isPhantom) return "Phantom";
  if (provider?.isBackpack) return "Backpack";
  if (provider?.isSolflare || window.solflare === provider) return "Solflare";
  return "Wallet";
}

async function disconnectSolanaWallet(provider) {
  try {
    if (provider?.disconnect) {
      await provider.disconnect();
    }
  } catch (_) {}
}


function ensureTurnstileScript() {
  if (document.querySelector('script[data-turnstile="1"]')) return;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  s.async = true;
  s.defer = true;
  s.dataset.turnstile = "1";
  document.head.appendChild(s);
}

function injectStyles() {
  if (document.getElementById("sf-airdrop-styles")) return;
  const style = document.createElement("style");
  style.id = "sf-airdrop-styles";
  style.textContent = `
    .sf-airdrop-form{display:grid;gap:12px}
    .sf-wallet-shell{display:grid;gap:12px}
    .sf-wallet-note{color:#c9d5f3;font-size:14px;line-height:1.6;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 16px}
    .sf-wallet-note strong{color:#fff}
    .sf-wallet-note.ok{color:#8bf0b2}
    .sf-wallet-note.warn{color:#ffd87d}
    .sf-wallet-note.error{color:#ffb2b2}
    .sf-field{display:grid;gap:8px}
    .sf-label{font-size:13px;font-weight:800;letter-spacing:.02em;color:#fff}
    .sf-handle-shell{display:flex;align-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;overflow:hidden}
    .sf-prefix{flex:0 0 auto;padding:0 14px;height:52px;display:inline-flex;align-items:center;justify-content:center;color:#8fb3ff;font-weight:800;border-right:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-input{width:100%;padding:14px;border:none;background:transparent;color:#fff;outline:none;font:inherit}
    .sf-handle-shell:focus-within{border-color:rgba(81,151,255,.7);box-shadow:0 0 0 3px rgba(81,151,255,.16)}
    .sf-help{font-size:12px;color:#8ca6d8;line-height:1.45}
    .sf-btn-stack{display:grid;gap:10px}
    .sf-wallet-actions{display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .sf-wallet-actions.show{display:grid}
  `;
  document.head.appendChild(style);
}


function getTurnstileToken(root) {
  return (
    root.querySelector('[name="cf-turnstile-response"]')?.value ||
    document.querySelector('[name="cf-turnstile-response"]')?.value ||
    ""
  );
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

  return firstSegment(cleaned);
}

function normalizeXHandle(value) {
  let cleaned = stripSpaces(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(x\.com|twitter\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "");

  return firstSegment(cleaned);
}

export function mountAirdropRegister(selector = "#airdrop-register") {
  ensureTurnstileScript();
  injectStyles();

  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `
    <div class="sf-airdrop-form">
      <div class="sf-wallet-shell">
        <div class="sf-btn-stack">
          <button id="sf-connect" class="btn btn-blue" type="button">Connect Wallet</button>
          <button id="sf-open-phantom" class="btn btn-dark" type="button" style="display:none">Open in Phantom</button>
          <div id="sf-wallet-actions" class="sf-wallet-actions">
            <button id="sf-disconnect" class="btn btn-dark" type="button">Disconnect</button>
            <button id="sf-switch-wallet" class="btn btn-dark" type="button">Disconnect & Change Wallet</button>
          </div>
        </div>
        <div id="sf-wallet" class="sf-wallet-note warn">Wallet not connected</div>
      </div>

      <div class="sf-field">
        <label class="sf-label" for="sf-telegram">Telegram</label>
        <div class="sf-handle-shell">
          <span class="sf-prefix">t.me/</span>
          <input id="sf-telegram" class="sf-input" placeholder="usuario" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="sf-help">Solo usuario, sin @ ni t.me/</div>
      </div>

      <div class="sf-field">
        <label class="sf-label" for="sf-x">X</label>
        <div class="sf-handle-shell">
          <span class="sf-prefix">@</span>
          <input id="sf-x" class="sf-input" placeholder="usuario" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="sf-help">Solo usuario, sin @ ni x.com/</div>
      </div>

      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
      <button id="sf-register" class="btn btn-gold" type="button" disabled style="opacity:.75;filter:grayscale(.1)">Register Access</button>
      <div id="sf-msg" class="sf-wallet-note">Use one personal wallet, sign the message, then complete X, Telegram and captcha.</div>
    </div>
  `;

  let walletAddress = "";
  let signedMessage = "";
  let signature = "";
  let nonce = "";
  let timestamp = "";
  let challenge = "";
  let connectedProvider = null;
  let connectedProviderLabel = "Wallet";

  const connectBtn = root.querySelector("#sf-connect");
  const openPhantomBtn = root.querySelector("#sf-open-phantom");
  const walletActionsEl = root.querySelector("#sf-wallet-actions");
  const disconnectBtn = root.querySelector("#sf-disconnect");
  const switchWalletBtn = root.querySelector("#sf-switch-wallet");
  const registerBtn = root.querySelector("#sf-register");
  const msgEl = root.querySelector("#sf-msg");
  const walletEl = root.querySelector("#sf-wallet");
  const telegramEl = root.querySelector("#sf-telegram");
  const xEl = root.querySelector("#sf-x");

  function setRegisterEnabled(enabled) {
    registerBtn.disabled = !enabled;
    registerBtn.style.opacity = enabled ? "1" : ".75";
    registerBtn.style.filter = enabled ? "none" : "grayscale(.1)";
  }

  function setWalletMessage(html, tone = "warn") {
    walletEl.className = `sf-wallet-note ${tone}`;
    walletEl.innerHTML = html;
  }

  function setMsg(text, tone = "") {
    msgEl.className = `sf-wallet-note ${tone}`.trim();
    msgEl.textContent = text;
  }

  function showOpenWalletButton(show) {
    openPhantomBtn.style.display = show ? "inline-flex" : "none";
  }

  function showWalletActions(show) {
    walletActionsEl.classList.toggle("show", Boolean(show));
  }

  function resetWalletState(message = "Wallet not connected") {
    walletAddress = "";
    signedMessage = "";
    signature = "";
    nonce = "";
    timestamp = "";
    challenge = "";
    connectedProvider = null;
    connectedProviderLabel = "Wallet";
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect Wallet";
    connectBtn.onclick = null;
    showWalletActions(false);
    setRegisterEnabled(false);
    setWalletMessage(message, "warn");
  }

  function cleanInputs() {
    telegramEl.value = normalizeTelegramHandle(telegramEl.value);
    xEl.value = normalizeXHandle(xEl.value);
  }

  telegramEl.addEventListener("input", () => {
    telegramEl.value = normalizeTelegramHandle(telegramEl.value);
  });

  xEl.addEventListener("input", () => {
    xEl.value = normalizeXHandle(xEl.value);
  });

  openPhantomBtn.addEventListener("click", () => openInPreferredWallet("#airdrop"));

  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = "Checking wallet...";
      setMsg("Checking wallet provider...", "warn");

      const preferredWallet = await getPreferredSolanaProvider();
      const provider = preferredWallet?.provider;
      const providerLabel = preferredWallet?.name || getWalletLabel(preferredWallet?.provider);
      if (!provider) {
        if (isMobileDevice()) {
          connectBtn.disabled = false;
          connectBtn.textContent = "Open in Wallet";
          connectBtn.onclick = () => openInPreferredWallet("#airdrop");
          showOpenWalletButton(false);
          setWalletMessage("<strong>Mobile detected.</strong> Open this page inside your wallet browser, then tap Connect Wallet again.", "warn");
          setMsg("No wallet provider is available in this browser. Open the page inside Phantom or use a desktop wallet extension and try again.", "warn");
          return;
        }

        connectBtn.disabled = false;
        connectBtn.textContent = "Retry Wallet Detection";
        connectBtn.onclick = () => window.location.reload();
        setWalletMessage("<strong>No compatible wallet found.</strong> Install or enable Phantom, Backpack or Solflare, then reload the page.", "error");
        setMsg("No compatible wallet provider is available in this browser.", "error");
        return;
      }

      connectBtn.textContent = "Connecting...";
      const connectRes = await provider.connect();
      connectedProvider = provider;
      connectedProviderLabel = providerLabel;
      walletAddress = connectRes.publicKey.toString();
      setWalletMessage(`<strong>${providerLabel} connected:</strong> ${shortAddress(walletAddress)}`, "ok");

      const nonceResp = await fetch("/api/airdrop/nonce", { cache: "no-store" });
      const nonceData = await nonceResp.json();
      if (!nonceResp.ok) throw new Error(nonceData.error || "Failed to get nonce");

      nonce = nonceData.nonce;
      timestamp = nonceData.timestamp;
      challenge = nonceData.challenge;

      signedMessage = [
        "SuperFirulai Airdrop Registration",
        `Wallet: ${walletAddress}`,
        `Nonce: ${nonce}`,
        `Timestamp: ${timestamp}`
      ].join("\n");

      const encoded = new TextEncoder().encode(signedMessage);
      const sig = await provider.signMessage(encoded, "utf8");
      signature = bs58.encode(sig.signature);

      connectBtn.textContent = shortAddress(walletAddress);
      connectBtn.disabled = true;
      showWalletActions(true);
      showOpenWalletButton(false);
      setRegisterEnabled(true);
      setMsg("Wallet verified. Complete X, Telegram and captcha, then register your airdrop.", "ok");
    } catch (err) {
      resetWalletState("Wallet not connected");
      setMsg(err?.message || "Could not connect or sign the wallet.", "error");
    }
  });

  disconnectBtn.addEventListener("click", async () => {
    await disconnectSolanaWallet(connectedProvider);
    resetWalletState("Wallet disconnected");
    setMsg("Wallet disconnected. You can connect again with the same or another account.", "warn");
  });

  switchWalletBtn.addEventListener("click", async () => {
    await disconnectSolanaWallet(connectedProvider);
    resetWalletState("Choose another wallet account and connect again.");
    if (isMobileDevice()) {
      openInPreferredWallet("#airdrop");
      setMsg("Open your wallet, switch account there, then come back and tap Connect Wallet again.", "warn");
      return;
    }
    setMsg("Open Phantom, Backpack or Solflare, switch account there, then tap Connect Wallet again.", "warn");
  });

  registerBtn.addEventListener("click", async () => {
    try {
      if (!walletAddress || !signedMessage || !signature || !nonce || !timestamp || !challenge) {
        setMsg("Connect and sign your wallet first.", "error");
        return;
      }

      cleanInputs();
      const telegram = telegramEl.value;
      const x = xEl.value;
      const turnstileToken = getTurnstileToken(root);

      if (!telegram || !x || !turnstileToken) {
        setMsg("Complete X, Telegram and the captcha.", "error");
        return;
      }

      registerBtn.disabled = true;
      registerBtn.textContent = "Registering...";
      setMsg("Submitting your verified registration...", "warn");

      const resp = await fetch("/api/airdrop/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          telegram_username: telegram,
          x_username: x,
          signed_message: signedMessage,
          signature,
          nonce,
          timestamp,
          challenge,
          turnstileToken
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Registration failed");
      }

      setMsg(data.message || "Airdrop registration verified", "ok");
      registerBtn.textContent = "Registered";
      registerBtn.disabled = true;
      telegramEl.disabled = true;
      xEl.disabled = true;
    } catch (err) {
      registerBtn.disabled = false;
      registerBtn.textContent = "Register Airdrop";
      setMsg(err?.message || "Error registering the airdrop.", "error");
    }
  });

  if (isMobileDevice() && !getAvailableSolanaWallets().length) {
    showOpenWalletButton(true);
  }
}
