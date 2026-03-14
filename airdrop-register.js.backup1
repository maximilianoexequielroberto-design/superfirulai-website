const TURNSTILE_SITE_KEY = "0x4AAAAAACpwkm3WDkKZBlBv";

function short(address) {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";
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

export function mountAirdropRegister(selector = "#airdrop-register") {
  ensureTurnstileScript();
  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `
    <div style="display:grid;gap:12px">
      <button id="sf-connect" class="btn btn-blue" type="button">Connect Wallet</button>
      <div id="sf-wallet" style="color:#b8c4e4;font-size:14px">Wallet not connected</div>
      <input id="sf-telegram" placeholder="Telegram username" style="padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#11182f;color:#fff" />
      <input id="sf-x" placeholder="X username" style="padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:#11182f;color:#fff" />
      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
      <button id="sf-register" class="btn btn-gold" type="button">Register Airdrop</button>
      <div id="sf-msg" style="color:#b8c4e4;font-size:14px;line-height:1.6"></div>
    </div>
  `;

  let walletAddress = "";
  let signedMessage = "";
  let signature = "";
  let nonce = "";

  const msgEl = root.querySelector("#sf-msg");
  const walletEl = root.querySelector("#sf-wallet");

  root.querySelector("#sf-connect").addEventListener("click", async () => {
    try {
      const provider = window.phantom?.solana;
      if (!provider?.isPhantom) {
        msgEl.textContent = "Phantom no está disponible.";
        return;
      }

      const connectRes = await provider.connect();
      walletAddress = connectRes.publicKey.toString();
      walletEl.textContent = `Wallet connected: ${short(walletAddress)}`;

      const nonceResp = await fetch("/api/airdrop/nonce");
      const nonceData = await nonceResp.json();
      nonce = nonceData.nonce;

      signedMessage = [
        "SuperFirulai Airdrop Registration",
        `Wallet: ${walletAddress}`,
        `Nonce: ${nonce}`,
        `Timestamp: ${nonceData.timestamp}`
      ].join("\n");

      const encoded = new TextEncoder().encode(signedMessage);
      const sig = await provider.signMessage(encoded, "utf8");
      signature = bs58.encode(sig.signature);

      msgEl.textContent = "Wallet verificada. Completa Telegram, X y el captcha para terminar.";
    } catch (err) {
      msgEl.textContent = "No se pudo conectar o firmar la wallet.";
    }
  });

  root.querySelector("#sf-register").addEventListener("click", async () => {
    try {
      if (!walletAddress || !signedMessage || !signature || !nonce) {
        msgEl.textContent = "Primero conecta y firma tu wallet.";
        return;
      }

      const telegram = root.querySelector("#sf-telegram").value.trim();
      const x = root.querySelector("#sf-x").value.trim();
      const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value || "";

      if (!telegram || !x || !turnstileToken) {
        msgEl.textContent = "Completa Telegram, X y el captcha.";
        return;
      }

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
          turnstileToken
        })
      });

      const data = await resp.json();
      msgEl.textContent = data.message || data.error || "Unexpected response";
    } catch (err) {
      msgEl.textContent = "Error registrando el airdrop.";
    }
  });
}
