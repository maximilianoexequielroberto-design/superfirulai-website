// Premium Phantom + Airdrop UX
// Replace your current airdrop-register.js with this file

(function () {
  const PHANTOM_DEEPLINK_BASE = "https://phantom.app/ul/browse/";
  const MOBILE_RE = /Android|iPhone|iPad|iPod/i;

  function isMobile() {
    return MOBILE_RE.test(navigator.userAgent);
  }

  function currentUrl() {
    return window.location.href.split("#")[0] + "#airdrop";
  }

  function openInPhantom() {
    const target = encodeURIComponent(currentUrl());
    window.location.href = `${PHANTOM_DEEPLINK_BASE}${target}`;
  }

  async function getProviderSafe() {
    if (window.solana?.isPhantom) return window.solana;

    for (let i = 0; i < 25; i++) {
      if (window.solana?.isPhantom) return window.solana;
      await new Promise((r) => setTimeout(r, 120));
    }

    return null;
  }

  function createEl(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "className") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    });
    if (text) el.textContent = text;
    return el;
  }

  function findRoot() {
    return (
      document.getElementById("phantom-container") ||
      document.getElementById("connectWalletWrap") ||
      document.getElementById("wallet-connect") ||
      document.querySelector("[data-phantom-container]") ||
      document.querySelector(".wallet-connect-wrap") ||
      document.querySelector(".airdrop-wallet-box")
    );
  }

  function findWalletLabel() {
    return (
      document.getElementById("walletAddress") ||
      document.getElementById("wallet-address") ||
      document.getElementById("walletStatus") ||
      document.querySelector("[data-wallet-address]")
    );
  }

  function findRegisterButton() {
    return (
      document.getElementById("registerAirdrop") ||
      document.getElementById("register-airdrop") ||
      document.querySelector("[data-register-airdrop]") ||
      Array.from(document.querySelectorAll("button")).find((b) =>
        /register airdrop/i.test((b.textContent || "").trim())
      )
    );
  }

  function shortWallet(addr) {
    if (!addr || addr.length < 10) return addr || "";
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  }

  function injectStyles() {
    if (document.getElementById("phantom-premium-styles")) return;

    const style = createEl("style", { id: "phantom-premium-styles" });
    style.textContent = `
      .pf-wallet-shell{
        display:flex;flex-direction:column;gap:12px;margin-bottom:16px;
      }
      .pf-wallet-btn{
        width:100%;border:none;border-radius:22px;padding:18px 18px;
        font-weight:800;font-size:16px;cursor:pointer;
        background:linear-gradient(180deg,#35a2ff 0%,#1a73ff 100%);
        color:#fff;box-shadow:0 10px 30px rgba(30,115,255,.22);
        transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
      }
      .pf-wallet-btn:active{transform:translateY(1px) scale(.995);}
      .pf-wallet-btn:hover{box-shadow:0 14px 32px rgba(30,115,255,.28);}
      .pf-wallet-btn[disabled]{opacity:.75;cursor:default;}
      .pf-wallet-btn-secondary{
        background:linear-gradient(180deg,#1d2442 0%,#121933 100%);
        color:#dce6ff;border:1px solid rgba(255,255,255,.08);
        box-shadow:none;
      }
      .pf-wallet-note{
        color:#cfd7f7;font-size:14px;line-height:1.5;opacity:.95;
        background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);
        border-radius:18px;padding:14px 16px;
      }
      .pf-wallet-note strong{color:#fff;}
      .pf-wallet-ok{color:#77e0a1;}
      .pf-wallet-warn{color:#ffd16a;}
      .pf-wallet-error{color:#ff9a9a;}
    `;
    document.head.appendChild(style);
  }

  function setRegisterState(enabled) {
    const btn = findRegisterButton();
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "1" : "0.7";
    btn.style.filter = enabled ? "none" : "grayscale(0.1)";
  }

  async function connectWallet({ statusEl, btnEl }) {
    btnEl.disabled = true;
    btnEl.textContent = "Connecting...";
    statusEl.className = "pf-wallet-note pf-wallet-warn";
    statusEl.innerHTML = "<strong>Checking Phantom...</strong> Please wait a moment.";

    const provider = await getProviderSafe();

    if (!provider) {
      if (isMobile()) {
        statusEl.className = "pf-wallet-note pf-wallet-warn";
        statusEl.innerHTML = "<strong>Mobile detected.</strong> Open this page inside Phantom to connect your wallet.";
        btnEl.disabled = false;
        btnEl.textContent = "Open in Phantom";
        btnEl.onclick = openInPhantom;
        return;
      }

      statusEl.className = "pf-wallet-note pf-wallet-error";
      statusEl.innerHTML = "<strong>Phantom not found.</strong> Install or enable the Phantom extension in this browser.";
      btnEl.disabled = false;
      btnEl.textContent = "Retry Wallet Detection";
      btnEl.onclick = () => connectWallet({ statusEl, btnEl });
      return;
    }

    try {
      const response = await provider.connect();
      const address = response?.publicKey?.toString?.() || "";
      const walletLabel = findWalletLabel();

      if (walletLabel) {
        walletLabel.textContent = address || "Wallet connected";
      }

      statusEl.className = "pf-wallet-note pf-wallet-ok";
      statusEl.innerHTML = `<strong>Wallet connected.</strong> ${shortWallet(address)} is ready for airdrop registration.`;

      btnEl.textContent = "Wallet Connected";
      btnEl.disabled = true;
      setRegisterState(true);
    } catch (err) {
      statusEl.className = "pf-wallet-note pf-wallet-error";
      statusEl.innerHTML = `<strong>Connection failed.</strong> ${err?.message || "Please try again."}`;
      btnEl.disabled = false;
      btnEl.textContent = "Connect Wallet";
    }
  }

  function renderPremiumWalletUX() {
    injectStyles();

    const root = findRoot();
    if (!root) return;

    root.innerHTML = "";

    const shell = createEl("div", { className: "pf-wallet-shell" });
    const status = createEl(
      "div",
      { className: "pf-wallet-note pf-wallet-warn", id: "pf-wallet-status" },
      isMobile()
        ? "Mobile detected. Use Phantom browser for the smoothest wallet connection."
        : "Connect your Phantom wallet to continue with verified registration."
    );

    const primaryBtn = createEl(
      "button",
      { className: "pf-wallet-btn", type: "button", id: "connectWallet" },
      "Connect Wallet"
    );

    if (isMobile() && !window.solana?.isPhantom) {
      primaryBtn.textContent = "Open in Phantom";
      primaryBtn.onclick = openInPhantom;
    } else {
      primaryBtn.onclick = () => connectWallet({ statusEl: status, btnEl: primaryBtn });
    }

    shell.appendChild(primaryBtn);

    if (isMobile() && !window.solana?.isPhantom) {
      const secondary = createEl(
        "button",
        { className: "pf-wallet-btn pf-wallet-btn-secondary", type: "button" },
        "I already opened Phantom"
      );
      secondary.onclick = () => connectWallet({ statusEl: status, btnEl: primaryBtn });
      shell.appendChild(secondary);
    }

    shell.appendChild(status);
    root.appendChild(shell);

    const providerAlready = window.solana?.isPhantom;
    setRegisterState(!!providerAlready);

    if (providerAlready && window.solana?.publicKey) {
      const walletLabel = findWalletLabel();
      const address = window.solana.publicKey.toString();
      if (walletLabel) walletLabel.textContent = address;

      status.className = "pf-wallet-note pf-wallet-ok";
      status.innerHTML = `<strong>Wallet detected.</strong> ${shortWallet(address)} is already available.`;
      primaryBtn.textContent = "Wallet Connected";
      primaryBtn.disabled = true;
      setRegisterState(true);
    }
  }

  document.addEventListener("DOMContentLoaded", renderPremiumWalletUX);
})();
