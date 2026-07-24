const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || "postgres",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "streamio",
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || "streamio"
});

module.exports = pool;
