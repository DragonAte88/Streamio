import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { fetchIncomingFriendRequests, respondFriendRequest } from "../../lib/api";

export default function Requests() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);

  const load = () => {
    if (token) fetchIncomingFriendRequests(token).then(setRequests);
  };

  useEffect(load, [token]);

  const respond = async (id: number, accept: boolean) => {
    if (!token) return;
    await respondFriendRequest(token, id, accept);
    load();
  };

  return (
    <div className="playlist-list">
      <div className="row-title" style={{ fontSize: 15 }}>Incoming Requests ({requests.length})</div>
      {requests.length === 0 && <p style={{ color: "var(--text-dim)" }}>No pending requests.</p>}
      {requests.map((r) => (
        <div className="playlist-item" key={r.id}>
          <div>{r.display_name || r.username}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => respond(r.id, true)}>Accept</button>
            <button className="btn btn-secondary" onClick={() => respond(r.id, false)}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
