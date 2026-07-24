import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { loadPlaylistFromUrl } from "../lib/playlist";
import { addChannel } from "../lib/api";
import { addSource } from "../lib/playlistSources";

export default function PlaylistAdd() {
  const { token } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Sign in first — imported channels sync to your account's catalog.");
      return;
    }

    setBusy(true);
    try {
      setProgress("Fetching and parsing playlist…");
      const channels = await loadPlaylistFromUrl(url);
      if (channels.length === 0) throw new Error("No channels found in that playlist");

      let added = 0;
      for (const ch of channels) {
        setProgress(`Adding channel ${added + 1} of ${channels.length}: ${ch.name}`);
        try {
          await addChannel(token, { name: ch.name, url: ch.url, logo: ch.logo, group: ch.group, tvgId: ch.tvgId });
          added++;
        } catch {
          // one bad entry shouldn't abort the whole import
        }
      }

      addSource({
        id: crypto.randomUUID(),
        name: name || url,
        url,
        channelCount: added,
        addedAt: Date.now()
      });

      nav("/playlists");
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="playlist-list">
      <h2>Add Playlist</h2>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={submit} style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My IPTV list" />
        </div>
        <div className="field">
          <label>M3U / M3U8 URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/playlist.m3u8" required />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Importing…" : "Import"}
        </button>
        {busy && <p style={{ color: "var(--text-dim)", marginTop: 12 }}>{progress}</p>}
      </form>
    </div>
  );
}
