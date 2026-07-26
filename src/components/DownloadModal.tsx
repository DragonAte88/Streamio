import React, { useEffect, useState } from "react";

interface Episode { title: string; url: string; season: string; epNum: number; }

interface Props {
  showTitle: string;
  seasons: string[];
  episodes: Episode[];
  onClose: () => void;
}

interface DownloadProgress {
  currentEpisodeTitle: string;
  completedEpisodes: number;
  totalEpisodes: number;
  status: "downloading" | "compressing" | "extracting" | "completed" | "error";
  message: string;
}

export default function DownloadModal({ showTitle, seasons, episodes, onClose }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<string>(seasons[0] ?? "All");
  const [extractAfterZip, setExtractAfterZip] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const filteredEps = selectedSeason === "All"
    ? episodes
    : episodes.filter(e => e.season === selectedSeason);

  // Listen for real-time progress from main process
  useEffect(() => {
    if (!started) return;
    const unsub = (window as any).wco?.onDownloadProgress?.((p: DownloadProgress) => {
      setProgress(p);
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, [started]);

  const handleStart = async () => {
    setStarted(true);
    try {
      await (window as any).wco.startSeasonDownload({
        showTitle: selectedSeason === "All" ? showTitle : `${showTitle} - ${selectedSeason}`,
        episodes: filteredEps,
        extractAfterZip,
      });
    } catch (e: any) {
      setProgress({ currentEpisodeTitle: "", completedEpisodes: 0, totalEpisodes: 0, status: "error", message: e?.message || "Unknown error" });
    }
  };

  const isComplete = progress?.status === "completed";
  const isError    = progress?.status === "error";
  const percent    = progress
    ? Math.round((progress.completedEpisodes / Math.max(progress.totalEpisodes, 1)) * 100)
    : 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={(e) => { if (e.target === e.currentTarget && !started) onClose(); }}
    >
      <div style={{
        width: 500, borderRadius: 18, overflow: "hidden",
        background: "linear-gradient(135deg, #1a1a2e 0%, #12121e 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>
        {/* Header */}
        <div style={{
          padding: "22px 28px 18px",
          background: "linear-gradient(90deg, rgba(16,185,129,0.15) 0%, rgba(99,102,241,0.1) 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>⬇ Season Downloader</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{showTitle}</div>
          </div>
          {!started && (
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8,
              color: "rgba(255,255,255,0.6)", fontSize: 18, width: 32, height: 32,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
          )}
        </div>

        <div style={{ padding: "24px 28px" }}>
          {!started ? (
            <>
              {/* Season selector */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 0.8 }}>SELECT SEASON</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <SeasonBtn active={selectedSeason === "All"} onClick={() => setSelectedSeason("All")}>
                    All ({episodes.length})
                  </SeasonBtn>
                  {seasons.map(s => (
                    <SeasonBtn key={s} active={selectedSeason === s} onClick={() => setSelectedSeason(s)}>
                      {s} ({episodes.filter(e => e.season === s).length})
                    </SeasonBtn>
                  ))}
                </div>
              </div>

              {/* Episode preview */}
              <div style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
                marginBottom: 20, border: "1px solid rgba(255,255,255,0.06)",
                maxHeight: 160, overflowY: "auto",
              }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, fontWeight: 700, letterSpacing: 0.8 }}>
                  {filteredEps.length} EPISODES TO DOWNLOAD
                </div>
                {filteredEps.slice(0, 12).map((ep, i) => (
                  <div key={ep.url} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", padding: "3px 0" }}>
                    {i + 1}. {ep.title}
                  </div>
                ))}
                {filteredEps.length > 12 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                    …and {filteredEps.length - 12} more
                  </div>
                )}
              </div>

              {/* ZIP extraction option */}
              <label style={{
                display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                padding: "12px 16px", borderRadius: 10,
                background: extractAfterZip ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${extractAfterZip ? "rgba(16,185,129,0.35)" : "rgba(255,255,255,0.06)"}`,
                marginBottom: 22, transition: "all 0.15s",
              }}>
                <input
                  type="checkbox"
                  checked={extractAfterZip}
                  onChange={e => setExtractAfterZip(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "#10b981", cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Auto-extract ZIP archive</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    Episodes will be extracted to a folder after the ZIP is created
                  </div>
                </div>
              </label>

              <button
                onClick={handleStart}
                disabled={filteredEps.length === 0}
                style={{
                  width: "100%", padding: "13px", borderRadius: 12, fontSize: 14, fontWeight: 800,
                  background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                  border: "none", color: "#fff", cursor: "pointer",
                  boxShadow: "0 4px 20px rgba(16,185,129,0.35)",
                  opacity: filteredEps.length === 0 ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                ⬇ Start Downloading {filteredEps.length} Episodes
              </button>
            </>
          ) : (
            <>
              {/* Progress view */}
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>
                  {isComplete ? "✅" : isError ? "❌" : "⬇"}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                  {isComplete ? "Download Complete!" : isError ? "Download Failed" : "Downloading…"}
                </div>
                {progress?.message && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                    {progress.message}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {!isComplete && !isError && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 8,
                  }}>
                    <span>{progress?.completedEpisodes ?? 0} / {progress?.totalEpisodes ?? filteredEps.length} episodes</span>
                    <span>{percent}%</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 6,
                      background: "linear-gradient(90deg, #10b981, #6366f1)",
                      width: `${percent}%`,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                  {progress?.currentEpisodeTitle && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8, textAlign: "center" }}>
                      {progress.currentEpisodeTitle}
                    </div>
                  )}
                </div>
              )}

              {(isComplete || isError) && (
                <button
                  onClick={onClose}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                    background: isComplete ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.15)",
                    border: `1px solid ${isComplete ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)"}`,
                    color: isComplete ? "#10b981" : "#ef4444", cursor: "pointer",
                  }}
                >
                  {isComplete ? "✓ Done" : "✕ Close"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SeasonBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 14px", borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: "pointer",
      background: active ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)",
      border: `1px solid ${active ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.08)"}`,
      color: active ? "#10b981" : "rgba(255,255,255,0.55)",
      transition: "all 0.12s",
    }}>
      {children}
    </button>
  );
}
