import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL
} from "https://esm.sh/@solana/web3.js@1.98.4";

import {
  shortAddress,
  openInPreferredWallet,
  getPreferredSolanaProvider
} from "./wallet-provider.js";

const MOBILE_RE = /Android|iPhone|iPad|iPod/i;
const CONFIG_ENDPOINT = "/api/round/config";
const TOKEN_ORDER = ["SOL", "USDT", "USDC"];

function short(address) {
  return address ? `${address.slice(0, 4)}...${address.slice(-4)}` : "";
}

function isMobileDevice() {
  return MOBILE_RE.test(navigator.userAgent || "");
}

function isInPhantomBrowser() {
  return Boolean(window.phantom?.solana?.isPhantom || window.solana?.isPhantom);
}

function injectStyles() {
  if (document.getElementById("sf-round-styles")) return;
  const style = document.createElement("style");
  style.id = "sf-round-styles";
  style.textContent = `
    .sf-round-form{display:grid;gap:10px;position:relative;z-index:1}
     .sf-checkout-cluster{display:grid;gap:8px;padding:12px;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.028),rgba(255,255,255,.018));border:1px solid rgba(255,255,255,.07)}
    .sf-checkout-cluster .sf-row,.sf-checkout-cluster .sf-row-tight,.sf-checkout-cluster .sf-price-grid,.sf-checkout-cluster .sf-summary,.sf-checkout-cluster .sf-round-actions{margin:0}
    .sf-round-note{color:#c9d5f3;font-size:14px;line-height:1.6;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 16px}
    .sf-round-note strong{color:#fff}
    .sf-round-note.ok{color:#8bf0b2}
    .sf-round-note.warn{color:#ffd87d}
    .sf-round-note.error{color:#ffb2b2}
     .sf-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08)}
     .sf-row-tight{display:grid;grid-template-columns:1fr 180px 180px;gap:10px;padding:12px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08)}
    .sf-field{display:grid;gap:8px}
    .sf-copy-shell{display:flex;align-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;overflow:hidden}
    .sf-copy-shell .sf-input{flex:1;min-width:0}
    .sf-copy-btn{flex:0 0 auto;min-width:84px;height:52px;padding:0 14px;border:none;border-left:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#fff;font:inherit;font-weight:800;cursor:pointer;transition:background .18s ease,color .18s ease;white-space:nowrap}
    .sf-copy-btn:hover{background:rgba(255,255,255,.1)}
    .sf-copy-btn.copied{background:rgba(33,203,126,.18);color:#8bf0b2}
    #sfRoundSubmit{background:linear-gradient(135deg,#18a3ff,#6f8cff);color:#fff;border:1px solid rgba(143,179,255,.55);box-shadow:0 12px 30px rgba(24,163,255,.20)}
    #sfRoundSubmit:hover{filter:brightness(1.06);transform:translateY(-1px)}
    #sfRoundSubmit:disabled{background:rgba(255,255,255,.08);color:rgba(255,255,255,.52);border-color:rgba(255,255,255,.10);box-shadow:none;filter:none;transform:none}
    .sf-hash-warning{display:grid;gap:8px;padding:14px 16px;border-radius:16px;background:rgba(255,216,125,.08);border:1px solid rgba(255,216,125,.22);color:#ffe39d;font-size:13px;line-height:1.55}
    .sf-hash-warning strong{color:#fff}
    .sf-label{font-size:13px;font-weight:800;letter-spacing:.02em;color:#fff}
    .sf-handle-shell,.sf-input-shell{display:flex;align-items:center;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:#11182f;overflow:hidden}
    .sf-prefix{flex:0 0 auto;padding:0 14px;height:52px;display:inline-flex;align-items:center;justify-content:center;color:#8fb3ff;font-weight:800;border-right:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
    .sf-input,.sf-select{width:100%;padding:14px;border:none;background:transparent;color:#fff;outline:none;font:inherit}
    .sf-select{appearance:none;-webkit-appearance:none;-moz-appearance:none;color:#fff}
    .sf-select option{color:#fff;background:#0b1430}
    .sf-select option:disabled{color:#8ca6d8;background:#0b1430}
    .sf-input-shell:focus-within,.sf-handle-shell:focus-within{border-color:rgba(81,151,255,.7);box-shadow:0 0 0 3px rgba(81,151,255,.16)}
    .sf-help{font-size:12px;color:#8ca6d8;line-height:1.45}
    .sf-round-actions{display:grid;gap:10px;padding:0;border-radius:0;background:transparent;border:none}
    .sf-wallet-flow{display:grid;gap:10px;padding:14px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08)}
    .sf-wallet-flow .sf-row{padding:0;border:none;background:transparent}
    .sf-wallet-flow .sf-round-actions{margin:0}
    .sf-wallet-flow .sf-stable-guide{margin-top:0}
    .sf-wallet-flow .sf-summary{display:none}
    .sf-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sf-wallet-tools{display:none;grid-template-columns:1fr 1fr;gap:10px}
    .sf-wallet-tools.show{display:grid}
    .sf-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:4px;padding:14px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08)}
    .sf-mini{padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
    .sf-mini strong{display:block;color:#fff;font-size:13px;margin-bottom:4px}
    .sf-mini span{display:block;color:#9db7e8;font-size:12px;line-height:1.45}
    .sf-open-phantom{display:none}
    .sf-open-phantom.show{display:inline-flex}
    .sf-trust-bar{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px;padding:12px;border-radius:16px;background:linear-gradient(180deg,rgba(255,214,101,.10),rgba(24,163,255,.08));border:1px solid rgba(255,255,255,.10)}
    .sf-trust-bar-compact{margin-top:8px}
    .sf-trust-item{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
    .sf-trust-item strong{display:block;color:#fff;font-size:13px;margin-bottom:4px}
    .sf-trust-item span{display:block;color:#cfe0ff;font-size:12px;line-height:1.45}
    .sf-stable-guide{display:none;gap:8px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);color:#dce7ff;font-size:13px;line-height:1.55}
    .sf-stable-guide.show{display:grid}
    .sf-open-phantom.show{display:inline-flex}
    .sf-price-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08)}
    .sf-metric{padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
    .sf-metric strong{display:block;color:#fff;font-size:13px;margin-bottom:4px}
    .sf-metric span{display:block;color:#9db7e8;font-size:12px;line-height:1.45}
    .sf-progress{padding:14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)} .sf-progress-head{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;margin-bottom:8px} .sf-progress-head strong{color:#fff}.sf-progress-head span{color:#9db7e8;font-weight:800}.sf-progress-bar{height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}.sf-progress-fill{height:100%;width:0%;background:linear-gradient(90deg,#18a3ff,#ffd665);transition:width .4s ease}
    .sf-steps{display:grid;gap:12px;padding:15px;border-radius:20px;background:linear-gradient(180deg,rgba(255,214,101,.08),rgba(24,163,255,.06));border:1px solid rgba(255,255,255,.10)}
    .sf-steps-compact{margin-top:8px}
    .sf-steps-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .sf-steps-head strong{display:block;color:#fff;font-size:18px;line-height:1.1}
    .sf-steps-head span{display:block;margin-top:6px;color:#b9cdf5;font-size:13px;line-height:1.5;max-width:58ch}
    .sf-steps-kicker{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:999px;background:rgba(255,214,101,.14);border:1px solid rgba(255,214,101,.22);color:#ffd665;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .sf-steps-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
    .sf-steps-grid-compact{grid-template-columns:repeat(4,1fr)}
    .sf-step{position:relative;min-height:112px;padding:13px 13px 13px 15px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);overflow:hidden}
    .sf-step:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,#ffd665,#18a3ff);opacity:.95}
    .sf-step-num{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:linear-gradient(180deg,#ffd665,#ffb81f);color:#081224;font-size:14px;font-weight:900;box-shadow:0 10px 28px rgba(255,214,101,.18)}
    .sf-step strong{display:block;margin-top:12px;color:#fff;font-size:14px;line-height:1.2}
    .sf-step span{display:block;margin-top:8px;color:#a9bee7;font-size:12px;line-height:1.5}
    .sf-step{transition:border-color .2s ease,background .2s ease,transform .2s ease,box-shadow .2s ease}
    .sf-step.active{border-color:rgba(255,214,101,.5);background:linear-gradient(180deg,rgba(255,214,101,.12),rgba(24,163,255,.08));box-shadow:0 16px 36px rgba(8,17,34,.22),0 0 0 1px rgba(255,214,101,.08) inset;transform:translateY(-1px)}
    .sf-step.active:before{width:4px;background:linear-gradient(180deg,#ffe08a,#18a3ff)}
    .sf-step.active .sf-step-num{box-shadow:0 0 0 6px rgba(255,214,101,.12),0 10px 30px rgba(255,214,101,.28)}
    .sf-step.completed{border-color:rgba(18,227,140,.26);background:linear-gradient(180deg,rgba(18,227,140,.10),rgba(255,255,255,.035))}
    .sf-step.completed:before{background:linear-gradient(180deg,#12e38c,#18a3ff)}
    .sf-step.completed .sf-step-num{background:linear-gradient(180deg,#12e38c,#10c872);color:#04131d;box-shadow:0 0 0 6px rgba(18,227,140,.10),0 10px 28px rgba(18,227,140,.22)}
    .sf-step.done .sf-step-num{font-size:0;position:relative}
    .sf-step.done .sf-step-num::after{content:"✓";font-size:15px;font-weight:900}
    .sf-receipt-overlay{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,8,23,.76);backdrop-filter:blur(12px)}
    .sf-receipt-overlay.show{display:flex}
    .sf-receipt-card{position:relative;width:min(760px,100%);max-height:min(92vh,980px);overflow:auto;border-radius:28px;padding:28px;background:
      radial-gradient(circle at top left,rgba(255,214,101,.18),transparent 28%),
      radial-gradient(circle at top right,rgba(24,163,255,.18),transparent 34%),
      linear-gradient(180deg,rgba(9,15,34,.98),rgba(6,12,26,.98));
      border:1px solid rgba(255,255,255,.12);
      box-shadow:0 40px 120px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)}
    .sf-receipt-card:before{content:"";position:absolute;inset:0;border-radius:28px;padding:1px;background:linear-gradient(135deg,rgba(255,214,101,.7),rgba(24,163,255,.55),rgba(255,255,255,.18));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
    .sf-receipt-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:20px}
    .sf-receipt-badge{display:inline-flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;background:rgba(18,227,140,.14);border:1px solid rgba(18,227,140,.25);color:#9ef3c4;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .sf-receipt-title{margin:14px 0 8px;color:#fff;font-size:clamp(28px,4vw,42px);line-height:1.05;font-weight:900;letter-spacing:-.03em}
    .sf-receipt-sub{margin:0;color:#bfd3ff;font-size:15px;line-height:1.6;max-width:56ch}
    .sf-receipt-close{flex:0 0 auto;width:44px;height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font-size:18px;font-weight:900;cursor:pointer}
    .sf-receipt-close:hover{background:rgba(255,255,255,.08)}
    .sf-receipt-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin:22px 0}
    .sf-receipt-panel{padding:18px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
    .sf-receipt-kicker{display:block;color:#ffd665;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}
    .sf-receipt-value{display:block;color:#fff;font-size:clamp(28px,4vw,38px);font-weight:900;line-height:1.05}
    .sf-receipt-value.small{font-size:clamp(22px,3.5vw,30px)}
    .sf-receipt-copy{display:grid;gap:10px}
    .sf-receipt-copy p{margin:0;color:#cfe0ff;font-size:14px;line-height:1.6}
    .sf-receipt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:8px}
    .sf-receipt-stat{padding:16px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)}
    .sf-receipt-stat strong{display:block;color:#8fb3ff;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px}
    .sf-receipt-stat span{display:block;color:#fff;font-size:16px;font-weight:800;line-height:1.35;word-break:break-word}
    .sf-receipt-hash{display:grid;gap:10px;margin-top:18px;padding:18px;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.025));border:1px solid rgba(255,255,255,.08)}
    .sf-receipt-hash-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .sf-receipt-hash-head strong{color:#fff;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
    .sf-receipt-hash code{display:block;padding:14px 16px;border-radius:16px;background:#081122;border:1px solid rgba(255,255,255,.06);color:#d7e6ff;font:600 13px/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;word-break:break-all}
    .sf-receipt-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
    .sf-receipt-btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 18px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease}
    .sf-receipt-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.09)}
    .sf-receipt-btn.primary{background:linear-gradient(135deg,#ffd665,#ffb84d);color:#07111f;border-color:rgba(255,214,101,.65)}
    .sf-receipt-btn.primary:hover{background:linear-gradient(135deg,#ffe08a,#ffc566)}
    .sf-receipt-footer{margin-top:18px;color:#92abda;font-size:13px;line-height:1.6}
    .sf-history{display:grid;gap:14px;padding:18px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.08)}
    .sf-history[hidden]{display:none!important}
    .sf-history-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    .sf-history-head h3{margin:0;color:#fff;font-size:22px;line-height:1.1}
    .sf-history-head p{margin:6px 0 0;color:#a9bee7;font-size:13px;line-height:1.55;max-width:56ch}
    .sf-history-refresh{min-height:44px;padding:0 16px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font:inherit;font-weight:800;cursor:pointer}
    .sf-history-refresh:hover{background:rgba(255,255,255,.08)}
    .sf-history-refresh:disabled{opacity:.6;cursor:not-allowed}
    .sf-history-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .sf-history-empty{padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px dashed rgba(255,255,255,.12);color:#bfd3ff;font-size:14px;line-height:1.6}
    .sf-history-list{display:grid;gap:12px}
    .sf-history-item{padding:16px;border-radius:20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}
    .sf-history-item-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
    .sf-history-item-head strong{color:#fff;font-size:15px}
    .sf-history-chip{display:inline-flex;align-items:center;justify-content:center;padding:7px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#dbe7ff;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
    .sf-history-chip.pending{color:#ffd87d;border-color:rgba(255,216,125,.28);background:rgba(255,216,125,.1)}
    .sf-history-chip.delivered{color:#95f0be;border-color:rgba(18,227,140,.26);background:rgba(18,227,140,.11)}
    .sf-history-chip.processing{color:#8fc8ff;border-color:rgba(81,151,255,.26);background:rgba(81,151,255,.11)}
    .sf-history-chip.failed,.sf-history-chip.cancelled{color:#ffb7b7;border-color:rgba(255,107,107,.25);background:rgba(255,107,107,.12)}
    .sf-history-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .sf-history-stat{padding:12px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06)}
    .sf-history-stat strong{display:block;color:#8fb3ff;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px}
    .sf-history-stat span{display:block;color:#fff;font-size:15px;font-weight:800;line-height:1.35;word-break:break-word}
    .sf-history-links{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
    .sf-history-link{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;text-decoration:none;font-size:13px;font-weight:800}
    .sf-history-link:hover{background:rgba(255,255,255,.08)}
    .sf-history-meta{margin-top:12px;color:#9fb5df;font-size:12px;line-height:1.55}
    body.sf-modal-open{overflow:hidden}
    @media (max-width:640px){.sf-row,.sf-row-tight,.sf-summary,.sf-action-grid,.sf-price-grid,.sf-receipt-hero,.sf-receipt-grid,.sf-history-summary,.sf-history-grid{grid-template-columns:1fr}.sf-row,.sf-row-tight,.sf-price-grid,.sf-summary,.sf-checkout-cluster,.sf-wallet-flow{padding:12px;border-radius:18px}.sf-checkout-cluster{gap:8px}.sf-receipt-overlay{padding:14px}.sf-receipt-card{padding:20px}.sf-receipt-top{align-items:flex-start}.sf-receipt-actions{flex-direction:column}.sf-receipt-btn{width:100%}.sf-steps{padding:14px;gap:10px}.sf-steps-head{flex-direction:column;gap:10px}.sf-steps-head strong{font-size:17px}.sf-steps-head span{font-size:12px;line-height:1.4}.sf-steps-kicker{padding:7px 11px;font-size:10px}.sf-steps-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sf-step{min-height:96px;padding:12px 12px 12px 14px;border-radius:16px}.sf-step-num{width:26px;height:26px;font-size:13px}.sf-step strong{margin-top:8px;font-size:13px}.sf-step span{margin-top:6px;font-size:11px;line-height:1.35}.sf-step:last-child{grid-column:1/-1}.sf-trust-bar{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function fetchRoundConfig() {
  const resp = await fetch(CONFIG_ENDPOINT, { cache: "no-store" });

  let data = null;
  const contentType = String(resp.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    data = await resp.json();
  } else {
    const raw = await resp.text();
    try {
      data = JSON.parse(raw);
    } catch {
      data = { error: raw?.trim() || "Could not load round config" };
    }
  }

  if (!resp.ok) {
    throw new Error(data?.error || "Could not load round config");
  }

  return data;
}

function quoteNeedsRefresh(config, minRemainingMs = 60_000) {
  const expiresAt = Date.parse(config?.quote?.expiresAt || "");
  if (!Number.isFinite(expiresAt)) return true;
  return (expiresAt - Date.now()) < minRemainingMs;
}

function getSelectedRoundMeta(config, value) {
  const rounds = config?.rounds || {};
  return rounds[value] || Object.values(rounds)[0] || null;
}

function getRoundNumberFromKey(value) {
  const match = String(value || "").match(/round(\d+)/i);
  return match ? match[1] : "?";
}

function getRoundLabel(value, meta = null) {
  return meta?.label || `Round ${getRoundNumberFromKey(value)}`;
}

function syncRoundOptions(selectEl, config) {
  if (!selectEl) return;
  const rounds = Object.entries(config?.rounds || {});
  selectEl.innerHTML = rounds.map(([key, meta]) => `<option value="${key}">${getRoundLabel(key, meta)}</option>`).join("");
  if (!rounds.some(([key]) => key === selectEl.value) && rounds[0]) {
    selectEl.value = rounds[0][0];
  }
}

function getTokenMeta(config, token) {
  return config?.tokens?.find((item) => item.symbol === token) || null;
}

function formatCurrency(value, digits = 2) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCompact(value, digits = 6) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits
  });
}

export function mountRoundRegister(selector) {
  const root = document.querySelector(selector);
  if (!root) return;

  injectStyles();
  root.innerHTML = `
    <form class="sf-round-form sf-round-form-v2" novalidate>
      <section class="sf-history" id="sfPurchaseHistory" hidden>
        <div class="sf-history-head">
          <div>
            <h3>My $FIRU Position</h3>
            <p>Connect your wallet to view your verified purchases, your reserved $FIRU allocation and delivery status.</p>
            <p class="sf-history-note">Published rounds appear automatically from the current project configuration. Purchased round allocations will be delivered manually on launch day to the same buyer wallet used during the round purchase. Additional future rounds may be announced separately if applicable.</p>
          </div>
          <button type="button" class="sf-history-refresh" id="sfHistoryRefresh">Refresh</button>
        </div>

        <div class="sf-history-summary">
          <div class="sf-metric"><strong>Total reserved $FIRU</strong><span id="sfHistoryTotalFiru">-</span></div>
          <div class="sf-metric"><strong>Total purchases</strong><span id="sfHistoryTotalPurchases">-</span></div>
          <div class="sf-metric"><strong>Total paid</strong><span id="sfHistoryTotalPaid">-</span></div>
          <div class="sf-metric"><strong>Delivery status</strong><span id="sfHistoryDelivery">-</span></div>
        </div>

        <div class="sf-history-empty" id="sfHistoryEmpty">Connect your wallet to load your verified $FIRU purchases.</div>
        <div class="sf-history-list" id="sfHistoryList"></div>
      </section>

      <div class="sf-progress"><div class="sf-progress-head"><strong id="sfProgressText">Loading...</strong><span id="sfProgressPercent">0%</span></div><div class="sf-progress-bar"><div class="sf-progress-fill" id="sfProgressFill"></div></div></div>

      <div class="sf-checkout-cluster">
        <section class="sf-steps sf-steps-compact" aria-label="Buy flow steps">
          <div class="sf-steps-head">
            <div>
              <strong>Buy in 5 steps</strong>
              <span>Connect wallet first, then choose token, amount and confirm the official Solana buy flow.</span>
            </div>
            <div class="sf-steps-kicker">Live progress</div>
          </div>
          <div class="sf-steps-grid">
            <article class="sf-step" data-step="1">
              <div class="sf-step-num">1</div>
              <strong>Connect wallet</strong>
              <span>Use Phantom and keep the correct Solana wallet active.</span>
            </article>
            <article class="sf-step" data-step="2">
              <div class="sf-step-num">2</div>
              <strong>Choose token</strong>
              <span>Select SOL, USDT or USDC on Solana before continuing.</span>
            </article>
            <article class="sf-step" data-step="3">
              <div class="sf-step-num">3</div>
              <strong>Enter amount</strong>
              <span>Type a valid amount inside the active round limits.</span>
            </article>
            <article class="sf-step" data-step="4">
              <div class="sf-step-num">4</div>
              <strong>Confirm payment</strong>
              <span>Approve Phantom for SOL, or submit the confirmed TX hash.</span>
            </article>
            <article class="sf-step" data-step="5">
              <div class="sf-step-num">5</div>
              <strong>Receipt saved</strong>
              <span>Your verified payment locks the reserved $FIRU allocation.</span>
            </article>
          </div>
        </section>

        <div class="sf-wallet-flow">
          <div class="sf-round-actions">
            <button type="button" class="btn btn-gold" id="sfRoundConnect">Connect Wallet</button>
            <button type="button" class="btn btn-dark sf-open-phantom" id="sfRoundOpenPhantom">Open Wallet</button>
            <div class="sf-wallet-tools" id="sfWalletTools">
              <button type="button" class="btn btn-dark" id="sfRoundChangeWallet">Switch Account</button>
              <button type="button" class="btn btn-dark" id="sfRoundDisconnect">Disconnect</button>
            </div>
          </div>

          <div class="sf-row-tight">
            <label class="sf-field">
              <span class="sf-label">Payment token</span>
              <div class="sf-input-shell">
                <select class="sf-select" id="sfTokenSelect">
                  <option value="SOL">SOL</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
              <span class="sf-help">Accepted on Solana only. Order: SOL, USDT, USDC.</span>
            </label>

            <label class="sf-field">
              <span class="sf-label">Amount</span>
              <div class="sf-input-shell">
                <input class="sf-input" id="sfBuyAmount" inputmode="decimal" autocomplete="off" placeholder="0.10" />
              </div>
              <span class="sf-help" id="sfAmountHint">Use this for live estimate. Automatic buy is only available for SOL right now.</span><span class="sf-help" id="sfAmountRange">Loading limits...</span><span class="sf-help" id="sfAmountValidation"></span>
            </label>

            <label class="sf-field">
              <span class="sf-label">Round</span>
              <div class="sf-input-shell">
                <select class="sf-select" id="sfRoundSelect">
                  
                </select>
              </div>
              <span class="sf-help" id="sfRoundMeta">Loading round configuration...</span>
            </label>
          </div>

          <div class="sf-price-grid">
            <div class="sf-metric"><strong>Live token price</strong><span id="sfLiveTokenPrice">-</span></div>
            <div class="sf-metric"><strong>Estimated market value</strong><span id="sfEstimatedUsd">Not available yet</span></div>
            <div class="sf-metric"><strong>Estimated $FIRU</strong><span id="sfEstimatedFiru">Not available yet</span></div>
            <div class="sf-metric"><strong>Official destination</strong><span id="sfDestinationShort">Not available yet</span></div>
          </div>

          <div class="sf-row">
            <label class="sf-field">
              <span class="sf-label">Transaction hash</span>
              <div class="sf-input-shell">
                <input class="sf-input" id="sfTxHash" inputmode="text" autocomplete="off" placeholder="Paste the confirmed Solana transaction hash" />
              </div>
              <span class="sf-help">For USDT and USDC this step is required. Without submitting the hash, the payment is not automatically registered.</span>
            </label>
            <label class="sf-field">
              <span class="sf-label">Destination wallet / token account</span>
              <div class="sf-copy-shell">
                <input class="sf-input" id="sfDestinationAddress" readonly />
                <button type="button" class="sf-copy-btn" id="sfCopyDestination">COPY ADDRESS</button>
              </div>
              <span class="sf-help">Send only on Solana. SOL uses the project wallet. USDT and USDC use the official destination shown here.</span>
            </label>
          </div>

          <div class="sf-stable-guide" id="sfStableGuide">
          <div><strong>How it works:</strong></div>
          <div>1. Copy the official destination address.</div>
          <div>2. Send funds on Solana.</div>
          <div>3. Paste the confirmed transaction hash.</div>
          <div>4. Register the payment to lock your allocation.</div>
        </div>
        </div>

        <div class="sf-hash-warning" id="sfHashWarning">
          <div><strong>USDT / USDC important:</strong> after sending funds, paste the confirmed transaction hash to complete and register the payment.</div>
          <div>Payments sent without submitting the transaction hash will not be automatically processed.</div>
        </div>

        <div class="sf-action-grid sf-action-grid-bottom">
          <button type="button" class="btn btn-blue" id="sfRoundAutoBuy" disabled>Buy SOL with Phantom</button>
          <button type="button" class="btn btn-dark" id="sfRoundSubmit" disabled>Register TX</button>
        </div>
        <div id="sfRoundWalletMsg" class="sf-round-note warn"><strong>Wallet not connected.</strong> Connect Phantom for SOL, or paste the confirmed TX hash for USDT/USDC.</div>
      </div>
    </form>

    <div class="sf-receipt-overlay" id="sfReceiptOverlay" aria-hidden="true">
      <div class="sf-receipt-card" role="dialog" aria-modal="true" aria-labelledby="sfReceiptTitle">
        <div class="sf-receipt-top">
          <div>
            <div class="sf-receipt-badge">✓ Purchase Confirmed</div>
            <h3 class="sf-receipt-title" id="sfReceiptTitle">Your $FIRU allocation is locked in.</h3>
            <p class="sf-receipt-sub" id="sfReceiptSub">Your verified payment has been registered successfully. This receipt confirms your early position and reserved allocation.</p>
          </div>
          <button type="button" class="sf-receipt-close" id="sfReceiptClose" aria-label="Close receipt">✕</button>
        </div>

        <div class="sf-receipt-hero">
          <div class="sf-receipt-panel">
            <span class="sf-receipt-kicker">Reserved allocation</span>
            <span class="sf-receipt-value" id="sfReceiptFiru">-</span>
          </div>
          <div class="sf-receipt-panel sf-receipt-copy">
            <span class="sf-receipt-kicker">Receipt status</span>
            <span class="sf-receipt-value small" id="sfReceiptRound">-</span>
            <p id="sfReceiptMessage">Your purchase is recorded and reserved for post-launch distribution.</p>
          </div>
        </div>

        <div class="sf-receipt-grid">
          <div class="sf-receipt-stat"><strong>Payment</strong><span id="sfReceiptPayment">-</span></div>
          <div class="sf-receipt-stat"><strong>Market value</strong><span id="sfReceiptUsd">-</span></div>
          <div class="sf-receipt-stat"><strong>Wallet</strong><span id="sfReceiptWallet">-</span></div>
          <div class="sf-receipt-stat"><strong>Token price</strong><span id="sfReceiptPrice">-</span></div>
        </div>

        <div class="sf-receipt-hash">
          <div class="sf-receipt-hash-head">
            <strong>Transaction hash</strong>
            <button type="button" class="sf-receipt-btn" id="sfReceiptCopyTx">Copy TX</button>
          </div>
          <code id="sfReceiptTx">-</code>
        </div>

        <div class="sf-receipt-actions">
          <a class="sf-receipt-btn primary" id="sfReceiptExplorer" href="#" target="_blank" rel="noopener noreferrer">View on Solscan</a>
          <button type="button" class="sf-receipt-btn" id="sfReceiptCloseAction">Close receipt</button>
        </div>

        <div class="sf-receipt-footer">
          This receipt confirms that your payment was verified on Solana and your $FIRU allocation was reserved successfully. Keep this transaction hash for your records.
        </div>
      </div>
    </div>
  `;

  const walletMsg = root.querySelector("#sfRoundWalletMsg");
  const tokenEl = root.querySelector("#sfTokenSelect");
  const amountEl = root.querySelector("#sfBuyAmount");
  const txEl = root.querySelector("#sfTxHash");
  const roundEl = root.querySelector("#sfRoundSelect");
  const destinationEl = root.querySelector("#sfDestinationAddress");
  const copyDestinationBtn = root.querySelector("#sfCopyDestination");
  const stableGuideEl = root.querySelector("#sfStableGuide");
  const hashWarningEl = root.querySelector("#sfHashWarning");
  const trustHeadlineEl = root.querySelector("#sfTrustHeadline");
  const trustCopyEl = root.querySelector("#sfTrustCopy");
  const purchaseHistoryEl = root.querySelector("#sfPurchaseHistory");
  const historyRefreshBtn = root.querySelector("#sfHistoryRefresh");
  const historyTotalFiruEl = root.querySelector("#sfHistoryTotalFiru");
  const historyTotalPurchasesEl = root.querySelector("#sfHistoryTotalPurchases");
  const historyTotalPaidEl = root.querySelector("#sfHistoryTotalPaid");
  const historyDeliveryEl = root.querySelector("#sfHistoryDelivery");
  const historyEmptyEl = root.querySelector("#sfHistoryEmpty");
  const historyListEl = root.querySelector("#sfHistoryList");
  const destinationShortEl = root.querySelector("#sfDestinationShort");
  const roundMetaEl = root.querySelector("#sfRoundMeta");
  const amountHintEl = root.querySelector("#sfAmountHint");
  const amountRangeEl = root.querySelector("#sfAmountRange");
  const amountValidationEl = root.querySelector("#sfAmountValidation");
  const liveTokenPriceEl = root.querySelector("#sfLiveTokenPrice");
  const estimatedUsdEl = root.querySelector("#sfEstimatedUsd");
  const estimatedFiruEl = root.querySelector("#sfEstimatedFiru");
  const connectBtn = root.querySelector("#sfRoundConnect");
  const openBtn = root.querySelector("#sfRoundOpenPhantom");
  const walletToolsEl = root.querySelector("#sfWalletTools");
  const changeWalletBtn = root.querySelector("#sfRoundChangeWallet");
  const disconnectWalletBtn = root.querySelector("#sfRoundDisconnect");
  const autoBuyBtn = root.querySelector("#sfRoundAutoBuy");
  const submitBtn = root.querySelector("#sfRoundSubmit");
  const receiptOverlay = root.querySelector("#sfReceiptOverlay");
  const receiptCloseBtn = root.querySelector("#sfReceiptClose");
  const receiptCloseActionBtn = root.querySelector("#sfReceiptCloseAction");
  const receiptCopyTxBtn = root.querySelector("#sfReceiptCopyTx");
  const receiptExplorerLink = root.querySelector("#sfReceiptExplorer");
  const receiptTitleEl = root.querySelector("#sfReceiptTitle");
  const receiptSubEl = root.querySelector("#sfReceiptSub");
  const receiptFiruEl = root.querySelector("#sfReceiptFiru");
  const receiptRoundEl = root.querySelector("#sfReceiptRound");
  const receiptMessageEl = root.querySelector("#sfReceiptMessage");
  const receiptPaymentEl = root.querySelector("#sfReceiptPayment");
  const receiptUsdEl = root.querySelector("#sfReceiptUsd");
  const receiptWalletEl = root.querySelector("#sfReceiptWallet");
  const receiptPriceEl = root.querySelector("#sfReceiptPrice");
  const receiptTxEl = root.querySelector("#sfReceiptTx");

  const txField = txEl?.closest(".sf-field");
  const destField = destinationEl?.closest(".sf-field");
  const stableRow = txField?.parentElement;
  const stepEls = Array.from(root.querySelectorAll(".sf-step[data-step]"));
  let receiptCompleted = false;
  let stepAttention = 0;
  const summaryCards = [];

  let provider = null;
  let walletAddress = "";
  let roundConfig = null;
  let historyLoading = false;

  function formatPurchaseDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function getDeliveryBadgeClass(status) {
    const key = String(status || "pending").toLowerCase();
    if (["delivered", "processing", "failed", "cancelled"].includes(key)) return key;
    return "pending";
  }

  function getDeliveryLabelFromSummary(summary) {
    if (!summary || !summary.total_purchases) return "No purchases yet";
    if (summary.delivered_firu > 0 && summary.reserved_firu > 0) return "Partially delivered";
    if (summary.delivered_firu > 0) return "Delivered";
    return "Reserved for launch";
  }

  function setHistoryLoadingState(isLoading) {
    historyLoading = Boolean(isLoading);
    if (historyRefreshBtn) {
      historyRefreshBtn.disabled = historyLoading || !walletAddress;
      historyRefreshBtn.textContent = historyLoading ? "Refreshing..." : "Refresh";
    }
  }

  function clearHistory(message = "Connect your wallet to load your verified $FIRU purchases.") {
    if (purchaseHistoryEl) purchaseHistoryEl.hidden = !walletAddress;
    if (historyTotalFiruEl) historyTotalFiruEl.textContent = walletAddress ? "-" : "-";
    if (historyTotalPurchasesEl) historyTotalPurchasesEl.textContent = walletAddress ? "-" : "-";
    if (historyTotalPaidEl) historyTotalPaidEl.textContent = walletAddress ? "-" : "-";
    if (historyDeliveryEl) historyDeliveryEl.textContent = walletAddress ? "-" : "-";
    if (historyListEl) historyListEl.innerHTML = "";
    if (historyEmptyEl) {
      historyEmptyEl.hidden = false;
      historyEmptyEl.textContent = message;
    }
    setHistoryLoadingState(false);
  }

  function renderHistory(data) {
    if (!purchaseHistoryEl) return;
    purchaseHistoryEl.hidden = !walletAddress;

    const summary = data?.summary || {};
    const purchases = Array.isArray(data?.purchases) ? data.purchases : [];

    if (historyTotalFiruEl) historyTotalFiruEl.textContent = `${formatCompact(summary.total_firu || 0, 0)} FIRU`;
    if (historyTotalPurchasesEl) historyTotalPurchasesEl.textContent = String(summary.total_purchases || 0);
    if (historyTotalPaidEl) historyTotalPaidEl.textContent = `$${formatCurrency(summary.total_paid_usd || 0, 2)}`;
    if (historyDeliveryEl) historyDeliveryEl.textContent = getDeliveryLabelFromSummary(summary);

    if (historyListEl) {
      historyListEl.innerHTML = purchases.map((purchase) => {
        const roundLabel = getRoundLabel(purchase.round);
        const statusLabel = purchase.ownership_status || "Reserved";
        const statusClass = getDeliveryBadgeClass(purchase.delivery_status);
        const deliveredMeta = purchase.delivered_at ? `Delivered: ${formatPurchaseDate(purchase.delivered_at)}` : `Registered: ${formatPurchaseDate(purchase.created_at)}`;
        return `
          <article class="sf-history-item">
            <div class="sf-history-item-head">
              <strong>${roundLabel} · ${purchase.payment_token}</strong>
              <span class="sf-history-chip ${statusClass}">${statusLabel}</span>
            </div>
            <div class="sf-history-grid">
              <div class="sf-history-stat"><strong>Paid</strong><span>${formatCompact(purchase.payment_amount, purchase.payment_token === "SOL" ? 4 : 2)} ${purchase.payment_token}</span></div>
              <div class="sf-history-stat"><strong>Market value</strong><span>$${formatCurrency(purchase.payment_amount_usd, 2)}</span></div>
              <div class="sf-history-stat"><strong>Reserved $FIRU</strong><span>${formatCompact(purchase.firu_allocation, 0)} FIRU</span></div>
              <div class="sf-history-stat"><strong>Wallet match</strong><span>${shortAddress(purchase.sender_wallet || purchase.wallet || walletAddress)}</span></div>
            </div>
            <div class="sf-history-links">
              <a class="sf-history-link" href="${getSolscanUrl(purchase.tx_hash)}" target="_blank" rel="noopener noreferrer">View payment TX</a>
              ${purchase.delivery_tx ? `<a class="sf-history-link" href="${getSolscanUrl(purchase.delivery_tx)}" target="_blank" rel="noopener noreferrer">View delivery TX</a>` : ""}
            </div>
            <div class="sf-history-meta">${deliveredMeta}</div>
          </article>
        `;
      }).join("");
    }

    if (historyEmptyEl) {
      historyEmptyEl.hidden = purchases.length > 0;
      historyEmptyEl.textContent = purchases.length > 0
        ? ""
        : "No verified purchases were found for this wallet yet. Once you register a payment, it will appear here automatically.";
    }

    setHistoryLoadingState(false);
  }

  async function loadPurchaseHistory(force = false) {
    if (!walletAddress || !purchaseHistoryEl) {
      clearHistory("Connect your wallet to load your verified $FIRU purchases.");
      return;
    }
    if (historyLoading && !force) return;

    try {
      purchaseHistoryEl.hidden = false;
      setHistoryLoadingState(true);
      if (historyEmptyEl && (!historyListEl || !historyListEl.children.length || force)) {
        historyEmptyEl.hidden = false;
        historyEmptyEl.textContent = "Loading your verified $FIRU purchases...";
      }

      const resp = await fetch(`/api/round/history?wallet=${encodeURIComponent(walletAddress)}`, {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Could not load purchase history.");
      }
      renderHistory(data);
    } catch (error) {
      clearHistory(error?.message || "Could not load purchase history.");
    }
  }

  function updateWalletControls() {
    const connected = Boolean(walletAddress);
    if (walletToolsEl) walletToolsEl.classList.toggle("show", connected);
    if (purchaseHistoryEl) purchaseHistoryEl.hidden = !connected;
    if (historyRefreshBtn) {
      historyRefreshBtn.disabled = !connected || historyLoading;
    }
    if (connectBtn) {
      connectBtn.textContent = connected ? "Wallet Connected" : "Connect Wallet";
      connectBtn.disabled = false;
    }
  }

  function applyContextualUi() {
    const token = tokenEl?.value || "SOL";
    const phantomMobile = isMobileDevice() && isInPhantomBrowser();
    const outsidePhantomMobile = isMobileDevice() && !isInPhantomBrowser();
    updateWalletControls();

    if (stableRow && destField && txField && (token === "USDT" || token === "USDC")) {
      if (stableRow.firstElementChild !== destField) {
        stableRow.insertBefore(destField, txField);
      }
    }

    if (phantomMobile) {
      if (tokenEl) tokenEl.value = "SOL";
      if (txField) txField.style.display = "none";
      if (stableGuideEl) stableGuideEl.classList.remove("show");
      if (hashWarningEl) hashWarningEl.style.display = "none";
      if (submitBtn) submitBtn.style.display = "none";
      if (destField) destField.style.display = "none";
      if (connectBtn) connectBtn.style.display = "";
      if (walletToolsEl) walletToolsEl.style.display = walletAddress ? "grid" : "none";
      if (autoBuyBtn) autoBuyBtn.style.display = "";
      if (openBtn) openBtn.style.display = "none";
      if (summaryCards[0]) summaryCards[0].style.display = "";
      if (summaryCards[1]) summaryCards[1].style.display = "none";
      if (amountHintEl) amountHintEl.textContent = "Phantom mode: connect your wallet and complete the SOL purchase below.";
      return;
    }

    if (token === "SOL") {
      if (txField) txField.style.display = "none";
      if (stableGuideEl) stableGuideEl.classList.remove("show");
      if (hashWarningEl) hashWarningEl.style.display = "none";
      if (submitBtn) submitBtn.style.display = "none";
      if (destField) destField.style.display = "";
      if (connectBtn) connectBtn.style.display = "";
      if (walletToolsEl) walletToolsEl.style.display = outsidePhantomMobile ? "none" : (walletAddress ? "grid" : "none");
      if (openBtn) openBtn.style.display = outsidePhantomMobile ? "" : "none";
      if (autoBuyBtn) autoBuyBtn.style.display = outsidePhantomMobile ? "none" : "";
      if (summaryCards[0]) summaryCards[0].style.display = "";
      if (summaryCards[1]) summaryCards[1].style.display = "none";
      if (amountHintEl) amountHintEl.textContent = outsidePhantomMobile
        ? "Open Phantom to continue with the automatic SOL purchase."
        : "Automatic buy is available for SOL. Use Phantom to complete the purchase directly.";
      return;
    }

    if (token === "USDT" || token === "USDC") {
      if (txField) txField.style.display = "";
      if (stableGuideEl) stableGuideEl.classList.add("show");
      if (hashWarningEl) hashWarningEl.style.display = "grid";
      if (submitBtn) submitBtn.style.display = "";
      if (destField) destField.style.display = "";
      if (connectBtn) connectBtn.style.display = "none";
      if (walletToolsEl) walletToolsEl.style.display = "none";
      if (openBtn) openBtn.style.display = "none";
      if (autoBuyBtn) autoBuyBtn.style.display = "none";
      if (summaryCards[0]) summaryCards[0].style.display = "none";
      if (summaryCards[1]) summaryCards[1].style.display = "";
      if (amountHintEl) amountHintEl.textContent = `${token} flow: copy the destination, send funds on Solana, then paste the confirmed transaction hash below.`;
      return;
    }
  }


  function copyToClipboardWithFallback(value) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
    }
    return fallbackCopy(value);
  }

  function fallbackCopy(value) {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    if (!ok) throw new Error("copy_failed");
  }

  function getTokenLimits(selectedToken) {
    const minSol = Number(roundConfig?.limits?.minSol || 0);
    const maxSol = Number(roundConfig?.limits?.maxSol || 0);
    const solToken = getTokenMeta(roundConfig, "SOL");
    const solPrice = Number(solToken?.livePriceUsd || 0);

    if (selectedToken === "SOL") {
      return {
        min: minSol,
        max: maxSol,
        suffix: "SOL",
        decimals: 4,
      };
    }

    return {
      min: minSol * solPrice,
      max: maxSol * solPrice,
      suffix: selectedToken,
      decimals: 2,
    };
  }

  function getEstimatedFiruForAmount(selectedToken, amount, selectedRound = getSelectedRoundMeta(roundConfig, roundEl.value)) {
    const token = getTokenMeta(roundConfig, selectedToken);
    if (!token || !selectedRound) return 0;

    const usdValue = Number(amount || 0) * Number(token.livePriceUsd || 0);
    return selectedRound.firuPriceUsd > 0 ? usdValue / Number(selectedRound.firuPriceUsd) : 0;
  }

  function getRemainingPaymentEquivalent(selectedToken, selectedRound = getSelectedRoundMeta(roundConfig, roundEl.value)) {
    if (!selectedRound || typeof selectedRound.remainingFiru !== "number") return null;
    if (!(selectedRound.firuPriceUsd > 0)) return null;

    const token = getTokenMeta(roundConfig, selectedToken);
    const tokenPriceUsd = Number(token?.livePriceUsd || 0);
    if (!(tokenPriceUsd > 0)) return null;

    return (Number(selectedRound.remainingFiru || 0) * Number(selectedRound.firuPriceUsd || 0)) / tokenPriceUsd;
  }

  function getAmountValidation() {
    const selectedToken = tokenEl.value;
    const amount = Number(amountEl.value || 0);
    const selectedRound = getSelectedRoundMeta(roundConfig, roundEl.value);

    if (!selectedRound?.enabled || selectedRound?.soldOut) {
      return selectedRound?.soldOut ? "This round is sold out." : "This round is currently closed.";
    }

    if (!Number.isFinite(amount) || amount <= 0) return "";

    const limits = getTokenLimits(selectedToken);
    if (amount < limits.min) {
      return `Minimum amount for ${limits.suffix} is ${formatCompact(limits.min, limits.decimals)} ${limits.suffix}.`;
    }
    if (amount > limits.max) {
      return `Maximum amount for ${limits.suffix} is ${formatCompact(limits.max, limits.decimals)} ${limits.suffix}.`;
    }

    const estimatedFiru = getEstimatedFiruForAmount(selectedToken, amount, selectedRound);
    if (typeof selectedRound.remainingFiru === "number" && estimatedFiru > Number(selectedRound.remainingFiru || 0)) {
      const remainingPayment = getRemainingPaymentEquivalent(selectedToken, selectedRound);
      if (remainingPayment !== null) {
        return `Only ${formatCompact(remainingPayment, limits.decimals)} ${selectedToken} remains in this round at the current price.`;
      }
      return `Only ${formatCompact(selectedRound.remainingFiru, 0)} $FIRU remains in this round.`;
    }

    return "";
  }
  function updateTrustBar() {
    if (!trustHeadlineEl || !trustCopyEl) return;
    const meta = getSelectedRoundMeta(roundConfig, roundEl.value);
    const token = tokenEl.value;
    const limits = getTokenLimits(token);

    if (!meta) {
      trustHeadlineEl.textContent = "Live round status";
      trustCopyEl.textContent = "Loading live pricing and round availability...";
      return;
    }

    const sold = Number(meta.raisedFiru || 0);
    const cap = Number(meta.tokenCap || 0);
    const pct = cap > 0 ? (sold / cap) * 100 : 0;

    if (!meta.enabled) {
      trustHeadlineEl.textContent = "Round currently closed";
      trustCopyEl.textContent = "This round is not accepting registrations right now.";
      return;
    }

    if (meta.soldOut) {
      trustHeadlineEl.textContent = "Round sold out";
      trustCopyEl.textContent = "This round is full. Switch rounds to continue.";
      return;
    }

    trustHeadlineEl.textContent = pct >= 70 ? "Limited allocation remaining" : "Live round status";
    trustCopyEl.textContent =
      pct >= 70
        ? `${getRoundLabel(roundEl.value, meta)} is ${pct.toFixed(1)}% filled. Current range: ${formatCompact(limits.min, limits.decimals)}–${formatCompact(limits.max, limits.decimals)} ${limits.suffix}.`
        : `${getRoundLabel(roundEl.value, meta)} is open. Current range: ${formatCompact(limits.min, limits.decimals)}–${formatCompact(limits.max, limits.decimals)} ${limits.suffix}.`;
  }


  function setMsg(message, tone = "warn") {
    walletMsg.className = `sf-round-note ${tone}`;
    walletMsg.innerHTML = message;
  }

  function updateRoundMeta() {
    applyContextualUi();
    const meta = getSelectedRoundMeta(roundConfig, roundEl.value);
    const selectedToken = tokenEl.value;
    if (!meta) {
      roundMetaEl.textContent = "Round config unavailable.";
      if (amountRangeEl) amountRangeEl.textContent = "Limits unavailable.";
      return;
    }
    const pieces = [];
    pieces.push(meta.enabled ? "Open" : "Closed");
    pieces.push(`$FIRU $${formatCompact(meta.firuPriceUsd, 6)}`);
    const limits = getTokenLimits(selectedToken);
    pieces.push(`Min ${formatCompact(limits.min, limits.decimals)} ${limits.suffix}`);
    pieces.push(`Max ${formatCompact(limits.max, limits.decimals)} ${limits.suffix}`);
    if (typeof meta.remainingFiru === "number") {
      pieces.push(meta.soldOut ? "Sold out" : `Remaining ${formatCompact(meta.remainingFiru, 0)} $FIRU`);
    }
    roundMetaEl.textContent = pieces.join(" · ");
    if (amountRangeEl) {
      amountRangeEl.textContent = `Allowed range: ${formatCompact(limits.min, limits.decimals)} ${limits.suffix} to ${formatCompact(limits.max, limits.decimals)} ${limits.suffix}.`;
    }
    if (amountHintEl) {
      amountHintEl.textContent = selectedToken === "SOL"
        ? "Automatic buy is available for SOL. USDT and USDC still require the confirmed transaction hash."
        : `${selectedToken} uses manual registration: copy the destination, send funds on Solana, then paste the confirmed transaction hash.`;
    }
    updateTrustBar();
  }


  function updateProgress() {
    const meta = getSelectedRoundMeta(roundConfig, roundEl.value);
    const textEl = root.querySelector("#sfProgressText");
    const percentEl = root.querySelector("#sfProgressPercent");
    const fillEl = root.querySelector("#sfProgressFill");
    if (!meta || !textEl || !percentEl || !fillEl) return;
    const sold = Number(meta.raisedFiru || 0);
    const cap = Number(meta.tokenCap || 0);
    const percent = cap > 0 ? Math.min((sold / cap) * 100, 100) : 0;
    textEl.textContent = sold.toLocaleString("en-US") + " / " + cap.toLocaleString("en-US") + " $FIRU sold";
    percentEl.textContent = percent.toFixed(1) + "%";
    fillEl.style.width = percent + "%";
  }

  function updateTokenDetails() {
    applyContextualUi();
    const selectedToken = tokenEl.value;
    const limits = getTokenLimits(selectedToken);
    amountEl.placeholder = formatCompact(limits.min, limits.decimals);
    const token = getTokenMeta(roundConfig, selectedToken);
    if (!token) {
      destinationEl.value = "";
      destinationShortEl.textContent = "-";
      liveTokenPriceEl.textContent = "-";
      estimatedUsdEl.textContent = "-";
      estimatedFiruEl.textContent = "-";
      if (hashWarningEl) hashWarningEl.style.display = "grid";
      updateProgress();
      return;
    }

    destinationEl.value = token.destinationAddress || "";
    destinationShortEl.textContent = short(token.destinationAddress || "");
    liveTokenPriceEl.textContent = `$${formatCompact(token.livePriceUsd, 6)}`;
    if (hashWarningEl) {
      if (selectedToken === "SOL") {
        hashWarningEl.innerHTML = `<div><strong>SOL options:</strong> use Phantom automatic buy for the fastest flow, or paste a confirmed transaction hash as manual fallback.</div><div>For USDT and USDC, hash submission stays required until stablecoin automatic payments are enabled.</div>`;
      } else {
        hashWarningEl.innerHTML = `<div><strong>${selectedToken} required flow:</strong> copy the official destination, send ${selectedToken} on Solana, then paste the confirmed transaction hash to complete and register the payment.</div><div>Payments sent without submitting the transaction hash will not be automatically processed.</div>`;
      }
    }
    updateEstimate();
    updateProgress();
  }

  function updateEstimate() {
    const token = getTokenMeta(roundConfig, tokenEl.value);
    const round = getSelectedRoundMeta(roundConfig, roundEl.value);
    const amount = Number(amountEl.value || 0);

    if (!token || !round || !Number.isFinite(amount) || amount <= 0) {
      estimatedUsdEl.textContent = "-";
      estimatedFiruEl.textContent = "-";
      if (amountValidationEl) amountValidationEl.textContent = "";
      return;
    }

    const usdValue = amount * Number(token.livePriceUsd || 0);
    const estimatedFiru = round.firuPriceUsd > 0 ? usdValue / Number(round.firuPriceUsd) : 0;

    estimatedUsdEl.textContent = `$${formatCurrency(usdValue, 2)}`;
    estimatedFiruEl.textContent = formatCompact(estimatedFiru, 0);
    if (amountValidationEl) {
      const validation = getAmountValidation();
      amountValidationEl.textContent = validation;

      if (validation) {
        amountValidationEl.style.color = "#ff6b6b";
        amountEl.style.borderColor = "#ff6b6b";
      } else if (amount > 0) {
        amountValidationEl.textContent = "✔ Valid amount";
        amountValidationEl.style.color = "#4ade80";
        amountEl.style.borderColor = "#4ade80";
      } else {
        amountValidationEl.textContent = "";
        amountEl.style.borderColor = "";
      }
    }
  }


  function getSolscanUrl(txHash) {
    if (!txHash) return "#";
    return `https://solscan.io/tx/${encodeURIComponent(txHash)}`;
  }

  function getRpcCandidates(primaryRpcUrl) {
    return Array.from(new Set([
      String(primaryRpcUrl || "").trim(),
      "https://api.mainnet-beta.solana.com"
    ].filter(Boolean)));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function fetchServerRoundBlockhash() {
    const resp = await fetch("/api/round/blockhash", {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store"
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error || "Could not load latest blockhash from server");
    }

    const blockhash = String(data?.blockhash || "").trim();
    const lastValidBlockHeight = Number(data?.lastValidBlockHeight || 0);

    if (!blockhash || !Number.isFinite(lastValidBlockHeight) || lastValidBlockHeight <= 0) {
      throw new Error("Server returned an invalid blockhash payload");
    }

    return { blockhash, lastValidBlockHeight };
  }

  async function getWalletBalanceWithFallback(senderPublicKey, primaryRpcUrl) {
    let lastError = null;
    for (const rpcUrl of getRpcCandidates(primaryRpcUrl)) {
      try {
        const connection = new Connection(rpcUrl, "confirmed");
        return await connection.getBalance(senderPublicKey, "confirmed");
      } catch (error) {
        lastError = error;
        console.warn(`Balance pre-check failed on ${rpcUrl}`, error);
      }
    }
    if (lastError) {
      console.warn("Could not fetch Phantom balance before purchase. Continuing without pre-check.", lastError);
    }
    return null;
  }

  async function getWorkingRpcContext(primaryRpcUrl, senderPublicKey, recipientPublicKey, lamports) {
    let lastError = null;

    for (const rpcUrl of getRpcCandidates(primaryRpcUrl)) {
      const connection = new Connection(rpcUrl, "confirmed");
      try {
        const latest = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({
          feePayer: senderPublicKey,
          recentBlockhash: latest.blockhash
        }).add(
          SystemProgram.transfer({
            fromPubkey: senderPublicKey,
            toPubkey: recipientPublicKey,
            lamports
          })
        );

        return { connection, latest, tx, rpcUrl };
      } catch (error) {
        lastError = error;
        console.warn(`Blockhash fetch failed on ${rpcUrl}`, error);
      }
    }

    throw lastError || new Error("Could not reach Solana RPC.");
  }

  async function confirmTransactionWithFallback(signature, latest, primaryRpcUrl) {
    let lastError = null;

    for (const rpcUrl of getRpcCandidates(primaryRpcUrl)) {
      try {
        const connection = new Connection(rpcUrl, "confirmed");
        await connection.confirmTransaction(
          {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight
          },
          "confirmed"
        );
        return;
      } catch (error) {
        lastError = error;
        console.warn(`Confirmation failed on ${rpcUrl}`, error);
      }
    }

    throw lastError || new Error("Could not confirm the transaction on Solana.");
  }

  async function sendRawTransactionWithFallback(serializedTx, primaryRpcUrl) {
    let lastError = null;

    for (const rpcUrl of getRpcCandidates(primaryRpcUrl)) {
      try {
        const connection = new Connection(rpcUrl, "confirmed");
        return await connection.sendRawTransaction(serializedTx, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 3
        });
      } catch (error) {
        lastError = error;
        console.warn(`Raw transaction send failed on ${rpcUrl}`, error);
      }
    }

    throw lastError || new Error("Could not broadcast the transaction on Solana.");
  }

  function lockPurchaseUi() {
    amountEl.disabled = true;
    txEl.disabled = true;
    tokenEl.disabled = true;
    roundEl.disabled = true;
    autoBuyBtn.disabled = true;
    submitBtn.disabled = true;
  }

  function openReceipt(data) {
    if (!receiptOverlay || !data) return;
    const paymentAmount = Number(data.payment_amount || 0);
    const paymentUsd = Number(data.payment_amount_usd || 0);
    const firuAllocation = Number(data.firu_allocation || 0);
    const tokenPriceUsd = Number(data.token_price_usd || data.firu_price_usd || 0);
    const txHash = String(data.tx_hash || txEl.value || "").trim();
    const paymentToken = String(data.payment_token || tokenEl.value || "SOL");
    const effectiveWallet = String(data.wallet || walletAddress || "").trim();

    if (receiptTitleEl) receiptTitleEl.textContent = "Your $FIRU allocation is locked in.";
    if (receiptSubEl) receiptSubEl.textContent = "Verified on Solana. Registered successfully. Reserved for post-launch distribution.";
    if (receiptFiruEl) receiptFiruEl.textContent = `${formatCompact(firuAllocation, 0)} FIRU`;
    if (receiptRoundEl) receiptRoundEl.textContent = `${getRoundLabel(data.round)} confirmed`;
    if (receiptMessageEl) receiptMessageEl.textContent = "You entered early. Your verified payment is now attached to a reserved $FIRU allocation.";
    if (receiptPaymentEl) receiptPaymentEl.textContent = `${formatCompact(paymentAmount, paymentToken === "SOL" ? 4 : 2)} ${paymentToken}`;
    if (receiptUsdEl) receiptUsdEl.textContent = `$${formatCurrency(paymentUsd, 2)}`;
    if (receiptWalletEl) receiptWalletEl.textContent = effectiveWallet ? shortAddress(effectiveWallet) : "Wallet connected";
    if (receiptPriceEl) receiptPriceEl.textContent = tokenPriceUsd > 0 ? `$${formatCompact(tokenPriceUsd, 6)}` : "-";
    if (receiptTxEl) receiptTxEl.textContent = txHash || "-";
    if (receiptExplorerLink) receiptExplorerLink.href = getSolscanUrl(txHash);

    receiptCompleted = true;
    receiptOverlay.classList.add("show");
    receiptOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("sf-modal-open");
    updateStepWitness();
  }

  function closeReceipt() {
    if (!receiptOverlay) return;
    receiptOverlay.classList.remove("show");
    receiptOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sf-modal-open");
    updateStepWitness();
  }

  function getMissingBuyStep() {
    if (!walletAddress) {
      return { step: 1, message: "<strong>Complete Step 1:</strong> connect your wallet before continuing." };
    }
    if (!tokenEl?.value) {
      return { step: 2, message: "<strong>Complete Step 2:</strong> choose a payment token before continuing." };
    }
    const rawAmount = String(amountEl?.value || "").trim();
    const numericAmount = Number(rawAmount || 0);
    if (!rawAmount || !Number.isFinite(numericAmount) || numericAmount <= 0 || getAmountValidation()) {
      return { step: 3, message: "<strong>Complete Step 3:</strong> enter a valid amount before tapping buy." };
    }
    return null;
  }

  function updateStepWitness() {
    if (!stepEls.length) return;

    const token = tokenEl?.value || "";
    const amount = Number(amountEl?.value || 0);
    const hasWallet = Boolean(walletAddress);
    const hasToken = Boolean(token);
    const hasValidAmount = Number.isFinite(amount) && amount > 0 && !getAmountValidation();

    let activeStep = 1;
    if (receiptCompleted) activeStep = 5;
    else if (stepAttention && !receiptCompleted) activeStep = stepAttention;
    else if (hasValidAmount) activeStep = 4;
    else if (hasWallet) activeStep = 3;
    else activeStep = 1;

    const completedMap = {
      1: hasWallet,
      2: hasToken,
      3: hasValidAmount,
      4: receiptCompleted,
      5: receiptCompleted,
    };

    stepEls.forEach((el) => {
      const step = Number(el.getAttribute("data-step") || 0);
      const completed = Boolean(completedMap[step]);
      el.classList.toggle("active", step === activeStep);
      el.classList.toggle("completed", completed);
      el.classList.toggle("done", completed);
    });
  }

  function setReady() {
    updateWalletControls();
    applyContextualUi();
    const token = tokenEl.value;
    const selectedRound = getSelectedRoundMeta(roundConfig, roundEl.value);
    const amount = Number(amountEl.value || 0);
    const amountInvalid = Boolean(getAmountValidation());
    const amountReady = walletAddress && token === "SOL" && Number.isFinite(amount) && amount > 0 && !amountInvalid && selectedRound?.enabled && !selectedRound?.soldOut;
    const manualReady = txEl.value.trim().length > 20 && !amountInvalid && selectedRound?.enabled && !selectedRound?.soldOut;
    if (stepAttention === 1 && walletAddress) stepAttention = 0;
    if (stepAttention === 2 && token) stepAttention = 0;
    if (stepAttention === 3 && Number.isFinite(amount) && amount > 0 && !amountInvalid) stepAttention = 0;
    autoBuyBtn.disabled = !amountReady;
    submitBtn.disabled = !manualReady;
    autoBuyBtn.textContent = token === "SOL" ? "Buy SOL with Phantom" : "Automatic buy only for SOL";
    submitBtn.textContent = token === "SOL" ? "Register TX" : `Register ${token} TX`;
    updateStepWitness();
  }

  [tokenEl, amountEl, txEl, roundEl].forEach((el) => el.addEventListener("input", () => {
    if (!receiptOverlay?.classList.contains("show")) receiptCompleted = false;
    updateRoundMeta();
    updateTokenDetails();
    setReady();
  }));

  amountEl.addEventListener("input", () => {
    amountEl.value = amountEl.value.replace(/[^0-9.]/g, "");
  });

  copyDestinationBtn?.addEventListener("click", async () => {
    const value = destinationEl.value.trim();
    if (!value) return;
    try {
      await copyToClipboardWithFallback(value);
      copyDestinationBtn.textContent = "✔ COPIED";
      copyDestinationBtn.classList.add("copied");
      setTimeout(() => {
        copyDestinationBtn.textContent = "COPY ADDRESS";
        copyDestinationBtn.classList.remove("copied");
      }, 1600);
    } catch {
      setMsg("Could not copy the destination address. Copy it manually.", "error");
    }
  });

  receiptCloseBtn?.addEventListener("click", closeReceipt);
  receiptCloseActionBtn?.addEventListener("click", closeReceipt);
  receiptOverlay?.addEventListener("click", (event) => {
    if (event.target === receiptOverlay) closeReceipt();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && receiptOverlay?.classList.contains("show")) {
      closeReceipt();
    }
  });
  receiptCopyTxBtn?.addEventListener("click", async () => {
    const txHash = receiptTxEl?.textContent?.trim();
    if (!txHash || txHash === "-") return;
    try {
      await copyToClipboardWithFallback(txHash);
      receiptCopyTxBtn.textContent = "Copied";
      setTimeout(() => {
        receiptCopyTxBtn.textContent = "Copy TX";
      }, 1400);
    } catch {
      receiptCopyTxBtn.textContent = "Copy failed";
      setTimeout(() => {
        receiptCopyTxBtn.textContent = "Copy TX";
      }, 1400);
    }
  });

  historyRefreshBtn?.addEventListener("click", async () => {
    await loadPurchaseHistory(true);
  });

  openBtn.addEventListener("click", () => openInPreferredWallet("#buy"));
  openBtn.textContent = "Open Phantom";
  if (isMobileDevice() && !isInPhantomBrowser()) {
    openBtn.classList.add("show");
  }

  clearHistory();

  (async () => {
    try {
      roundConfig = await fetchRoundConfig();
      syncRoundOptions(roundEl, roundConfig);
      applyContextualUi();
      updateRoundMeta();
      updateTokenDetails();
      updateProgress();
      setReady();
      updateTrustBar();
    } catch (err) {
      roundMetaEl.textContent = "Could not load round configuration.";
      setMsg(err?.message || "Could not load round configuration.", "error");
    }
  })();

  setInterval(async () => {
    try {
      roundConfig = await fetchRoundConfig();
      syncRoundOptions(roundEl, roundConfig);
      applyContextualUi();
      updateRoundMeta();
      updateTokenDetails();
      updateProgress();
      setReady();
    } catch (_) {}
  }, 30000);

  async function ensureConnected() {
    const preferredWallet = provider ? { provider, name: provider?.isPhantom ? "Phantom" : provider?.isBackpack ? "Backpack" : provider?.isSolflare ? "Solflare" : "Wallet" } : await getPreferredSolanaProvider();
    provider = preferredWallet?.provider;
    const providerLabel = preferredWallet?.name || "wallet";

    if (!provider) {
      if (isMobileDevice() && !isInPhantomBrowser()) {
        openBtn.classList.add("show");
        openInPreferredWallet("#buy");
        throw new Error("Opening Phantom...");
      }
      throw new Error("No compatible wallet was found on this device.");
    }

    const resp = await provider.connect({ onlyIfTrusted: false });
    walletAddress = resp.publicKey.toString();
    updateWalletControls();
    setMsg(
      isMobileDevice() && isInPhantomBrowser()
        ? `<strong>${providerLabel} connected:</strong> ${shortAddress(walletAddress)}. Wallet mode is active. Continue with the automatic SOL purchase below.`
        : `<strong>${providerLabel} connected:</strong> ${shortAddress(walletAddress)}. Use automatic buy for SOL, or for USDT / USDC send funds on Solana and register the confirmed transaction hash.`,
      "ok"
    );
    stepAttention = 0;
    setReady();
    await loadPurchaseHistory(true);
    return provider;
  }

  async function disconnectCurrentWallet() {
    try {
      if (provider?.disconnect) {
        await provider.disconnect();
      }
    } catch (_) {}
    walletAddress = "";
    provider = null;
    receiptCompleted = false;
    stepAttention = 0;
    if (txEl && tokenEl?.value === "SOL") txEl.value = "";
    setMsg("<strong>Wallet disconnected.</strong> You can connect another wallet whenever you want.", "warn");
    updateWalletControls();
    clearHistory();
    setReady();
  }

  changeWalletBtn?.addEventListener("click", async () => {
    await disconnectCurrentWallet();
    stepAttention = 1;
    setMsg("<strong>Switch account in Phantom.</strong> Open Phantom, choose another account, then tap <strong>Connect Wallet</strong> again to load that wallet in the app.", "warn");
    updateWalletControls();
    setReady();
  });

  disconnectWalletBtn?.addEventListener("click", async () => {
    await disconnectCurrentWallet();
  });

  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = isMobileDevice() && !isInPhantomBrowser() ? "Opening Phantom..." : "Connecting...";
      await ensureConnected();
    } catch (err) {
      if (err?.message === "Opening Phantom...") {
        connectBtn.textContent = "Connect Wallet";
      } else {
        connectBtn.textContent = "Connect Wallet";
        setMsg(err?.message || "Could not connect the wallet.", "error");
      }
    } finally {
      connectBtn.disabled = false;
      updateWalletControls();
    }
  });

  async function registerRoundPurchase(txHash) {
    if (quoteNeedsRefresh(roundConfig)) {
      roundConfig = await fetchRoundConfig();
      syncRoundOptions(roundEl, roundConfig);
      updateRoundMeta();
      updateProgress();
    }

    const selectedToken = tokenEl.value;
    const expectedStableAmount = Number(estimatedUsdEl?.textContent?.replace(/[^0-9.]/g, "") || 0);
    const payload = {
      wallet: walletAddress || null,
      tx_hash: txHash,
      round: roundEl.value,
      payment_token: selectedToken,
      requested_amount: selectedToken === "SOL" ? Number(amountEl.value || 0) : expectedStableAmount,
      requested_amount_usd: expectedStableAmount,
      quote: roundConfig?.quote || null,
    };

    let lastError = null;

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const resp = await fetch("/api/round/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        if (data?.round_status) {
          const meta = roundConfig?.rounds?.[roundEl.value];
          if (meta) {
            meta.raisedFiru = data.round_status.raised_firu;
            meta.remainingFiru = data.round_status.remaining_firu;
            meta.soldOut = Boolean(data.round_status.sold_out);
          }
          updateRoundMeta();
          updateProgress();
          setReady();
        }
        return data;
      }

      lastError = new Error(data?.error || "Round registration failed");
      if (/transaction not found/i.test(lastError.message) && attempt < 6) {
        await wait(2000);
        continue;
      }
      throw lastError;
    }

    throw lastError || new Error("Round registration failed");
  }

  autoBuyBtn.addEventListener("click", async () => {
    try {
      if (tokenEl.value !== "SOL") {
        throw new Error("Automatic buy is only available for SOL. Use manual TX registration for USDT and USDC.");
      }

      const missingStep = getMissingBuyStep();
      if (missingStep) {
        stepAttention = missingStep.step;
        setMsg(missingStep.message, "warn");
        setReady();
        return;
      }

      await ensureConnected();
      stepAttention = 0;

      if (quoteNeedsRefresh(roundConfig, 120_000)) {
        roundConfig = await fetchRoundConfig();
        syncRoundOptions(roundEl, roundConfig);
        updateRoundMeta();
        updateProgress();
      }

      const round = getSelectedRoundMeta(roundConfig, roundEl.value);
      const amount = Number(amountEl.value || 0);

      if (!round?.enabled || round?.soldOut) throw new Error(round?.soldOut ? "This round is sold out." : "This round is currently closed.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid SOL amount.");
      if (!roundConfig?.projectReceiveWallet) throw new Error("Project wallet is not configured.");

      if (amount < Number(roundConfig?.limits?.minSol || 0)) {
        throw new Error(`Minimum purchase is ${formatCompact(roundConfig.limits.minSol, 4)} SOL.`);
      }
      if (amount > Number(roundConfig?.limits?.maxSol || 0)) {
        throw new Error(`Maximum purchase is ${formatCompact(roundConfig.limits.maxSol, 4)} SOL.`);
      }

      const estimatedFiru = getEstimatedFiruForAmount("SOL", amount, round);
      if (typeof round?.remainingFiru === "number" && estimatedFiru > Number(round.remainingFiru || 0)) {
        const remainingSol = getRemainingPaymentEquivalent("SOL", round);
        throw new Error(
          round.soldOut
            ? "This round is sold out."
            : remainingSol !== null
              ? `Only ${formatCompact(remainingSol, 4)} SOL remains in this round at the current price.`
              : `Only ${formatCompact(round.remainingFiru, 0)} $FIRU remains in this round.`
        );
      }

      autoBuyBtn.disabled = true;
      autoBuyBtn.textContent = "Preparing...";
      setMsg("Preparing Phantom transaction...", "warn");

      const primaryRpcUrl = roundConfig.rpcUrl || "https://api.mainnet-beta.solana.com";
      const sender = new PublicKey(walletAddress);
      const recipient = new PublicKey(roundConfig.projectReceiveWallet);
      const lamports = Math.round(amount * LAMPORTS_PER_SOL);
      const minFeeReserveLamports = 10000;

      let walletBalanceLamports = null;
      try {
        walletBalanceLamports = await getWalletBalanceWithFallback(sender, primaryRpcUrl);
      } catch (balanceError) {
        console.warn("wallet balance precheck skipped", balanceError);
      }

      if (Number.isFinite(walletBalanceLamports) && walletBalanceLamports < lamports + minFeeReserveLamports) {
        const availableSol = walletBalanceLamports / LAMPORTS_PER_SOL;
        throw new Error(
          `Insufficient SOL balance. You need at least ${formatCompact(amount, 4)} SOL plus network fee. Wallet balance: ${formatCompact(availableSol, 4)} SOL.`
        );
      }

      let latest;
      let tx;

      autoBuyBtn.textContent = "Checking...";
      try {
        let lastServerBlockhashError = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            latest = await fetchServerRoundBlockhash();
            break;
          } catch (serverBlockhashError) {
            lastServerBlockhashError = serverBlockhashError;
            if (attempt < 2) {
              await wait(700);
            }
          }
        }

        if (!latest?.blockhash) {
          throw lastServerBlockhashError || new Error("Could not get server blockhash.");
        }

        tx = new Transaction({
          feePayer: sender,
          recentBlockhash: latest.blockhash
        }).add(
          SystemProgram.transfer({
            fromPubkey: sender,
            toPubkey: recipient,
            lamports
          })
        );
      } catch (serverBlockhashError) {
        const canWalletSendDirect = typeof provider?.signAndSendTransaction === "function";

        if (canWalletSendDirect) {
          console.warn("server blockhash failed for direct wallet send", serverBlockhashError);
          throw new Error("Could not get a fresh Solana blockhash from the server. Please try again in a few seconds.");
        }

        console.warn("server blockhash failed, falling back to browser rpc", serverBlockhashError);
        const rpcContext = await getWorkingRpcContext(primaryRpcUrl, sender, recipient, lamports);
        latest = rpcContext.latest;
        tx = rpcContext.tx;
      }

      autoBuyBtn.textContent = "Waiting for approval...";
      let signature = "";

      if (typeof provider.signAndSendTransaction === "function") {
        const sent = await provider.signAndSendTransaction(tx);
        signature = sent?.signature || "";
      } else if (typeof provider.signTransaction === "function") {
        const signedTx = await provider.signTransaction(tx);
        signature = await sendRawTransactionWithFallback(signedTx.serialize(), primaryRpcUrl);
      } else {
        throw new Error("This wallet does not support transaction signing.");
      }

      if (!signature) {
        throw new Error("Wallet did not return a transaction signature.");
      }

      txEl.value = signature;
      autoBuyBtn.textContent = "Registering...";
      setMsg("Transaction sent. Verifying it with the server...", "warn");

      await wait(3500);
      const data = await registerRoundPurchase(signature);

      if (data?.round_status) {
        const meta = roundConfig?.rounds?.[roundEl.value];
        if (meta) {
          meta.raisedFiru = data.round_status.raised_firu;
          meta.remainingFiru = data.round_status.remaining_firu;
          meta.soldOut = Boolean(data.round_status.sold_out);
        }
      }

      updateRoundMeta();
      updateProgress();
      setReady();

      setMsg(
        `<strong>✔ Payment registered successfully.</strong> ${data.payment_amount} ${data.payment_token} verified · ${formatCurrency(data.payment_amount_usd, 2)} market value · ${formatCompact(data.firu_allocation, 0)} $FIRU allocated. Your allocation is now reserved for distribution after launch.`,
        "ok"
      );

      autoBuyBtn.textContent = "Purchased";
      submitBtn.textContent = "Registered";
      lockPurchaseUi();
      openReceipt(data);
      await loadPurchaseHistory(true);
    } catch (err) {
      autoBuyBtn.disabled = false;
      autoBuyBtn.textContent = tokenEl.value === "SOL" ? "Buy SOL with Phantom" : "Automatic buy only for SOL";
      setReady();

      const rawMessage = String(err?.message || "");
      let message = rawMessage || "Could not complete the automatic Phantom purchase.";

      if (/user rejected|rejected the request|4001/i.test(rawMessage)) {
        message = "The wallet request was rejected before signing.";
      } else if (/could not safely simulate|simulation failed|blocked this transaction during simulation/i.test(rawMessage)) {
        message = "Phantom could not safely simulate this transaction yet. Please try again in a few seconds.";
      } else if (/invalid arguments/i.test(rawMessage)) {
        message = "Phantom rejected the transaction format. Please try again. If it keeps happening, we need one more compatibility adjustment.";
      } else if (/fresh Solana blockhash from the server/i.test(rawMessage)) {
        message = "Could not get a fresh Solana blockhash from the server. Please try again in a few seconds.";
      } else if (/recent blockhash|failed to fetch|could not reach solana rpc/i.test(rawMessage)) {
        message = "Could not reach Solana from this browser at this moment. Please try again in a few seconds.";
      } else if (/does not match the amount entered|payment amount mismatch/i.test(rawMessage)) {
        message = rawMessage;
      } else if (/wallet did not return a transaction signature|missing transaction signature/i.test(rawMessage)) {
        message = "The wallet did not return a valid signature. Please reopen Phantom and try again.";
      } else if (/insufficient/i.test(rawMessage)) {
        message = "Insufficient SOL balance for the purchase amount plus network fee.";
      }

      setMsg(message, "error");
    }
  });

  submitBtn.addEventListener("click", async () => {
    try {
        const tx_hash = txEl.value.trim();
      if (!tx_hash || tx_hash.length < 20) {
        setMsg("Paste a valid transaction hash.", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Validating...";
      setMsg(`Checking the ${tokenEl.value} transaction on Solana and registering your purchase...`, "warn");

      const data = await registerRoundPurchase(tx_hash);

      setMsg(
        `<strong>✔ Payment registered successfully.</strong> ${data.payment_amount} ${data.payment_token} verified · ${formatCurrency(data.payment_amount_usd, 2)} market value · ${formatCompact(data.firu_allocation, 0)} $FIRU allocated. Your allocation is now reserved for distribution after launch.`,
        "ok"
      );

      submitBtn.textContent = "Registered";
      lockPurchaseUi();
      openReceipt(data);
      await loadPurchaseHistory(true);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register TX";
      setReady();
      setMsg(err?.message || "Could not register the purchase.", "error");
    }
  });
}
