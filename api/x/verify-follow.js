import { verifyXFollow } from "../../lib/x-auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const accessToken = String(req.body?.access_token || "").trim();
    const expectedUsername = String(req.body?.expected_username || "").trim();

    if (!accessToken) {
      return res.status(400).json({ error: "Missing X access token" });
    }

    const verification = await verifyXFollow({
      accessToken,
      expectedUsername
    });

    return res.status(200).json({
      ok: true,
      userId: verification.userId,
      username: verification.username,
      targetUserId: verification.targetUserId,
      targetUsername: verification.targetUsername,
      isFollowing: verification.isFollowing,
      verificationMode: verification.verificationMode,
      checkedAt: verification.checkedAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "X verification failed";
    const status = /follow/i.test(message) ? 403 : 400;
    return res.status(status).json({ error: message });
  }
}
