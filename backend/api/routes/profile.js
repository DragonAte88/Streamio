const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const FIELDS = `id, email, display_name, username, discriminator, avatar_url, banner_url, accent_color, bio,
  onboarded, status, role, can_upload_assets, suspended, discord_user_id, discord_username, discord_avatar_url,
  privacy_show_activity, privacy_allow_friend_requests, last_active_at`;

router.get("/me", async (req, res) => {
  const result = await pool.query(`SELECT ${FIELDS} FROM users WHERE id = $1`, [req.user.sub]);
  res.json({ user: result.rows[0] });
});

router.patch("/me", async (req, res) => {
  const { displayName, avatarUrl, bannerUrl, accentColor, bio, discordUserId, onboarded, privacyShowActivity, privacyAllowFriendRequests } =
    req.body || {};
  try {
    const result = await pool.query(
      `UPDATE users SET
         display_name = COALESCE($1, display_name),
         avatar_url = COALESCE($2, avatar_url),
         banner_url = COALESCE($3, banner_url),
         accent_color = COALESCE($4, accent_color),
         bio = COALESCE($5, bio),
         discord_user_id = COALESCE($6, discord_user_id),
         onboarded = COALESCE($7, onboarded),
         privacy_show_activity = COALESCE($8, privacy_show_activity),
         privacy_allow_friend_requests = COALESCE($9, privacy_allow_friend_requests)
       WHERE id = $10
       RETURNING ${FIELDS}`,
      [displayName, avatarUrl, bannerUrl, accentColor, bio, discordUserId, onboarded, privacyShowActivity, privacyAllowFriendRequests, req.user.sub]
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/presence", async (req, res) => {
  const { status } = req.body || {};
  const valid = ["online", "idle", "dnd", "invisible", "offline"];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(", ")}` });
  await pool.query("UPDATE users SET status = $1, last_active_at = now() WHERE id = $2", [status, req.user.sub]);
  res.status(204).end();
});

router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ users: [] });
  const result = await pool.query(
    `SELECT id, display_name, username, discriminator, avatar_url, status FROM users
     WHERE (username ILIKE $1 OR display_name ILIKE $1) AND id != $2 AND suspended = false LIMIT 20`,
    [`%${q}%`, req.user.sub]
  );
  res.json({ users: result.rows });
});

router.get("/:userId", async (req, res) => {
  const result = await pool.query(
    `SELECT id, display_name, username, discriminator, avatar_url, banner_url, accent_color, bio, status,
            privacy_show_activity
     FROM users WHERE id = $1 AND suspended = false`,
    [req.params.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "not found" });
  res.json({ user: result.rows[0] });
});

module.exports = router;
