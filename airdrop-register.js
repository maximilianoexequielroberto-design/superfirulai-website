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
const TELEGRAM_WIDGET_SCRIPT = "https://telegram.org/js/telegram-widget.js?22";
const TELEGRAM_BOT_USERNAME = (window.SF_TELEGRAM_BOT_USERNAME || "SuperFirulaiAirdropBot").replace(/^@/, "");
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
import { getAvailableSolanaWallets, getPreferredSolanaProvider, isMobileDevice, openInPreferredWallet, shortAddress } from "./wallet-provider.js";

function getWalletLabel(provider) {
  if (provider?.isPhantom) return "Phantom";
  if (provider?.isBackpack) return "Backpack";
  if (provider?.isSolflare || window.solflare === provider) return "Solflare";
  return "Wallet";
}

async function disconnectSolanaWallet(provider) {
  try {
    if (provider?.disconnect) await provider.disconnect();
  } catch (_) {}
}

function ensureTurnstileScript() {
  if (document.querySelector('script[data-turnstile="1"]')) return;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  s.defer = true;
  s.dataset.turnstile = "1";
  document.head.appendChild(s);
}

function ensureTelegramWidgetScript() {
  if (document.querySelector('script[data-telegram-widget="1"]')) return;
  const s = document.createElement("script");
  s.src = TELEGRAM_WIDGET_SCRIPT;
  s.async = true;
  s.dataset.telegramWidget = "1";
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
    .sf-verify-shell{display:grid;gap:10px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-verify-head{display:grid;gap:6px}
    .sf-verify-title{font-size:13px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#8fb3ff}
    .sf-verify-copy{font-size:13px;color:#c8d6f4;line-height:1.55}
    .sf-verify-copy strong{color:#fff}
    .sf-verify-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .sf-telegram-widget-slot{min-height:52px;display:flex;align-items:center;flex-wrap:wrap;gap:10px}
    .sf-final-step{display:grid;gap:12px;padding:16px;border-radius:22px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(12,20,42,.94),rgba(7,12,24,.92));box-shadow:0 18px 46px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.04)}
    .sf-final-step-head{display:grid;gap:6px}
    .sf-final-step-title{font-size:13px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#8fb3ff}
    .sf-final-step-copy{font-size:13px;color:#c8d6f4;line-height:1.55}
    .sf-final-step-copy strong{color:#fff}
    .sf-turnstile-slot{min-height:74px;display:flex;align-items:center;flex-wrap:wrap;gap:10px}
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
            <div class="sf-steps-sub">Verify Telegram first, then connect your wallet. The final block only appears after those two steps are ready.</div>
          </div>
        </div>
        <div id="sf-steps-grid" class="sf-steps-grid">
          <div class="sf-step-card" data-step="1">
            <div class="sf-step-index">1</div>
            <div>
              <div class="sf-step-title-row">
                <div class="sf-step-title">Verify Telegram</div>
                <div class="sf-step-state">Pending</div>
              </div>
            </div>
            <button class="sf-step-trigger" type="button" data-modal-step="1">Info</button>
          </div>
          <div class="sf-step-card" data-step="2">
            <div class="sf-step-index">2</div>
            <div>
              <div class="sf-step-title-row">
                <div class="sf-step-title">Connect wallet</div>
                <div class="sf-step-state">Pending</div>
              </div>
            </div>
            <button class="sf-step-trigger" type="button" data-modal-step="2">Info</button>
          </div>
          <div class="sf-step-card" data-step="3">
            <div class="sf-step-index">3</div>
            <div>
              <div class="sf-step-title-row">
                <div class="sf-step-title">X + Cloudflare + Register</div>
                <div class="sf-step-state">Pending</div>
              </div>
            </div>
            <button class="sf-step-trigger" type="button" data-modal-step="3">Info</button>
          </div>
        </div>
      </div>

      <div class="sf-verify-shell">
        <div class="sf-verify-head">
          <div class="sf-verify-title">Telegram verification</div>
          <div class="sf-verify-copy">Start here. Log in with Telegram and confirm that the account is inside <strong>SuperFirulai Community</strong>.</div>
        </div>
        <div class="sf-field">
          <label class="sf-label" for="sf-telegram">Telegram</label>
          <div id="sf-telegram-shell" class="sf-handle-shell">
            <span class="sf-prefix">t.me/</span>
            <input id="sf-telegram" class="sf-input" placeholder="verified after login" autocomplete="off" autocapitalize="off" spellcheck="false" disabled />
          </div>
          <div class="sf-help">This username is filled automatically after Telegram verification and stays locked.</div>
        </div>
        <div id="sf-telegram-widget-slot" class="sf-telegram-widget-slot"></div>
        <div id="sf-telegram-verify-status" class="sf-verify-status warn">Telegram not verified yet.</div>
        <div id="sf-telegram-verify-meta" class="sf-verify-meta">Use the same Telegram account that joined the community. Public username required.</div>
        <div class="sf-verify-actions">
          <button id="sf-telegram-reset" class="btn btn-dark" type="button" style="display:none">Verify another Telegram</button>
        </div>
      </div>

      <div class="sf-wallet-shell">
        <div class="sf-btn-stack">
          <button id="sf-connect" class="btn btn-blue" type="button" disabled>Verify Telegram First</button>
          <button id="sf-open-phantom" class="btn btn-dark" type="button" style="display:none">Open in Phantom</button>
          <div id="sf-wallet-actions" class="sf-wallet-actions">
            <button id="sf-disconnect" class="btn btn-dark" type="button">Disconnect</button>
            <button id="sf-switch-wallet" class="btn btn-dark" type="button">Switch Wallet</button>
          </div>
        </div>
        <div id="sf-wallet" class="sf-wallet-note warn">Step 2 is locked until Telegram is verified.</div>
      </div>

      <div id="sf-final-step" class="sf-final-step sf-hidden">
        <div class="sf-final-step-head">
          <div class="sf-final-step-title">Step 3 · X + Cloudflare + Register</div>
          <div class="sf-final-step-copy">Telegram and wallet are ready. Now write your <strong>X username</strong>, complete <strong>Cloudflare</strong>, and register.</div>
        </div>

        <div class="sf-verify-shell">
          <div class="sf-verify-head">
            <div class="sf-verify-title">X username</div>
            <div class="sf-verify-copy">This field is manual only. Write your public X username exactly as you want it saved.</div>
          </div>
          <div class="sf-field">
            <label class="sf-label" for="sf-x">X</label>
            <div id="sf-x-shell" class="sf-handle-shell">
              <span class="sf-prefix">@</span>
              <input id="sf-x" class="sf-input" placeholder="usuario" autocomplete="off" autocapitalize="off" spellcheck="false" />
            </div>
            <div class="sf-help">Only your public X username is required here. Real-time X verification is disabled.</div>
          </div>
          <div id="sf-x-verify-status" class="sf-verify-status warn">Manual field only. No X login required.</div>
          <div id="sf-x-verify-meta" class="sf-verify-meta">Telegram already verified your real account. Now finish the last step.</div>
        </div>

        <div id="sf-turnstile-slot" class="sf-turnstile-slot"></div>
        <button id="sf-register" class="btn btn-gold" type="button" disabled style="opacity:.75;filter:grayscale(.1)">Register for Airdrop</button>
      </div>
      <div id="sf-msg" class="sf-wallet-note info">Step 1: verify Telegram. Step 2: connect wallet. Step 3: write X, complete Cloudflare, and register.</div>
      <div id="sf-confirm" class="sf-confirm-card">
        <div class="sf-confirm-title">Airdrop registration confirmed</div>
        <div class="sf-confirm-copy">Your wallet and social handles were verified successfully. Your airdrop access is now locked in.</div>
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
  let telegramAuth = null;
  let telegramVerified = false;
  let turnstileWidgetId = null;
  let turnstileRenderRequested = false;

  const connectBtn = root.querySelector("#sf-connect");
  const openPhantomBtn = root.querySelector("#sf-open-phantom");
  const walletActionsEl = root.querySelector("#sf-wallet-actions");
  const disconnectBtn = root.querySelector("#sf-disconnect");
  const switchWalletBtn = root.querySelector("#sf-switch-wallet");
  const registerBtn = root.querySelector("#sf-register");
  const finalStepEl = root.querySelector("#sf-final-step");
  const turnstileSlot = root.querySelector("#sf-turnstile-slot");
  const msgEl = root.querySelector("#sf-msg");
  const walletEl = root.querySelector("#sf-wallet");
  const telegramEl = root.querySelector("#sf-telegram");
  const xEl = root.querySelector("#sf-x");
  const telegramShell = root.querySelector("#sf-telegram-shell");
  const xShell = root.querySelector("#sf-x-shell");
  const xVerifyStatusEl = root.querySelector("#sf-x-verify-status");
  const xVerifyMetaEl = root.querySelector("#sf-x-verify-meta");
  const telegramWidgetSlot = root.querySelector("#sf-telegram-widget-slot");
  const telegramVerifyStatusEl = root.querySelector("#sf-telegram-verify-status");
  const telegramVerifyMetaEl = root.querySelector("#sf-telegram-verify-meta");
  const telegramResetBtn = root.querySelector("#sf-telegram-reset");

  const telegramWidgetObserver = new MutationObserver(() => {
    const slotText = (telegramWidgetSlot.textContent || "").trim();
    if (/bot domain invalid/i.test(slotText)) {
      telegramWidgetSlot.innerHTML = "";
      telegramWidgetSlot.style.display = "none";
      setTelegramVerifyStatus("Telegram not verified yet.", "warn");
      telegramVerifyMetaEl.textContent = "Telegram login will be tested on the final domain. Public username required.";
    }
  });
  telegramWidgetObserver.observe(telegramWidgetSlot, { childList: true, subtree: true, characterData: true });
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
      title: "Verify Telegram",
      copy: "Start with Telegram so the page does not disconnect your wallet in the middle of the flow.",
      points: [
        "Tap <strong>Log in with Telegram</strong>.",
        "Use the Telegram account that already joined <strong>SuperFirulai Community</strong>.",
        "Your public Telegram username is filled automatically and locked after verification."
      ]
    },
    2: {
      step: "Step 2",
      title: "Connect wallet",
      copy: "After Telegram is verified, connect one Solana wallet and sign once to protect the airdrop from fake entries.",
      points: [
        "Tap <strong>Connect Wallet</strong> after Telegram is verified.",
        "Approve the connection in Phantom.",
        "Approve the signature once so the registration stays tied to your wallet."
      ]
    },
    3: {
      step: "Step 3",
      title: "X + Cloudflare + Register",
      copy: "The final block appears only after Telegram and wallet are ready. Write your X username, complete Cloudflare, and submit.",
      points: [
        "Type your public <strong>X</strong> username manually.",
        "Complete <strong>Cloudflare</strong> in the final block.",
        "Tap <strong>Register for Airdrop</strong> and wait for the confirmation card."
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

  function resetTurnstileToken() {
    if (turnstileWidgetId !== null && window.turnstile?.reset) {
      try { window.turnstile.reset(turnstileWidgetId); } catch (_) {}
    }
  }

  function renderTurnstileIfNeeded() {
    if (turnstileWidgetId !== null || turnstileRenderRequested) return;
    turnstileRenderRequested = true;

    const mountWidget = () => {
      if (!root.isConnected) return true;
      if (!window.turnstile?.render) return false;
      turnstileSlot.innerHTML = "";
      turnstileWidgetId = window.turnstile.render(turnstileSlot, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: () => evaluateReadyState(),
        "expired-callback": () => evaluateReadyState(),
        "error-callback": () => {
          setMsg("Cloudflare could not load correctly. Reload the page and try the final step again.", "error");
          evaluateReadyState();
        }
      });
      turnstileRenderRequested = false;
      return true;
    };

    if (mountWidget()) return;

    const waitId = window.setInterval(() => {
      if (mountWidget()) window.clearInterval(waitId);
    }, 300);
  }

  function syncFinalStepVisibility() {
    const state = getFlowState();
    const readyForFinalStep = Boolean(state.step1 && state.step2);
    finalStepEl.classList.toggle("sf-hidden", !readyForFinalStep);
    if (readyForFinalStep) renderTurnstileIfNeeded();
    else resetTurnstileToken();
  }
  function setWalletMessage(html, tone = "warn") { walletEl.className = `sf-wallet-note ${tone}`; walletEl.innerHTML = html; }
  function setMsg(text, tone = "") { msgEl.className = `sf-wallet-note ${tone}`.trim(); msgEl.textContent = text; }
  function showOpenWalletButton(show) { openPhantomBtn.style.display = show ? "inline-flex" : "none"; }
  function showWalletActions(show) { walletActionsEl.classList.toggle("show", Boolean(show)); }

  function setXVerifyStatus(html, tone = "warn") {
    xVerifyStatusEl.className = `sf-verify-status ${tone}`;
    xVerifyStatusEl.innerHTML = html;
  }

  function updateXStatus() {
    const x = normalizeXHandle(xEl.value);
    if (!x) {
      setXVerifyStatus("Manual field only. No X login required.", "warn");
      xVerifyMetaEl.textContent = "Telegram is already verified. Add only your public X username here.";
      return;
    }
    if (!X_HANDLE_RE.test(x)) {
      setXVerifyStatus("Use only letters, numbers, and underscores.", "error");
      xVerifyMetaEl.textContent = "Write your public X username exactly as it appears on X.";
      return;
    }
    setXVerifyStatus(`<strong>X ready:</strong> @${x}`, "ok");
    xVerifyMetaEl.textContent = "Cloudflare is the only thing left before registration.";
  }

  function initManualXField() {
    xEl.disabled = false;
    updateXStatus();
  }

  function getFieldState() {
    const telegram = normalizeTelegramHandle(telegramEl.value);
    const x = normalizeXHandle(xEl.value);
    const telegramReady = Boolean(telegramVerified && telegramAuth && telegram);
    const xValid = X_HANDLE_RE.test(x);
    return { telegram, x, telegramReady, xValid, complete: Boolean(telegramReady && xValid) };
  }
  function getCaptchaComplete() { return Boolean(getTurnstileToken(root)); }
  function getFlowState() {
    const fields = getFieldState();
    const walletReady = Boolean(walletAddress && signedMessage && signature && nonce && timestamp && challenge);
    return {
      step1: fields.telegramReady,
      step2: walletReady,
      step3: Boolean(registered)
    };
  }

  function syncWalletGate() {
    const state = getFlowState();
    const walletReady = state.step2;
    if (!state.step1 && !walletReady) {
      connectBtn.disabled = true;
      connectBtn.textContent = "Verify Telegram First";
      connectBtn.onclick = null;
      showWalletActions(false);
      if (!walletAddress) {
        setWalletMessage("Step 2 is locked until Telegram is verified.", "warn");
      }
      showOpenWalletButton(false);
      return;
    }
    if (!walletReady) {
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect Wallet";
      connectBtn.onclick = null;
      if (isMobileDevice() && !getAvailableSolanaWallets().length) {
        showOpenWalletButton(true);
      }
    }
  }

  function clearFieldHighlights() { telegramShell.classList.remove("sf-missing"); xShell.classList.remove("sf-missing"); }
  function applyFieldHighlights() {
    const fields = getFieldState();
    telegramShell.classList.toggle("sf-missing", lastMissingStep === 1 && !fields.telegramReady);
    xShell.classList.toggle("sf-missing", lastMissingStep === 3 && !fields.xValid);
  }

  function updateStepCards() {
    const state = getFlowState();
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

    applyFieldHighlights();
    confirmEl.classList.toggle("show", Boolean(state.step3));
  }

  function setMissingStep(step, message) { lastMissingStep = step; updateStepCards(); setMsg(message, "error"); }
  function clearMissingStep() { if (!lastMissingStep) return; lastMissingStep = 0; updateStepCards(); }

  function setTelegramVerifyStatus(html, tone = "warn") {
    telegramVerifyStatusEl.className = `sf-verify-status ${tone}`;
    telegramVerifyStatusEl.innerHTML = html;
  }

  function resetTelegramVerification(copy = "Telegram not verified yet.") {
    telegramAuth = null;
    telegramVerified = false;
    telegramEl.disabled = true;
    telegramEl.value = "";
    telegramResetBtn.style.display = "none";
    setTelegramVerifyStatus(copy, "warn");
    telegramVerifyMetaEl.textContent = "Use the same Telegram account that joined the community. Public username required.";
  }

  async function verifyTelegramMembership(authData) {
    const response = await fetch("/api/telegram/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auth: authData })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Telegram verification failed");
    }
    return data;
  }

  function renderTelegramWidget() {
    telegramWidgetSlot.style.display = "";
    telegramWidgetSlot.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = TELEGRAM_WIDGET_SCRIPT;
    script.setAttribute("data-telegram-login", TELEGRAM_BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "14");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "sfTelegramAuthCallback(user)");
    telegramWidgetSlot.appendChild(script);
  }

  window.sfTelegramAuthCallback = async function sfTelegramAuthCallback(user) {
    try {
      setTelegramVerifyStatus("Checking Telegram membership inside SuperFirulai Community...", "warn");
      const verification = await verifyTelegramMembership(user);
      telegramAuth = user;
      telegramVerified = true;
      telegramEl.value = verification.telegram_username || normalizeTelegramHandle(user?.username || "");
      telegramEl.disabled = true;
      telegramResetBtn.style.display = "inline-flex";
      setTelegramVerifyStatus(`<strong>Telegram verified:</strong> @${verification.telegram_username}`, "ok");
      telegramVerifyMetaEl.textContent = verification.message || "Telegram account verified inside the community.";
      resetTurnstileToken();
      if (lastMissingStep === 1) clearMissingStep();
      setMsg("Telegram verified. Now connect your wallet to unlock the final step.", "ok");
      evaluateReadyState();
    } catch (error) {
      resetTelegramVerification(error?.message || "Telegram verification failed.");
      evaluateReadyState();
    }
  };

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
    connectBtn.textContent = "Connect Wallet";
    connectBtn.onclick = null;
    showWalletActions(false);
    resetTurnstileToken();
    setRegisterEnabled(false);
    setWalletMessage(message, "warn");
    evaluateReadyState();
  }

  function cleanInputs() {
    xEl.value = normalizeXHandle(xEl.value);
  }

  function evaluateReadyState() {
    const state = getFlowState();
    const fields = getFieldState();
    syncWalletGate();
    syncFinalStepVisibility();
    setRegisterEnabled(Boolean(state.step1 && state.step2 && fields.xValid && getCaptchaComplete() && !registered && !isSubmitting));
    updateStepCards();
  }

  xEl.addEventListener("input", () => {
    xEl.value = normalizeXHandle(xEl.value);
    updateXStatus();
    resetTurnstileToken();
    if (lastMissingStep === 3) clearMissingStep();
    evaluateReadyState();
  });
  openPhantomBtn.addEventListener("click", () => openInPreferredWallet("#airdrop"));
  telegramResetBtn.addEventListener("click", () => {
    resetTelegramVerification("Telegram verification reset. Log in again with the account that joined the community.");
    resetTurnstileToken();
    renderTelegramWidget();
    setMsg("Telegram reset. Verify Telegram again before connecting your wallet.", "warn");
    evaluateReadyState();
  });

  connectBtn.addEventListener("click", async () => {
    try {
      if (!getFlowState().step1) {
        setMissingStep(1, "Complete Step 1 first: verify Telegram.");
        return;
      }
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
      setMsg("Wallet verified. Now write your X username, complete Cloudflare, and register.", "ok");
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
      const telegram = telegramEl.value;
      if (!telegramVerified || !telegram) {
        setMissingStep(1, "Complete Step 1: verify Telegram first.");
        return;
      }
      if (!walletAddress || !signedMessage || !signature || !nonce || !timestamp || !challenge) {
        setMissingStep(2, "Complete Step 2: connect and verify your wallet.");
        return;
      }
      cleanInputs();
      const x = xEl.value;
      const turnstileToken = getTurnstileToken(root);
      if (!X_HANDLE_RE.test(x)) {
        setMissingStep(3, "Complete Step 3: enter a valid public X username.");
        return;
      }
      if (!turnstileToken) {
        setMissingStep(3, "Complete Step 3: complete Cloudflare and then register.");
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
          telegram_auth: telegramAuth,
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
      setMsg(data.message || "Airdrop registration verified", "ok");
      registerBtn.textContent = "Registered";
      registerBtn.disabled = true;
      telegramEl.disabled = true;
      xEl.disabled = true;
      clearMissingStep();
      evaluateReadyState();
    } catch (err) {
      isSubmitting = false;
      registered = false;
      registerBtn.disabled = false;
      registerBtn.textContent = "Register for Airdrop";
      setMsg(err?.message || "Error registering the airdrop.", "error");
      evaluateReadyState();
    }
  });

  ensureTelegramWidgetScript();
  initManualXField();
  resetTelegramVerification();
  renderTelegramWidget();

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
