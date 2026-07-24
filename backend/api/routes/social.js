const express = require("express");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const USER_CARD = "u.id, u.display_name, u.username, u.discriminator, u.avatar_url, u.status";

// --- Friend requests / friendships ---

router.post("/friends/requests/:toUserId", async (req, res) => {
  const fromId = req.user.sub;
  const toId = Number(req.params.toUserId);
  if (fromId === toId) return res.status(400).json({ error: "can't friend yourself" });
  try {
    const target = await pool.query("SELECT privacy_allow_friend_requests FROM users WHERE id=$1", [toId]);
    if (target.rows[0] && target.rows[0].privacy_allow_friend_requests === false) {
      return res.status(403).json({ error: "this user isn't accepting friend requests" });
    }
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
    `SELECT fr.id, ${USER_CARD}, fr.created_at
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
    `SELECT ${USER_CARD}
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

router.post("/dm/:userId/read", async (req, res) => {
  const { messageId } = req.body || {};
  await pool.query(
    `INSERT INTO dm_reads (user_id, other_user_id, last_read_message_id) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, other_user_id) DO UPDATE SET last_read_message_id = GREATEST(dm_reads.last_read_message_id, $3)`,
    [req.user.sub, req.params.userId, messageId || 0]
  );
  res.status(204).end();
});

router.get("/dm/:userId/read", async (req, res) => {
  const result = await pool.query("SELECT last_read_message_id FROM dm_reads WHERE user_id=$1 AND other_user_id=$2", [
    req.params.userId,
    req.user.sub
  ]);
  res.json({ lastReadMessageId: result.rows[0]?.last_read_message_id ?? 0 });
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
    `SELECT ${USER_CARD} FROM room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = $1`,
    [req.params.roomId]
  );
  res.json({ room: room.rows[0], members: members.rows });
});

router.get("/rooms/:roomId/messages", async (req, res) => {
  const result = await pool.query(
    `SELECT rm.id, rm.user_id, u.display_name, u.username, u.discriminator, u.avatar_url, rm.body, rm.sent_at
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

router.post("/rooms/:roomId/read", async (req, res) => {
  const { messageId } = req.body || {};
  await pool.query(
    `INSERT INTO room_reads (room_id, user_id, last_read_message_id) VALUES ($1,$2,$3)
     ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_message_id = GREATEST(room_reads.last_read_message_id, $3)`,
    [req.params.roomId, req.user.sub, messageId || 0]
  );
  res.status(204).end();
});

router.get("/rooms/:roomId/reads", async (req, res) => {
  // Read state for every member, so the UI can show "seen by X, Y" per message.
  const result = await pool.query(
    `SELECT rr.user_id, u.username, u.discriminator, rr.last_read_message_id
     FROM room_reads rr JOIN users u ON u.id = rr.user_id WHERE rr.room_id = $1`,
    [req.params.roomId]
  );
  res.json({ reads: result.rows });
});

// --- Typing indicators (ephemeral, in-memory - not worth persisting) ---
const typingState = new Map(); // roomId -> Map(userId -> { name, expiresAt })
const TYPING_TTL_MS = 5000;

router.post("/rooms/:roomId/typing", async (req, res) => {
  const roomId = req.params.roomId;
  if (!typingState.has(roomId)) typingState.set(roomId, new Map());
  const user = await pool.query("SELECT display_name, username FROM users WHERE id=$1", [req.user.sub]);
  typingState.get(roomId).set(req.user.sub, {
    name: user.rows[0]?.display_name || user.rows[0]?.username || "Someone",
    expiresAt: Date.now() + TYPING_TTL_MS
  });
  res.status(204).end();
});

router.get("/rooms/:roomId/typing", async (req, res) => {
  const map = typingState.get(req.params.roomId);
  if (!map) return res.json({ typing: [] });
  const now = Date.now();
  const typing = [];
  for (const [userId, info] of map.entries()) {
    if (info.expiresAt > now && userId !== req.user.sub) typing.push({ userId, name: info.name });
    else if (info.expiresAt <= now) map.delete(userId);
  }
  res.json({ typing });
});

// --- Invite a friend to watch (room + channel) ---

router.post("/rooms/:roomId/invite/:toUserId", async (req, res) => {
  const result = await pool.query(
    "INSERT INTO room_invites (room_id, from_user_id, to_user_id) VALUES ($1,$2,$3) RETURNING *",
    [req.params.roomId, req.user.sub, req.params.toUserId]
  );
  res.status(201).json({ invite: result.rows[0] });
});

router.get("/invites", async (req, res) => {
  const result = await pool.query(
    `SELECT ri.id, ri.room_id, r.name AS room_name, r.active_channel_id, c.name AS channel_name,
            ${USER_CARD.replace("u.id", "u.id AS from_user_id")}, ri.created_at
     FROM room_invites ri
     JOIN rooms r ON r.id = ri.room_id
     JOIN users u ON u.id = ri.from_user_id
     LEFT JOIN channels c ON c.id = r.active_channel_id
     WHERE ri.to_user_id = $1 AND ri.status = 'pending'
     ORDER BY ri.created_at DESC`,
    [req.user.sub]
  );
  res.json({ invites: result.rows });
});

router.post("/invites/:inviteId/accept", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invite = await client.query(
      "UPDATE room_invites SET status='accepted' WHERE id=$1 AND to_user_id=$2 RETURNING room_id",
      [req.params.inviteId, req.user.sub]
    );
    if (invite.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "invite not found" });
    }
    await client.query("INSERT INTO room_members (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
      invite.rows[0].room_id,
      req.user.sub
    ]);
    await client.query("COMMIT");
    res.json({ roomId: invite.rows[0].room_id });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "internal error" });
  } finally {
    client.release();
  }
});

router.post("/invites/:inviteId/decline", async (req, res) => {
  await pool.query("UPDATE room_invites SET status='declined' WHERE id=$1 AND to_user_id=$2", [
    req.params.inviteId,
    req.user.sub
  ]);
  res.status(204).end();
});

module.exports = router;
