import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import {
  adminListUsers,
  adminSuspendUser,
  adminUnsuspendUser,
  adminDeleteUser,
  adminGrantUpload,
  adminRevokeUpload,
  fetchUserBadges,
  grantBadge,
  revokeBadge
} from "../../lib/api";
import { BADGE_DEFINITIONS } from "../../lib/badges";
import { BadgeRow } from "../../components/Badge";

export default function AdminUsers() {
  const { token } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [badgesByUser, setBadgesByUser] = useState<Record<number, string[]>>({});
  const [badgeMenuFor, setBadgeMenuFor] = useState<number | null>(null);

  const load = () => {
    if (!token) return;
    adminListUsers(token).then((list) => {
      setUsers(list);
      list.forEach((u: any) => fetchUserBadges(token, u.id).then((b) => setBadgesByUser((prev) => ({ ...prev, [u.id]: b }))));
    });
  };
  useEffect(load, [token]);

  const act = async (fn: (t: string, id: number) => Promise<void>, id: number) => {
    if (!token) return;
    await fn(token, id);
    load();
  };

  const toggleBadge = async (userId: number, slug: string) => {
    if (!token) return;
    const has = (badgesByUser[userId] || []).includes(slug);
    if (has) await revokeBadge(token, userId, slug);
    else await grantBadge(token, userId, slug);
    fetchUserBadges(token, userId).then((b) => setBadgesByUser((prev) => ({ ...prev, [userId]: b })));
  };

  return (
    <div className="playlist-list">
      <div className="row-title" style={{ fontSize: 15 }}>Users ({users.length})</div>
      {users.map((u) => (
        <div className="playlist-item" key={u.id} style={{ alignItems: "flex-start", position: "relative" }}>
          <div>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              {u.display_name || u.username || u.email}
              {u.username && <span style={{ opacity: 0.5 }}> #{u.discriminator}</span>}
              {u.role === "admin" && <span style={{ fontSize: 10, color: "var(--accent)" }}>ADMIN</span>}
              <BadgeRow slugs={badgesByUser[u.id] || []} size={16} />
            </div>
            <div className="playlist-meta">
              {u.email} · {u.suspended ? `Suspended (${u.suspended_reason})` : "Active"} ·{" "}
              {u.can_upload_assets ? "Can upload" : "No upload permission"}
            </div>
            <div className="playlist-meta" style={{ fontFamily: "monospace", fontSize: 10, opacity: 0.6 }}>
              ID: {u.internal_account_id}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 400, justifyContent: "flex-end" }}>
            <div style={{ position: "relative" }}>
              <button className="btn btn-secondary" onClick={() => setBadgeMenuFor(badgeMenuFor === u.id ? null : u.id)}>
                Badges
              </button>
              {badgeMenuFor === u.id && (
                <div className="status-menu" style={{ bottom: "auto", top: "100%", right: 0, left: "auto", marginTop: 8, width: 220, maxHeight: 280, overflowY: "auto" }}>
                  {BADGE_DEFINITIONS.map((b) => (
                    <div key={b.slug} className="status-menu-item" onClick={() => toggleBadge(u.id, b.slug)}>
                      <span>{b.icon}</span>
                      {b.label}
                      {(badgesByUser[u.id] || []).includes(b.slug) && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
