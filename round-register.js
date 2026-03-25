
// FINAL: Contextual UX + Phantom SOL-only + Ordered USDT/USDC steps

const MOBILE_RE = /Android|iPhone|iPad/i;

function isMobileDevice() {
  return MOBILE_RE.test(navigator.userAgent || "");
}
function isInPhantomBrowser() {
  return Boolean(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);
}

export function mountRoundRegister(root = document) {
  const tokenEl = root.querySelector("#sfPaymentToken");
  const amountEl = root.querySelector("#sfBuyAmount");
  const roundEl = root.querySelector("#sfRoundSelect");
  const txEl = root.querySelector("#sfTxHash");

  const connectBtn = root.querySelector("#sfRoundConnect");
  const openBtn = root.querySelector("#sfRoundOpenPhantom");
  const autoBuyBtn = root.querySelector("#sfRoundAutoBuy");
  const submitBtn = root.querySelector("#sfRoundSubmit");

  const tokenFieldWrap = tokenEl?.closest(".sf-field");
  const txFieldWrap = txEl?.closest(".sf-field");
  const destWrap = root.querySelector("#sfDestinationWrap"); // container with wallet + copy
  const hashWarningEl = root.querySelector("#sfHashWarning");
  const amountHintEl = root.querySelector("#sfAmountHint");

  const summaryCards = Array.from(root.querySelectorAll(".sf-summary .sf-mini"));

  function applyContextualUi() {
    const token = tokenEl?.value || "SOL";
    const phantomMobile = isMobileDevice() && isInPhantomBrowser();
    const mobileOutside = isMobileDevice() && !isInPhantomBrowser();

    // ---- PHANTOM MOBILE: SOL ONLY ----
    if (phantomMobile) {
      if (tokenEl) tokenEl.value = "SOL";
      if (tokenFieldWrap) tokenFieldWrap.style.display = "none";

      // hide all stable/manual elements
      if (txFieldWrap) txFieldWrap.style.display = "none";
      if (hashWarningEl) hashWarningEl.style.display = "none";
      if (submitBtn) submitBtn.style.display = "none";
      if (destWrap) destWrap.style.display = "none";

      // show SOL flow
      if (connectBtn) connectBtn.style.display = "";
      if (autoBuyBtn) autoBuyBtn.style.display = "";
      if (openBtn) openBtn.style.display = "none";

      // cards
      if (summaryCards[0]) summaryCards[0].style.display = ""; // Automatic SOL
      if (summaryCards[1]) summaryCards[1].style.display = "none"; // Stablecoin flow

      if (amountHintEl) {
        amountHintEl.textContent = "Phantom mode: connect your wallet and complete the SOL purchase below.";
      }
      return;
    }

    // ---- MOBILE OUTSIDE PHANTOM (SOL) ----
    if (mobileOutside && token === "SOL") {
      if (connectBtn) connectBtn.style.display = "none";
      if (openBtn) {
        openBtn.style.display = "";
        openBtn.textContent = "Open in Phantom App";
      }
      if (autoBuyBtn) autoBuyBtn.style.display = "none";
    }

    // ---- SOL (desktop / generic) ----
    if (token === "SOL") {
      if (tokenFieldWrap) tokenFieldWrap.style.display = "";
      if (txFieldWrap) txFieldWrap.style.display = "none";
      if (hashWarningEl) hashWarningEl.style.display = "none";
      if (submitBtn) submitBtn.style.display = "none";
      if (destWrap) destWrap.style.display = "";

      if (!mobileOutside) {
        if (connectBtn) connectBtn.style.display = "";
        if (autoBuyBtn) autoBuyBtn.style.display = "";
      }

      if (summaryCards[0]) summaryCards[0].style.display = "";
      if (summaryCards[1]) summaryCards[1].style.display = "none";

      if (amountHintEl) {
        amountHintEl.textContent = "Connect Phantom and use the automatic SOL purchase.";
      }
      return;
    }

    // ---- USDT / USDC (ordered steps) ----
    if (token === "USDT" || token === "USDC") {
      // hide Phantom/SOL actions
      if (connectBtn) connectBtn.style.display = "none";
      if (openBtn) openBtn.style.display = "none";
      if (autoBuyBtn) autoBuyBtn.style.display = "none";

      // show manual elements
      if (tokenFieldWrap) tokenFieldWrap.style.display = "";
      if (destWrap) destWrap.style.display = "";
      if (txFieldWrap) txFieldWrap.style.display = "";
      if (hashWarningEl) hashWarningEl.style.display = "grid";
      if (submitBtn) submitBtn.style.display = "";

      // ORDER: destination (copy) above hash
      if (destWrap && txFieldWrap && destWrap.nextElementSibling !== txFieldWrap) {
        destWrap.parentNode.insertBefore(destWrap, txFieldWrap);
      }

      // cards
      if (summaryCards[0]) summaryCards[0].style.display = "none";
      if (summaryCards[1]) summaryCards[1].style.display = "";

      if (amountHintEl) {
        amountHintEl.textContent = token + " flow: copy destination, send funds on Solana, then paste the transaction hash below.";
      }
      return;
    }
  }

  // simple valid amount feedback
  function validateAmount() {
    const v = Number(amountEl?.value || 0);
    const msg = root.querySelector("#sfAmountValidation");
    if (!msg || !amountEl) return;

    if (!v || v <= 0) {
      msg.textContent = "";
      amountEl.style.borderColor = "";
      return;
    }
    msg.textContent = "✔ Valid amount";
    msg.style.color = "#4ade80";
    amountEl.style.borderColor = "#4ade80";
  }

  // events
  [tokenEl, amountEl, roundEl, txEl].forEach(el => {
    if (!el) return;
    el.addEventListener("input", () => {
      applyContextualUi();
      validateAmount();
    });
  });

  // init
  applyContextualUi();
  validateAmount();
}
