const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/me", async (req, res) => {
  const result = await pool.query(
    "SELECT id, email, display_name, username, avatar_url, bio, onboarded, discord_user_id FROM users WHERE id = $1",
    [req.user.sub]
  );
  res.json({ user: result.rows[0] });
});

router.patch("/me", async (req, res) => {
  const { displayName, username, avatarUrl, bio, discordUserId, onboarded } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE users SET
         display_name = COALESCE($1, display_name),
         username = COALESCE($2, username),
         avatar_url = COALESCE($3, avatar_url),
         bio = COALESCE($4, bio),
         discord_user_id = COALESCE($5, discord_user_id),
         onboarded = COALESCE($6, onboarded)
       WHERE id = $7
       RETURNING id, email, display_name, username, avatar_url, bio, onboarded, discord_user_id`,
      [displayName, username, avatarUrl, bio, discordUserId, onboarded, req.user.sub]
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "username already taken" });
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ users: [] });
  const result = await pool.query(
    `SELECT id, display_name, username, avatar_url FROM users
     WHERE (username ILIKE $1 OR display_name ILIKE $1) AND id != $2 LIMIT 20`,
    [`%${q}%`, req.user.sub]
  );
  res.json({ users: result.rows });
});

module.exports = router;
