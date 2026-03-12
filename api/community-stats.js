export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const holders = Number(process.env.HOLDERS_COUNT || 2418);
  const xFollowers = Number(process.env.X_FOLLOWERS_COUNT || 61);
  const totalSupply = Number(process.env.TOTAL_SUPPLY || 1000000000);

  let telegramMembers = Number(process.env.TELEGRAM_MEMBERS_FALLBACK || 24);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  try {
    if (token && chatId) {
      const url = `https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${encodeURIComponent(chatId)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data && data.ok && typeof data.result === "number") {
        telegramMembers = data.result;
      }
    }
  } catch (e) {
    // fallback to env/default
  }

  return res.status(200).json({
    holders,
    telegramMembers,
    xFollowers,
    totalSupply
  });
}
