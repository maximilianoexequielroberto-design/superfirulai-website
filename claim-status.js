import { getAvailableSolanaWallets, getPreferredSolanaProvider, isMobileDevice, openInPreferredWallet, shortAddress } from "./wallet-provider.js";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const CLAIM_TESTING_MODE = false;

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

function injectStyles() {
  if (document.getElementById("sf-claim-status-styles")) return;

  const style = document.createElement("style");
  style.id = "sf-claim-status-styles";
  style.textContent = `
    .sf-claim-stack{display:grid;gap:14px}
    .sf-claim-switcher{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .sf-claim-switch{display:inline-flex;align-items:center;justify-content:center;padding:13px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:#dce8ff;font-size:13px;font-weight:900;letter-spacing:.02em;cursor:pointer;transition:.18s ease}
    .sf-claim-switch.active{border-color:rgba(255,216,77,.34);background:linear-gradient(180deg, rgba(255,216,77,.18), rgba(255,216,77,.1));color:#fff;box-shadow:0 0 0 1px rgba(255,216,77,.06) inset}
    .sf-claim-panel[hidden]{display:none !important}
    .sf-claim-card{
      position:relative;
      overflow:hidden;
      margin-top:0;
      display:grid;
      gap:8px;
      padding:14px;
      border-radius:24px;
      border:1px solid rgba(255,255,255,.08);
      background:
        radial-gradient(circle at top right, rgba(86,196,255,.14), transparent 34%),
        radial-gradient(circle at bottom left, rgba(255,216,77,.10), transparent 36%),
        rgba(10,18,34,.82);
      box-shadow:0 20px 50px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04);
    }
    .sf-claim-card.round-claim{
      background:
        radial-gradient(circle at top right, rgba(255,216,77,.16), transparent 34%),
        radial-gradient(circle at bottom left, rgba(86,196,255,.12), transparent 36%),
        rgba(10,18,34,.82);
    }
    .sf-claim-eyebrow{
      display:inline-flex;
      width:max-content;
      align-items:center;
      gap:8px;
      padding:7px 12px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.1);
      background:rgba(255,255,255,.04);
      color:#dff3ff;
      font-size:11px;
      font-weight:900;
      letter-spacing:.14em;
      text-transform:uppercase;
    }
    .sf-claim-title{margin:0;color:#fff;font-size:22px;line-height:1.08;letter-spacing:-.02em}
    .sf-claim-subtitle{margin:0;color:#c8d6f2;font-size:13px;line-height:1.48}
    .sf-claim-steps{display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:7px}
    .sf-claim-step{display:grid;gap:4px;padding:9px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);min-height:68px}
    .sf-claim-step-id{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#eef6ff;font-size:12px;font-weight:900}
    .sf-claim-step strong{color:#fff;font-size:13px;line-height:1.25}
    .sf-claim-step span{color:#bfccea;font-size:12px;line-height:1.45}
    .sf-claim-step.done{border-color:rgba(111,236,170,.28);background:rgba(111,236,170,.08)}
    .sf-claim-step.done .sf-claim-step-id{border-color:rgba(111,236,170,.36);background:rgba(111,236,170,.18);color:#9df7c2}
    .sf-claim-step.active{border-color:rgba(255,216,77,.34);background:rgba(255,216,77,.10);box-shadow:0 0 0 1px rgba(255,216,77,.06) inset}
    .sf-claim-step.active .sf-claim-step-id{border-color:rgba(255,216,77,.4);background:rgba(255,216,77,.16);color:#ffe38d}
    .sf-claim-actions,.sf-claim-wallet-tools,.sf-claim-inline{display:flex;flex-wrap:wrap;gap:10px}
    .sf-claim-wallet-tools{display:none}
    .sf-claim-wallet-tools.show{display:flex}
    .sf-claim-module{display:grid;gap:8px;padding:12px;border-radius:20px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-claim-note{color:#c9d5f3;font-size:13px;line-height:1.5;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px 14px}
    .sf-claim-note strong{color:#fff}
    .sf-claim-note.ok{color:#8bf0b2;border-color:rgba(111,236,170,.22);background:rgba(111,236,170,.08)}
    .sf-claim-note.warn{color:#ffd87d;border-color:rgba(255,216,77,.22);background:rgba(255,216,77,.08)}
    .sf-claim-note.error{color:#ffb2b2;border-color:rgba(255,120,120,.22);background:rgba(255,120,120,.08)}
    .sf-claim-testing{color:#d7e6ff;font-size:12px;line-height:1.5;padding:10px 12px;border-radius:14px;border:1px dashed rgba(86,196,255,.24);background:rgba(86,196,255,.06)}
    .sf-btn-disabled{display:inline-flex;align-items:center;justify-content:center;padding:13px 18px;border-radius:14px;border:1px solid rgba(255,216,77,.28);background:rgba(255,216,77,.18);color:rgba(255,255,255,.72);font-weight:800;letter-spacing:.04em;cursor:not-allowed}
    .sf-claim-code{word-break:break-all}
    .sf-round-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .sf-round-stat{display:grid;gap:4px;padding:10px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}
    .sf-round-stat strong{color:#8fb3ff;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
    .sf-round-stat span{color:#fff;font-size:15px;font-weight:800;line-height:1.3;word-break:break-word}
    @media (max-width:640px){
      .sf-claim-card{padding:15px;border-radius:22px}
      .sf-claim-title{font-size:20px}
      .sf-claim-steps,.sf-round-summary{grid-template-columns:1fr}
      .sf-claim-step{min-height:auto;padding:10px}
      .sf-claim-actions .btn,.sf-claim-wallet-tools .btn,.sf-claim-inline .btn,.sf-btn-disabled{width:100%;justify-content:center}
    }
  `;
  document.head.appendChild(style);
}

