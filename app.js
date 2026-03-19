// UPDATED PRESALE FLOW

document.getElementById("buy").onclick = async () => {
  const tx = document.getElementById("tx").value;
  const receive_wallet = document.getElementById("receive_wallet").value;
  const round = document.getElementById("round").value;

  const res = await fetch("/api/round/register", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ tx_hash: tx, receive_wallet, round })
  });

  const data = await res.json();

  if (!res.ok) {
    document.getElementById("roundStatus").innerText = data.error;
    return;
  }

  document.getElementById("roundStatus").innerText =
    "Transaction verified | SOL: " + data.sol + " | FIRU: " + data.firu;
};
