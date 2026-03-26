const PHANTOM_DEEPLINK_BASE = "https://phantom.app/ul/browse/";
const MOBILE_RE = /Android|iPhone|iPad|iPod/i;

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
    { name: "Phantom", provider: window.phantom?.solana || (direct?.isPhantom ? direct : null), mobile: true },
    { name: "Backpack", provider: window.backpack?.solana || (direct?.isBackpack ? direct : null), mobile: false },
    { name: "Solflare", provider: window.solflare || (direct?.isSolflare ? direct : null), mobile: false }
  ];

  return candidates.filter((item) => item.provider);
}

export function getAvailableSolanaWallets() {
  return getProviderCandidates();
}

export async function getPreferredSolanaProvider() {
  for (let i = 0; i < 25; i++) {
    const matches = getProviderCandidates();
    if (matches.length) {
      const preferred = matches.find((item) => item.name === "Phantom") || matches[0];
      return preferred;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return null;
}


export function getWalletLabel(provider) {
  if (!provider) return "Wallet";
  if (provider.isPhantom) return "Phantom";
  if (provider.isBackpack) return "Backpack";
  if (provider.isSolflare) return "Solflare";
  return "Wallet";
}

export async function disconnectSolanaWallet(provider) {
  try {
    if (provider?.disconnect) {
      await provider.disconnect();
    }
  } catch (_) {}
}
