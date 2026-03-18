export default async function handler(req, res) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const challenge = crypto.randomUUID();

  res.status(200).json({ nonce, timestamp, challenge });
}
