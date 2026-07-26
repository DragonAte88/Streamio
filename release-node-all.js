// release-node-all.js — Script to create GitHub Release v0.7.4 and upload all assets
const fs = require('fs');
const path = require('path');

async function main() {
  const version = "0.7.4";
  const tag = `v${version}`;
  const owner = "DragonAte88";
  const repo = "Streamio";
  const token = process.env.GH_TOKEN;
  if (!token) { console.error("GH_TOKEN env variable is required"); process.exit(1); }

  const headers = {
    "Authorization": `token ${token}`,
    "User-Agent": "Node-Release-Script",
    "Accept": "application/vnd.github.v3+json"
  };

  console.log(`Checking release for ${tag}...`);
  let release;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, { headers });
    if (res.ok) {
      release = await res.json();
      console.log(`Found existing release (ID: ${release.id})`);
    }
  } catch (e) {}

  if (!release) {
    console.log(`Creating release for ${tag}...`);
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: "main",
        name: `Streamio ${tag}`,
        body: `### Streamio ${tag}\n\n- Fix WCO stream playback: 2-step embed navigation now correctly intercepts \`c1.wco.tv/getvid?evid=...\` stream\n- Fix episode titles: HTML entities decoded, quality badges (4K/HD/SD) stripped\n- Fix MPV headers: Referer + User-Agent set for WCO streams to prevent 403\n- Fix PlaybackContext: WCO episodes correctly play in VOD mode`,
        draft: false,
        prerelease: false
      })
    });

    if (createRes.ok) {
      release = await createRes.json();
      console.log(`Successfully created release (ID: ${release.id})`);
    } else {
      const errText = await createRes.text();
      console.error("Failed to create release:", createRes.status, errText);
      process.exit(1);
    }
  }

  const filesToUpload = [
    path.join(__dirname, "release", `Streamio-Setup-${version}.exe`),
    path.join(__dirname, "release", `Streamio-Setup-${version}.exe.blockmap`),
    path.join(__dirname, "release", `latest.yml`),
  ];

  for (const filePath of filesToUpload) {
    if (!fs.existsSync(filePath)) {
      console.warn("File missing:", filePath);
      continue;
    }

    const fileName = path.basename(filePath);
    console.log(`Uploading ${fileName}...`);

    // Delete existing asset if present
    const existingAsset = release.assets?.find(a => a.name === fileName);
    if (existingAsset) {
      console.log(`Deleting existing asset ${fileName} (ID: ${existingAsset.id})...`);
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existingAsset.id}`, {
        method: "DELETE",
        headers
      });
    }

    const fileData = fs.readFileSync(filePath);
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`;
    const contentType = fileName.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `token ${token}`,
        "User-Agent": "Node-Release-Script",
        "Content-Type": contentType,
        "Content-Length": fileData.length
      },
      body: fileData
    });

    if (uploadRes.ok) {
      const asset = await uploadRes.json();
      console.log(`SUCCESS! Uploaded ${fileName}:`, asset.browser_download_url);
    } else {
      const errText = await uploadRes.text();
      console.log(`Upload error for ${fileName}:`, uploadRes.status, errText);
    }
  }

  console.log(`\n🎉 Release ${tag} is live at https://github.com/${owner}/${repo}/releases/tag/${tag}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
