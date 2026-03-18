const bs58 = window.bs58 || window.base58 || null;

const TURNSTILE_SITE_KEY = "0x4AAAAAACpwkm3WDkKZBlBv";
const PHANTOM_DEEPLINK_BASE = "https://phantom.app/ul/browse/";
const MOBILE_RE = /Android|iPhone|iPad|iPod/i;

function short(address) {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";
}

function isMobileDevice() {
  return MOBILE_RE.test(navigator.userAgent || "");
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
  `;
  document.head.appendChild(style);
}

function currentUrl() {
  return window.location.href.split("#")[0] + "#airdrop";
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
      <button id="sf-register" class="btn btn-gold" type="button" disabled style="opacity:.75;filter:grayscale(.1)">Register Airdrop</button>
      <div id="sf-msg" class="sf-wallet-note">Connect your wallet, sign the message, then complete Telegram, X and captcha.</div>
    </div>
  `;

  let walletAddress = "";
  let signedMessage = "";
  let signature = "";
  let nonce = "";
  let timestamp = "";
  let challenge = "";

  const connectBtn = root.querySelector("#sf-connect");
  const openPhantomBtn = root.querySelector("#sf-open-phantom");
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

  function showOpenInPhantom(show) {
    openPhantomBtn.style.display = show ? "inline-flex" : "none";
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

  openPhantomBtn.addEventListener("click", openInPhantom);

  connectBtn.addEventListener("click", async () => {
    try {
      if (!bs58?.encode) {
        throw new Error("bs58 library is not available on the page");
      }

      connectBtn.disabled = true;
      connectBtn.textContent = "Checking Phantom...";
      setMsg("Checking wallet provider...", "warn");

      const provider = await getPhantomProvider();
      if (!provider) {
        if (isMobileDevice()) {
          connectBtn.disabled = false;
          connectBtn.textContent = "Open in Phantom";
          connectBtn.onclick = openInPhantom;
          showOpenInPhantom(false);
          setWalletMessage("<strong>Mobile detected.</strong> Open this page inside Phantom, then tap Connect Wallet again.", "warn");
          setMsg("Phantom is not available in this browser. Open the page inside Phantom and try again.", "warn");
          return;
        }

        connectBtn.disabled = false;
        connectBtn.textContent = "Retry Wallet Detection";
        connectBtn.onclick = () => window.location.reload();
        setWalletMessage("<strong>Phantom not found.</strong> Install or enable the Phantom extension, then reload the page.", "error");
        setMsg("Phantom is not available in this browser.", "error");
        return;
      }

      connectBtn.textContent = "Connecting...";
      const connectRes = await provider.connect();
      walletAddress = connectRes.publicKey.toString();
      setWalletMessage(`<strong>Wallet connected:</strong> ${short(walletAddress)}`, "ok");

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

      connectBtn.textContent = "Wallet Verified";
      connectBtn.disabled = true;
      showOpenInPhantom(false);
      setRegisterEnabled(true);
      setMsg("Wallet verified. Complete Telegram, X and captcha, then register your airdrop.", "ok");
    } catch (err) {
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect Wallet";
      setRegisterEnabled(false);
      setMsg(err?.message || "Could not connect or sign the wallet.", "error");
    }
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
        setMsg("Complete Telegram, X and the captcha.", "error");
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

  if (isMobileDevice() && !(window.phantom?.solana?.isPhantom || window.solana?.isPhantom)) {
    showOpenInPhantom(true);
  }
}
