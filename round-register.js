
// FINAL MOBILE PHANTOM UX (AUTO CONNECT INSIDE PHANTOM)

function isInPhantom() {
  return !!(window.solana && window.solana.isPhantom);
}

function isMobile() {
  return /Android|iPhone|iPad/i.test(navigator.userAgent);
}

function openInPhantom() {
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  window.location.href = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
}

export function mountRoundRegister() {
  const connectBtn = document.getElementById("sfConnectBtn");
  const openBtn = document.getElementById("sfOpenPhantomBtn");

  if (!connectBtn || !openBtn) return;

  // OUTSIDE PHANTOM
  if (isMobile() && !isInPhantom()) {
    connectBtn.style.display = "none";
    openBtn.style.display = "block";
    openBtn.textContent = "OPEN IN PHANTOM APP";

    openBtn.onclick = () => {
      openInPhantom();
    };

    return;
  }

  // INSIDE PHANTOM
  if (isInPhantom()) {
    connectBtn.style.display = "block";
    openBtn.style.display = "none";
    connectBtn.textContent = "CONNECT WALLET";

    // AUTO TRIGGER CONNECT
    setTimeout(async () => {
      try {
        const provider = window.solana;
        await provider.connect();
        connectBtn.textContent = "WALLET CONNECTED";
      } catch (e) {
        // user rejected, ignore
      }
    }, 800);

    connectBtn.onclick = async () => {
      try {
        const provider = window.solana;
        await provider.connect();
        connectBtn.textContent = "WALLET CONNECTED";
      } catch (e) {}
    };
  }
}
