param(
    [string]$ProcessName = "Streamio",
    [string]$OutPath = "$env:TEMP\streamio_screenshot.png"
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

[WinCap]::SetProcessDPIAware() | Out-Null

$best = $null
$bestArea = 0
foreach ($proc in (Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)) {
    if ($proc.MainWindowHandle -eq 0) { continue }
    $rect = New-Object WinCap+RECT
    [WinCap]::GetWindowRect($proc.MainWindowHandle, [ref]$rect) | Out-Null
    $area = ($rect.Right - $rect.Left) * ($rect.Bottom - $rect.Top)
    if ($area -gt $bestArea) {
        $bestArea = $area
        $best = $rect
    }
}

if (-not $best) {
    Write-Output "NO_WINDOW_FOUND"
    exit 1
}

$width = $best.Right - $best.Left
$height = $best.Bottom - $best.Top

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($best.Left, $best.Top, 0, 0, $bmp.Size)
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()

Write-Output "SAVED:$OutPath ($width x $height)"
