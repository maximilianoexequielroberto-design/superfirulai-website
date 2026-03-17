const TURNSTILE_SITE_KEY = "0x4AAAAAACpwkm3WDkKZBlBv";

function short(address) {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function getPhantomProvider() {
  const provider = window.phantom?.solana || window.solana;
  return provider?.isPhantom ? provider : null;
}

function buildPhantomBrowseUrl() {
  const currentUrl = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return `https://phantom.app/ul/browse/${currentUrl}?ref=${ref}`;
}

function openInPhantom() {
  window.location.href = buildPhantomBrowseUrl();
}

function phantomHelpMessage() {
  if (isMobileDevice()) {
    return `Phantom no está disponible en este navegador.<br><br>Te vamos a abrir esta página en el navegador interno de Phantom.`;
  }

  return `Phantom no está disponible.<br><br>Instala la extensión de Phantom y recarga la página.`;
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

function normalizeHandle(value) {
  return String(value || "").trim().replace(/^@/, "");
}

const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;

export function mountAirdropRegister(selector = "#airdrop-register") {
  ensureTurnstileScript();
  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `
    <div style="display:grid;gap:12px">
      <button id="sf-connect" class="btn btn-blue" type="button">Connect Wallet</button>
      <a id="sf-open-phantom" class="btn btn-blue" href="#" style="display:none;text-align:center;text-decoration:none">Open in Phantom</a>
      <div id="sf-wallet" style="color:#b8c4e4;font-size:14px">Wallet not connected</div>
      <input id="sf-telegram" autocomplete="off" placeholder="Telegram username" style="padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#11182f;color:#fff" />
      <input id="sf-x" autocomplete="off" placeholder="X username" style="padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#11182f;color:#fff" />
      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
      <button id="sf-register" class="btn btn-gold" type="button">Register Airdrop</button>
      <div id="sf-msg" style="color:#b8c4e4;font-size:14px;line-height:1.6"></div>
    </div>
  `;

  let walletAddress = "";
  let signedMessage = "";
  let signature = "";
  let nonce = "";
  let timestamp = "";
  let challenge = "";

  const msgEl = root.querySelector("#sf-msg");
  const walletEl = root.querySelector("#sf-wallet");
  const connectBtn = root.querySelector("#sf-connect");
  const registerBtn = root.querySelector("#sf-register");
  const openPhantomBtn = root.querySelector("#sf-open-phantom");

  function setMessage(text, isError = false) {
    msgEl.style.color = isError ? "#ffb4c2" : "#b8c4e4";
    msgEl.textContent = text;
  }

  function getTurnstileToken() {
    return root.querySelector('[name="cf-turnstile-response"]')?.value || "";
  }

  function resetWalletState() {
    walletAddress = "";
    signedMessage = "";
    signature = "";
    nonce = "";
    timestamp = "";
    challenge = "";
    walletEl.textContent = "Wallet not connected";
  }

  if (isMobileDevice() && !getPhantomProvider()) {
    connectBtn.textContent = "Open in Phantom";
    openPhantomBtn.style.display = "block";
    openPhantomBtn.href = buildPhantomBrowseUrl();
    setMessage("Mobile detected. Open this page inside Phantom to connect your wallet.");
    openPhantomBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openInPhantom();
    });
  }

  const provider = getPhantomProvider();
  if (provider?.on) {
    provider.on("disconnect", () => {
      resetWalletState();
      setMessage("Wallet disconnected. Connect again to continue.", true);
    });
    provider.on("accountChanged", (publicKey) => {
      if (!publicKey) {
        resetWalletState();
        return;
      }
      resetWalletState();
      setMessage("Wallet changed. Please connect and sign again.", true);
    });
  }

  connectBtn.addEventListener("click", async () => {
    connectBtn.disabled = true;
    const oldText = connectBtn.textContent;
    connectBtn.textContent = "Connecting...";
    try {
      const phantom = getPhantomProvider();
      if (!phantom) {
        msgEl.innerHTML = phantomHelpMessage();
        if (isMobileDevice()) {
          openInPhantom();
        }
        return;
      }

      const connectRes = await phantom.connect();
      walletAddress = connectRes.publicKey.toString();
      walletEl.textContent = `Wallet connected: ${short(walletAddress)}`;

      const nonceResp = await fetch("/api/airdrop/nonce", { headers: { Accept: "application/json" } });
      if (!nonceResp.ok) throw new Error("Nonce request failed");
      const nonceData = await nonceResp.json();
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
      const sig = await phantom.signMessage(encoded, "utf8");
      signature = bs58.encode(sig.signature);

      setMessage("Wallet verified. Complete Telegram, X and the captcha to finish.");
    } catch (err) {
      resetWalletState();
      setMessage("Could not connect or sign the wallet.", true);
    } finally {
      connectBtn.disabled = false;
      connectBtn.textContent = oldText;
    }
  });

  registerBtn.addEventListener("click", async () => {
    try {
      if (!walletAddress || !signedMessage || !signature || !nonce || !timestamp || !challenge) {
        setMessage("Connect and sign your wallet first.", true);
        return;
      }

      const telegram = normalizeHandle(root.querySelector("#sf-telegram").value);
      const x = normalizeHandle(root.querySelector("#sf-x").value);
      const turnstileToken = getTurnstileToken();

      if (!HANDLE_RE.test(telegram)) {
        setMessage("Enter a valid Telegram username.", true);
        return;
      }

      if (!HANDLE_RE.test(x)) {
        setMessage("Enter a valid X username.", true);
        return;
      }

      if (!turnstileToken) {
        setMessage("Complete the captcha before registering.", true);
        return;
      }

      registerBtn.disabled = true;
      const oldText = registerBtn.textContent;
      registerBtn.textContent = "Registering...";

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
      setMessage(data.message || data.error || "Unexpected response", !resp.ok);
      if (resp.ok) {
        root.querySelector("#sf-telegram").value = "";
        root.querySelector("#sf-x").value = "";
      }

      registerBtn.textContent = oldText;
      registerBtn.disabled = false;
    } catch (err) {
      registerBtn.disabled = false;
      registerBtn.textContent = "Register Airdrop";
      setMessage("Error registering the airdrop.", true);
    }
  });
}
