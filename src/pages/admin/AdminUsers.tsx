import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { adminListUsers, adminSuspendUser, adminUnsuspendUser, adminDeleteUser, adminGrantUpload, adminRevokeUpload } from "../../lib/api";

export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = () => {
    if (token) adminListUsers(token).then(setUsers);
  };
  useEffect(load, [token]);

  const act = async (fn: (t: string, id: number) => Promise<void>, id: number) => {
    if (!token) return;
    await fn(token, id);
    load();
  };

  return (
    <div className="playlist-list">
      <div className="row-title" style={{ fontSize: 15 }}>Users ({users.length})</div>
      {users.map((u) => (
        <div className="playlist-item" key={u.id} style={{ alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 600 }}>
              {u.display_name || u.username || u.email}
              {u.username && <span style={{ opacity: 0.5 }}> #{u.discriminator}</span>}
              {u.role === "admin" && <span style={{ marginLeft: 8, fontSize: 10, color: "var(--accent)" }}>ADMIN</span>}
            </div>
            <div className="playlist-meta">
              {u.email} · {u.suspended ? `Suspended (${u.suspended_reason})` : "Active"} ·{" "}
              {u.can_upload_assets ? "Can upload" : "No upload permission"}
            </div>
            <div className="playlist-meta" style={{ fontFamily: "monospace", fontSize: 10, opacity: 0.6 }}>
              ID: {u.internal_account_id}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 320, justifyContent: "flex-end" }}>
            {u.suspended ? (
              <button className="btn btn-secondary" onClick={() => act(adminUnsuspendUser, u.id)}>Unsuspend</button>
            ) : (
              <button className="btn btn-secondary" onClick={() => act(adminSuspendUser, u.id)}>Suspend</button>
            )}
            {u.can_upload_assets ? (
              <button className="btn btn-secondary" onClick={() => act(adminRevokeUpload, u.id)}>Revoke Upload</button>
            ) : (
              <button className="btn btn-secondary" onClick={() => act(adminGrantUpload, u.id)}>Grant Upload</button>
            )}
            {confirmDelete === u.id ? (
              <button className="btn btn-primary" style={{ background: "#e6392f" }} onClick={() => act(adminDeleteUser, u.id)}>
                Confirm Delete
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(u.id)}>Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