function formatWhole(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function renderTestingNotice(copy) {
  return `<div class="sf-claim-testing"><strong>Testing mode.</strong> ${copy}</div>`;
}

async function requestClaimNonce() {
  const resp = await fetch("/api/airdrop/nonce", { cache: "no-store" });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Failed to get claim nonce");
  return data;
}

function getClaimMessage({ wallet, nonce, timestamp }) {
  return [
    "SuperFirulai Airdrop Claim",
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${timestamp}`
  ].join("\n");
}

async function signAirdropClaim(provider, wallet) {
  if (!provider?.signMessage) {
    throw new Error("This wallet cannot sign messages for claim.");
  }

  const nonceData = await requestClaimNonce();
  const signedMessage = getClaimMessage({
    wallet,
    nonce: nonceData.nonce,
    timestamp: nonceData.timestamp
  });

  const encoded = new TextEncoder().encode(signedMessage);
  const sig = await provider.signMessage(encoded, "utf8");
  const rawSignature = sig?.signature || sig;
  const signature = window.bs58?.encode
    ? window.bs58.encode(rawSignature)
    : encodeBase58(rawSignature);

  return {
    wallet,
    signed_message: signedMessage,
    signature,
    nonce: nonceData.nonce,
    timestamp: nonceData.timestamp,
    challenge: nonceData.challenge
  };
}

async function submitAirdropClaim(payload) {
  const resp = await fetch("/api/airdrop/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Claim failed");
  return data;
}

export function mountClaimStatus(selector = "#airdrop-claim-status") {
  injectStyles();

  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `
    <div class="sf-claim-stack">
      <div class="sf-claim-card sf-claim-panel" id="sf-airdrop-claim-card" data-claim-panel="airdrop">
        <div class="sf-claim-eyebrow">Claim Airdrop · Premium</div>
        <h3 class="sf-claim-title">Claim Airdrop with the same wallet</h3>
        <p class="sf-claim-subtitle">Connect the same wallet from registration. The page checks status first and unlocks claim only for approved wallets. Manual $FIRU delivery is processed after claim through the current project distribution flow.</p>

        <div id="sf-claim-steps" class="sf-claim-steps">
          <div class="sf-claim-step active" data-step="1"><div class="sf-claim-step-id">1</div><strong>Connect Wallet</strong><span>Use the same wallet from registration.</span></div>
          <div class="sf-claim-step" data-step="2"><div class="sf-claim-step-id">2</div><strong>Check Status</strong><span>Pending, approved, rejected or claimed.</span></div>
          <div class="sf-claim-step" data-step="3"><div class="sf-claim-step-id">3</div><strong>Approved Only</strong><span>Only approved wallets continue.</span></div>
          <div class="sf-claim-step" data-step="4"><div class="sf-claim-step-id">4</div><strong>Claim Airdrop</strong><span>Manual delivery after claim.</span></div>
        </div>

        <div class="sf-claim-module">
          <div class="sf-claim-actions">
            <button id="sf-claim-connect" class="btn btn-blue" type="button">Connect Wallet</button>
            <button id="sf-claim-open-phantom" class="btn btn-dark" type="button" style="display:none">Open Wallet</button>
            <div id="sf-claim-wallet-tools" class="sf-claim-wallet-tools">
              <button id="sf-claim-disconnect" class="btn btn-dark" type="button">Disconnect</button>
              <button id="sf-claim-switch" class="btn btn-dark" type="button">Change Wallet</button>
            </div>
          </div>
          <div id="sf-claim-wallet" class="sf-claim-note warn">Connect the same wallet from registration.</div>
          <div id="sf-claim-status" class="sf-claim-note">After connecting, the page checks if that wallet is pending, approved, rejected or already claimed.</div>
          <div id="sf-claim-cta" class="sf-claim-row"></div>
        </div>
      </div>
    </div>
  `;

  mountAirdropClaim(root);
}

function mountAirdropClaim(root) {
  const connectBtn = root.querySelector("#sf-claim-connect");
  const openPhantomBtn = root.querySelector("#sf-claim-open-phantom");
  const walletToolsEl = root.querySelector("#sf-claim-wallet-tools");
  const disconnectBtn = root.querySelector("#sf-claim-disconnect");
  const switchBtn = root.querySelector("#sf-claim-switch");
  const walletEl = root.querySelector("#sf-claim-wallet");
  const statusEl = root.querySelector("#sf-claim-status");
  const ctaEl = root.querySelector("#sf-claim-cta");
  const stepsEl = root.querySelector("#sf-claim-steps");

  function setStepState(current = 1, approved = false, claimed = false) {
    const steps = stepsEl.querySelectorAll(".sf-claim-step");
    steps.forEach((stepEl, index) => {
      const step = index + 1;
      stepEl.classList.remove("active", "done");
      if (claimed) {
        stepEl.classList.add("done");
        return;
      }
      if (approved && step <= 3) {
        stepEl.classList.add("done");
      }
      if (step < current) stepEl.classList.add("done");
      else if (step === current) stepEl.classList.add("active");
    });
  }

  function setWalletMessage(html, tone = "warn") {
    walletEl.className = `sf-claim-note ${tone}`;
    walletEl.innerHTML = html;
  }

  function setStatusMessage(html, tone = "") {
    statusEl.className = `sf-claim-note ${tone}`.trim();
    statusEl.innerHTML = html;
  }

  let connectedProvider = null;
  let connectedWallet = "";

  function showOpenWalletButton(show) {
    openPhantomBtn.style.display = show ? "inline-flex" : "none";
  }

  function showWalletTools(show) {
    walletToolsEl.classList.toggle("show", Boolean(show));
  }

  function resetWalletUi(message = "Connect the same wallet from registration.") {
    connectedProvider = null;
    connectedWallet = "";
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect Wallet";
    connectBtn.onclick = null;
    showWalletTools(false);
    setWalletMessage(message, "warn");
    setStatusMessage("After connecting, the page checks if that wallet is pending, approved, rejected or already claimed.");
    ctaEl.innerHTML = "";
    setStepState(1, false, false);
  }

  function renderCta(state, data) {
    if (state === "approved" && data.claimLive) {
      ctaEl.innerHTML = `
        <div class="sf-claim-row">
          <div class="sf-claim-inline"><button id="sf-claim-submit" class="btn btn-gold" type="button">Claim Airdrop</button></div>
          ${renderTestingNotice(data.claimLive
            ? "This flow marks the approved wallet as claimed in Supabase after a fresh wallet signature. Token delivery remains manual after claim."
            : "This flow now attempts the real test/manual claim endpoint. If the backend claim window is still closed, the server will reject it until CLAIM_LIVE is enabled.")}
        </div>`;
      root.querySelector("#sf-claim-submit")?.addEventListener("click", async () => {
        setStepState(4, true, false);
        const wallet = connectedWallet || data.wallet || "";
        const provider = connectedProvider;
        const submitBtn = root.querySelector("#sf-claim-submit");
        if (!wallet || !provider) {
          setStatusMessage("Connect the approved wallet again before claiming.", "error");
          return;
        }

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = "Signing claim...";
          setStatusMessage(`<strong>Claim signature required.</strong><br>Approve the signature in your wallet to continue the test/manual claim flow.`, "warn");

          const claimPayload = await signAirdropClaim(provider, wallet);
          submitBtn.textContent = "Submitting claim...";
          const result = await submitAirdropClaim(claimPayload);

          ctaEl.innerHTML = `<div class="sf-btn-disabled" aria-disabled="true">CLAIMED</div>`;
          setStatusMessage(`<strong>${result.message || "Airdrop claim confirmed."}</strong><br>Claim TX: <code class="sf-claim-code">${result.claimTx || "test-claim"}</code><br>Airdrop amount: <strong>${Number(result.airdropAmount || 0).toLocaleString("en-US")} $FIRU</strong><br>Manual token delivery is processed through the current project distribution flow after claim confirmation.`, "ok");
          setStepState(4, false, true);
        } catch (err) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Claim Airdrop";
          }
          setStatusMessage(err?.message || "Claim failed.", "error");
        }
      });
      return;
    }
    if (state === "approved") {
      ctaEl.innerHTML = `<div class="sf-claim-inline"><span class="sf-btn-disabled" aria-disabled="true">CLAIM AFTER LAUNCH</span></div>`;
      return;
    }
    if (state === "not_registered") {
      ctaEl.innerHTML = `<div class="sf-claim-inline"><a class="btn btn-gold" href="#register">Register Airdrop</a></div>`;
      return;
    }
    if (state === "claimed") {
      ctaEl.innerHTML = `<div class="sf-btn-disabled" aria-disabled="true">CLAIMED</div>`;
      return;
    }
    ctaEl.innerHTML = "";
  }

  async function checkClaimStatus(wallet) {
    const resp = await fetch(`/api/airdrop/claim-status?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Could not check claim status");
    return data;
  }

  openPhantomBtn.addEventListener("click", () => openInPreferredWallet("#claim"));

  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = "Checking wallet...";
      setStepState(1, false, false);
      setStatusMessage("Checking wallet provider...", "warn");

      const preferredWallet = await getPreferredSolanaProvider();
      const provider = preferredWallet?.provider;
      const providerLabel = preferredWallet?.name || getWalletLabel(provider);
      if (!provider) {
        if (isMobileDevice()) {
          connectBtn.disabled = false;
          connectBtn.textContent = "Open Wallet";
          connectBtn.onclick = () => openInPreferredWallet("#claim");
          showOpenWalletButton(false);
          setWalletMessage("<strong>Mobile detected.</strong> Open this page inside your wallet browser and tap Connect Wallet again.", "warn");
          setStatusMessage("No wallet provider is available here. Open the page inside Phantom or use a desktop wallet extension.", "warn");
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
      connectedWallet = connectRes.publicKey.toString();
      setStepState(2, false, false);
      setWalletMessage(`<strong>${providerLabel} connected:</strong> ${shortAddress(connectedWallet)}`, "ok");
      setStatusMessage("Checking wallet status...", "warn");

      const data = await checkClaimStatus(connectedWallet);
      renderCta(data.state, data);

      if (data.state === "approved") {
        const amountLine = data.airdropAmount ? `<br>Airdrop amount: <strong>${Number(data.airdropAmount).toLocaleString("en-US")} $FIRU</strong>` : "";
        setStatusMessage(`<strong>${data.message}</strong>${amountLine}<br>Approved airdrop claims are processed manually through the current project distribution flow after claim confirmation.`, "ok");
        setStepState(4, true, false);
      } else if (data.state === "pending") {
        setStatusMessage(`<strong>${data.message}</strong><br>This wallet is registered and still waiting for review.`, "warn");
        setStepState(3, false, false);
      } else if (data.state === "rejected") {
        setStatusMessage(`<strong>${data.message}</strong>`, "error");
        setStepState(3, false, false);
      } else if (data.state === "claimed") {
        const txLine = data.claimTx ? `<br>Claim TX: <code class="sf-claim-code">${data.claimTx}</code>` : "";
        setStatusMessage(`<strong>${data.message}</strong>${txLine}`, "ok");
        setStepState(4, false, true);
      } else {
        setStatusMessage(`<strong>${data.message}</strong>`, "warn");
        setStepState(2, false, false);
      }

      connectBtn.textContent = shortAddress(connectedWallet);
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
    setStatusMessage("Wallet disconnected. Connect again to check claim status.", "warn");
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

  if (isMobileDevice() && !getAvailableSolanaWallets().length) showOpenWalletButton(true);
}
