import { disconnectSolanaWallet, getAvailableSolanaWallets, getPreferredSolanaProvider, getWalletLabel, isMobileDevice, openInPreferredWallet, shortAddress } from "./wallet-provider.js";


function injectStyles() {
  if (document.getElementById("sf-claim-status-styles")) return;

  const style = document.createElement("style");
  style.id = "sf-claim-status-styles";
  style.textContent = `
    .sf-claim-card{margin-top:0;display:grid;gap:12px;padding:18px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-claim-row{display:grid;gap:12px}
    .sf-claim-note{color:#c9d5f3;font-size:14px;line-height:1.6;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 16px}
    .sf-claim-note strong{color:#fff}
    .sf-claim-note.ok{color:#8bf0b2}
    .sf-claim-note.warn{color:#ffd87d}
    .sf-claim-note.error{color:#ffb2b2}
    .sf-claim-actions{display:flex;flex-wrap:wrap;gap:10px}
    .sf-claim-wallet-tools{display:none;flex-wrap:wrap;gap:10px}
    .sf-claim-wallet-tools.show{display:flex}
    .sf-claim-inline{display:flex;flex-wrap:wrap;gap:10px}
    .sf-btn-disabled{display:inline-flex;align-items:center;justify-content:center;padding:13px 18px;border-radius:14px;border:1px solid rgba(255,216,77,.28);background:rgba(255,216,77,.18);color:rgba(255,255,255,.72);font-weight:800;letter-spacing:.04em;cursor:not-allowed}
  `;
  document.head.appendChild(style);
}

