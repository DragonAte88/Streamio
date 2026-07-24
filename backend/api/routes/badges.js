const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/roles");

const router = express.Router();
router.use(requireAuth);

router.get("/user/:userId", async (req, res) => {
  const result = await pool.query("SELECT badge_slug, granted_at FROM user_badges WHERE user_id=$1 ORDER BY granted_at", [
    req.params.userId
  ]);
  res.json({ badges: result.rows });
});

router.get("/me", async (req, res) => {
  const result = await pool.query("SELECT badge_slug, granted_at FROM user_badges WHERE user_id=$1 ORDER BY granted_at", [
    req.user.sub
  ]);
  res.json({ badges: result.rows });
});

router.post("/user/:userId/:slug", requireAdmin, async (req, res) => {
  await pool.query(
    "INSERT INTO user_badges (user_id, badge_slug, granted_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
    [req.params.userId, req.params.slug, req.user.sub]
  );
  res.status(204).end();
});

router.delete("/user/:userId/:slug", requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM user_badges WHERE user_id=$1 AND badge_slug=$2", [req.params.userId, req.params.slug]);
  res.status(204).end();
});

module.exports = router;
