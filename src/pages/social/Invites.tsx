import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { fetchInvites, acceptInvite, declineInvite } from "../../lib/api";

export default function Invites() {
  const { token } = useAuth();
  const nav = useNavigate();
  const [invites, setInvites] = useState<any[]>([]);

  const load = () => {
    if (token) fetchInvites(token).then(setInvites);
  };

  useEffect(load, [token]);

  const accept = async (id: number) => {
    if (!token) return;
    const { roomId } = await acceptInvite(token, id);
    nav(`/social/rooms/${roomId}`);
  };

  const decline = async (id: number) => {
    if (!token) return;
    await declineInvite(token, id);
    load();
  };

  return (
    <div className="playlist-list">
      <div className="row-title" style={{ fontSize: 15 }}>Watch Invites ({invites.length})</div>
      {invites.length === 0 && <p style={{ color: "var(--text-dim)" }}>No pending invites.</p>}
      {invites.map((inv) => (
        <div className="playlist-item" key={inv.id}>
          <div>
            <div>
              <strong>{inv.display_name || inv.username}</strong> invited you to watch{" "}
              <strong>{inv.channel_name || "a channel"}</strong> in "{inv.room_name}"
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={() => accept(inv.id)}>Join</button>
            <button className="btn btn-secondary" onClick={() => decline(inv.id)}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
