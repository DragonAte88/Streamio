# upload-release.ps1
# Direct GitHub API upload — bypasses electron-builder's uploader entirely.
# Run this if electron-builder fails with ENOENT during publish.
#
# Usage: .\upload-release.ps1 -Version 0.7.0

param([string]$Version = "0.7.0")

$token     = $env:GH_TOKEN
$owner     = "DragonAte88"
$repo      = "Streamio"
$tag       = "v$Version"
$releaseDir = "release"

if (-not $token) { Write-Error "Set `$env:GH_TOKEN first"; exit 1 }

$headers = @{
    Authorization = "token $token"
    Accept        = "application/vnd.github.v3+json"
}

# ── 1. Find or create the release ──────────────────────────────────────────────
Write-Host "Looking up release $tag..."
try {
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $headers
    Write-Host "Found existing release: id=$($rel.id)"
} catch {
    Write-Host "Creating new release $tag..."
    $body = @{ tag_name = $tag; name = $Version; draft = $false; prerelease = $false } | ConvertTo-Json
    $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/releases" `
        -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "Created release: id=$($rel.id)"
}

$releaseId  = $rel.id
$uploadBase = "https://uploads.github.com/repos/$owner/$repo/releases/$releaseId/assets"

# ── 2. Delete any stale assets ─────────────────────────────────────────────────
Write-Host "Clearing stale assets..."
$existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/$releaseId/assets" -Headers $headers
foreach ($a in $existing) {
    Write-Host "  Deleting: $($a.name)"
    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$owner/$repo/releases/assets/$($a.id)" -Headers $headers | Out-Null
}

# ── 3. Upload assets ───────────────────────────────────────────────────────────
function Upload-File {
    param([string]$Path)
    if (-not (Test-Path $Path)) { Write-Warning "  SKIP (not found): $Path"; return }
    $name    = Split-Path $Path -Leaf
    $sizeMB  = [math]::Round((Get-Item $Path).Length / 1MB, 2)
    $uri     = "$uploadBase`?name=$([Uri]::EscapeDataString($name))"
    Write-Host "Uploading $name ($sizeMB MB)..."

    # Use HttpClient for large file streaming — Invoke-RestMethod loads into RAM
    $client = [System.Net.Http.HttpClient]::new()
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("token", $token)
    $client.Timeout = [TimeSpan]::FromMinutes(30)

    $stream  = [System.IO.File]::OpenRead($Path)
    $content = [System.Net.Http.StreamContent]::new($stream)
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/octet-stream")

    $resp = $client.PostAsync($uri, $content).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $stream.Close()
    $client.Dispose()

    if ($resp.IsSuccessStatusCode) {
        $json = $body | ConvertFrom-Json
        Write-Host "  ✅ $name  state=$($json.state)  size=$([math]::Round($json.size/1MB,2)) MB"
    } else {
        Write-Host "  ❌ $name  HTTP $([int]$resp.StatusCode): $body"
    }
}

# Upload blockmap and latest.yml first (small — always succeed quickly)
Upload-File "$releaseDir\Streamio-Setup-$Version.exe.blockmap"
Upload-File "$releaseDir\latest.yml"
# Upload installer last (large)
Upload-File "$releaseDir\Streamio-Setup-$Version.exe"

# ── 4. Final verification ──────────────────────────────────────────────────────
Write-Host "`nVerifying assets on GitHub..."
$assets = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/$releaseId/assets" -Headers $headers
foreach ($a in $assets) {
    $icon = if ($a.state -eq "uploaded") { "✅" } else { "⏳" }
    Write-Host "  $icon $($a.name.PadRight(44)) $($a.state)  $([math]::Round($a.size/1MB,2)) MB"
}

$exe = $assets | Where-Object { $_.name -like "*.exe" -and $_.state -eq "uploaded" }
$yml = $assets | Where-Object { $_.name -eq "latest.yml" -and $_.state -eq "uploaded" }
if ($exe -and $yml) {
    Write-Host "`n✅ v$Version is FULLY PUBLISHED."
} else {
    Write-Host "`n⚠ Some assets missing or not yet uploaded."
}
