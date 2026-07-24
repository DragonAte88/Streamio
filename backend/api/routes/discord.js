const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Exchanges an OAuth2 authorization code for tokens using the client secret,
// which lives only here (server-side) - never shipped in the Electron client.
router.post("/callback", requireAuth, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "code required" });

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });
    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[discord oauth] token exchange failed", tokenRes.status, errBody);
      return res.status(502).json({ error: "Discord token exchange failed" });
    }
    const tokens = await tokenRes.json();

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    if (!userRes.ok) return res.status(502).json({ error: "failed to fetch Discord identity" });
    const discordUser = await userRes.json();

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    const result = await pool.query(
      `UPDATE users SET
         discord_user_id = $1,
         discord_username = $2,
         discord_avatar_url = $3,
         discord_access_token = $4,
         discord_refresh_token = $5
       WHERE id = $6
       RETURNING id, discord_user_id, discord_username, discord_avatar_url`,
      [discordUser.id, `${discordUser.username}`, avatarUrl, tokens.access_token, tokens.refresh_token, req.user.sub]
    );

    res.json({ user: result.rows[0] });
  } catch (e) {
    console.error("[discord oauth] error", e);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/unlink", requireAuth, async (req, res) => {
  await pool.query(
    `UPDATE users SET discord_user_id=NULL, discord_username=NULL, discord_avatar_url=NULL,
       discord_access_token=NULL, discord_refresh_token=NULL WHERE id=$1`,
    [req.user.sub]
  );
  res.status(204).end();
});

module.exports = router;