export function mountClaimStatus(selector = "#airdrop-claim-status") {
  injectStyles();

  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `
    <div class="sf-claim-card">
      <div class="sf-claim-actions">
        <button id="sf-claim-connect" class="btn btn-blue" type="button">Connect Wallet</button>
        <button id="sf-claim-open-phantom" class="btn btn-dark" type="button" style="display:none">Open in Phantom</button>
        <div id="sf-claim-wallet-tools" class="sf-claim-wallet-tools">
          <button id="sf-claim-disconnect" class="btn btn-dark" type="button">Disconnect</button>
          <button id="sf-claim-switch" class="btn btn-dark" type="button">Use Another Wallet</button>
        </div>
      </div>
      <div id="sf-claim-wallet" class="sf-claim-note warn">Connect the same wallet used during registration.</div>
      <div id="sf-claim-status" class="sf-claim-note">After connecting, the site will check if your wallet is not registered, pending, approved, rejected or already claimed.</div>
      <div id="sf-claim-cta" class="sf-claim-row"></div>
    </div>
  `;

  const connectBtn = root.querySelector("#sf-claim-connect");
  const openPhantomBtn = root.querySelector("#sf-claim-open-phantom");
  const walletToolsEl = root.querySelector("#sf-claim-wallet-tools");
  const disconnectBtn = root.querySelector("#sf-claim-disconnect");
  const switchBtn = root.querySelector("#sf-claim-switch");
  const walletEl = root.querySelector("#sf-claim-wallet");
  const statusEl = root.querySelector("#sf-claim-status");
  const ctaEl = root.querySelector("#sf-claim-cta");

  function setWalletMessage(html, tone = "warn") {
    walletEl.className = `sf-claim-note ${tone}`;
    walletEl.innerHTML = html;
  }

  function setStatusMessage(html, tone = "") {
    statusEl.className = `sf-claim-note ${tone}`.trim();
    statusEl.innerHTML = html;
  }

  let connectedProvider = null;

  function showOpenWalletButton(show) {
    openPhantomBtn.style.display = show ? "inline-flex" : "none";
  }

  function showWalletTools(show) {
    walletToolsEl.classList.toggle("show", Boolean(show));
  }

  function resetWalletUi(message = "Connect the same wallet used during registration.") {
    connectedProvider = null;
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect Wallet";
    connectBtn.onclick = null;
    showWalletTools(false);
    setWalletMessage(message, "warn");
    ctaEl.innerHTML = "";
  }

  function renderCta(state, data) {
    if (state === "approved" && data.claimLive) {
      ctaEl.innerHTML = `
        <div class="sf-claim-inline">
          <button class="btn btn-gold" type="button" disabled title="Claim endpoint not mounted yet">CLAIM $FIRU</button>
        </div>
      `;
      return;
    }

    if (state === "approved") {
      ctaEl.innerHTML = `
        <div class="sf-claim-inline">
          <span class="sf-btn-disabled" aria-disabled="true">CLAIM AFTER LAUNCH</span>
        </div>
      `;
      return;
    }

    if (state === "pending") {
      ctaEl.innerHTML = ``;
      return;
    }

    if (state === "not_registered") {
      ctaEl.innerHTML = `
        <div class="sf-claim-inline">
          <a class="btn btn-gold" href="#register">Register Access</a>
        </div>
      `;
      return;
    }

    if (state === "claimed") {
      ctaEl.innerHTML = `<div class="sf-btn-disabled" aria-disabled="true">CLAIMED</div>`;
      return;
    }

    ctaEl.innerHTML = "";
  }

  async function checkClaimStatus(wallet) {
    const resp = await fetch(`/api/airdrop/claim-status?wallet=${encodeURIComponent(wallet)}`, {
      cache: "no-store"
    });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || "Could not check claim status");
    }

    return data;
  }

  openPhantomBtn.addEventListener("click", () => openInPreferredWallet("#claim"));

  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = "Checking wallet...";
      setStatusMessage("Checking wallet provider...", "warn");

      const preferredWallet = await getPreferredSolanaProvider();
      const provider = preferredWallet?.provider;
      const providerLabel = preferredWallet?.name || getWalletLabel(preferredWallet?.provider);
      if (!provider) {
        if (isMobileDevice()) {
          connectBtn.disabled = false;
          connectBtn.textContent = "Open in Wallet";
          connectBtn.onclick = () => openInPreferredWallet("#claim");
          showOpenWalletButton(false);
          setWalletMessage("<strong>Mobile detected.</strong> Open this page inside your wallet browser, then tap Connect Wallet again.", "warn");
          setStatusMessage("No wallet provider is available in this browser. Open the page inside Phantom or use a desktop wallet extension and try again.", "warn");
          return;
        }

        connectBtn.disabled = false;
        connectBtn.textContent = "Retry Wallet Detection";
        connectBtn.onclick = () => window.location.reload();
        setWalletMessage("<strong>No compatible wallet found.</strong> Install or enable Phantom, Backpack or Solflare, then reload the page.", "error");
        setStatusMessage("No compatible wallet provider is available in this browser.", "error");
        return;
      }

      connectBtn.textContent = "Connecting...";
      const connectRes = await provider.connect();
      connectedProvider = provider;
      const walletAddress = connectRes.publicKey.toString();
      setWalletMessage(`<strong>${providerLabel} connected:</strong> ${shortAddress(walletAddress)}`, "ok");
      setStatusMessage("Checking wallet status...", "warn");

      const data = await checkClaimStatus(walletAddress);
      renderCta(data.state, data);

      if (data.state === "approved") {
        const amountLine = data.airdropAmount ? `<br>Airdrop amount: <strong>${Number(data.airdropAmount).toLocaleString("en-US")} $FIRU</strong>` : "";
        setStatusMessage(`<strong>${data.message}</strong>${amountLine}`, data.claimLive ? "ok" : "warn");
      } else if (data.state === "pending") {
        setStatusMessage(`<strong>${data.message}</strong><br>Your wallet is already registered and still waiting for review.`, "warn");
      } else if (data.state === "rejected") {
        setStatusMessage(`<strong>${data.message}</strong>`, "error");
      } else if (data.state === "claimed") {
        const txLine = data.claimTx ? `<br>Claim TX: <code>${data.claimTx}</code>` : "";
        setStatusMessage(`<strong>${data.message}</strong>${txLine}`, "ok");
      } else {
        setStatusMessage(`<strong>${data.message}</strong>`, "warn");
      }

      connectBtn.textContent = shortAddress(walletAddress);
      connectBtn.disabled = true;
      showWalletTools(true);
      showOpenWalletButton(false);
    } catch (err) {
      resetWalletUi();
      setStatusMessage(err?.message || "Could not check claim status.", "error");
    }
  });

  disconnectBtn.addEventListener("click", async () => {
    await disconnectSolanaWallet(connectedProvider);
    resetWalletUi("Wallet disconnected");
    setStatusMessage("Wallet disconnected. Connect again with the same or another account to check claim status.", "warn");
  });

  switchBtn.addEventListener("click", async () => {
    await disconnectSolanaWallet(connectedProvider);
    resetWalletUi("Choose another wallet account and connect again.");
    if (isMobileDevice()) {
      openInPreferredWallet("#claim");
      setStatusMessage("Open your wallet, switch account there, then tap Connect Wallet again.", "warn");
      return;
    }
    setStatusMessage("Open Phantom, Backpack or Solflare, switch account there, then tap Connect Wallet again.", "warn");
  });

  if (isMobileDevice() && !getAvailableSolanaWallets().length) {
    showOpenWalletButton(true);
  }
}
