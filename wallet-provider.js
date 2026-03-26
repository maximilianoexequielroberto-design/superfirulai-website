const PHANTOM_DEEPLINK_BASE = "https://phantom.app/ul/browse/";
const MOBILE_RE = /Android|iPhone|iPad|iPod/i;

const WALLET_MODAL_ID = "sf-wallet-selector-modal";
const WALLET_STYLE_ID = "sf-wallet-selector-style";

export function isMobileDevice() {
  return MOBILE_RE.test(navigator.userAgent || "");
}

export function shortAddress(address) {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";
}

function currentUrl(hash = "") {
  const clean = window.location.href.split("#")[0];
  return hash ? `${clean}${hash.startsWith("#") ? hash : `#${hash}`}` : clean;
}

export function openInPreferredWallet(hash = "") {
  const target = encodeURIComponent(currentUrl(hash));
  window.location.href = `${PHANTOM_DEEPLINK_BASE}${target}`;
}

function getProviderCandidates() {
  const direct = window.solana;
  const candidates = [
    {
      name: "Phantom",
      provider: window.phantom?.solana || (direct?.isPhantom ? direct : null),
      mobile: true,
      accent: "phantom",
      description: "Fast and simple for most users"
    },
    {
      name: "Backpack",
      provider: window.backpack?.solana || (direct?.isBackpack ? direct : null),
      mobile: false,
      accent: "backpack",
      description: "Good for multi-wallet users"
    },
    {
      name: "Solflare",
      provider: window.solflare || (direct?.isSolflare ? direct : null),
      mobile: false,
      accent: "solflare",
      description: "Popular native Solana wallet"
    }
  ];

  return candidates.filter((item) => item.provider);
}

export function getAvailableSolanaWallets() {
  return getProviderCandidates();
}

