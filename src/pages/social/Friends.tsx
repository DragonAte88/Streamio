import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { fetchFriends, searchUsers, sendFriendRequest } from "../../lib/api";

export default function Friends() {
  const { token, user } = useAuth();
  const nav = useNavigate();
  const [friends, setFriends] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [sent, setSent] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (token) fetchFriends(token).then(setFriends);
  }, [token]);

  useEffect(() => {
    if (!token || !query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => searchUsers(token, query).then(setResults), 300);
    return () => clearTimeout(t);
  }, [token, query]);

  if (!user) {
    return (
      <div className="empty-state">
        <h2>Friends</h2>
        <p>Sign in to add friends.</p>
        <button className="btn btn-primary" onClick={() => nav("/login")}>Sign In</button>
      </div>
    );
  }

  const request = async (id: number) => {
    if (!token) return;
    await sendFriendRequest(token, id);
    setSent((prev) => new Set(prev).add(id));
  };

  return (
    <div className="playlist-list">
      <input
        placeholder="Search by username or display name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", maxWidth: 420, padding: "10px 14px", borderRadius: 8, border: "1px solid #2a2a35", background: "#16161d", color: "#f4f4f6", marginBottom: 20 }}
      />

      {results.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="row-title" style={{ fontSize: 15 }}>Results</div>
          {results.map((u) => (
            <div className="playlist-item" key={u.id}>
              <div>{u.display_name || u.username}</div>
              <button className="btn btn-secondary" disabled={sent.has(u.id)} onClick={() => request(u.id)}>
                {sent.has(u.id) ? "Requested" : "Add Friend"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row-title" style={{ fontSize: 15 }}>Your Friends ({friends.length})</div>
      {friends.length === 0 && <p style={{ color: "var(--text-dim)" }}>No friends yet — search above to add some.</p>}
      {friends.map((f) => (
        <div className="playlist-item" key={f.id}>
          <div>{f.display_name || f.username}</div>
        </div>
      ))}
    </div>
  );
}
