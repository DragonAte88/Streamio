const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// --- Friend requests / friendships ---

router.post("/friends/requests/:toUserId", async (req, res) => {
  const fromId = req.user.sub;
  const toId = Number(req.params.toUserId);
  if (fromId === toId) return res.status(400).json({ error: "can't friend yourself" });
  try {
    await pool.query(
      "INSERT INTO friend_requests (from_user_id, to_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [fromId, toId]
    );
    res.status(201).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

router.get("/friends/requests/incoming", async (req, res) => {
  const result = await pool.query(
    `SELECT fr.id, u.id AS user_id, u.display_name, u.username, u.avatar_url, fr.created_at
     FROM friend_requests fr JOIN users u ON u.id = fr.from_user_id
     WHERE fr.to_user_id = $1 AND fr.status = 'pending'`,
    [req.user.sub]
  );
  res.json({ requests: result.rows });
});

router.post("/friends/requests/:requestId/accept", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reqRow = await client.query(
      "UPDATE friend_requests SET status='accepted' WHERE id=$1 AND to_user_id=$2 RETURNING from_user_id, to_user_id",
      [req.params.requestId, req.user.sub]
    );
    if (reqRow.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "request not found" });
    }
    const { from_user_id, to_user_id } = reqRow.rows[0];
    const [a, b] = from_user_id < to_user_id ? [from_user_id, to_user_id] : [to_user_id, from_user_id];
    await client.query("INSERT INTO friendships (user_a_id, user_b_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [a, b]);
    await client.query("COMMIT");
    res.status(204).end();
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "internal error" });
  } finally {
    client.release();
  }
});

router.post("/friends/requests/:requestId/decline", async (req, res) => {
  await pool.query("UPDATE friend_requests SET status='declined' WHERE id=$1 AND to_user_id=$2", [
    req.params.requestId,
    req.user.sub
  ]);
  res.status(204).end();
});

router.get("/friends", async (req, res) => {
  const uid = req.user.sub;
  const result = await pool.query(
    `SELECT u.id, u.display_name, u.username, u.avatar_url
     FROM friendships f JOIN users u ON u.id = (CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END)
     WHERE f.user_a_id = $1 OR f.user_b_id = $1`,
    [uid]
  );
  res.json({ friends: result.rows });
});

// --- Direct messages ---

router.get("/dm/:userId", async (req, res) => {
  const me = req.user.sub;
  const other = Number(req.params.userId);
  const result = await pool.query(
    `SELECT id, from_user_id, to_user_id, body, sent_at FROM direct_messages
     WHERE (from_user_id=$1 AND to_user_id=$2) OR (from_user_id=$2 AND to_user_id=$1)
     ORDER BY sent_at ASC LIMIT 200`,
    [me, other]
  );
  res.json({ messages: result.rows });
});

router.post("/dm/:userId", async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "body required" });
  const result = await pool.query(
    "INSERT INTO direct_messages (from_user_id, to_user_id, body) VALUES ($1,$2,$3) RETURNING id, from_user_id, to_user_id, body, sent_at",
    [req.user.sub, req.params.userId, body.trim().slice(0, 2000)]
  );
  res.status(201).json({ message: result.rows[0] });
});

// --- Rooms (watch parties / group chat) ---

router.get("/rooms", async (req, res) => {
  const result = await pool.query(
    `SELECT r.id, r.name, r.owner_id, r.is_public, r.active_channel_id, r.discord_voice_channel_id, r.created_at,
            (SELECT count(*) FROM room_members m WHERE m.room_id = r.id) AS member_count
     FROM rooms r
     WHERE r.is_public = true OR r.owner_id = $1 OR EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = $1)
     ORDER BY r.created_at DESC`,
    [req.user.sub]
  );
  res.json({ rooms: result.rows });
});

router.post("/rooms", async (req, res) => {
  const { name, isPublic } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const room = await client.query(
      "INSERT INTO rooms (name, owner_id, is_public) VALUES ($1,$2,$3) RETURNING *",
      [name, req.user.sub, !!isPublic]
    );
    await client.query("INSERT INTO room_members (room_id, user_id) VALUES ($1,$2)", [room.rows[0].id, req.user.sub]);
    await client.query("COMMIT");
    res.status(201).json({ room: room.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "internal error" });
  } finally {
    client.release();
  }
});

router.post("/rooms/:roomId/join", async (req, res) => {
  await pool.query("INSERT INTO room_members (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
    req.params.roomId,
    req.user.sub
  ]);
  res.status(204).end();
});

router.post("/rooms/:roomId/leave", async (req, res) => {
  await pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id=$2", [req.params.roomId, req.user.sub]);
  res.status(204).end();
});

// Sets the channel everyone in the room is watching together - clients poll
// this to stay in sync ("watch together"), rather than a push/websocket model.
router.post("/rooms/:roomId/sync", async (req, res) => {
  const { channelId } = req.body || {};
  const result = await pool.query(
    "UPDATE rooms SET active_channel_id=$1 WHERE id=$2 AND owner_id=$3 RETURNING id, active_channel_id",
    [channelId, req.params.roomId, req.user.sub]
  );
  if (result.rows.length === 0) return res.status(403).json({ error: "only the room owner can sync playback" });
  res.json({ room: result.rows[0] });
});

router.get("/rooms/:roomId", async (req, res) => {
  const room = await pool.query("SELECT * FROM rooms WHERE id=$1", [req.params.roomId]);
  if (room.rows.length === 0) return res.status(404).json({ error: "not found" });
  const members = await pool.query(
    `SELECT u.id, u.display_name, u.username, u.avatar_url FROM room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = $1`,
    [req.params.roomId]
  );
  res.json({ room: room.rows[0], members: members.rows });
});

router.get("/rooms/:roomId/messages", async (req, res) => {
  const result = await pool.query(
    `SELECT rm.id, rm.user_id, u.display_name, u.username, rm.body, rm.sent_at
     FROM room_messages rm JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1 ORDER BY rm.sent_at ASC LIMIT 200`,
    [req.params.roomId]
  );
  res.json({ messages: result.rows });
});

router.post("/rooms/:roomId/messages", async (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: "body required" });
  const result = await pool.query(
    "INSERT INTO room_messages (room_id, user_id, body) VALUES ($1,$2,$3) RETURNING id, user_id, body, sent_at",
    [req.params.roomId, req.user.sub, body.trim().slice(0, 2000)]
  );
  res.status(201).json({ message: result.rows[0] });
});

module.exports = router;