function ensureWalletSelectorStyles() {
  if (document.getElementById(WALLET_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = WALLET_STYLE_ID;
  style.textContent = `
    #${WALLET_MODAL_ID}[hidden] { display: none !important; }
    #${WALLET_MODAL_ID} {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    #${WALLET_MODAL_ID} .sf-wallet-overlay {
      position: absolute;
      inset: 0;
      background: rgba(6, 10, 23, 0.82);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    #${WALLET_MODAL_ID} .sf-wallet-dialog {
      position: relative;
      width: min(100%, 460px);
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.12);
      background:
        radial-gradient(circle at top, rgba(255,210,76,0.08), transparent 42%),
        linear-gradient(180deg, rgba(16,23,46,0.98), rgba(7,11,24,0.98));
      box-shadow: 0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
      color: #fff;
      padding: 24px;
      overflow: hidden;
    }
    #${WALLET_MODAL_ID} .sf-wallet-topline {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.86);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    #${WALLET_MODAL_ID} .sf-wallet-title {
      margin: 14px 0 8px;
      font-size: 28px;
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    #${WALLET_MODAL_ID} .sf-wallet-subtitle {
      margin: 0 0 18px;
      color: rgba(255,255,255,0.72);
      font-size: 14px;
      line-height: 1.5;
    }
    #${WALLET_MODAL_ID} .sf-wallet-list {
      display: grid;
      gap: 12px;
      margin-top: 18px;
    }
    #${WALLET_MODAL_ID} .sf-wallet-option {
      appearance: none;
      width: 100%;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 18px;
      background: rgba(255,255,255,0.04);
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      color: #fff;
      cursor: pointer;
      text-align: left;
      transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
    }
    #${WALLET_MODAL_ID} .sf-wallet-option:hover,
    #${WALLET_MODAL_ID} .sf-wallet-option:focus-visible {
      outline: none;
      transform: translateY(-1px);
      border-color: rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.08);
      box-shadow: 0 12px 26px rgba(0,0,0,0.22);
    }
    #${WALLET_MODAL_ID} .sf-wallet-icon {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.03em;
      flex: 0 0 auto;
      color: #fff;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
    }
    #${WALLET_MODAL_ID} .sf-wallet-icon.phantom { background: linear-gradient(135deg, #7c3aed, #a855f7); }
    #${WALLET_MODAL_ID} .sf-wallet-icon.backpack { background: linear-gradient(135deg, #16a34a, #22c55e); }
    #${WALLET_MODAL_ID} .sf-wallet-icon.solflare { background: linear-gradient(135deg, #f97316, #fb923c); }
    #${WALLET_MODAL_ID} .sf-wallet-copy { min-width: 0; flex: 1 1 auto; }
    #${WALLET_MODAL_ID} .sf-wallet-name { font-size: 16px; font-weight: 800; line-height: 1.2; display:block; }
    #${WALLET_MODAL_ID} .sf-wallet-desc { margin-top: 3px; color: rgba(255,255,255,0.66); font-size: 12px; line-height: 1.35; display:block; }
    #${WALLET_MODAL_ID} .sf-wallet-arrow { color: rgba(255,255,255,0.5); font-size: 20px; line-height: 1; flex: 0 0 auto; }
    #${WALLET_MODAL_ID} .sf-wallet-footer { margin-top: 16px; color: rgba(255,255,255,0.54); font-size: 12px; line-height: 1.45; }
    #${WALLET_MODAL_ID} .sf-wallet-close {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 38px;
      height: 38px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.85);
      cursor: pointer;
      font-size: 18px;
    }
    @media (max-width: 640px) {
      #${WALLET_MODAL_ID} { padding: 14px; }
      #${WALLET_MODAL_ID} .sf-wallet-dialog { padding: 20px 18px 18px; border-radius: 20px; }
      #${WALLET_MODAL_ID} .sf-wallet-title { font-size: 24px; }
      #${WALLET_MODAL_ID} .sf-wallet-option { padding: 13px 14px; }
    }
  `;
  document.head.appendChild(style);
}

function getWalletInitials(name) {
  if (name === "Solflare") return "SF";
  if (name === "Backpack") return "BP";
  return "PH";
}

function removeModal() {
  const existing = document.getElementById(WALLET_MODAL_ID);
  if (existing) existing.remove();
}

function createWalletOption(wallet) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sf-wallet-option";
  button.innerHTML = `
    <span class="sf-wallet-icon ${wallet.accent}">${getWalletInitials(wallet.name)}</span>
    <span class="sf-wallet-copy">
      <span class="sf-wallet-name">${wallet.name}</span>
      <span class="sf-wallet-desc">${wallet.description}</span>
    </span>
    <span class="sf-wallet-arrow">›</span>
  `;
  return button;
}

function showWalletSelector(wallets) {
  ensureWalletSelectorStyles();

  return new Promise((resolve) => {
    removeModal();

    const modal = document.createElement("div");
    modal.id = WALLET_MODAL_ID;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Choose wallet");

    const close = () => {
      removeModal();
      resolve(null);
    };

    modal.innerHTML = `
      <div class="sf-wallet-overlay"></div>
      <div class="sf-wallet-dialog">
        <button type="button" class="sf-wallet-close" aria-label="Close wallet selector">×</button>
        <div class="sf-wallet-topline">SuperFirulai • Wallet Connect</div>
        <h3 class="sf-wallet-title">Choose your wallet</h3>
        <p class="sf-wallet-subtitle">
          Select the wallet you want to use for register, claim or buy. If you need another account inside the same wallet, switch it inside the wallet app first.
        </p>
        <div class="sf-wallet-list"></div>
        <div class="sf-wallet-footer">
          Tip: disconnect first, then switch account inside Phantom, Solflare or Backpack, and connect again.
        </div>
      </div>
    `;

    const list = modal.querySelector(".sf-wallet-list");
    const overlay = modal.querySelector(".sf-wallet-overlay");
    const closeBtn = modal.querySelector(".sf-wallet-close");

    wallets.forEach((wallet) => {
      const button = createWalletOption(wallet);
      button.addEventListener("click", () => {
        removeModal();
        resolve(wallet);
      });
      list.appendChild(button);
    });

    overlay.addEventListener("click", close);
    closeBtn.addEventListener("click", close);

    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown, { once: true });

    document.body.appendChild(modal);
    const firstButton = list.querySelector(".sf-wallet-option");
    if (firstButton) firstButton.focus();
  });
}

export async function getPreferredSolanaProvider() {
  for (let i = 0; i < 25; i++) {
    const matches = getProviderCandidates();
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      return await showWalletSelector(matches);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return null;
}
