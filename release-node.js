// release.js — Node.js script to create GitHub Release and upload build artifact
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
  const version = "0.7.2";
  const tag = `v${version}`;
  const owner = "DragonAte88";
  const repo = "Streamio";
  const filePath = path.join(__dirname, "release", `Streamio-Setup-${version}.exe`);

  if (!fs.existsSync(filePath)) {
    console.error("Installer file not found:", filePath);
    process.exit(1);
  }

  // Get token from environment or git credential
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (!token) {
    console.log("No GH_TOKEN environment variable set. Attempting token resolution...");
    try {
      token = execSync("git config --get github.token", { encoding: "utf8" }).trim();
    } catch {}
  }

  if (!token) {
    console.error("Please set GH_TOKEN environment variable.");
    process.exit(1);
  }

  const headers = {
    "Authorization": `token ${token}`,
    "User-Agent": "Node-Release-Script",
    "Accept": "application/vnd.github.v3+json"
  };

  console.log(`Checking existing release for ${tag}...`);
  let release;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, { headers });
    if (res.ok) {
      release = await res.json();
      console.log(`Found existing release (ID: ${release.id})`);
    }
  } catch (e) {}

  if (!release) {
    console.log(`Creating release ${tag}...`);
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        name: `Streamio v${version}`,
        body: `### Streamio v${version} Release\n\n- Full WatchNixtoons2 scraping engine & 5-phase video extractor\n- Season-aware episode list fetching\n- Multi-mirror automatic host failover\n- Oracle Cloud 3-instance synchronized infrastructure (Flex-1, Flex-2, Flex-3)\n- UI resilience & episode loading updates`,
        draft: false,
        prerelease: false
      })
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Failed to create release:", createRes.status, errText);
      process.exit(1);
    }
    release = await createRes.json();
    console.log(`Successfully created release (ID: ${release.id})`);
  }

  const fileName = path.basename(filePath);
  console.log(`Uploading ${fileName} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB)...`);

  const fileData = fs.readFileSync(filePath);
  const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`;

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Authorization": `token ${token}`,
      "User-Agent": "Node-Release-Script",
      "Content-Type": "application/octet-stream",
      "Content-Length": fileData.length
    },
    body: fileData
  });

  if (uploadRes.ok) {
    const asset = await uploadRes.json();
    console.log("SUCCESS! Release asset uploaded:", asset.browser_download_url);
  } else {
    const errText = await uploadRes.text();
    console.log("Upload response status:", uploadRes.status, errText);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
