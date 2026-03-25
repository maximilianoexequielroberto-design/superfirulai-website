
// SOL-only UX when inside Phantom (mobile)
// Keeps full flow on desktop/outside Phantom

function isInPhantom() {
  return !!(window.solana && window.solana.isPhantom);
}
function isMobile() {
  return /Android|iPhone|iPad/i.test(navigator.userAgent);
}

export function mountRoundRegister() {
  const tokenSelect = document.getElementById("sfPaymentToken");
  const usdtBlocks = document.querySelectorAll(".sf-stablecoin, .sf-usdt, .sf-usdc");
  const stableNotes = document.querySelectorAll(".sf-stable-note");
  const buySolBtn = document.getElementById("sfAutoBuyBtn");
  const connectBtn = document.getElementById("sfConnectBtn");

  // If inside Phantom on mobile → SOL only mode
  if (isMobile() && isInPhantom()) {
    // Force SOL
    if (tokenSelect) {
      tokenSelect.value = "SOL";
      tokenSelect.style.display = "none"; // hide selector
    }

    // Hide USDT/USDC related UI
    usdtBlocks.forEach(el => el.style.display = "none");
    stableNotes.forEach(el => el.style.display = "none");

    // Ensure SOL buttons visible
    if (buySolBtn) buySolBtn.style.display = "block";
    if (connectBtn) connectBtn.style.display = "block";

    // Small hint
    const hint = document.createElement("div");
    hint.className = "sf-round-note ok";
    hint.innerHTML = "<strong>Phantom mode:</strong> SOL automatic purchase enabled.";
    const container = document.getElementById("sfRoundWalletMsg");
    if (container && container.parentNode) {
      container.parentNode.insertBefore(hint, container.nextSibling);
    }
  }

  // Outside Phantom → keep original behavior (no overrides)
}
