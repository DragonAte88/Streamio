import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { fetchAssets, uploadAsset, updateAsset, deleteAsset, ApiAsset } from "../../lib/api";

const CATEGORIES = ["Movies", "TV Shows", "Live TV", "Sports", "News", "Kids", "Music", "Uncategorized"];

export default function AdminAssets() {
  const { token, user } = useAuth();
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (token) fetchAssets(token).then(setAssets);
  };
  useEffect(load, [token]);

  if (user && user.role !== "admin" && !user.can_upload_assets) {
    return <div className="empty-state"><h2>Assets</h2><p>You don't have upload permission. Ask an admin to grant it in Admin → Users.</p></div>;
  }

  const doUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!token || !file || !title.trim()) return;
    setProgress(0);
    try {
      await uploadAsset(token, file, title.trim(), category, setProgress);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } finally {
      setProgress(null);
    }
  };

  const publish = async (id: number) => {
    if (!token) return;
    await updateAsset(token, id, { publish: true });
    load();
  };

  const moveCategory = async (id: number, newCategory: string) => {
    if (!token) return;
    await updateAsset(token, id, { category: newCategory, publish: true });
    load();
  };

  const remove = async (id: number) => {
    if (!token) return;
    await deleteAsset(token, id);
    load();
  };

  return (
    <div className="playlist-list">
      <div style={{ background: "var(--bg-card)", borderRadius: 10, padding: 20, marginBottom: 24, maxWidth: 480 }}>
        <div className="row-title" style={{ fontSize: 15, marginTop: 0 }}>Upload Media</div>
        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>File (.mp4, .mkv, .mp3, .png/.jpg/.webp)</label>
          <input type="file" ref={fileRef} accept=".mp4,.mkv,.mp3,.png,.jpg,.jpeg,.webp" />
        </div>
        <button className="btn btn-primary" onClick={doUpload} disabled={progress !== null}>
          {progress !== null ? `Uploading… ${progress}%` : "Upload"}
        </button>
      </div>

      <div className="row-title" style={{ fontSize: 15 }}>Assets ({assets.length})</div>
      {assets.map((a) => (
        <div className="playlist-item" key={a.id}>
          <div>
            <div style={{ fontWeight: 600 }}>{a.title} <span style={{ fontSize: 11, color: "var(--text-dim)" }}>({a.kind})</span></div>
            <div className="playlist-meta">
              {a.category} · uploaded by {a.username}#{a.discriminator} ·{" "}
              {a.published_channel_id ? "Published to catalog" : "Not published"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={a.category} onChange={(e) => moveCategory(a.id, e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {!a.published_channel_id && a.kind === "video" && (
              <button className="btn btn-secondary" onClick={() => publish(a.id)}>Publish</button>
            )}
            <button className="btn btn-secondary" onClick={() => remove(a.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
