const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.tvg_id, c.name, c.url, c.logo, c.group_name
     FROM watchlist w JOIN channels c ON c.id = w.channel_id
     WHERE w.user_id = $1 ORDER BY w.added_at DESC`,
    [req.user.sub]
  );
  res.json({ channels: result.rows });
});

router.post("/:channelId", async (req, res) => {
  await pool.query(
    "INSERT INTO watchlist (user_id, channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [req.user.sub, req.params.channelId]
  );
  res.status(204).end();
});

router.delete("/:channelId", async (req, res) => {
  await pool.query("DELETE FROM watchlist WHERE user_id=$1 AND channel_id=$2", [req.user.sub, req.params.channelId]);
  res.status(204).end();
});

router.get("/history", async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.tvg_id, c.name, c.url, c.logo, c.group_name
     FROM watch_history h JOIN channels c ON c.id = h.channel_id
     WHERE h.user_id = $1
     GROUP BY c.id, c.tvg_id, c.name, c.url, c.logo, c.group_name
     ORDER BY MAX(h.watched_at) DESC
     LIMIT 20`,
    [req.user.sub]
  );
  res.json({ channels: result.rows });
});

router.post("/:channelId/history", async (req, res) => {
  await pool.query("INSERT INTO watch_history (user_id, channel_id) VALUES ($1,$2)", [req.user.sub, req.params.channelId]);
  res.status(204).end();
});

module.exports = router;
