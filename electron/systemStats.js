const os = require("os");
const { exec } = require("child_process");
const { app } = require("electron");

function cpuUsagePercent() {
  return new Promise((resolve) => {
    const start = os.cpus();
    setTimeout(() => {
      const end = os.cpus();
      let idleDiff = 0;
      let totalDiff = 0;
      for (let i = 0; i < start.length; i++) {
        const s = start[i].times;
        const e = end[i].times;
        const sIdle = s.idle;
        const eIdle = e.idle;
        const sTotal = s.user + s.nice + s.sys + s.idle + s.irq;
        const eTotal = e.user + e.nice + e.sys + e.idle + e.irq;
        idleDiff += eIdle - sIdle;
        totalDiff += eTotal - sTotal;
      }
      resolve(totalDiff > 0 ? Math.round(100 * (1 - idleDiff / totalDiff)) : 0);
    }, 200);
  });
}

function diskUsage() {
  return new Promise((resolve) => {
    exec(
      "powershell -NoProfile -Command \"Get-CimInstance Win32_LogicalDisk -Filter \\\"DeviceID='C:'\\\" | Select-Object Size,FreeSpace | ConvertTo-Json\"",
      { timeout: 5000 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const data = JSON.parse(stdout);
          resolve({ totalBytes: data.Size, freeBytes: data.FreeSpace });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function networkStats() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-NetAdapterStatistics | Measure-Object -Property ReceivedBytes,SentBytes -Sum | Select-Object Property,Sum | ConvertTo-Json"',
      { timeout: 5000 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const parsed = JSON.parse(stdout);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const received = arr.find((x) => x.Property === "ReceivedBytes")?.Sum || 0;
          const sent = arr.find((x) => x.Property === "SentBytes")?.Sum || 0;
          resolve({ totalReceivedBytes: received, totalSentBytes: sent });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function getStats() {
  const [cpu, disk, net] = await Promise.all([cpuUsagePercent(), diskUsage(), networkStats()]);
  const gpuInfo = await app.getGPUInfo("basic").catch(() => null);

  return {
    cpu: { percent: cpu, model: os.cpus()[0]?.model, cores: os.cpus().length },
    memory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
    disk,
    network: net,
    gpu: gpuInfo,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptimeSeconds: os.uptime()
  };
}

module.exports = { getStats };
