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
    .sf-airdrop-form{display:grid;gap:14px}
    .sf-wallet-shell{display:grid;gap:12px}
    .sf-wallet-note{color:#c9d5f3;font-size:14px;line-height:1.6;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 16px}
    .sf-wallet-note strong{color:#fff}
    .sf-wallet-note.ok{color:#8bf0b2}
    .sf-wallet-note.warn{color:#ffd87d}
    .sf-wallet-note.error{color:#ffb2b2}
    .sf-wallet-note.info{color:#9ec4ff}
    .sf-field{display:grid;gap:8px}
    .sf-label{font-size:13px;font-weight:800;letter-spacing:.02em;color:#fff}
    .sf-handle-shell{display:flex;align-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;overflow:hidden;transition:border-color .18s ease, box-shadow .18s ease, transform .18s ease}
    .sf-prefix{flex:0 0 auto;padding:0 14px;height:52px;display:inline-flex;align-items:center;justify-content:center;color:#8fb3ff;font-weight:800;border-right:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-input{width:100%;padding:14px;border:none;background:transparent;color:#fff;outline:none;font:inherit}
    .sf-handle-shell:focus-within{border-color:rgba(81,151,255,.7);box-shadow:0 0 0 3px rgba(81,151,255,.16)}
    .sf-handle-shell.sf-missing{border-color:rgba(255,115,115,.75);box-shadow:0 0 0 3px rgba(255,115,115,.12)}
    .sf-help{font-size:12px;color:#8ca6d8;line-height:1.45}
    .sf-btn-stack{display:grid;gap:10px}
    .sf-wallet-actions{display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .sf-wallet-actions.show{display:grid}
    .sf-steps-shell{display:grid;gap:10px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(13,20,40,.92),rgba(8,12,24,.9));box-shadow:0 20px 50px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.04)}
    .sf-steps-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .sf-steps-title{font-size:13px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#8fb3ff}
    .sf-steps-sub{font-size:12px;color:#9db4dd;line-height:1.45}
    .sf-steps-grid{display:grid;gap:10px}
    .sf-step-card{position:relative;display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center;padding:13px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}
    .sf-step-card.active{border-color:rgba(89,161,255,.8);background:linear-gradient(180deg,rgba(20,38,76,.9),rgba(12,22,46,.88));box-shadow:0 0 0 1px rgba(89,161,255,.16),0 10px 28px rgba(28,85,188,.22)}
    .sf-step-card.done{border-color:rgba(90,202,137,.6);background:linear-gradient(180deg,rgba(18,45,32,.92),rgba(11,26,19,.88));box-shadow:0 0 0 1px rgba(90,202,137,.14),0 10px 24px rgba(17,68,38,.2)}
    .sf-step-card.missing{border-color:rgba(255,119,119,.8);background:linear-gradient(180deg,rgba(62,20,27,.92),rgba(33,12,17,.88));box-shadow:0 0 0 1px rgba(255,119,119,.14),0 10px 24px rgba(85,18,28,.2)}
    .sf-step-index{width:44px;height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#dbe7ff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
    .sf-step-card.active .sf-step-index{background:linear-gradient(180deg,#4f8dff,#275dd8);color:#fff;border-color:rgba(255,255,255,.16);box-shadow:0 10px 22px rgba(45,93,216,.35)}
    .sf-step-card.done .sf-step-index{background:linear-gradient(180deg,#63dd8e,#2f9f5f);color:#082012;border-color:rgba(255,255,255,.16);box-shadow:0 10px 22px rgba(47,159,95,.28)}
    .sf-step-card.missing .sf-step-index{background:linear-gradient(180deg,#ff9b9b,#db5252);color:#2b0910;border-color:rgba(255,255,255,.14);box-shadow:0 10px 22px rgba(150,34,34,.25)}
    .sf-step-title{font-size:14px;font-weight:800;color:#fff;line-height:1.2}
    .sf-step-desc{font-size:12px;color:#9cb2da;line-height:1.4;margin-top:3px}
    .sf-step-state{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.08);color:#a8bddf;background:rgba(255,255,255,.04)}
    .sf-step-card.active .sf-step-state{color:#dcebff;background:rgba(82,144,255,.16);border-color:rgba(82,144,255,.36)}
    .sf-step-card.done .sf-step-state{color:#d8ffe7;background:rgba(76,194,121,.18);border-color:rgba(76,194,121,.34)}
    .sf-step-card.missing .sf-step-state{color:#ffe0e0;background:rgba(255,110,110,.16);border-color:rgba(255,110,110,.34)}
    .sf-confirm-card{display:none;gap:8px;padding:16px;border-radius:18px;border:1px solid rgba(95,221,151,.34);background:linear-gradient(180deg,rgba(15,44,32,.94),rgba(9,22,17,.92));box-shadow:0 16px 38px rgba(6,32,18,.28)}
    .sf-confirm-card.show{display:grid}
    .sf-confirm-title{font-size:15px;font-weight:900;color:#f5fff8}
    .sf-confirm-copy{font-size:13px;color:#b7f0ca;line-height:1.55}
    @media (max-width:640px){
      .sf-wallet-actions{grid-template-columns:1fr}
      .sf-step-card{grid-template-columns:42px 1fr;align-items:start}
      .sf-step-state{grid-column:2;justify-self:start}
    }
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
      <div class="sf-steps-shell">
        <div class="sf-steps-head">
          <div>
            <div class="sf-steps-title">Airdrop in 5 premium steps</div>
            <div class="sf-steps-sub">Follow the flow below to secure your verified SuperFirulai access without confusion.</div>
          </div>
        </div>
        <div id="sf-steps-grid" class="sf-steps-grid">
          <div class="sf-step-card" data-step="1">
            <div class="sf-step-index">1</div>
            <div>
              <div class="sf-step-title">Connect wallet</div>
              <div class="sf-step-desc">Use your personal wallet before anything else.</div>
            </div>
            <div class="sf-step-state">Pending</div>
          </div>
          <div class="sf-step-card" data-step="2">
            <div class="sf-step-index">2</div>
            <div>
              <div class="sf-step-title">Sign verification message</div>
              <div class="sf-step-desc">Prove wallet ownership with a secure signature.</div>
            </div>
            <div class="sf-step-state">Pending</div>
          </div>
          <div class="sf-step-card" data-step="3">
            <div class="sf-step-index">3</div>
            <div>
              <div class="sf-step-title">Complete social handles</div>
              <div class="sf-step-desc">Add your Telegram and X usernames correctly.</div>
            </div>
            <div class="sf-step-state">Pending</div>
          </div>
          <div class="sf-step-card" data-step="4">
            <div class="sf-step-index">4</div>
            <div>
              <div class="sf-step-title">Pass captcha</div>
              <div class="sf-step-desc">Confirm you are human before registering.</div>
            </div>
            <div class="sf-step-state">Pending</div>
          </div>
          <div class="sf-step-card" data-step="5">
            <div class="sf-step-index">5</div>
            <div>
              <div class="sf-step-title">Registration confirmed</div>
              <div class="sf-step-desc">Finish and lock your verified airdrop access.</div>
            </div>
            <div class="sf-step-state">Pending</div>
          </div>
        </div>
      </div>

      <div class="sf-wallet-shell">
        <div class="sf-btn-stack">
          <button id="sf-connect" class="btn btn-blue" type="button">Connect Wallet</button>
          <button id="sf-open-phantom" class="btn btn-dark" type="button" style="display:none">Open in Phantom</button>
          <div id="sf-wallet-actions" class="sf-wallet-actions">
            <button id="sf-disconnect" class="btn btn-dark" type="button">Disconnect</button>
            <button id="sf-switch-wallet" class="btn btn-dark" type="button">Switch account in Phantom</button>
          </div>
        </div>
        <div id="sf-wallet" class="sf-wallet-note warn">Wallet not connected</div>
      </div>

      <div class="sf-field">
        <label class="sf-label" for="sf-telegram">Telegram</label>
        <div id="sf-telegram-shell" class="sf-handle-shell">
          <span class="sf-prefix">t.me/</span>
          <input id="sf-telegram" class="sf-input" placeholder="usuario" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="sf-help">Solo usuario, sin @ ni t.me/</div>
      </div>

      <div class="sf-field">
        <label class="sf-label" for="sf-x">X</label>
        <div id="sf-x-shell" class="sf-handle-shell">
          <span class="sf-prefix">@</span>
          <input id="sf-x" class="sf-input" placeholder="usuario" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="sf-help">Solo usuario, sin @ ni x.com/</div>
      </div>

      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
      <button id="sf-register" class="btn btn-gold" type="button" disabled style="opacity:.75;filter:grayscale(.1)">Register Access</button>
      <div id="sf-msg" class="sf-wallet-note info">Use one personal wallet, sign the message, then complete Telegram, X and captcha to finish your airdrop registration.</div>
      <div id="sf-confirm" class="sf-confirm-card">
        <div class="sf-confirm-title">Airdrop registration confirmed</div>
        <div class="sf-confirm-copy">Your wallet and social accounts were verified successfully. Your access is now locked in.</div>
      </div>
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
  let lastMissingStep = 0;
  let isSubmitting = false;
  let registered = false;
  let turnstileWatcher = null;

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
  const telegramShell = root.querySelector("#sf-telegram-shell");
  const xShell = root.querySelector("#sf-x-shell");
  const confirmEl = root.querySelector("#sf-confirm");
  const stepCards = Array.from(root.querySelectorAll(".sf-step-card"));

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

  function getFieldState() {
    const telegram = normalizeTelegramHandle(telegramEl.value);
    const x = normalizeXHandle(xEl.value);
    return {
      telegram,
      x,
      complete: Boolean(telegram && x)
    };
  }

  function getCaptchaComplete() {
    return Boolean(getTurnstileToken(root));
  }

  function getFlowState() {
    const fields = getFieldState();
    return {
      step1: Boolean(walletAddress),
      step2: Boolean(walletAddress && signedMessage && signature && nonce && timestamp && challenge),
      step3: fields.complete,
      step4: getCaptchaComplete(),
      step5: Boolean(registered)
    };
  }

  function clearFieldHighlights() {
    telegramShell.classList.remove("sf-missing");
    xShell.classList.remove("sf-missing");
  }

  function applyFieldHighlights() {
    const fields = getFieldState();
    const needsHighlight = lastMissingStep === 3 && !fields.complete;
    telegramShell.classList.toggle("sf-missing", needsHighlight && !fields.telegram);
    xShell.classList.toggle("sf-missing", needsHighlight && !fields.x);
  }

  function updateStepCards() {
    const state = getFlowState();
    const doneMap = {
      1: state.step1,
      2: state.step2,
      3: state.step3,
      4: state.step4,
      5: state.step5
    };

    let activeStep = 0;
    if (!state.step1) activeStep = 1;
    else if (!state.step2) activeStep = 2;
    else if (!state.step3) activeStep = 3;
    else if (!state.step4) activeStep = 4;
    else if (!state.step5) activeStep = isSubmitting ? 5 : 5;

    stepCards.forEach((card) => {
      const step = Number(card.dataset.step);
      const stateEl = card.querySelector(".sf-step-state");
      const done = doneMap[step];
      const missing = lastMissingStep === step && !done;
      const active = !missing && activeStep === step && !done;

      card.classList.remove("done", "active", "missing");
      if (done) card.classList.add("done");
      else if (missing) card.classList.add("missing");
      else if (active) card.classList.add("active");

      if (done) {
        stateEl.textContent = step === 5 ? "Complete" : "Done";
      } else if (missing) {
        stateEl.textContent = "Required";
      } else if (active) {
        stateEl.textContent = step === 5 && isSubmitting ? "Finishing" : "Now";
      } else {
        stateEl.textContent = "Pending";
      }
    });

    applyFieldHighlights();
    confirmEl.classList.toggle("show", Boolean(state.step5));
  }

  function setMissingStep(step, message) {
    lastMissingStep = step;
    updateStepCards();
    setMsg(message, "error");
  }

  function clearMissingStep() {
    if (!lastMissingStep) return;
    lastMissingStep = 0;
    updateStepCards();
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
    registered = false;
    isSubmitting = false;
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect Wallet";
    connectBtn.onclick = null;
    showWalletActions(false);
    setRegisterEnabled(false);
    setWalletMessage(message, "warn");
    updateStepCards();
  }

  function cleanInputs() {
    telegramEl.value = normalizeTelegramHandle(telegramEl.value);
    xEl.value = normalizeXHandle(xEl.value);
  }

  function evaluateReadyState() {
    const state = getFlowState();
    setRegisterEnabled(Boolean(state.step1 && state.step2));
    updateStepCards();
  }

  telegramEl.addEventListener("input", () => {
    telegramEl.value = normalizeTelegramHandle(telegramEl.value);
    if (lastMissingStep === 3) clearMissingStep();
    evaluateReadyState();
  });

  xEl.addEventListener("input", () => {
    xEl.value = normalizeXHandle(xEl.value);
    if (lastMissingStep === 3) clearMissingStep();
    evaluateReadyState();
  });

  openPhantomBtn.addEventListener("click", () => openInPreferredWallet("#airdrop"));

  connectBtn.addEventListener("click", async () => {
    try {
      registered = false;
      isSubmitting = false;
      clearMissingStep();
      connectBtn.disabled = true;
      connectBtn.textContent = "Checking wallet...";
      setMsg("Checking wallet provider...", "warn");
      updateStepCards();

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
          updateStepCards();
          return;
        }

        connectBtn.disabled = false;
        connectBtn.textContent = "Retry Wallet Detection";
        connectBtn.onclick = () => window.location.reload();
        setWalletMessage("<strong>No compatible wallet found.</strong> Install or enable Phantom, Backpack or Solflare, then reload the page.", "error");
        setMsg("No compatible wallet provider is available in this browser.", "error");
        updateStepCards();
        return;
      }

      connectBtn.textContent = "Connecting...";
      const connectRes = await provider.connect();
      connectedProvider = provider;
      connectedProviderLabel = providerLabel;
      walletAddress = connectRes.publicKey.toString();
      setWalletMessage(`<strong>${providerLabel} connected:</strong> ${shortAddress(walletAddress)}`, "ok");
      updateStepCards();

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

      connectBtn.textContent = "Sign message...";
      const encoded = new TextEncoder().encode(signedMessage);
      const sig = await provider.signMessage(encoded, "utf8");
      signature = bs58.encode(sig.signature);

      connectBtn.textContent = shortAddress(walletAddress);
      connectBtn.disabled = true;
      showWalletActions(true);
      showOpenWalletButton(false);
      setRegisterEnabled(true);
      setMsg("Wallet verified. Complete Telegram, X and captcha, then register your airdrop.", "ok");
      updateStepCards();
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
    resetWalletState("Switch your account in Phantom, then connect again.");
    if (isMobileDevice()) {
      setMsg("Open Phantom, switch the active account there, return to the page, then tap Connect Wallet again.", "warn");
      return;
    }
    setMsg("Open Phantom, Backpack or Solflare, switch account there, then tap Connect Wallet again.", "warn");
  });

  registerBtn.addEventListener("click", async () => {
    try {
      clearMissingStep();
      if (!walletAddress) {
        setMissingStep(1, "Complete Step 1: connect your wallet first.");
        return;
      }
      if (!signedMessage || !signature || !nonce || !timestamp || !challenge) {
        setMissingStep(2, "Complete Step 2: sign the verification message.");
        return;
      }

      cleanInputs();
      const telegram = telegramEl.value;
      const x = xEl.value;
      const turnstileToken = getTurnstileToken(root);

      if (!telegram || !x) {
        setMissingStep(3, "Complete Step 3: add both Telegram and X usernames.");
        return;
      }
      if (!turnstileToken) {
        setMissingStep(4, "Complete Step 4: pass the captcha before registering.");
        return;
      }

      isSubmitting = true;
      registered = false;
      registerBtn.disabled = true;
      registerBtn.textContent = "Registering...";
      setMsg("Submitting your verified registration...", "warn");
      updateStepCards();

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

      registered = true;
      isSubmitting = false;
      setMsg(data.message || "Airdrop registration verified", "ok");
      registerBtn.textContent = "Registered";
      registerBtn.disabled = true;
      telegramEl.disabled = true;
      xEl.disabled = true;
      clearMissingStep();
      updateStepCards();
    } catch (err) {
      isSubmitting = false;
      registered = false;
      registerBtn.disabled = false;
      registerBtn.textContent = "Register Access";
      updateStepCards();
      setMsg(err?.message || "Error registering the airdrop.", "error");
    }
  });

  if (isMobileDevice() && !getAvailableSolanaWallets().length) {
    showOpenWalletButton(true);
  }

  turnstileWatcher = window.setInterval(() => {
    if (!root.isConnected) {
      window.clearInterval(turnstileWatcher);
      return;
    }
    if (lastMissingStep === 4 && getCaptchaComplete()) {
      clearMissingStep();
    }
    evaluateReadyState();
  }, 800);

  evaluateReadyState();
}
