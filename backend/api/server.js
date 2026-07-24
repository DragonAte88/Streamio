const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const pool = require("./db/pool");

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch (e) {
    res.status(503).json({ ok: false, error: String(e) });
  }
});

app.use("/auth", require("./routes/auth"));
app.use("/channels", require("./routes/channels"));
app.use("/watchlist", require("./routes/watchlist"));
app.use("/artwork", require("./routes/artwork"));
app.use("/profile", require("./routes/profile"));
app.use("/social", require("./routes/social"));
app.use("/account", require("./routes/account"));
app.use("/admin", require("./routes/admin"));
app.use("/auth/discord", require("./routes/discord"));

const { router: assetsRouter, UPLOAD_DIR } = require("./routes/assets");
app.use("/assets", assetsRouter);
app.use("/uploads", express.static(UPLOAD_DIR));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("[migrate] schema applied");
}

const PORT = process.env.PORT || 4000;
migrate()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`[streamio-backend] listening on ${PORT}`));
  })
  .catch((e) => {
    console.error("[migrate] failed", e);
    process.exit(1);
  });
