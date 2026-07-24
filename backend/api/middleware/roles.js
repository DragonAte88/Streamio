const pool = require("../db/pool");

function requireAdmin(req, res, next) {
  pool.query("SELECT role FROM users WHERE id = $1", [req.user.sub]).then((result) => {
    if (result.rows[0]?.role !== "admin") return res.status(403).json({ error: "admin only" });
    next();
  }, next);
}

function requireUploader(req, res, next) {
  pool.query("SELECT role, can_upload_assets FROM users WHERE id = $1", [req.user.sub]).then((result) => {
    const row = result.rows[0];
    if (!row || (row.role !== "admin" && !row.can_upload_assets)) {
      return res.status(403).json({ error: "upload permission required" });
    }
    next();
  }, next);
}

module.exports = { requireAdmin, requireUploader };
