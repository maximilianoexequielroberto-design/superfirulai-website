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

  return digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join("");
}

const bs58 = {
  encode(input) {
    const native = window.bs58?.encode || window.base58?.encode;
    return native ? native(input) : encodeBase58(input);
  }
};

const TURNSTILE_SITE_KEY = "0x4AAAAAACpwkm3WDkKZBlBv";
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
import { getAvailableSolanaWallets, getPreferredSolanaProvider, isMobileDevice, openInPreferredWallet, shortAddress } from "./wallet-provider.js";

function getWalletLabel(provider) {
  if (provider?.isPhantom) return "Phantom";
  if (provider?.isBackpack) return "Backpack";
  if (provider?.isSolflare || window.solflare === provider) return "Solflare";
  return "Wallet";
}

function normalizeRegistrationError(message) {
  const raw = String(message || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return "Registration failed. Please try again.";
  if (lower.includes("wallet already registered")) return "This wallet is already registered.";
  if (lower.includes("telegram already registered")) return "This Telegram username is already registered.";
  if (lower.includes("x account already registered")) return "This X username is already registered.";
  if (lower.includes("registration already exists")) return "This registration already exists.";
  if (lower.includes("nonce already used")) return "This session already expired. Reconnect your wallet and try again.";
  if (lower.includes("captcha validation failed")) return "Cloudflare verification failed. Complete it again and retry.";
  if (lower.includes("invalid wallet signature")) return "Wallet signature invalid. Reconnect your wallet and try again.";
  if (lower.includes("missing required fields")) return "Complete all required fields before registering.";
  return raw;
}


async function disconnectSolanaWallet(provider) {
  try {
    if (provider?.disconnect) await provider.disconnect();
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
    .sf-wallet-note strong{color:#fff}.sf-wallet-note.ok{color:#8bf0b2}.sf-wallet-note.warn{color:#ffd87d}.sf-wallet-note.error{color:#ffb2b2}.sf-wallet-note.info{color:#9ec4ff}
    .sf-field{display:grid;gap:8px}.sf-label{font-size:13px;font-weight:800;letter-spacing:.02em;color:#fff}
    .sf-handle-shell{display:flex;align-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;overflow:hidden;transition:border-color .18s ease, box-shadow .18s ease}
    .sf-prefix{flex:0 0 auto;padding:0 14px;height:52px;display:inline-flex;align-items:center;justify-content:center;color:#8fb3ff;font-weight:800;border-right:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-input{width:100%;padding:14px;border:none;background:transparent;color:#fff;outline:none;font:inherit}
    .sf-handle-shell:focus-within{border-color:rgba(81,151,255,.7);box-shadow:0 0 0 3px rgba(81,151,255,.16)}
    .sf-handle-shell.sf-missing{border-color:rgba(255,115,115,.75);box-shadow:0 0 0 3px rgba(255,115,115,.12)}
    .sf-help{font-size:12px;color:#8ca6d8;line-height:1.45}
    .sf-check-row{display:flex;gap:10px;align-items:flex-start;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f}
    .sf-check-row input{margin-top:2px;transform:scale(1.1)}
    .sf-check-copy{font-size:13px;color:#dbe7ff;line-height:1.55}
    .sf-verify-shell{display:grid;gap:10px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-verify-head{display:grid;gap:6px}
    .sf-verify-title{font-size:13px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#8fb3ff}
    .sf-verify-copy{font-size:13px;color:#c8d6f4;line-height:1.55}
    .sf-verify-copy strong{color:#fff}
    .sf-verify-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .sf-telegram-widget-slot{min-height:52px;display:flex;align-items:center;flex-wrap:wrap;gap:10px}
    .sf-verify-status{font-size:13px;color:#c9d5f3;line-height:1.55;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px 14px}
    .sf-verify-status.ok{color:#9ef0bf;border-color:rgba(111,236,170,.22);background:rgba(111,236,170,.08)}
    .sf-verify-status.warn{color:#ffd87d;border-color:rgba(255,216,77,.22);background:rgba(255,216,77,.08)}
    .sf-verify-status.error{color:#ffb2b2;border-color:rgba(255,120,120,.22);background:rgba(255,120,120,.08)}
    .sf-verify-meta{font-size:12px;color:#8ca6d8;line-height:1.45}
    .sf-btn-stack{display:grid;gap:10px}.sf-wallet-actions{display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.sf-wallet-actions.show{display:grid}
    .sf-steps-shell{display:grid;gap:12px;padding:16px;border-radius:22px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(12,20,42,.94),rgba(7,12,24,.92));box-shadow:0 18px 46px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04)}
    .sf-steps-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .sf-steps-title{font-size:15px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#8fb3ff}
    .sf-steps-sub{font-size:13px;color:#b8c8ea;line-height:1.5;max-width:520px}
    .sf-steps-grid{display:grid;gap:10px;grid-template-columns:1fr !important}
    .sf-step-card{display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}
    .sf-step-card.active{border-color:rgba(89,161,255,.7);background:linear-gradient(180deg,rgba(20,38,76,.92),rgba(12,23,47,.9));box-shadow:0 10px 28px rgba(28,85,188,.22)}
    .sf-step-card.done{border-color:rgba(90,202,137,.55);background:linear-gradient(180deg,rgba(17,46,32,.92),rgba(11,26,19,.88));box-shadow:0 10px 24px rgba(17,68,38,.2)}
    .sf-step-card.missing{border-color:rgba(255,119,119,.72);background:linear-gradient(180deg,rgba(62,20,27,.92),rgba(33,12,17,.88));box-shadow:0 10px 24px rgba(85,18,28,.2)}
    .sf-step-index{width:52px;height:52px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#dbe7ff;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
    .sf-step-card.active .sf-step-index{background:linear-gradient(180deg,#4f8dff,#275dd8);color:#fff}.sf-step-card.done .sf-step-index{background:linear-gradient(180deg,#63dd8e,#2f9f5f);color:#082012}.sf-step-card.missing .sf-step-index{background:linear-gradient(180deg,#ff9b9b,#db5252);color:#2b0910}
    .sf-step-title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sf-step-title{font-size:15px;font-weight:800;color:#fff;line-height:1.2}
    .sf-step-state{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.08);color:#a8bddf;background:rgba(255,255,255,.04)}
    .sf-step-card.active .sf-step-state{color:#dcebff;background:rgba(82,144,255,.16);border-color:rgba(82,144,255,.36)}
    .sf-step-card.done .sf-step-state{color:#d8ffe7;background:rgba(76,194,121,.18);border-color:rgba(76,194,121,.34)}
    .sf-step-card.missing .sf-step-state{color:#ffe0e0;background:rgba(255,110,110,.16);border-color:rgba(255,110,110,.34)}
    .sf-step-trigger{appearance:none;border:none;background:rgba(255,255,255,.04);color:#dbe7ff;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;font-weight:800;font:inherit;cursor:pointer;transition:all .18s ease}
    .sf-step-trigger:hover{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.07)}
    .sf-step-trigger:focus-visible{outline:2px solid rgba(95,155,255,.6);outline-offset:2px}
    .sf-confirm-card{display:none;gap:8px;padding:16px;border-radius:18px;border:1px solid rgba(95,221,151,.34);background:linear-gradient(180deg,rgba(15,44,32,.94),rgba(9,22,17,.92));box-shadow:0 16px 38px rgba(6,32,18,.28)}
    .sf-confirm-card.show{display:grid}.sf-confirm-title{font-size:15px;font-weight:900;color:#f5fff8}.sf-confirm-copy{font-size:13px;color:#b7f0ca;line-height:1.55}
    .sf-modal-backdrop{position:fixed;inset:0;display:none;align-items:flex-end;justify-content:center;padding:18px;background:rgba(3,6,15,.68);backdrop-filter:blur(6px);z-index:9999}
    .sf-modal-backdrop.show{display:flex}
    .sf-modal{width:min(100%,560px);border-radius:24px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(13,21,44,.98),rgba(8,12,24,.98));box-shadow:0 26px 70px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.05);padding:18px;display:grid;gap:12px}
    .sf-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sf-modal-step{font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#8fb3ff}
    .sf-modal-title{font-size:24px;font-weight:900;color:#fff;line-height:1.1;margin-top:6px}.sf-modal-copy{font-size:14px;color:#c7d6f5;line-height:1.7}
    .sf-modal-points{display:grid;gap:8px;padding:14px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
    .sf-modal-point{font-size:13px;color:#dfe9ff;line-height:1.55}.sf-modal-point strong{color:#fff}
    .sf-modal-close{appearance:none;border:none;background:rgba(255,255,255,.06);color:#fff;border-radius:12px;width:42px;height:42px;font-size:24px;line-height:1;cursor:pointer}
    .sf-hidden{display:none!important}
    @media (max-width:640px){.sf-wallet-actions{grid-template-columns:1fr}.sf-steps-grid{grid-template-columns:1fr !important}.sf-step-card{grid-template-columns:52px 1fr;align-items:start}.sf-step-trigger{grid-column:2;justify-self:start}.sf-modal-backdrop{padding:14px}.sf-modal-title{font-size:22px}}
  `;
  document.head.appendChild(style);
}

function getTurnstileToken(root) {
  return root.querySelector('[name="cf-turnstile-response"]')?.value || document.querySelector('[name="cf-turnstile-response"]')?.value || "";
}

function stripSpaces(value) { return String(value || "").trim().replace(/\s+/g, ""); }
function firstSegment(value) { return String(value || "").split(/[/?#]/)[0] || ""; }
function normalizeTelegramHandle(value) {
  let cleaned = stripSpaces(value).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^t\.me\//i, "").replace(/^telegram\.me\//i, "").replace(/^@/, "").replace(/^\/+/, "");
  return firstSegment(cleaned);
}
function normalizeXHandle(value) {
  let cleaned = stripSpaces(value).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^(x\.com|twitter\.com)\//i, "").replace(/^@/, "").replace(/^\/+/, "");
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
            <div class="sf-steps-title">Airdrop in 3 simple steps</div>
            <div class="sf-steps-sub">Clear order: connect wallet first, add your X + Telegram manually, then finish Cloudflare + Register.</div>
          </div>
        </div>
        <div id="sf-steps-grid" class="sf-steps-grid">
          <div class="sf-step-card" data-step="1">
            <div class="sf-step-index">1</div>
            <div>
              <div class="sf-step-title-row">
                <div class="sf-step-title">Connect wallet</div>
                <div class="sf-step-state">Pending</div>
              </div>
            </div>
            <button class="sf-step-trigger" type="button" data-modal-step="1">Info</button>
          </div>
          <div class="sf-step-card" data-step="2">
            <div class="sf-step-index">2</div>
            <div>
              <div class="sf-step-title-row">
                <div class="sf-step-title">Add X + Telegram</div>
                <div class="sf-step-state">Pending</div>
              </div>
            </div>
            <button class="sf-step-trigger" type="button" data-modal-step="2">Info</button>
          </div>
          <div class="sf-step-card" data-step="3">
            <div class="sf-step-index">3</div>
            <div>
              <div class="sf-step-title-row">
                <div class="sf-step-title">Captcha + register</div>
                <div class="sf-step-state">Pending</div>
              </div>
            </div>
            <button class="sf-step-trigger" type="button" data-modal-step="3">Info</button>
          </div>
        </div>
      </div>

      <div class="sf-wallet-shell">
        <div class="sf-btn-stack">
          <button id="sf-connect" class="btn btn-blue" type="button">Connect Wallet</button>
          <button id="sf-open-phantom" class="btn btn-dark" type="button" style="display:none">Open in Phantom</button>
          <div id="sf-wallet-actions" class="sf-wallet-actions">
            <button id="sf-disconnect" class="btn btn-dark" type="button">Disconnect</button>
            <button id="sf-switch-wallet" class="btn btn-dark" type="button">Switch Wallet</button>
          </div>
        </div>
        <div id="sf-wallet" class="sf-wallet-note warn">Wallet not connected</div>
      </div>

      <div class="sf-verify-shell">
        <div class="sf-verify-head">
          <div class="sf-verify-title">Step 2 · Add X + Telegram</div>
          <div class="sf-verify-copy">Write your public <strong>X</strong> and <strong>Telegram</strong> usernames manually, then confirm you already joined the community. Review stays manual before approval.</div>
        </div>
        <div id="sf-telegram-verify-status" class="sf-verify-status warn">Telegram will be reviewed manually after registration.</div>
        <div id="sf-telegram-verify-meta" class="sf-verify-meta">Use the same public @username that you use inside the community.</div>
      </div>

      <div class="sf-field">
        <label class="sf-label" for="sf-x">X username</label>
        <div id="sf-x-shell" class="sf-handle-shell">
          <span class="sf-prefix">@</span>
          <input id="sf-x" class="sf-input" placeholder="usuario" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="sf-help">Write your public X username manually. Real-time X verification is disabled.</div>
      </div>

      <div class="sf-field">
        <label class="sf-label" for="sf-telegram">Telegram username</label>
        <div id="sf-telegram-shell" class="sf-handle-shell">
          <span class="sf-prefix">@</span>
          <input id="sf-telegram" class="sf-input" placeholder="usuario" autocomplete="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="sf-help">Write your Telegram username manually. Real-time Telegram verification is disabled.</div>
      </div>
      <label class="sf-check-row">
        <input id="sf-telegram-confirm" type="checkbox" />
        <span class="sf-check-copy">I confirm that I already joined the official SuperFirulai Telegram community with this account.</span>
      </label>

      <div id="sf-step3-shell" class="sf-verify-shell sf-hidden">
        <div class="sf-verify-head">
          <div class="sf-verify-title">Step 3 · Finish registration</div>
          <div class="sf-verify-copy">Complete Cloudflare and submit your entry. Your X and Telegram usernames stay manual in the previous step.</div>
        </div>
        <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
        <button id="sf-register" class="btn btn-gold" type="button" disabled style="opacity:.75;filter:grayscale(.1)">Register for Airdrop</button>
      </div>

      <div id="sf-msg" class="sf-wallet-note info">Step 1: connect and sign your wallet.</div>
      <div id="sf-confirm" class="sf-confirm-card">
        <div class="sf-confirm-title">Airdrop registration confirmed</div>
        <div class="sf-confirm-copy">Your registration was received successfully and is now pending manual review.</div>
      </div>
    </div>

    <div id="sf-modal-backdrop" class="sf-modal-backdrop" aria-hidden="true">
      <div class="sf-modal" role="dialog" aria-modal="true" aria-labelledby="sf-modal-title">
        <div class="sf-modal-head">
          <div>
            <div id="sf-modal-step" class="sf-modal-step">Step</div>
            <div id="sf-modal-title" class="sf-modal-title">Details</div>
          </div>
          <button id="sf-modal-close" class="sf-modal-close" type="button" aria-label="Close">×</button>
        </div>
        <div id="sf-modal-copy" class="sf-modal-copy"></div>
        <div id="sf-modal-points" class="sf-modal-points"></div>
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
  let lastMissingStep = 0;
  let isSubmitting = false;
  let registered = false;
  let turnstileWatcher = null;
  let telegramConfirmed = false;

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
  const step3Shell = root.querySelector("#sf-step3-shell");
  const telegramConfirmEl = root.querySelector("#sf-telegram-confirm");
  const telegramVerifyStatusEl = root.querySelector("#sf-telegram-verify-status");
  const telegramVerifyMetaEl = root.querySelector("#sf-telegram-verify-meta");
  const confirmEl = root.querySelector("#sf-confirm");
  const stepCards = Array.from(root.querySelectorAll(".sf-step-card"));
  const modalBackdrop = root.querySelector("#sf-modal-backdrop");
  const modalClose = root.querySelector("#sf-modal-close");
  const modalStep = root.querySelector("#sf-modal-step");
  const modalTitle = root.querySelector("#sf-modal-title");
  const modalCopy = root.querySelector("#sf-modal-copy");
  const modalPoints = root.querySelector("#sf-modal-points");
  const modalTriggers = Array.from(root.querySelectorAll("[data-modal-step]"));

  const stepInfo = {
    1: {
      step: "Step 1",
      title: "Connect wallet",
      copy: "Connect your wallet first so the registration can be signed correctly.",
      points: [
        "Tap <strong>Connect Wallet</strong>.",
        "Approve the connection in Phantom.",
        "Approve the signature once to secure the registration."
      ]
    },
    2: {
      step: "Step 2",
      title: "Add X + Telegram",
      copy: "Write both public usernames manually and confirm that you already joined the Telegram community.",
      points: [
        "Type your public <strong>X</strong> username.",
        "Type your public <strong>Telegram</strong> username.",
        "Check the confirmation box for Telegram community membership."
      ]
    },
    3: {
      step: "Step 3",
      title: "Pass Cloudflare and register",
      copy: "The last step is short: complete Cloudflare, then submit.",
      points: [
        "Complete the <strong>Cloudflare</strong> check.",
        "Tap <strong>Register for Airdrop</strong>.",
        "Your registration stays pending review until approval."
      ]
    }
  };

  function openStepModal(step) {
    const info = stepInfo[step];
    if (!info) return;
    modalStep.textContent = info.step;
    modalTitle.textContent = info.title;
    modalCopy.textContent = info.copy;
    modalPoints.innerHTML = info.points.map((point) => `<div class="sf-modal-point">• ${point}</div>`).join("");
    modalBackdrop.classList.add("show");
    modalBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeStepModal() {
    modalBackdrop.classList.remove("show");
    modalBackdrop.setAttribute("aria-hidden", "true");
  }

  modalTriggers.forEach((btn) => btn.addEventListener("click", () => openStepModal(Number(btn.dataset.modalStep))));
  modalClose.addEventListener("click", closeStepModal);
  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop) closeStepModal();
  });

  function setRegisterEnabled(enabled) {
    registerBtn.disabled = !enabled;
    registerBtn.style.opacity = enabled ? "1" : ".75";
    registerBtn.style.filter = enabled ? "none" : "grayscale(.1)";
  }
  function setWalletMessage(html, tone = "warn") { walletEl.className = `sf-wallet-note ${tone}`; walletEl.innerHTML = html; }
  function setMsg(text, tone = "") { msgEl.className = `sf-wallet-note ${tone}`.trim(); msgEl.textContent = text; }
  function showOpenWalletButton(show) { openPhantomBtn.style.display = show ? "inline-flex" : "none"; }
  function showWalletActions(show) { walletActionsEl.classList.toggle("show", Boolean(show)); }

  function getFieldState() {
    const telegram = normalizeTelegramHandle(telegramEl.value);
    const x = normalizeXHandle(xEl.value);
    const telegramValid = /^[A-Za-z0-9_]{3,32}$/.test(telegram);
    const xValid = X_HANDLE_RE.test(x);
    return { telegram, x, telegramValid, xValid, telegramConfirmed: Boolean(telegramConfirmed) };
  }

  function getCaptchaComplete() { return Boolean(getTurnstileToken(root)); }
  function getFlowState() {
    const fields = getFieldState();
    return {
      step1: Boolean(walletAddress && signedMessage && signature && nonce && timestamp && challenge),
      step2: Boolean(fields.telegramValid && fields.xValid && fields.telegramConfirmed),
      step3: Boolean(registered)
    };
  }

  function clearFieldHighlights() {
    telegramShell.classList.remove("sf-missing");
    xShell.classList.remove("sf-missing");
  }

  function applyFieldHighlights() {
    const fields = getFieldState();
    telegramShell.classList.toggle("sf-missing", lastMissingStep === 2 && !fields.telegramValid);
    xShell.classList.toggle("sf-missing", lastMissingStep === 2 && !fields.xValid);
  }

  function updateStepCards() {
    const state = getFlowState();
    const fields = getFieldState();
    const doneMap = { 1: state.step1, 2: state.step2, 3: state.step3 };
    let activeStep = 0;
    if (!state.step1) activeStep = 1;
    else if (!state.step2) activeStep = 2;
    else if (!state.step3) activeStep = 3;

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
      stateEl.textContent = done ? "Done" : missing ? "Required" : active ? (step === 3 && isSubmitting ? "Finishing" : "Now") : "Pending";
    });

    step3Shell.classList.toggle("sf-hidden", !(state.step1 && state.step2) || registered);
    confirmEl.classList.toggle("show", Boolean(state.step3));
    applyFieldHighlights();
  }

  function setMissingStep(step, message) { lastMissingStep = step; updateStepCards(); setMsg(message, "error"); }
  function clearMissingStep() { if (!lastMissingStep) return; lastMissingStep = 0; updateStepCards(); }

  function setTelegramVerifyStatus(html, tone = "warn") {
    telegramVerifyStatusEl.className = `sf-verify-status ${tone}`;
    telegramVerifyStatusEl.innerHTML = html;
  }


  function resetWalletState(message = "Wallet not connected") {
    walletAddress = "";
    signedMessage = "";
    signature = "";
    nonce = "";
    timestamp = "";
    challenge = "";
    connectedProvider = null;
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

  function refreshMessage() {
    const state = getFlowState();
    const fields = getFieldState();
    if (registered) {
      setMsg("Airdrop registration verified.", "ok");
      return;
    }
    if (isSubmitting) {
      setMsg("Submitting your verified registration...", "warn");
      return;
    }
    if (!state.step1) {
      setMsg("Step 1: connect and sign your wallet.", "warn");
      return;
    }
    if (!fields.telegramValid) {
      setMsg("Step 2: write your public Telegram username.", "warn");
      return;
    }
    if (!fields.telegramConfirmed) {
      setMsg("Step 2: confirm that you already joined Telegram.", "warn");
      return;
    }
    if (!fields.xValid) {
      setMsg("Step 2: write your public X username.", "warn");
      return;
    }
    if (!getCaptchaComplete()) {
      setMsg("Step 3: complete Cloudflare and then register.", "warn");
      return;
    }
    setMsg("Everything is ready. Tap Register for Airdrop.", "ok");
  }

  function evaluateReadyState() {
    const state = getFlowState();
    const fields = getFieldState();
    setRegisterEnabled(Boolean(state.step1 && state.step2 && fields.xValid && getCaptchaComplete() && !registered));
    updateStepCards();
    refreshMessage();
  }

  telegramEl.addEventListener("input", () => {
    telegramEl.value = normalizeTelegramHandle(telegramEl.value);
    if (lastMissingStep === 2) clearMissingStep();
    evaluateReadyState();
  });
  xEl.addEventListener("input", () => {
    xEl.value = normalizeXHandle(xEl.value);
    if (lastMissingStep === 2) clearMissingStep();
    evaluateReadyState();
  });
  telegramConfirmEl.addEventListener("change", () => {
    telegramConfirmed = telegramConfirmEl.checked;
    evaluateReadyState();
  });
  openPhantomBtn.addEventListener("click", () => openInPreferredWallet("#register"));

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
          connectBtn.onclick = () => openInPreferredWallet("#register");
          showOpenWalletButton(false);
          setWalletMessage("<strong>Mobile detected.</strong> Open this page inside your wallet browser and tap Connect Wallet again.", "warn");
          setMsg("No wallet provider is available here. Open the page inside Phantom or use a desktop wallet extension.", "warn");
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
      walletAddress = connectRes.publicKey.toString();
      setWalletMessage(`<strong>${providerLabel} connected:</strong> ${shortAddress(walletAddress)}`, "ok");

      const nonceResp = await fetch("/api/airdrop/nonce", { cache: "no-store" });
      const nonceData = await nonceResp.json();
      if (!nonceResp.ok) throw new Error(nonceData.error || "Failed to get nonce");

      nonce = nonceData.nonce;
      timestamp = nonceData.timestamp;
      challenge = nonceData.challenge;
      signedMessage = ["SuperFirulai Airdrop Registration", `Wallet: ${walletAddress}`, `Nonce: ${nonce}`, `Timestamp: ${timestamp}`].join("\n");

      connectBtn.textContent = "Sign message...";
      const encoded = new TextEncoder().encode(signedMessage);
      const sig = await provider.signMessage(encoded, "utf8");
      signature = bs58.encode(sig.signature);

      connectBtn.textContent = shortAddress(walletAddress);
      connectBtn.disabled = true;
      showWalletActions(true);
      showOpenWalletButton(false);
      setRegisterEnabled(false);
      setMsg("Wallet verified.", "ok");
      evaluateReadyState();
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
      cleanInputs();
      const fields = getFieldState();
      const turnstileToken = getTurnstileToken(root);

      if (!walletAddress || !signedMessage || !signature || !nonce || !timestamp || !challenge) {
        setMissingStep(1, "Complete Step 1: connect and sign your wallet.");
        return;
      }
      if (!fields.telegramValid) {
        setMissingStep(2, "Complete Step 2: write your public Telegram username.");
        return;
      }
      if (!fields.telegramConfirmed) {
        setMissingStep(2, "Complete Step 2: confirm that you already joined Telegram.");
        return;
      }
      if (!fields.xValid) {
        setMissingStep(2, "Complete Step 2: write your public X username.");
        return;
      }
      if (!turnstileToken) {
        setMissingStep(3, "Complete Step 3: pass the Cloudflare check before registering.");
        return;
      }

      isSubmitting = true;
      registered = false;
      registerBtn.disabled = true;
      registerBtn.textContent = "Registering...";
      refreshMessage();
      updateStepCards();

      const resp = await fetch("/api/airdrop/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress,
          telegram_username: fields.telegram,
          x_username: fields.x,
          signed_message: signedMessage,
          signature,
          nonce,
          timestamp,
          challenge,
          turnstileToken
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Registration failed");

      registered = true;
      isSubmitting = false;
      registerBtn.textContent = "Registered";
      registerBtn.disabled = true;
      xEl.disabled = true;
      clearMissingStep();
      evaluateReadyState();
      setMsg(data.message || "Airdrop registration verified", "ok");
    } catch (err) {
      isSubmitting = false;
      registered = false;
      registerBtn.disabled = false;
      registerBtn.textContent = "Register for Airdrop";
      updateStepCards();
      const errorMessage = normalizeRegistrationError(err?.message || "Error registering the airdrop.");
      if (errorMessage.includes("wallet is already registered") || errorMessage.includes("session already expired") || errorMessage.includes("signature invalid")) {
        setMissingStep(1, errorMessage);
      } else if (errorMessage.includes("Telegram username is already registered") || errorMessage.includes("X username is already registered")) {
        setMissingStep(2, errorMessage);
      } else if (errorMessage.includes("Cloudflare verification failed")) {
        setMissingStep(3, errorMessage);
      }
      setMsg(errorMessage, "error");
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
    if (lastMissingStep === 3 && getCaptchaComplete()) clearMissingStep();
    evaluateReadyState();
  }, 800);

  evaluateReadyState();
}
