const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/roles");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/users", async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, display_name, username, discriminator, role, can_upload_assets, suspended, suspended_reason,
            onboarded, status, created_at
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
