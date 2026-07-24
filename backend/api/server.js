const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const pool = require("./db/pool");

const app = express();
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
