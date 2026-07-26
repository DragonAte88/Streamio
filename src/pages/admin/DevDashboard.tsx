import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { fetchAdminStats, fetchAdminLogs } from "../../lib/api";

function fmtBytes(n: number | undefined | null) {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function DevDashboard() {
  const { token } = useAuth();
  const [backendStats, setBackendStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [localStats, setLocalStats] = useState<any>(null);
  const [discordStatus, setDiscordStatus] = useState<any>(null);
  const [cloudStatus, setCloudStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    const load = () => {
      fetchAdminStats(token).then(setBackendStats).catch(() => {});
      fetchAdminLogs(token).then(setLogs).catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const load = () => {
      window.system.getStats().then(setLocalStats).catch(() => {});
      window.discord.isConnected().then(setDiscordStatus).catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const check = async (name: string, url: string) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        setCloudStatus((s) => ({ ...s, [name]: res.ok ? "reachable" : `HTTP ${res.status}` }));
      } catch {
        setCloudStatus((s) => ({ ...s, [name]: "unreachable" }));
      }
    };
    const load = () => {
      check("Flex-1 (Production API)", "https://163-192-40-120.sslip.io/health");
      check("Flex-2 (Discord Bot Host)", "https://170-9-15-10.sslip.io/health");
      check("Flex-3 (Staging API)", "https://138-2-232-225.sslip.io/health");
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const exportLogs = () => {
    const text = logs.map((l) => `[${l.ts}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `streamio-backend-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="playlist-list">
      <div className="row-title" style={{ fontSize: 15 }}>Backend (Flex-1)</div>
      {backendStats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard label="Users" value={backendStats.database.users} />
          <StatCard label="Online now" value={backendStats.database.online_users} />
          <StatCard label="Channels" value={backendStats.database.channels} />
          <StatCard label="Assets" value={backendStats.database.assets} />
          <StatCard label="Rooms" value={backendStats.database.rooms} />
          <StatCard label="Room messages" value={backendStats.database.room_messages} />
          <StatCard label="DMs" value={backendStats.database.direct_messages} />
          <StatCard label="Friendships" value={backendStats.database.friendships} />
          <StatCard label="API uptime" value={fmtUptime(backendStats.process.uptimeSeconds)} />
          <StatCard label="API memory" value={fmtBytes(backendStats.process.memory.rss)} />
          <StatCard label="Host CPU" value={backendStats.host.cpuModel} small />
          <StatCard label="Host load (1m)" value={backendStats.host.loadAvg1m.toFixed(2)} />
          <StatCard label="Host memory free" value={`${fmtBytes(backendStats.host.freeMemBytes)} / ${fmtBytes(backendStats.host.totalMemBytes)}`} />
          <StatCard label="Host uptime" value={fmtUptime(backendStats.host.uptimeSeconds)} />
        </div>
      ) : (
        <p style={{ color: "var(--text-dim)" }}>Loading backend stats…</p>
      )}

      <div className="row-title" style={{ fontSize: 15 }}>This Device</div>
      {localStats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard label="CPU usage" value={`${localStats.cpu.percent}%`} />
          <StatCard label="CPU" value={localStats.cpu.model} small />
          <StatCard label="Cores" value={localStats.cpu.cores} />
          <StatCard label="Memory free" value={`${fmtBytes(localStats.memory.freeBytes)} / ${fmtBytes(localStats.memory.totalBytes)}`} />
          <StatCard label="Disk free (C:)" value={localStats.disk ? `${fmtBytes(localStats.disk.freeBytes)} / ${fmtBytes(localStats.disk.totalBytes)}` : "unavailable"} />
          <StatCard label="Network received" value={fmtBytes(localStats.network?.totalReceivedBytes)} />
          <StatCard label="Network sent" value={fmtBytes(localStats.network?.totalSentBytes)} />
          <StatCard label="GPU" value={localStats.gpu?.gpuDevice?.[0]?.deviceString || "unknown"} small />
          <StatCard label="OS" value={`${localStats.platform} ${localStats.arch}`} />
          <StatCard label="Device uptime" value={fmtUptime(localStats.uptimeSeconds)} />
        </div>
      ) : (
        <p style={{ color: "var(--text-dim)" }}>Loading local stats…</p>
      )}

      <div className="row-title" style={{ fontSize: 15 }}>Discord</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard label="RPC connection" value={discordStatus?.connected ? "Connected" : "Not connected"} />
        <StatCard label="Local Discord user" value={discordStatus?.username || "—"} />
        <StatCard label="Bot (Flex-2)" value="Deployed, not activated" small />
      </div>

      <div className="row-title" style={{ fontSize: 15 }}>Oracle Cloud</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {Object.entries(cloudStatus).map(([name, state]) => (
          <StatCard key={name} label={name} value={state} small />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="row-title" style={{ fontSize: 15, marginTop: 0 }}>Raw Backend Logs ({logs.length})</div>
        <button className="btn btn-secondary" onClick={exportLogs}>Export Full Log</button>
      </div>
      <div style={{ background: "#0a0a0d", borderRadius: 10, padding: 14, maxHeight: 320, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
        {logs.slice(-200).map((l, i) => (
          <div key={i} style={{ color: l.level === "error" ? "#e6392f" : l.level === "warn" ? "#f0b132" : "var(--text-dim)" }}>
            [{l.ts}] [{l.level.toUpperCase()}] {l.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 12, border: "1px solid #24242f" }}>
      <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: small ? 12 : 16, fontWeight: 700, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}
