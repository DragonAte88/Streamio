const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/suspend", requireAuth, async (req, res) => {
  const { reason } = req.body || {};
  await pool.query("UPDATE users SET suspended = true, suspended_reason = $1 WHERE id = $2", [
    reason || "Suspended by user request",
    req.user.sub
  ]);
  res.status(204).end();
});

// Uses the short-lived suspendedReactivateToken issued at login time for a
// suspended account, since a normal session token isn't issued while suspended.
router.post("/reactivate", async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token required" });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "invalid or expired token" });
  }
  await pool.query("UPDATE users SET suspended = false, suspended_reason = NULL WHERE id = $1", [payload.sub]);
  const sessionToken = jwt.sign({ sub: payload.sub, email: payload.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
  const user = await pool.query("SELECT id, email, display_name, username, discriminator FROM users WHERE id = $1", [payload.sub]);
  res.json({ token: sessionToken, user: user.rows[0] });
});

// Permanent, irreversible: deleting the row cascades to every social/watchlist
// table via ON DELETE CASCADE, and frees the (username, discriminator) pair for
// reuse immediately since nothing soft-deleted is left holding onto it.
router.delete("/wipe", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id = $1", [req.user.sub]);
  res.status(204).end();
});

module.exports = router;
