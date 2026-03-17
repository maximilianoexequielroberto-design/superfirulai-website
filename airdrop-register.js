// Phantom Wallet Connection - FIXED VERSION

async function getProvider() {
  if ('solana' in window) {
    const provider = window.solana;
    if (provider.isPhantom) return provider;
  }

  // wait for Phantom injection
  for (let i = 0; i < 20; i++) {
    if (window.solana?.isPhantom) {
      return window.solana;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  return null;
}

async function connectWallet() {
  const provider = await getProvider();

  if (!provider) {
    alert("Open this page inside Phantom Wallet");
    return;
  }

  try {
    const resp = await provider.connect();
    console.log("Connected:", resp.publicKey.toString());
    alert("Wallet connected successfully");
  } catch (err) {
    alert("Connection failed: " + err.message);
  }
}

// Attach button
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("connectWallet");
  if (btn) {
    btn.addEventListener("click", connectWallet);
  }
});
