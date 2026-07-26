const { dialog, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { execFile } = require("child_process");
const wcoScraper = require("./wcoScraper");

// ─── Active Download State ────────────────────────────────────────────────────

let currentJob = null;

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

/**
 * Downloads a video stream URL directly to a target file path.
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://www.wcostream.tv/",
      }
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download HTTP ${res.statusCode}`));
      }

      const total = parseInt(res.headers["content-length"] || "0", 10);
      let downloaded = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && onProgress) {
          onProgress(downloaded, total);
        }
      });

      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close();
        resolve(destPath);
      });

      fileStream.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on("error", (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    req.setTimeout(60000, () => {
      req.destroy();
      fs.unlink(destPath, () => {});
      reject(new Error("Download timeout"));
    });
  });
}

/**
 * Compresses a directory into a .zip file using native Windows PowerShell Compress-Archive.
 */
function compressToZip(sourceDir, zipPath) {
  return new Promise((resolve, reject) => {
    const script = `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force`;
    execFile("powershell", ["-NoProfile", "-Command", script], (err) => {
      if (err) return reject(err);
      resolve(zipPath);
    });
  });
}

/**
 * Extracts a .zip file using native Windows PowerShell Expand-Archive.
 */
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const script = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`;
    execFile("powershell", ["-NoProfile", "-Command", script], (err) => {
      if (err) return reject(err);
      resolve(destDir);
    });
  });
}

/**
 * Start downloading an entire show season or list of episodes.
 */
async function startSeasonDownload(event, { showTitle, episodes, extractAfterZip }) {
  if (currentJob && currentJob.status === "downloading") {
    throw new Error("A download job is already in progress.");
  }

  // Ask user for save directory
  const dialogRes = await dialog.showOpenDialog({
    title: `Select Download Directory for ${showTitle}`,
    properties: ["openDirectory", "createDirectory"],
  });

  if (dialogRes.canceled || !dialogRes.filePaths[0]) {
    return { canceled: true };
  }

  const targetDir = dialogRes.filePaths[0];
  const safeTitle = sanitizeFilename(showTitle);
  const tempWorkDir = path.join(targetDir, `.streamio_temp_${Date.now()}`);

  fs.mkdirSync(tempWorkDir, { recursive: true });

  currentJob = {
    showTitle,
    totalEpisodes: episodes.length,
    completedEpisodes: 0,
    currentEpisodeTitle: "",
    status: "downloading",
    bytesDownloaded: 0,
    extractAfterZip,
    targetDir,
  };

  const sendStatus = (msg) => {
    try {
      event.sender.send("wco:download-progress", { ...currentJob, message: msg });
    } catch {}
  };

  // Run download job asynchronously
  (async () => {
    try {
      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        currentJob.currentEpisodeTitle = ep.title;
        sendStatus(`Extracting stream link for ${ep.title} (${i + 1}/${episodes.length})...`);

        // Deep-dive extract direct stream URL
        let streamUrl = await wcoScraper.extractVideo(ep.url);

        // Fallback retry attempt
        if (!streamUrl) {
          await new Promise(r => setTimeout(r, 2000));
          streamUrl = await wcoScraper.extractVideo(ep.url);
        }

        if (!streamUrl) {
          console.warn(`[wcoDownloader] Failed to extract stream for ${ep.title}, skipping...`);
          continue;
        }

        const safeEpTitle = sanitizeFilename(`${i + 1} - ${ep.title}.mp4`);
        const epDestPath  = path.join(tempWorkDir, safeEpTitle);

        sendStatus(`Downloading ${ep.title}...`);

        await downloadFile(streamUrl, epDestPath, (downloaded, total) => {
          const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          sendStatus(`Downloading ${ep.title} (${percent}%)...`);
        });

        currentJob.completedEpisodes++;
        sendStatus(`Completed ${ep.title} (${currentJob.completedEpisodes}/${episodes.length})`);
      }

      // Step 2: Compress into ZIP file
      const zipName = `${safeTitle}.zip`;
      const zipPath = path.join(targetDir, zipName);
      sendStatus(`Compressing season into ${zipName}...`);

      await compressToZip(tempWorkDir, zipPath);

      // Step 3: Extract if requested
      if (extractAfterZip) {
        const extractDir = path.join(targetDir, safeTitle);
        sendStatus(`Extracting ZIP archive into ${safeTitle}...`);
        await extractZip(zipPath, extractDir);
      }

      // Clean up temp work directory
      try {
        fs.rmSync(tempWorkDir, { recursive: true, force: true });
      } catch {}

      currentJob.status = "completed";
      sendStatus(`Season download and processing complete!`);
    } catch (err) {
      console.error("[wcoDownloader] Job failed:", err);
      currentJob.status = "error";
      sendStatus(`Download failed: ${err.message}`);
    }
  })();

  return { started: true, targetDir };
}

function registerIpcHandlers() {
  ipcMain.handle("wco:start-season-download", async (event, params) => {
    return await startSeasonDownload(event, params);
  });

  ipcMain.handle("wco:get-download-status", () => {
    return currentJob;
  });
}

module.exports = { registerIpcHandlers, startSeasonDownload };
