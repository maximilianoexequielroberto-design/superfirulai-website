const TURNSTILE_SITE_KEY = "0x4AAAAAACpwkm3WDkKZBlBv";
const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;

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

function phantomHelpMessage() {
  if (isMobileDevice()) {
    return `Phantom no está disponible en este navegador.<br><br>Abrí esta página desde el navegador interno de la app Phantom.`;
  }

  return `Phantom no está disponible.<br><br>Instalá la extensión de Phantom y recargá la página.`;
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

export function mountAirdropRegister(selector = "#airdrop-register") {
  ensureTurnstileScript();
  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `
    <div style="display:grid;gap:14px">
      <div style="display:grid;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <strong style="font-size:18px;letter-spacing:-.02em">Verified Registration</strong>
          <span style="display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:999px;background:rgba(27,136,255,.12);border:1px solid rgba(27,136,255,.24);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#9bccff">One wallet per spot</span>
        </div>
        <div style="color:#9fb2da;font-size:13px;line-height:1.65">Connect Phantom, sign once, and finish the form with your Telegram and X usernames.</div>
      </div>
      <button id="sf-connect" class="btn btn-blue" type="button">Connect Wallet</button>
      <div id="sf-wallet" style="color:#b8c4e4;font-size:14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)">Wallet not connected</div>
      <input id="sf-telegram" autocomplete="off" placeholder="Telegram username" style="padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;color:#fff;outline:none" />
      <input id="sf-x" autocomplete="off" placeholder="X username" style="padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;color:#fff;outline:none" />
      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
      <button id="sf-register" class="btn btn-gold" type="button">Register Airdrop</button>
      <div id="sf-msg" style="color:#b8c4e4;font-size:14px;line-height:1.6;min-height:24px"></div>
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
  const telegramInput = root.querySelector("#sf-telegram");
  const xInput = root.querySelector("#sf-x");

  function setMessage(text, isError = false) {
    msgEl.style.color = isError ? "#ffb4c2" : "#b8c4e4";
    msgEl.innerHTML = text;
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

  [telegramInput, xInput].forEach((input) => {
    input.addEventListener("blur", () => {
      input.value = normalizeHandle(input.value);
    });
  });

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
      setMessage("Wallet changed. Connect and sign again to keep your registration secure.", true);
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
    const oldText = registerBtn.textContent;
    try {
      if (!walletAddress || !signedMessage || !signature || !nonce || !timestamp || !challenge) {
        setMessage("Connect and sign your wallet first.", true);
        return;
      }

      const telegram = normalizeHandle(telegramInput.value);
      const x = normalizeHandle(xInput.value);
      const turnstileToken = getTurnstileToken();

      telegramInput.value = telegram;
      xInput.value = x;

      if (!HANDLE_RE.test(telegram)) {
        setMessage("Enter a valid Telegram username.", true);
        telegramInput.focus();
        return;
      }

      if (!HANDLE_RE.test(x)) {
        setMessage("Enter a valid X username.", true);
        xInput.focus();
        return;
      }

      if (!turnstileToken) {
        setMessage("Complete the captcha before registering.", true);
        return;
      }

      registerBtn.disabled = true;
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

      const data = await resp.json().catch(() => ({}));
      setMessage(data.message || data.error || "Unexpected response", !resp.ok);

      if (resp.ok) {
        telegramInput.value = "";
        xInput.value = "";
        if (window.turnstile) {
          const widget = root.querySelector(".cf-turnstile");
          if (widget) window.turnstile.reset(widget);
        }
      }
    } catch (err) {
      setMessage("Error registering the airdrop.", true);
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = oldText;
    }
  });
}
