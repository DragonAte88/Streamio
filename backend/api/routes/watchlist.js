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
  const result = await pool.query(
    "INSERT INTO watch_history (user_id, channel_id) VALUES ($1,$2) RETURNING id",
    [req.user.sub, req.params.channelId]
  );
  // The id lets the client update this exact row as playback progresses,
  // instead of inserting a new row every few seconds.
  res.json({ historyId: result.rows[0].id });
});

/**
 * Progress ping. Updates the row in place rather than appending, so one viewing
 * session stays one row no matter how long it runs.
 */
router.post("/history/:historyId/progress", async (req, res) => {
  const { position, duration } = req.body || {};
  if (typeof position !== "number") return res.status(400).json({ error: "position required" });

  await pool.query(
    `UPDATE watch_history
        SET position_seconds = $1,
            duration_seconds = COALESCE($2, duration_seconds),
            updated_at = now()
      WHERE id = $3 AND user_id = $4`,
    [Math.floor(position), typeof duration === "number" ? Math.floor(duration) : null, req.params.historyId, req.user.sub]
  );
  res.status(204).end();
});

/**
 * Continue Watching: finite media that was started but not finished.
 * Excludes live channels (no duration) and anything past 92% - at that point
 * it has effectively been watched and resuming it is annoying, not helpful.
 */
router.get("/continue", async (req, res) => {
  const result = await pool.query(
    `SELECT DISTINCT ON (c.id)
            c.id, c.tvg_id, c.name, c.url, c.logo, c.group_name,
            h.position_seconds, h.duration_seconds, h.updated_at
       FROM watch_history h
       JOIN channels c ON c.id = h.channel_id
      WHERE h.user_id = $1
        AND h.position_seconds IS NOT NULL
        AND h.duration_seconds IS NOT NULL
        AND h.duration_seconds > 0
        AND h.position_seconds > 30
        AND (h.position_seconds::float / h.duration_seconds) < 0.92
      ORDER BY c.id, h.updated_at DESC NULLS LAST
      LIMIT 20`,
    [req.user.sub]
  );
  // Re-sort by recency across channels; DISTINCT ON forced ordering by c.id.
  const rows = result.rows.sort(
    (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
  );
  res.json({ channels: rows });
});

/** Aggregate viewing signal used to weight recommendations. */
router.get("/stats", async (req, res) => {
  const byGroup = await pool.query(
    `SELECT c.group_name, COUNT(*)::int AS plays,
            COALESCE(SUM(h.position_seconds), 0)::int AS seconds
       FROM watch_history h JOIN channels c ON c.id = h.channel_id
      WHERE h.user_id = $1
      GROUP BY c.group_name
      ORDER BY plays DESC`,
    [req.user.sub]
  );
  const totals = await pool.query(
    `SELECT COUNT(*)::int AS plays,
            COUNT(DISTINCT channel_id)::int AS distinct_channels,
            COALESCE(SUM(position_seconds), 0)::int AS seconds
       FROM watch_history WHERE user_id = $1`,
    [req.user.sub]
  );
  res.json({ byGroup: byGroup.rows, totals: totals.rows[0] });
});

// ── Favorites ──────────────────────────────────────────────────────────────
router.get("/favorites", async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.tvg_id, c.name, c.url, c.logo, c.group_name
       FROM favorites f JOIN channels c ON c.id = f.channel_id
      WHERE f.user_id = $1 ORDER BY f.added_at DESC`,
    [req.user.sub]
  );
  res.json({ channels: result.rows });
});

router.post("/favorites/:channelId", async (req, res) => {
  await pool.query(
    "INSERT INTO favorites (user_id, channel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [req.user.sub, req.params.channelId]
  );
  res.status(204).end();
});

router.delete("/favorites/:channelId", async (req, res) => {
  await pool.query("DELETE FROM favorites WHERE user_id=$1 AND channel_id=$2", [req.user.sub, req.params.channelId]);
  res.status(204).end();
});

/** What friends have been watching - the social signal behind recommendations. */
router.get("/friends-activity", async (req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.tvg_id, c.name, c.url, c.logo, c.group_name,
            u.id AS friend_id, u.username, u.display_name, u.avatar_url,
            MAX(h.watched_at) AS watched_at
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END
       JOIN watch_history h ON h.user_id = u.id
       JOIN channels c ON c.id = h.channel_id
      WHERE (f.user_a_id = $1 OR f.user_b_id = $1)
        AND u.privacy_show_activity IS NOT FALSE
      GROUP BY c.id, c.tvg_id, c.name, c.url, c.logo, c.group_name,
               u.id, u.username, u.display_name, u.avatar_url
      ORDER BY watched_at DESC
      LIMIT 30`,
    [req.user.sub]
  );
  res.json({ items: result.rows });
});

module.exports = router;
