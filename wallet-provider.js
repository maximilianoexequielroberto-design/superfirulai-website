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

function askWalletChoice(matches) {
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  if (isMobileDevice()) {
    return matches.find((item) => item.name === "Phantom") || matches[0];
  }

  const text = [
    "Choose wallet:",
    ...matches.map((item, index) => `${index + 1}. ${item.name}`),
    "",
    "Write 1, 2 or 3 and press OK."
  ].join("\n");

  const raw = window.prompt(text, "1");
  if (raw == null) return null;

  const choice = Number.parseInt(String(raw).trim(), 10);
  if (Number.isInteger(choice) && matches[choice - 1]) {
    return matches[choice - 1];
  }

  return matches.find((item) => item.name === "Phantom") || matches[0];
}

export async function getPreferredSolanaProvider() {
  for (let i = 0; i < 25; i++) {
    const matches = getProviderCandidates();
    if (matches.length) {
      return askWalletChoice(matches);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return null;
}
