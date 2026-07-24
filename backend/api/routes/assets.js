const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { requireUploader, requireAdmin } = require("../middleware/roles");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = {
  video: [".mp4", ".mkv"],
  audio: [".mp3"],
  image: [".png", ".jpg", ".jpeg", ".webp"]
};

function kindForExt(ext) {
  for (const [kind, exts] of Object.entries(ALLOWED_EXT)) if (exts.includes(ext)) return kind;
  return null;
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB ceiling
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!kindForExt(ext)) return cb(new Error(`unsupported file type: ${ext}`));
    cb(null, true);
  }
});

router.use(requireAuth);

router.post("/", requireUploader, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });
  const { title, category } = req.body || {};
  const ext = path.extname(req.file.originalname).toLowerCase();
  const kind = kindForExt(ext);
  const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

  try {
    const result = await pool.query(
      `INSERT INTO assets (uploader_id, filename, url, kind, title, category)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.sub, req.file.filename, publicUrl, kind, title || req.file.originalname, category || "Uncategorized"]
    );
    res.status(201).json({ asset: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/", requireUploader, async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, u.username, u.discriminator FROM assets a JOIN users u ON u.id = a.uploader_id ORDER BY a.created_at DESC`
  );
  res.json({ assets: result.rows });
});

// Move an asset's category, and/or publish/republish it into the channel
// catalog so it becomes playable + syncable in rooms like any other channel.
router.patch("/:assetId", requireUploader, async (req, res) => {
  const { title, category, publish } = req.body || {};
  const asset = await pool.query("SELECT * FROM assets WHERE id=$1", [req.params.assetId]);
  if (asset.rows.length === 0) return res.status(404).json({ error: "not found" });
  let a = asset.rows[0];

  if (title || category) {
    const updated = await pool.query(
      "UPDATE assets SET title = COALESCE($1,title), category = COALESCE($2,category) WHERE id=$3 RETURNING *",
      [title, category, req.params.assetId]
    );
    a = updated.rows[0];
  }

  if (publish && a.kind === "video") {
    if (a.published_channel_id) {
      await pool.query("UPDATE channels SET name=$1, group_name=$2, url=$3 WHERE id=$4", [
        a.title,
        a.category,
        a.url,
        a.published_channel_id
      ]);
    } else {
      const ch = await pool.query(
        "INSERT INTO channels (name, url, group_name) VALUES ($1,$2,$3) RETURNING id",
        [a.title, a.url, a.category]
      );
      await pool.query("UPDATE assets SET published_channel_id=$1 WHERE id=$2", [ch.rows[0].id, a.id]);
      a.published_channel_id = ch.rows[0].id;
    }
  }

  res.json({ asset: a });
});

router.delete("/:assetId", requireUploader, async (req, res) => {
  const asset = await pool.query("SELECT * FROM assets WHERE id=$1", [req.params.assetId]);
  if (asset.rows.length === 0) return res.status(404).json({ error: "not found" });
  const a = asset.rows[0];

  if (a.published_channel_id) await pool.query("DELETE FROM channels WHERE id=$1", [a.published_channel_id]);
  await pool.query("DELETE FROM assets WHERE id=$1", [req.params.assetId]);

  const filePath = path.join(UPLOAD_DIR, a.filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") console.error("[assets] failed to delete file", err);
  });

  res.status(204).end();
});

module.exports = { router, UPLOAD_DIR };
