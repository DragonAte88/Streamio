Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WL {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

[WL]::EnumWindows({
    param($h, $l)
    if ([WL]::IsWindowVisible($h)) {
        $len = [WL]::GetWindowTextLength($h)
        if ($len -gt 0) {
            $sb = New-Object System.Text.StringBuilder($len + 1)
            [WL]::GetWindowText($h, $sb, $sb.Capacity) | Out-Null
            Write-Output $sb.ToString()
        }
    }
    return $true
}, [IntPtr]::Zero) | Out-Null
