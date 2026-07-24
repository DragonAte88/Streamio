const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();

function randomDigits(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += crypto.randomInt(0, 10);
  return s;
}

async function assignInternalAccountId(client) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${randomDigits(12)}.#${randomDigits(6)}`;
    const exists = await client.query("SELECT 1 FROM users WHERE internal_account_id=$1", [candidate]);
    if (exists.rows.length === 0) return candidate;
  }
  throw new Error("could not allocate an internal account id");
}

async function assignDiscriminator(client, username) {
  for (let n = 1; n <= 9999; n++) {
    const candidate = String(n).padStart(4, "0");
    const exists = await client.query("SELECT 1 FROM users WHERE username=$1 AND discriminator=$2", [username, candidate]);
    if (exists.rows.length === 0) return candidate;
  }
  throw new Error("no discriminators available for this username");
}

function sanitizeUsername(raw) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24) || "user";
}

router.post("/register", async (req, res) => {
  const { email, password, displayName } = req.body || {};
  let { username } = req.body || {};
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: "email and password (min 8 chars) required" });
  }
  username = sanitizeUsername(username || email.split("@")[0]);

  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const discriminator = await assignDiscriminator(client, username);
    const internalAccountId = await assignInternalAccountId(client);
    const result = await client.query(
      `INSERT INTO users (email, password_hash, display_name, username, discriminator, internal_account_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, display_name, username, discriminator, avatar_url, banner_url, accent_color, bio,
                 onboarded, status, role, can_upload_assets, suspended`,
      [email.toLowerCase().trim(), hash, displayName || null, username, discriminator, internalAccountId]
    );
    await client.query("COMMIT");
    const user = result.rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({ token, user });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") return res.status(409).json({ error: "email already registered" });
    console.error(e);
    res.status(500).json({ error: "internal error" });
  } finally {
    client.release();
  }
});

const PROFILE_FIELDS = `id, email, display_name, username, discriminator, avatar_url, banner_url, accent_color, bio,
  onboarded, status, role, can_upload_assets, suspended, suspended_reason, discord_user_id, discord_username, discord_avatar_url`;

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const result = await pool.query(`SELECT ${PROFILE_FIELDS}, password_hash FROM users WHERE email = $1`, [
    email.toLowerCase().trim()
  ]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  delete user.password_hash;

  if (user.suspended) {
    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    return res.status(423).json({ error: "account suspended", suspendedReactivateToken: token, user });
  }

  await pool.query("UPDATE users SET last_active_at = now() WHERE id = $1", [user.id]);
  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user });
});

module.exports = router;
