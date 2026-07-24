Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WC3 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

Get-Process -Name Streamio -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.MainWindowHandle -ne 0) {
        $r = New-Object WC3+RECT
        [WC3]::GetWindowRect($_.MainWindowHandle, [ref]$r) | Out-Null
        $w = $r.Right - $r.Left
        $h = $r.Bottom - $r.Top
        Write-Output "PID=$($_.Id) HWND=$($_.MainWindowHandle) SIZE=${w}x${h} TITLE=$($_.MainWindowTitle) PATH=$($_.Path)"
    }
}
