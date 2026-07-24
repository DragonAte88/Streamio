const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { email, password, displayName, username } = req.body || {};
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: "email and password (min 8 chars) required" });
  }
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, username)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, username, avatar_url, bio, onboarded`,
      [email.toLowerCase().trim(), hash, displayName || null, username || null]
    );
    const user = result.rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
    res.status(201).json({ token, user });
  } catch (e) {
    if (e.code === "23505") {
      const field = e.constraint?.includes("username") ? "username" : "email";
      return res.status(409).json({ error: `${field} already taken` });
    }
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const result = await pool.query(
    "SELECT id, email, display_name, username, avatar_url, bio, onboarded, password_hash FROM users WHERE email = $1",
    [email.toLowerCase().trim()]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  delete user.password_hash;
  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user });
});

module.exports = router;
