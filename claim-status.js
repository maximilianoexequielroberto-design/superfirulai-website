const PHANTOM_DEEPLINK_BASE = "https://phantom.app/ul/browse/";
const MOBILE_RE = /Android|iPhone|iPad|iPod/i;

function short(address) {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";
}

function isMobileDevice() {
  return MOBILE_RE.test(navigator.userAgent || "");
}

function currentUrl() {
  return window.location.href.split("#")[0] + "#claim";
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
      </div>
      <div id="sf-claim-wallet" class="sf-claim-note warn">Connect the same wallet used during registration.</div>
      <div id="sf-claim-status" class="sf-claim-note">After connecting, the site will check if your wallet is not registered, pending, approved, rejected or already claimed.</div>
      <div id="sf-claim-cta" class="sf-claim-row"></div>
    </div>
  `;

  const connectBtn = root.querySelector("#sf-claim-connect");
  const openPhantomBtn = root.querySelector("#sf-claim-open-phantom");
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

  function showOpenInPhantom(show) {
    openPhantomBtn.style.display = show ? "inline-flex" : "none";
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
          <a class="btn btn-dark" href="#register">VIEW STATUS</a>
        </div>
      `;
      return;
    }

    if (state === "pending") {
      ctaEl.innerHTML = `
        <div class="sf-claim-inline">
          <a class="btn btn-dark" href="#register">VIEW STATUS</a>
        </div>
      `;
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

  openPhantomBtn.addEventListener("click", openInPhantom);

  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = "Checking Phantom...";
      setStatusMessage("Checking wallet provider...", "warn");

      const provider = await getPhantomProvider();
      if (!provider) {
        if (isMobileDevice()) {
          connectBtn.disabled = false;
          connectBtn.textContent = "Open in Phantom";
          connectBtn.onclick = openInPhantom;
          showOpenInPhantom(false);
          setWalletMessage("<strong>Mobile detected.</strong> Open this page inside Phantom, then tap Connect Wallet again.", "warn");
          setStatusMessage("Phantom is not available in this browser. Open the page inside Phantom and try again.", "warn");
          return;
        }

        connectBtn.disabled = false;
        connectBtn.textContent = "Retry Wallet Detection";
        connectBtn.onclick = () => window.location.reload();
        setWalletMessage("<strong>Phantom not found.</strong> Install or enable the Phantom extension, then reload the page.", "error");
        setStatusMessage("Phantom is not available in this browser.", "error");
        return;
      }

      connectBtn.textContent = "Connecting...";
      const connectRes = await provider.connect();
      const walletAddress = connectRes.publicKey.toString();
      setWalletMessage(`<strong>Wallet connected:</strong> ${short(walletAddress)}`, "ok");
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

      connectBtn.textContent = "Wallet Checked";
      connectBtn.disabled = true;
      showOpenInPhantom(false);
    } catch (err) {
      connectBtn.disabled = false;
      connectBtn.textContent = "Connect Wallet";
      setStatusMessage(err?.message || "Could not check claim status.", "error");
    }
  });

  if (isMobileDevice() && !(window.phantom?.solana?.isPhantom || window.solana?.isPhantom)) {
    showOpenInPhantom(true);
  }
}
