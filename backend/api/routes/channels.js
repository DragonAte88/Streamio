const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT id, tvg_id, name, url, logo, group_name FROM channels ORDER BY group_name, name");
  res.json({ channels: result.rows });
});

router.post("/", requireAuth, async (req, res) => {
  const { name, url, logo, group, tvgId } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: "name and url required" });
  const result = await pool.query(
    "INSERT INTO channels (tvg_id, name, url, logo, group_name) VALUES ($1,$2,$3,$4,$5) RETURNING id, tvg_id, name, url, logo, group_name",
    [tvgId || null, name, url, logo || null, group || "Uncategorized"]
  );
  res.status(201).json({ channel: result.rows[0] });
});

module.exports = router;
