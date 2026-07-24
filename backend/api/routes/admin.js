const express = require("express");
const os = require("os");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/roles");
const logBuffer = require("../lib/logBuffer");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/stats", async (req, res) => {
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM users WHERE suspended) AS suspended_users,
        (SELECT count(*) FROM users WHERE status = 'online') AS online_users,
        (SELECT count(*) FROM channels) AS channels,
        (SELECT count(*) FROM assets) AS assets,
        (SELECT count(*) FROM rooms) AS rooms,
        (SELECT count(*) FROM room_messages) AS room_messages,
        (SELECT count(*) FROM direct_messages) AS direct_messages,
        (SELECT count(*) FROM friendships) AS friendships
    `);

    const cpus = os.cpus();
    const load = os.loadavg();

    res.json({
      database: counts.rows[0],
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        pid: process.pid
      },
      host: {
        platform: os.platform(),
        arch: os.arch(),
        cpuModel: cpus[0]?.model || "unknown",
        cpuCount: cpus.length,
        loadAvg1m: load[0],
        loadAvg5m: load[1],
        loadAvg15m: load[2],
        totalMemBytes: os.totalmem(),
        freeMemBytes: os.freemem(),
        uptimeSeconds: Math.round(os.uptime())
      },
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("[admin/stats]", e);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/logs", (req, res) => {
  res.json({ logs: logBuffer.getAll() });
});

router.get("/users", async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, display_name, username, discriminator, internal_account_id, role, can_upload_assets,
            suspended, suspended_reason, onboarded, status, created_at
     FROM users ORDER BY created_at DESC`
  );
  res.json({ users: result.rows });
});

router.post("/users/:userId/suspend", async (req, res) => {
  const { reason } = req.body || {};
  await pool.query("UPDATE users SET suspended = true, suspended_reason = $1 WHERE id = $2", [
    reason || "Suspended by administrator",
    req.params.userId
  ]);
  res.status(204).end();
});

router.post("/users/:userId/unsuspend", async (req, res) => {
  await pool.query("UPDATE users SET suspended = false, suspended_reason = NULL WHERE id = $1", [req.params.userId]);
  res.status(204).end();
});

router.delete("/users/:userId", async (req, res) => {
  await pool.query("DELETE FROM users WHERE id = $1", [req.params.userId]);
  res.status(204).end();
});

router.post("/users/:userId/grant-upload", async (req, res) => {
  await pool.query("UPDATE users SET can_upload_assets = true WHERE id = $1", [req.params.userId]);
  res.status(204).end();
});

router.post("/users/:userId/revoke-upload", async (req, res) => {
  await pool.query("UPDATE users SET can_upload_assets = false WHERE id = $1", [req.params.userId]);
  res.status(204).end();
});

module.exports = router;
