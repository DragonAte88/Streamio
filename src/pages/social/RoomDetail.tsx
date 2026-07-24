import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { usePlayback } from "../../lib/PlaybackContext";
import { useCatalog } from "../../lib/CatalogContext";
import {
  fetchRoom,
  fetchRoomMessages,
  sendRoomMessage,
  syncRoomChannel,
  joinRoom,
  markRoomRead,
  fetchRoomReads,
  sendTyping,
  fetchTyping,
  inviteToRoom,
  fetchFriends
} from "../../lib/api";

export default function RoomDetail() {
  const { roomId } = useParams();
  const { token, user } = useAuth();
  const { play, playing } = usePlayback();
  const { channels } = useCatalog();
  const nav = useNavigate();

  const [room, setRoom] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [reads, setReads] = useState<any[]>([]);
  const [typing, setTyping] = useState<{ userId: number; name: string }[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingSentAt = useRef(0);

  const load = async () => {
    if (!token || !roomId) return;
    const data = await fetchRoom(token, Number(roomId));
    setRoom(data.room);
    setMembers(data.members);
    const msgs = await fetchRoomMessages(token, Number(roomId));
    setMessages(msgs);
    if (msgs.length > 0) markRoomRead(token, Number(roomId), msgs[msgs.length - 1].id);
    fetchRoomReads(token, Number(roomId)).then(setReads);
    fetchTyping(token, Number(roomId)).then(setTyping);
  };

  useEffect(() => {
    if (!token || !roomId) return;
    joinRoom(token, Number(roomId)).then(load);
    fetchFriends(token).then(setFriends);
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [token, roomId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!user) {
    nav("/login");
    return null;
  }
  if (!room) return <div className="empty-state">Loading room…</div>;

  const isOwner = room.owner_id === user.id;
  const activeChannel = channels.find((c) => c.id === String(room.active_channel_id));
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : 0;
  const seenByOthers = reads.filter((r) => r.user_id !== user.id && r.last_read_message_id >= lastMessageId);

  const send = async () => {
    if (!token || !roomId || !draft.trim()) return;
    await sendRoomMessage(token, Number(roomId), draft);
    setDraft("");
    load();
  };

  const onTypingInput = (value: string) => {
    setDraft(value);
    if (!token || !roomId) return;
    const now = Date.now();
    if (now - typingSentAt.current > 2000) {
      typingSentAt.current = now;
      sendTyping(token, Number(roomId));
    }
  };

  const syncToWhatImWatching = async () => {
    if (!token || !roomId || !playing) return;
    await syncRoomChannel(token, Number(roomId), Number(playing.id));
    load();
  };

  const invite = async (friendId: number) => {
    if (!token || !roomId) return;
    await inviteToRoom(token, Number(roomId), friendId);
    setShowInvite(false);
  };

  return (
    <div style={{ padding: "24px 48px", display: "flex", gap: 32, height: "calc(100vh - 100px)" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ marginTop: 0 }}>{room.name}</h2>
          <div style={{ position: "relative" }}>
            <button className="btn btn-secondary" onClick={() => setShowInvite((v) => !v)}>+ Invite a friend</button>
            {showInvite && (
              <div className="status-menu" style={{ bottom: "auto", top: "100%", marginTop: 8, width: 220 }}>
                {friends.length === 0 && <div className="status-menu-item">No friends yet</div>}
                {friends.map((f) => (
                  <div key={f.id} className="status-menu-item" onClick={() => invite(f.id)}>
                    {f.display_name || f.username}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          {activeChannel ? (
            <>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>Now syncing:</div>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>{activeChannel.name}</div>
              <button className="btn btn-primary" onClick={() => play(activeChannel)}>▶ Watch Together</button>
            </>
          ) : (
            <div style={{ color: "var(--text-dim)" }}>No channel synced yet.</div>
          )}
          {isOwner && playing && (
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={syncToWhatImWatching}>
              Sync room to what I'm watching ({playing.name})
            </button>
          )}
        </div>

        <div style={{ background: "var(--bg-card)", borderRadius: 10, padding: 14, fontSize: 12, color: "var(--text-dim)" }}>
          Voice chat: Discord can't relay audio into DM/Group DM calls (platform limitation). A bot joining a shared
          Discord server voice channel is possible but not wired up yet — see Settings → Discord.
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="row-title" style={{ fontSize: 14 }}>Members ({members.length})</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {members.map((m) => (
              <div key={m.id} style={{ padding: "6px 12px", background: "var(--bg-card)", borderRadius: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                {m.display_name || m.username}
                <span style={{ opacity: 0.5 }}>#{m.discriminator}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ width: 320, display: "flex", flexDirection: "column", background: "var(--bg-card)", borderRadius: 10 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {messages.map((m) => (
            <div key={m.id} className={"chat-bubble-row" + (m.user_id === user.id ? " mine" : "")}>
              <div>
                {m.user_id !== user.id && (
                  <div className="chat-meta">{m.display_name || m.username}#{m.discriminator}</div>
                )}
                <div className="chat-bubble">{m.body}</div>
              </div>
            </div>
          ))}
          {seenByOthers.length > 0 && (
            <div style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "right" }}>
              Seen by {seenByOthers.map((r) => r.username).join(", ")}
            </div>
          )}
        </div>
        {typing.length > 0 && (
          <div className="typing-indicator">{typing.map((t) => t.name).join(", ")} {typing.length === 1 ? "is" : "are"} typing…</div>
        )}
        <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #24242f" }}>
          <input
            value={draft}
            onChange={(e) => onTypingInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message…"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #2a2a35", background: "#101016", color: "#f4f4f6" }}
          />
          <button className="btn btn-primary" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
