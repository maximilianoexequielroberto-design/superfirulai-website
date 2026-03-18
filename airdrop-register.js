import bs58 from "https://esm.sh/bs58@6.0.0";

export function mountAirdropRegister(selector) {
  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `
    <button id="connect">Connect Wallet</button>
    <button id="register">Register Airdrop</button>
    <p id="status"></p>
  `;

  let wallet = "";
  let signature = "";
  let message = "";

  const status = root.querySelector("#status");

  document.getElementById("connect").onclick = async () => {
    try {
      const provider = window.solana;
      const res = await provider.connect();
      wallet = res.publicKey.toString();

      message = "SuperFirulai Airdrop";
      const encoded = new TextEncoder().encode(message);
      const signed = await provider.signMessage(encoded, "utf8");

      signature = bs58.encode(signed.signature);

      status.textContent = "Wallet connected and signed";
    } catch (e) {
      status.textContent = "Error connecting wallet";
    }
  };

  document.getElementById("register").onclick = async () => {
    try {
      const res = await fetch("/api/airdrop/register", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ wallet, message, signature })
      });

      const data = await res.json();
      status.textContent = data.message || data.error;
    } catch {
      status.textContent = "Register error";
    }
  };
}
