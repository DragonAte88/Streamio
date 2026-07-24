import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { fetchRooms, createRoom } from "../../lib/api";

export default function Rooms() {
  const { token, user } = useAuth();
  const nav = useNavigate();
  const [rooms, setRooms] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const load = () => {
    if (token) fetchRooms(token).then(setRooms);
  };

  useEffect(load, [token]);

  if (!user) {
    return (
      <div className="empty-state">
        <h2>Rooms</h2>
        <p>Sign in to create or join watch-together rooms.</p>
        <button className="btn btn-primary" onClick={() => nav("/login")}>Sign In</button>
      </div>
    );
  }

  const create = async () => {
    if (!token || !name.trim()) return;
    const room = await createRoom(token, name.trim(), isPublic);
    setName("");
    load();
    nav(`/social/rooms/${room.id}`);
  };

  return (
    <div className="playlist-list">
      <div style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "center" }}>
        <input
          placeholder="New room name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, maxWidth: 280, padding: "10px 14px", borderRadius: 8, border: "1px solid #2a2a35", background: "#16161d", color: "#f4f4f6" }}
        />
        <label style={{ fontSize: 13, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Public
        </label>
        <button className="btn btn-primary" onClick={create}>Create Room</button>
      </div>

      {rooms.length === 0 && <p style={{ color: "var(--text-dim)" }}>No rooms yet.</p>}
      {rooms.map((r) => (
        <div className="playlist-item" key={r.id} style={{ cursor: "pointer" }} onClick={() => nav(`/social/rooms/${r.id}`)}>
          <div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div className="playlist-meta">{r.member_count} member{r.member_count === "1" ? "" : "s"} · {r.is_public ? "Public" : "Private"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
