#requires -Version 5.1
# Automater - Fluent minimal dark-red study automation utility
# 51 features: timed Enter + 50 additional automation helpers
# No decorative emojis; clean typography only

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic

# --- Win32 interop (native POINT — System.Drawing.Point breaks Add-Type on some PS7 setups) ---
if (-not ('Win32' -as [type])) {
  try {
    Add-Type -ErrorAction Stop @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Win32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetCursorPos(int x, int y);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool GetCursorPos(out POINT pt);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern short GetAsyncKeyState(int vKey);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr GetWindowDC(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

  [DllImport("gdi32.dll", SetLastError = true)]
  public static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x02;
  public const uint MOUSEEVENTF_LEFTUP = 0x04;
  public const uint MOUSEEVENTF_RIGHTDOWN = 0x08;
  public const uint MOUSEEVENTF_RIGHTUP = 0x10;
  public const uint MOUSEEVENTF_MIDDLEDOWN = 0x20;
  public const uint MOUSEEVENTF_MIDDLEUP = 0x40;
  public const uint MOUSEEVENTF_WHEEL = 0x800;
  public const uint MOUSEEVENTF_MOVE = 0x01;
  public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const int SW_MINIMIZE = 6;
  public const int SW_RESTORE = 9;
  public const int SW_SHOW = 5;
  public const int VK_ESCAPE = 0x1B;
  public const int VK_F12 = 0x7B;
  public const int VK_RETURN = 0x0D;
  public const int VK_LBUTTON = 0x01;
  public const int VK_RBUTTON = 0x02;
  public const int VK_MBUTTON = 0x04;
}
"@
  } catch {
    throw "Failed to load Win32 interop. Close this PowerShell window and open a new one, then retry. Details: $($_.Exception.Message)"
  }
}

if (-not ('Win32' -as [type])) {
  throw "Win32 type is missing. Close this PowerShell window completely and run the script in a fresh session."
}

# --- Correct x64 SendInput (old flat INPUT layout silently fails in Electron/Claude) ---
if (-not ('AutomaterKeys' -as [type])) {
  try {
    Add-Type -ErrorAction Stop @"
using System;
using System.Runtime.InteropServices;

public static class AutomaterKeys {
  public const int INPUT_KEYBOARD = 1;
  public const uint KEYEVENTF_KEYUP = 0x0002;
  public const ushort VK_RETURN = 0x0D;
  public const ushort VK_CONTROL = 0x11;
  public const ushort VK_SHIFT = 0x10;
  public const ushort VK_V = 0x56;

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct HARDWAREINPUT {
    public uint uMsg;
    public ushort wParamL;
    public ushort wParamH;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public int type;
    public InputUnion U;
  }

  [DllImport("user32.dll", SetLastError = true)]
  static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  [DllImport("user32.dll")]
  static extern uint MapVirtualKey(uint uCode, uint uMapType);

  [DllImport("user32.dll")]
  static extern IntPtr GetMessageExtraInfo();

  [DllImport("user32.dll")]
  static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  static INPUT Key(ushort vk, uint flags) {
    return new INPUT {
      type = INPUT_KEYBOARD,
      U = new InputUnion {
        ki = new KEYBDINPUT {
          wVk = vk,
          wScan = (ushort)MapVirtualKey(vk, 0),
          dwFlags = flags,
          time = 0,
          dwExtraInfo = GetMessageExtraInfo()
        }
      }
    };
  }

  static bool Send(INPUT[] inputs) {
    uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    return sent == (uint)inputs.Length;
  }

  public static bool PressEnter() {
    bool ok = Send(new INPUT[] { Key(VK_RETURN, 0), Key(VK_RETURN, KEYEVENTF_KEYUP) });
    if (!ok) {
      keybd_event((byte)VK_RETURN, 0x1C, 0, UIntPtr.Zero);
      keybd_event((byte)VK_RETURN, 0x1C, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
    return ok;
  }

  public static bool PressCtrlV() {
    return Send(new INPUT[] {
      Key(VK_CONTROL, 0),
      Key(VK_V, 0),
      Key(VK_V, KEYEVENTF_KEYUP),
      Key(VK_CONTROL, KEYEVENTF_KEYUP)
    });
  }

  public static bool PressCtrlEnter() {
    return Send(new INPUT[] {
      Key(VK_CONTROL, 0),
      Key(VK_RETURN, 0),
      Key(VK_RETURN, KEYEVENTF_KEYUP),
      Key(VK_CONTROL, KEYEVENTF_KEYUP)
    });
  }
}
"@
  } catch {
    throw "Failed to load AutomaterKeys. Close this PowerShell window and open a new one, then retry. Details: $($_.Exception.Message)"
  }
}

# --- Paths and state ---
$script:AppData = Join-Path $env:LOCALAPPDATA "jp-study-automater"
if (-not (Test-Path $script:AppData)) { New-Item -ItemType Directory -Path $script:AppData -Force | Out-Null }
$script:ProfilesPath = Join-Path $script:AppData "profiles.json"
$script:SnippetsPath = Join-Path $script:AppData "snippets.json"
$script:SettingsPath = Join-Path $script:AppData "settings.json"
$script:LogPath = Join-Path $script:AppData "actions.log"

$script:Settings = @{ Theme = "dark"; Accent = "#A02830"; Compact = $false; Tray = $false; Sound = $false; Startup = $false; AlwaysOnTop = $false }
$script:Snippets = @{}
$script:Profiles = @{}
$script:Recording = @()
$script:RecordingActive = $false
$script:Cancelled = $false
$script:Running = $false
$script:LoopCount = 1
$script:PlaybackSpeed = 1.0
$script:TrayIcon = $null

function ConvertTo-Hashtable($obj) {
  if ($obj -eq $null) { return $null }
  if ($obj -is [System.Collections.IEnumerable] -and $obj -isnot [string]) {
    return @($obj | ForEach-Object { ConvertTo-Hashtable $_ })
  } elseif ($obj -is [System.Management.Automation.PSCustomObject]) {
    $ht = @{}
    $obj.PSObject.Properties | ForEach-Object { $ht[$_.Name] = ConvertTo-Hashtable $_.Value }
    return $ht
  } else { return $obj }
}

function Load-State {
  if (Test-Path $script:SettingsPath) {
    try { $script:Settings = ConvertTo-Hashtable (Get-Content $script:SettingsPath -Raw | ConvertFrom-Json) } catch { }
  }
  if (Test-Path $script:SnippetsPath) {
    try { $script:Snippets = ConvertTo-Hashtable (Get-Content $script:SnippetsPath -Raw | ConvertFrom-Json) } catch { }
  }
  if (Test-Path $script:ProfilesPath) {
    try { $script:Profiles = ConvertTo-Hashtable (Get-Content $script:ProfilesPath -Raw | ConvertFrom-Json) } catch { }
  }
  if ($script:Snippets -eq $null) { $script:Snippets = @{} }
  if ($script:Profiles -eq $null) { $script:Profiles = @{} }
  if ($script:Settings -eq $null) { $script:Settings = @{ Theme = "dark"; Accent = "#A02830"; Compact = $false; Tray = $false; Sound = $false; Startup = $false; AlwaysOnTop = $false } }
}

function Save-State {
  $script:Settings | ConvertTo-Json -Depth 5 | Set-Content $script:SettingsPath -Encoding UTF8
  $script:Snippets | ConvertTo-Json -Depth 5 | Set-Content $script:SnippetsPath -Encoding UTF8
  $script:Profiles | ConvertTo-Json -Depth 5 | Set-Content $script:ProfilesPath -Encoding UTF8
}

function Write-Log([string]$message) {
  $line = "$(Get-Date -Format "yyyy-MM-dd HH:mm:ss") - $message"
  Add-Content -Path $script:LogPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
  if ($script:LogBox -ne $null) { $script:LogBox.AppendText("$line`r`n") }
  if ($script:StatusLabel -ne $null) { $script:StatusLabel.Text = $message }
}

function Beep-Done {
  if ($script:Settings.Sound) {
    try { [System.Media.SystemSounds]::Beep.Play() } catch { }
  }
}

function Show-Balloon([string]$title, [string]$text) {
  if ($script:TrayIcon -ne $null) { $script:TrayIcon.ShowBalloonTip(3000, $title, $text, [System.Windows.Forms.ToolTipIcon]::Info) }
}

function Parse-Accent {
  $hex = $script:Settings.Accent.TrimStart('#')
  $r = [Convert]::ToInt32($hex.Substring(0,2), 16)
  $g = [Convert]::ToInt32($hex.Substring(2,2), 16)
  $b = [Convert]::ToInt32($hex.Substring(4,2), 16)
  return [System.Drawing.Color]::FromArgb($r, $g, $b)
}

function Accent-Hover {
  $c = Parse-Accent
  return [System.Drawing.Color]::FromArgb([Math]::Min(255, $c.R + 25), [Math]::Min(255, $c.G + 25), [Math]::Min(255, $c.B + 25))
}

function Apply-Theme {
  $script:BackColor = if ($script:Settings.Theme -eq "dark") { [System.Drawing.Color]::FromArgb(32, 32, 34) } else { [System.Drawing.Color]::FromArgb(245, 245, 250) }
  $script:SurfaceColor = if ($script:Settings.Theme -eq "dark") { [System.Drawing.Color]::FromArgb(42, 42, 44) } else { [System.Drawing.Color]::FromArgb(230, 230, 238) }
  $script:TextColor = if ($script:Settings.Theme -eq "dark") { [System.Drawing.Color]::White } else { [System.Drawing.Color]::FromArgb(32, 32, 34) }
  $script:MutedColor = if ($script:Settings.Theme -eq "dark") { [System.Drawing.Color]::FromArgb(180, 180, 180) } else { [System.Drawing.Color]::FromArgb(90, 90, 95) }
  $script:BorderColor = if ($script:Settings.Theme -eq "dark") { [System.Drawing.Color]::FromArgb(55, 55, 58) } else { [System.Drawing.Color]::FromArgb(200, 200, 210) }
  $script:AccentColor = Parse-Accent
  $script:AccentHover = Accent-Hover
}

function Style-Button($btn, [bool]$accent = $false) {
  $btn.FlatStyle = "Flat"
  $btn.FlatAppearance.BorderSize = 0
  $btn.BackColor = if ($accent) { $script:AccentColor } else { $script:SurfaceColor }
  $btn.ForeColor = $script:TextColor
  $btn.Font = New-Object System.Drawing.Font("Segoe UI", 9)
  $btn.Add_MouseEnter({ $this.BackColor = if ($this.Tag -eq "accent") { $script:AccentHover } else { $script:BorderColor } }.GetNewClosure())
  $btn.Add_MouseLeave({ $this.BackColor = if ($this.Tag -eq "accent") { $script:AccentColor } else { $script:SurfaceColor } }.GetNewClosure())
  if ($accent) { $btn.Tag = "accent" }
}

function Style-Input($input) {
  $input.BackColor = $script:SurfaceColor
  $input.ForeColor = $script:TextColor
  $input.BorderStyle = "FixedSingle"
  if ($input.Font -eq $null) { $input.Font = New-Object System.Drawing.Font("Segoe UI", 9) }
}

function Style-Combo($combo) {
  $combo.BackColor = $script:SurfaceColor
  $combo.ForeColor = $script:TextColor
  $combo.FlatStyle = "Flat"
}

function Style-Tab($tab) {
  $tab.BackColor = $script:BackColor
  $tab.ForeColor = $script:TextColor
  foreach ($page in $tab.TabPages) { $page.BackColor = $script:BackColor; $page.ForeColor = $script:TextColor }
}

function New-Label([string]$text, [int]$x, [int]$y, [int]$w, [int]$h, [bool]$muted = $false) {
  $lbl = New-Object System.Windows.Forms.Label
  $lbl.Text = $text
  $lbl.Location = New-Object System.Drawing.Point($x, $y)
  $lbl.Size = New-Object System.Drawing.Size($w, $h)
  $lbl.ForeColor = if ($muted) { $script:MutedColor } else { $script:TextColor }
  $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 9)
  $lbl.AutoSize = $false
  return $lbl
}

function New-TimeBox([int]$x, [int]$y, [int]$max, [int]$value = 0) {
  $box = New-Object System.Windows.Forms.NumericUpDown
  $box.Location = New-Object System.Drawing.Point($x, $y)
  $box.Size = New-Object System.Drawing.Size(70, 24)
  $box.Minimum = 0
  $box.Maximum = $max
  $box.Value = $value
  Style-Input $box
  return $box
}

function New-Button([string]$text, [int]$x, [int]$y, [int]$w, [int]$h, [bool]$accent = $false) {
  $btn = New-Object System.Windows.Forms.Button
  $btn.Text = $text
  $btn.Location = New-Object System.Drawing.Point($x, $y)
  $btn.Size = New-Object System.Drawing.Size($w, $h)
  Style-Button $btn -accent:$accent
  return $btn
}

function Format-Countdown([int]$TotalSeconds) {
  $ts = [TimeSpan]::FromSeconds([Math]::Max(0, $TotalSeconds))
  if ($ts.TotalHours -ge 1) { return "{0:00}:{1:00}:{2:00}" -f [int][Math]::Floor($ts.TotalHours), $ts.Minutes, $ts.Seconds }
  return "{0:00}:{1:00}" -f $ts.Minutes, $ts.Seconds
}

function Get-TotalSeconds($hoursBox, $minutesBox, $secondsBox) {
  return [int]($hoursBox.Value * 3600 + $minutesBox.Value * 60 + $secondsBox.Value)
}

function Focus-WindowByTitle([string]$match) {
  if ([string]::IsNullOrWhiteSpace($match)) { return $false }
  $shell = New-Object -ComObject WScript.Shell
  # AppActivate matches partial titles and works better than SetForegroundWindow for Electron apps
  if ($shell.AppActivate($match)) {
    Start-Sleep -Milliseconds 220
    return $true
  }
  $script:FocusMatch = $match
  $script:FocusHwnd = [IntPtr]::Zero
  [void][Win32]::EnumWindows({
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    $sb = New-Object System.Text.StringBuilder 512
    [void][Win32]::GetWindowText($hWnd, $sb, $sb.Capacity)
    $title = $sb.ToString()
    if ($title.Length -gt 0 -and $title -like "*$($script:FocusMatch)*") {
      $script:FocusHwnd = $hWnd
      return $false
    }
    return $true
  }, [IntPtr]::Zero)
  if ($script:FocusHwnd -eq [IntPtr]::Zero) { return $false }
  # Alt tap unlocks foreground lock on modern Windows
  Add-Type -Name AutomaterFocusHelper -Namespace AutomaterTemp -MemberDefinition @"
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr extra);
"@ -ErrorAction SilentlyContinue
  try {
    [AutomaterTemp.AutomaterFocusHelper]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [void][Win32]::ShowWindow($script:FocusHwnd, [Win32]::SW_RESTORE)
    [void][Win32]::SetForegroundWindow($script:FocusHwnd)
    [AutomaterTemp.AutomaterFocusHelper]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  } catch {
    [void][Win32]::SetForegroundWindow($script:FocusHwnd)
  }
  Start-Sleep -Milliseconds 220
  return $true
}

function Send-EnterNow([bool]$double = $false, [bool]$ctrlEnter = $false) {
  if ($ctrlEnter) {
    [void][AutomaterKeys]::PressCtrlEnter()
  } else {
    [void][AutomaterKeys]::PressEnter()
  }
  if ($double) {
    Start-Sleep -Milliseconds 120
    [void][AutomaterKeys]::PressEnter()
  }
}

function Send-KeysRaw([string]$keys) {
  # Prefer hardware paste/enter for common chords; fallback to SendKeys for the rest
  if ($keys -eq "^v") { [void][AutomaterKeys]::PressCtrlV(); Write-Log "Sent Ctrl+V"; return }
  if ($keys -eq "{ENTER}" -or $keys -eq "~") { [void][AutomaterKeys]::PressEnter(); Write-Log "Sent Enter"; return }
  $shell = New-Object -ComObject WScript.Shell
  $shell.SendKeys($keys)
  Write-Log "Sent keys: $keys"
}

function Send-TextRaw([string]$text) {
  if ($text -eq $null -or $text.Length -eq 0) { return }
  [System.Windows.Forms.Clipboard]::SetText($text)
  Start-Sleep -Milliseconds 80
  [void][AutomaterKeys]::PressCtrlV()
  Write-Log "Sent text: $($text.Length) chars"
}

function Send-PasteEnter([bool]$double = $false, [bool]$ctrlEnter = $false) {
  [void][AutomaterKeys]::PressCtrlV()
  Start-Sleep -Milliseconds 180
  Send-EnterNow -double:$double -ctrlEnter:$ctrlEnter
}

function Send-Click([int]$x, [int]$y, [string]$button = "left") {
  [Win32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 60
  $flagDown = if ($button -eq "right") { [Win32]::MOUSEEVENTF_RIGHTDOWN } elseif ($button -eq "middle") { [Win32]::MOUSEEVENTF_MIDDLEDOWN } else { [Win32]::MOUSEEVENTF_LEFTDOWN }
  $flagUp = if ($button -eq "right") { [Win32]::MOUSEEVENTF_RIGHTUP } elseif ($button -eq "middle") { [Win32]::MOUSEEVENTF_MIDDLEUP } else { [Win32]::MOUSEEVENTF_LEFTUP }
  [Win32]::mouse_event($flagDown, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 30
  [Win32]::mouse_event($flagUp, 0, 0, 0, 0)
  Write-Log "Click $button at $x,$y"
}

function Send-Move([int]$x, [int]$y) {
  [Win32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 20
  Write-Log "Move to $x,$y"
}

function Send-Scroll([int]$amount) {
  [Win32]::mouse_event([Win32]::MOUSEEVENTF_WHEEL, 0, 0, $amount, 0)
  Write-Log "Scroll $amount"
}

function Send-Drag([int]$x1, [int]$y1, [int]$x2, [int]$y2) {
  [Win32]::SetCursorPos($x1, $y1)
  Start-Sleep -Milliseconds 60
  [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 50
  $steps = 20
  for ($i = 1; $i -le $steps; $i++) {
    $px = [int]($x1 + ($x2 - $x1) * $i / $steps)
    $py = [int]($y1 + ($y2 - $y1) * $i / $steps)
    [Win32]::SetCursorPos($px, $py)
    Start-Sleep -Milliseconds 10
  }
  [Win32]::SetCursorPos($x2, $y2)
  Start-Sleep -Milliseconds 60
  [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
  Write-Log "Drag from $x1,$y1 to $x2,$y2"
}

function Get-CursorPos {
  $pt = New-Object 'Win32+POINT'
  [void][Win32]::GetCursorPos([ref]$pt)
  return New-Object System.Drawing.Point $pt.X, $pt.Y
}

function Get-PixelColor([int]$x, [int]$y) {
  $desk = [Win32]::GetWindowDC([IntPtr]::Zero)
  $pixel = [Win32]::GetPixel($desk, $x, $y)
  [void][Win32]::ReleaseDC([IntPtr]::Zero, $desk)
  $r = $pixel -band 0xFF
  $g = ($pixel -shr 8) -band 0xFF
  $b = ($pixel -shr 16) -band 0xFF
  return [System.Drawing.Color]::FromArgb($r, $g, $b)
}

function Get-ActiveWindowTitle {
  $h = [Win32]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder(256)
  [void][Win32]::GetWindowText($h, $sb, 256)
  return $sb.ToString()
}

function Get-WindowList {
  $list = New-Object System.Collections.Generic.List[System.Object]
  $callback = [Win32+EnumWindowsProc] {
    param([IntPtr]$h, [IntPtr]$l)
    $sb = New-Object System.Text.StringBuilder(256)
    [void][Win32]::GetWindowText($h, $sb, 256)
    $t = $sb.ToString()
    if ($t -and ($t -notmatch "^\s*$")) { $list.Add($t) }
    return $true
  }
  [Win32]::EnumWindows($callback, [IntPtr]::Zero)
  return $list | Sort-Object -Unique
}

function Set-Startup([bool]$enable) {
  $reg = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  $path = $PSCommandPath
  if ($enable) {
    Set-ItemProperty -Path $reg -Name "jp-study-automater" -Value "powershell.exe -ExecutionPolicy Bypass -File `"$path`"" -ErrorAction SilentlyContinue
  } else {
    Remove-ItemProperty -Path $reg -Name "jp-study-automater" -ErrorAction SilentlyContinue
  }
}

function Ucp([int[]]$codes) {
  return ($codes | ForEach-Object { [char]$_ }) -join ""
}

function Romaji-ToHiragana([string]$text) {
  $map = @{
    "a" = 0x3042; "i" = 0x3044; "u" = 0x3046; "e" = 0x3048; "o" = 0x304A;
    "ka" = 0x304B; "ki" = 0x304D; "ku" = 0x304F; "ke" = 0x3051; "ko" = 0x3053;
    "sa" = 0x3055; "shi" = 0x3057; "su" = 0x3059; "se" = 0x305B; "so" = 0x305D;
    "ta" = 0x305F; "chi" = 0x3061; "tsu" = 0x3064; "te" = 0x3066; "to" = 0x3068;
    "na" = 0x306A; "ni" = 0x306B; "nu" = 0x306C; "ne" = 0x306D; "no" = 0x306E;
    "ha" = 0x306F; "hi" = 0x3072; "fu" = 0x3075; "he" = 0x3078; "ho" = 0x307B;
    "ma" = 0x307E; "mi" = 0x307F; "mu" = 0x3080; "me" = 0x3081; "mo" = 0x3082;
    "ya" = 0x3084; "yu" = 0x3086; "yo" = 0x3088;
    "ra" = 0x3089; "ri" = 0x308A; "ru" = 0x308B; "re" = 0x308C; "ro" = 0x308D;
    "wa" = 0x308F; "wo" = 0x3092; "n" = 0x3093;
    "ga" = 0x304C; "gi" = 0x304E; "gu" = 0x3050; "ge" = 0x3052; "go" = 0x3054;
    "za" = 0x3056; "ji" = 0x3058; "zu" = 0x305A; "ze" = 0x305C; "zo" = 0x305E;
    "da" = 0x3060; "di" = 0x3062; "du" = 0x3065; "de" = 0x3067; "do" = 0x3069;
    "ba" = 0x3070; "bi" = 0x3073; "bu" = 0x3076; "be" = 0x3079; "bo" = 0x307C;
    "pa" = 0x3071; "pi" = 0x3074; "pu" = 0x3077; "pe" = 0x307A; "po" = 0x307D;
    "kya" = 0x304D + 0x3083; "kyu" = 0x304D + 0x3085; "kyo" = 0x304D + 0x3087;
    "sha" = 0x3057 + 0x3083; "shu" = 0x3057 + 0x3085; "sho" = 0x3057 + 0x3087;
    "cha" = 0x3061 + 0x3083; "chu" = 0x3061 + 0x3085; "cho" = 0x3061 + 0x3087;
    "nya" = 0x306B + 0x3083; "nyu" = 0x306B + 0x3085; "nyo" = 0x306B + 0x3087;
    "hya" = 0x3072 + 0x3083; "hyu" = 0x3072 + 0x3085; "hyo" = 0x3072 + 0x3087;
    "mya" = 0x307F + 0x3083; "myu" = 0x307F + 0x3085; "myo" = 0x307F + 0x3087;
    "rya" = 0x308A + 0x3083; "ryu" = 0x308A + 0x3085; "ryo" = 0x308A + 0x3087;
    "gya" = 0x304E + 0x3083; "gyu" = 0x304E + 0x3085; "gyo" = 0x304E + 0x3087;
    "ja" = 0x3058 + 0x3083; "ju" = 0x3058 + 0x3085; "jo" = 0x3058 + 0x3087;
    "bya" = 0x3073 + 0x3083; "byu" = 0x3073 + 0x3085; "byo" = 0x3073 + 0x3087;
    "pya" = 0x3074 + 0x3083; "pyu" = 0x3074 + 0x3085; "pyo" = 0x3074 + 0x3087
  }
  $result = ""
  $i = 0
  $low = $text.ToLower()
  while ($i -lt $low.Length) {
    $found = $false
    for ($len = 3; $len -ge 1; $len--) {
      if ($i + $len -le $low.Length) {
        $sub = $low.Substring($i, $len)
        if ($map.ContainsKey($sub)) {
          $cp = $map[$sub]
          if ($cp -gt 0xFFFF) {
            $result += [char]::ConvertFromUtf32($cp)
          } else {
            $result += [char]$cp
          }
          $i += $len; $found = $true; break
        }
      }
    }
    if (-not $found) { $result += $low[$i]; $i++ }
  }
  return $result
}

function To-TitleCase([string]$text) { return (Get-Culture).TextInfo.ToTitleCase($text.ToLower()) }

function Screenshot-Clipboard {
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  $g.Dispose()
  [System.Windows.Forms.Clipboard]::SetImage($bmp)
  $bmp.Dispose()
  Write-Log "Screenshot copied to clipboard"
  Show-Balloon "Screenshot" "Primary screen copied to clipboard"
}

function Base64-Encode([string]$text) { return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text)) }
function Base64-Decode([string]$text) { return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($text)) }
function Url-Encode([string]$text) { return [System.Uri]::EscapeDataString($text) }
function Url-Decode([string]$text) { return [System.Uri]::UnescapeDataString($text) }
function Reverse-Text([string]$text) { return (-join $text.ToCharArray()[-1..-($text.Length)]) }

# --- Main UI ---
Load-State
Apply-Theme

$form = New-Object System.Windows.Forms.Form
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(900, 680)
$form.MinimumSize = New-Object System.Drawing.Size(720, 540)
$form.BackColor = $script:BackColor
$form.ForeColor = $script:TextColor
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.FormBorderStyle = "None"
$form.Text = ""
$form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Get-Process -Id $PID).Path)
$form.TopMost = $script:Settings.AlwaysOnTop

# Title bar
$titleBar = New-Object System.Windows.Forms.Panel
$titleBar.Height = 36
$titleBar.Dock = "Top"
$titleBar.BackColor = $script:SurfaceColor
$titleBar.Cursor = "SizeAll"
$script:drag = @{ X = 0; Y = 0; Moving = $false }
$titleBar.Add_MouseDown({ $script:drag.X = $_.X; $script:drag.Y = $_.Y; $script:drag.Moving = $true })
$titleBar.Add_MouseMove({
  if ($script:drag.Moving) {
    $form.Location = New-Object System.Drawing.Point(($form.Location.X + $_.X - $script:drag.X), ($form.Location.Y + $_.Y - $script:drag.Y))
  }
})
$titleBar.Add_MouseUp({ $script:drag.Moving = $false })

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Automater"
$titleLabel.ForeColor = $script:TextColor
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(12, 9)
$titleBar.Controls.Add($titleLabel)

$btnMin = New-Button "-" 0 0 36 36
$btnMin.Dock = "Right"
$btnMin.Add_Click({ $form.WindowState = "Minimized" })
$btnClose = New-Button "x" 0 0 36 36
$btnClose.Dock = "Right"
$btnClose.Add_Click({ $form.Close() })
$titleBar.Controls.Add($btnMin)
$titleBar.Controls.Add($btnClose)

$accentLine = New-Object System.Windows.Forms.Panel
$accentLine.Height = 2
$accentLine.Dock = "Top"
$accentLine.BackColor = $script:AccentColor

$statusBar = New-Object System.Windows.Forms.Panel
$statusBar.Height = 28
$statusBar.Dock = "Bottom"
$statusBar.BackColor = $script:SurfaceColor
$script:StatusLabel = New-Label "Ready" 12 6 600 20 -muted:$true
$statusBar.Controls.Add($script:StatusLabel)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Width = 140
$progressBar.Height = 16
$progressBar.Location = New-Object System.Drawing.Point(($statusBar.Width - 152), 6)
$progressBar.Anchor = "Right"
$progressBar.Style = "Continuous"
$progressBar.BackColor = $script:SurfaceColor
$progressBar.ForeColor = $script:AccentColor
$statusBar.Controls.Add($progressBar)
$statusBar.Add_Resize({ $progressBar.Location = New-Object System.Drawing.Point(($statusBar.Width - 152), 6) })

$tab = New-Object System.Windows.Forms.TabControl
$tab.Dock = "Fill"
$tab.BackColor = $script:BackColor
$tab.ForeColor = $script:TextColor
$tab.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$tab.DrawMode = "OwnerDrawFixed"
$tab.Add_DrawItem({
  param($sender, $e)
  $page = $tab.TabPages[$e.Index]
  $selected = ($tab.SelectedIndex -eq $e.Index)
  $back = if ($selected) { $script:AccentColor } else { $script:SurfaceColor }
  $brushBack = New-Object System.Drawing.SolidBrush($back)
  $brushFore = New-Object System.Drawing.SolidBrush($script:TextColor)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = "Center"
  $sf.LineAlignment = "Center"
  $e.Graphics.FillRectangle($brushBack, $e.Bounds)
  $rectF = New-Object System.Drawing.RectangleF([float]$e.Bounds.X, [float]$e.Bounds.Y, [float]$e.Bounds.Width, [float]$e.Bounds.Height)
  $e.Graphics.DrawString($page.Text, $tab.Font, $brushFore, $rectF, $sf)
  if ($selected) {
    $pen = New-Object System.Drawing.Pen($script:AccentHover, 2)
    $e.Graphics.DrawLine($pen, $e.Bounds.Left, $e.Bounds.Bottom - 1, $e.Bounds.Right, $e.Bounds.Bottom - 1)
    $pen.Dispose()
  }
  $brushBack.Dispose()
  $brushFore.Dispose()
  $sf.Dispose()
})

function Add-TabPage([string]$name) {
  $page = New-Object System.Windows.Forms.TabPage
  $page.Text = $name
  $page.BackColor = $script:BackColor
  $page.ForeColor = $script:TextColor
  $page.BorderStyle = "None"
  $tab.TabPages.Add($page)
  return $page
}

$pageTimer = Add-TabPage "Timer"
$pageInput = Add-TabPage "Input"
$pageMouse = Add-TabPage "Mouse"
$pageSeq = Add-TabPage "Sequences"
$pageStudy = Add-TabPage "Study"
$pageTools = Add-TabPage "Tools"
$pageSystem = Add-TabPage "System"
$pageSettings = Add-TabPage "Settings"

Style-Tab $tab

# --- Timer Tab ---
$timerPanel = New-Object System.Windows.Forms.Panel
$timerPanel.Dock = "Fill"
$timerPanel.AutoScroll = $true
$timerPanel.BackColor = $script:BackColor
$timerPanel.Padding = New-Object System.Windows.Forms.Padding(20)
$pageTimer.Controls.Add($timerPanel)

$timerPanel.Controls.Add((New-Label "Countdown" 20 16 120 24))
$timerHours = New-TimeBox 20 44 99 0
$timerMinutes = New-TimeBox 104 44 59 0
$timerSeconds = New-TimeBox 188 44 59 5
$timerPanel.Controls.Add($timerHours)
$timerPanel.Controls.Add($timerMinutes)
$timerPanel.Controls.Add($timerSeconds)
$timerPanel.Controls.Add((New-Label "Hours" 20 72 70 18 -muted:$true))
$timerPanel.Controls.Add((New-Label "Minutes" 104 72 70 18 -muted:$true))
$timerPanel.Controls.Add((New-Label "Seconds" 188 72 70 18 -muted:$true))

$chkDouble = New-Object System.Windows.Forms.CheckBox
$chkDouble.Text = "Double Enter (search bars / IME)"
$chkDouble.Location = New-Object System.Drawing.Point(20, 100)
$chkDouble.Size = New-Object System.Drawing.Size(260, 24)
$chkDouble.ForeColor = $script:TextColor
$chkDouble.Checked = $false
$timerPanel.Controls.Add($chkDouble)

$chkCtrlEnter = New-Object System.Windows.Forms.CheckBox
$chkCtrlEnter.Text = "Ctrl+Enter (Claude / AI chats)"
$chkCtrlEnter.Location = New-Object System.Drawing.Point(20, 124)
$chkCtrlEnter.Size = New-Object System.Drawing.Size(260, 24)
$chkCtrlEnter.ForeColor = $script:TextColor
$chkCtrlEnter.Checked = $false
$timerPanel.Controls.Add($chkCtrlEnter)

$timerPanel.Controls.Add((New-Label "Focus window title contains" 20 152 220 20 -muted:$true))
$txtFocusTitle = New-Object System.Windows.Forms.TextBox
$txtFocusTitle.Location = New-Object System.Drawing.Point(20, 174)
$txtFocusTitle.Size = New-Object System.Drawing.Size(252, 24)
$txtFocusTitle.Text = "Claude"
Style-Input $txtFocusTitle
$timerPanel.Controls.Add($txtFocusTitle)

$btnStartTimer = New-Button "Start" 20 212 120 32 -accent:$true
$btnCancelTimer = New-Button "Cancel" 152 212 120 32
$btnCancelTimer.Enabled = $false
$timerPanel.Controls.Add($btnStartTimer)
$timerPanel.Controls.Add($btnCancelTimer)

$lblCountdown = New-Object System.Windows.Forms.Label
$lblCountdown.Text = "Ready"
$lblCountdown.Location = New-Object System.Drawing.Point(20, 256)
$lblCountdown.Size = New-Object System.Drawing.Size(252, 48)
$lblCountdown.TextAlign = "MiddleCenter"
$lblCountdown.Font = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Bold)
$lblCountdown.ForeColor = $script:AccentColor
$timerPanel.Controls.Add($lblCountdown)

$timerObj = New-Object System.Windows.Forms.Timer
$timerObj.Interval = 1000
$script:TimerRemaining = 0
$script:TimerTotal = 0
$timerObj.Add_Tick({
  $script:TimerRemaining--
  if ($script:TimerTotal -gt 0) {
    $progressBar.Value = [Math]::Max(0, [Math]::Min(100, [int](100 - ($script:TimerRemaining / $script:TimerTotal * 100))))
  }
  if ($script:TimerRemaining -le 0) {
    $timerObj.Stop()
    $lblCountdown.Text = "Enter"
    # Keep Automater minimized so it does not steal focus from Claude
    Start-Sleep -Milliseconds 80
    $focused = Focus-WindowByTitle $txtFocusTitle.Text
    if (-not $focused) {
      Write-Log "No window matched '$($txtFocusTitle.Text)' — sending to current focus"
      Start-Sleep -Milliseconds 80
    }
    if ($timerObj.Tag -eq "paste-enter") {
      $timerObj.Tag = $null
      Send-PasteEnter -double:$chkDouble.Checked -ctrlEnter:$chkCtrlEnter.Checked
      Write-Log "Paste+Enter fired (ctrlEnter=$($chkCtrlEnter.Checked))"
    } else {
      Send-EnterNow -double:$chkDouble.Checked -ctrlEnter:$chkCtrlEnter.Checked
      Write-Log "Timer fired: Enter sent (ctrlEnter=$($chkCtrlEnter.Checked))"
    }
    Beep-Done
    Show-Balloon "Automater" "Action fired"
    $btnStartTimer.Enabled = $true
    $btnCancelTimer.Enabled = $false
    $lblCountdown.Text = "Ready"
    $progressBar.Value = 0
    $form.WindowState = "Normal"
  } else {
    $lblCountdown.Text = Format-Countdown $script:TimerRemaining
  }
})

$btnStartTimer.Add_Click({
  $script:TimerTotal = Get-TotalSeconds $timerHours $timerMinutes $timerSeconds
  if ($script:TimerTotal -lt 1) { Write-Log "Set at least 1 second"; return }
  $script:TimerRemaining = $script:TimerTotal
  $timerObj.Tag = $null
  $btnStartTimer.Enabled = $false
  $btnCancelTimer.Enabled = $true
  $form.WindowState = "Minimized"
  $lblCountdown.Text = Format-Countdown $script:TimerRemaining
  $progressBar.Value = 0
  Write-Log "Timer started for $script:TimerTotal seconds"
  $timerObj.Start()
})
$btnCancelTimer.Add_Click({
  $timerObj.Stop()
  $btnStartTimer.Enabled = $true
  $btnCancelTimer.Enabled = $false
  $lblCountdown.Text = "Ready"
  $progressBar.Value = 0
  Write-Log "Timer cancelled"
})

$timerPanel.Controls.Add((New-Label "Presets" 300 16 200 24))
$presets = @("5s", "10s", "30s", "1m", "5m", "10m", "25m", "45m")
$px = 300
foreach ($p in $presets) {
  $bp = New-Button $p $px 44 52 28
  $bp.Add_Click({
    $v = $this.Text
    $timerHours.Value = 0; $timerMinutes.Value = 0; $timerSeconds.Value = 0
    if ($v -eq "5s") { $timerSeconds.Value = 5 }
    elseif ($v -eq "10s") { $timerSeconds.Value = 10 }
    elseif ($v -eq "30s") { $timerSeconds.Value = 30 }
    elseif ($v -eq "1m") { $timerMinutes.Value = 1 }
    elseif ($v -eq "5m") { $timerMinutes.Value = 5 }
    elseif ($v -eq "10m") { $timerMinutes.Value = 10 }
    elseif ($v -eq "25m") { $timerMinutes.Value = 25 }
    elseif ($v -eq "45m") { $timerMinutes.Value = 45 }
  }.GetNewClosure())
  $timerPanel.Controls.Add($bp)
  $px += 60
}

$btnPomodoro = New-Button "Pomodoro (25m)" 300 84 140 32
$btnPomodoro.Add_Click({
  $timerHours.Value = 0; $timerMinutes.Value = 25; $timerSeconds.Value = 0
  Write-Log "Pomodoro preset loaded"
})
$timerPanel.Controls.Add($btnPomodoro)

$btnBreak = New-Button "Break (5m)" 452 84 120 32
$btnBreak.Add_Click({
  $timerHours.Value = 0; $timerMinutes.Value = 5; $timerSeconds.Value = 0
  Write-Log "Break preset loaded"
})
$timerPanel.Controls.Add($btnBreak)

$btnPasteEnter = New-Button "Paste + Enter" 300 128 140 32 -accent:$true
$btnPasteEnter.Add_Click({
  $script:TimerTotal = Get-TotalSeconds $timerHours $timerMinutes $timerSeconds
  if ($script:TimerTotal -lt 1) { $script:TimerTotal = 1 }
  $script:TimerRemaining = $script:TimerTotal
  $timerObj.Tag = "paste-enter"
  $btnStartTimer.Enabled = $false
  $btnCancelTimer.Enabled = $true
  $form.WindowState = "Minimized"
  $lblCountdown.Text = Format-Countdown $script:TimerRemaining
  $progressBar.Value = 0
  Write-Log "Paste+Enter scheduled (focus='$($txtFocusTitle.Text)', ctrlEnter=$($chkCtrlEnter.Checked))"
  $timerObj.Start()
})
$timerPanel.Controls.Add($btnPasteEnter)

$btnClaudePreset = New-Button "Claude defaults" 452 128 120 32
$btnClaudePreset.Add_Click({
  $chkDouble.Checked = $false
  $chkCtrlEnter.Checked = $false
  $txtFocusTitle.Text = "Claude"
  $timerSeconds.Value = 3
  $timerMinutes.Value = 0
  $timerHours.Value = 0
  Write-Log "Claude defaults loaded"
})
$timerPanel.Controls.Add($btnClaudePreset)

# --- Input Tab ---
$inputPanel = New-Object System.Windows.Forms.Panel
$inputPanel.Dock = "Fill"
$inputPanel.AutoScroll = $true
$inputPanel.BackColor = $script:BackColor
$pageInput.Controls.Add($inputPanel)

$inputPanel.Controls.Add((New-Label "Type text" 20 16 300 24))
$txtType = New-Object System.Windows.Forms.TextBox
$txtType.Location = New-Object System.Drawing.Point(20, 44)
$txtType.Size = New-Object System.Drawing.Size(420, 24)
Style-Input $txtType
$inputPanel.Controls.Add($txtType)

$btnType = New-Button "Type" 452 40 80 28 -accent:$true
$btnType.Add_Click({
  if ($txtType.Text) { Send-KeysRaw $txtType.Text; Write-Log "Typed text" }
})
$inputPanel.Controls.Add($btnType)

$btnSendEnter = New-Button "Enter" 544 40 80 28
$btnSendEnter.Add_Click({
  [void](Focus-WindowByTitle $txtFocusTitle.Text)
  Send-EnterNow -double:$chkDouble.Checked -ctrlEnter:$chkCtrlEnter.Checked
})
$inputPanel.Controls.Add($btnSendEnter)

$btnSendHotkey = New-Button "Ctrl+V" 636 40 80 28
$btnSendHotkey.Add_Click({ Send-KeysRaw "^v"; Write-Log "Sent Ctrl+V" })
$inputPanel.Controls.Add($btnSendHotkey)

$btnSendCopy = New-Button "Ctrl+C" 728 40 80 28
$btnSendCopy.Add_Click({ Send-KeysRaw "^c"; Write-Log "Sent Ctrl+C" })
$inputPanel.Controls.Add($btnSendCopy)

$inputPanel.Controls.Add((New-Label "Snippets" 20 84 120 24))
$comboSnippets = New-Object System.Windows.Forms.ComboBox
$comboSnippets.Location = New-Object System.Drawing.Point(20, 112)
$comboSnippets.Size = New-Object System.Drawing.Size(260, 24)
$comboSnippets.DropDownStyle = "DropDown"
Style-Combo $comboSnippets
$inputPanel.Controls.Add($comboSnippets)

$btnInsertSnippet = New-Button "Insert" 292 108 80 28 -accent:$true
$btnInsertSnippet.Add_Click({
  $name = $comboSnippets.Text
  if ($script:Snippets.ContainsKey($name)) {
    Send-TextRaw $script:Snippets[$name]
    Write-Log "Inserted snippet: $name"
  }
})
$inputPanel.Controls.Add($btnInsertSnippet)

$btnSaveSnippet = New-Button "Save" 384 108 80 28
$btnSaveSnippet.Add_Click({
  if ($txtType.Text -and $comboSnippets.Text) {
    $script:Snippets[$comboSnippets.Text] = $txtType.Text
    Save-State
    Refresh-Snippets
    Write-Log "Saved snippet: $($comboSnippets.Text)"
  }
})
$inputPanel.Controls.Add($btnSaveSnippet)

$btnDeleteSnippet = New-Button "Delete" 476 108 80 28
$btnDeleteSnippet.Add_Click({
  if ($script:Snippets.ContainsKey($comboSnippets.Text)) {
    $script:Snippets.Remove($comboSnippets.Text)
    Save-State
    Refresh-Snippets
    Write-Log "Deleted snippet"
  }
})
$inputPanel.Controls.Add($btnDeleteSnippet)

function Refresh-Snippets {
  $comboSnippets.Items.Clear()
  $comboSnippets.Items.AddRange([array]($script:Snippets.Keys | Sort-Object))
}
Refresh-Snippets

$inputPanel.Controls.Add((New-Label "Text tools" 20 156 300 24))
$btnUpper = New-Button "UPPER" 20 184 80 28
$btnUpper.Add_Click({ if ($txtType.Text) { $txtType.Text = $txtType.Text.ToUpper(); Write-Log "Uppercase" } })
$btnLower = New-Button "lower" 112 184 80 28
$btnLower.Add_Click({ if ($txtType.Text) { $txtType.Text = $txtType.Text.ToLower(); Write-Log "Lowercase" } })
$btnTitle = New-Button "Title" 204 184 80 28
$btnTitle.Add_Click({ if ($txtType.Text) { $txtType.Text = To-TitleCase $txtType.Text; Write-Log "Title case" } })
$btnHiragana = New-Button "Romaji to Hiragana" 296 184 140 28
$btnHiragana.Add_Click({ if ($txtType.Text) { $txtType.Text = Romaji-ToHiragana $txtType.Text; Write-Log "Converted to hiragana" } })
$btnTrim = New-Button "Trim" 448 184 80 28
$btnTrim.Add_Click({ if ($txtType.Text) { $txtType.Text = $txtType.Text.Trim(); Write-Log "Trimmed" } })
$btnClear = New-Button "Clear" 540 184 80 28
$btnClear.Add_Click({ $txtType.Text = ""; Write-Log "Cleared" })
$inputPanel.Controls.AddRange(@($btnUpper, $btnLower, $btnTitle, $btnHiragana, $btnTrim, $btnClear))

$inputPanel.Controls.Add((New-Label "Encoding tools" 20 228 300 24))
$btnB64 = New-Button "Base64" 20 256 80 28
$btnB64.Add_Click({ if ($txtType.Text) { $txtType.Text = Base64-Encode $txtType.Text; Write-Log "Base64 encoded" } })
$btnB64Dec = New-Button "B64 dec" 112 256 80 28
$btnB64Dec.Add_Click({ try { if ($txtType.Text) { $txtType.Text = Base64-Decode $txtType.Text; Write-Log "Base64 decoded" } } catch { Write-Log "Invalid Base64" } })
$btnUrl = New-Button "URL enc" 204 256 80 28
$btnUrl.Add_Click({ if ($txtType.Text) { $txtType.Text = Url-Encode $txtType.Text; Write-Log "URL encoded" } })
$btnUrlDec = New-Button "URL dec" 296 256 80 28
$btnUrlDec.Add_Click({ if ($txtType.Text) { $txtType.Text = Url-Decode $txtType.Text; Write-Log "URL decoded" } })
$btnRev = New-Button "Reverse" 388 256 80 28
$btnRev.Add_Click({ if ($txtType.Text) { $txtType.Text = Reverse-Text $txtType.Text; Write-Log "Reversed" } })
$inputPanel.Controls.AddRange(@($btnB64, $btnB64Dec, $btnUrl, $btnUrlDec, $btnRev))

$inputPanel.Controls.Add((New-Label "Japanese inserts" 20 300 300 24))
$btnTilde = New-Button "Wave dash" 20 328 80 28
$btnTilde.Add_Click({ Send-TextRaw (Ucp 0x301C) })
$btnChoonpu = New-Button "Choonpu" 112 328 80 28
$btnChoonpu.Add_Click({ Send-TextRaw (Ucp 0x30FC) })
$btnMaru = New-Button "Maru" 204 328 80 28
$btnMaru.Add_Click({ Send-TextRaw (Ucp 0x30FB) })
$btnKaigyo = New-Button "Kai" 296 328 80 28
$btnKaigyo.Add_Click({ Send-KeysRaw "{ENTER}" })
$btnPitch = New-Button "Pitch" 388 328 80 28
$btnPitch.Add_Click({ Send-TextRaw (Ucp 0x0301) })
$btnFurigana = New-Button "Furigana template" 476 328 120 28
$btnFurigana.Add_Click({
  $t = $txtType.Text
  if (-not $t) { $t = Ucp 0x6F22,0x5B57,0x005B,0x304B,0x3093,0x3058,0x005D }
  else { $t = "$t[$((Romaji-ToHiragana $t))]" }
  Send-TextRaw $t
  Write-Log "Inserted furigana template"
})
$inputPanel.Controls.AddRange(@($btnTilde, $btnChoonpu, $btnMaru, $btnKaigyo, $btnPitch, $btnFurigana))

# --- Mouse Tab ---
$mousePanel = New-Object System.Windows.Forms.Panel
$mousePanel.Dock = "Fill"
$mousePanel.AutoScroll = $true
$mousePanel.BackColor = $script:BackColor
$pageMouse.Controls.Add($mousePanel)

$mousePanel.Controls.Add((New-Label "Coordinates" 20 16 120 24))
$numX = New-TimeBox 20 44 9999 0
$numX.Width = 80
$numY = New-TimeBox 112 44 9999 0
$numY.Width = 80
$mousePanel.Controls.Add($numX)
$mousePanel.Controls.Add($numY)
$mousePanel.Controls.Add((New-Label "X" 20 72 80 18 -muted:$true))
$mousePanel.Controls.Add((New-Label "Y" 112 72 80 18 -muted:$true))

$btnMove = New-Button "Move" 204 40 80 28
$btnMove.Add_Click({ Send-Move $numX.Value $numY.Value })
$btnClick = New-Button "Click" 296 40 80 28 -accent:$true
$btnClick.Add_Click({ Send-Click $numX.Value $numY.Value "left" })
$btnRightClick = New-Button "Right" 388 40 80 28
$btnRightClick.Add_Click({ Send-Click $numX.Value $numY.Value "right" })
$btnPick = New-Button "Pick" 480 40 80 28
$btnPick.Add_Click({
  $pf = New-Object System.Windows.Forms.Form
  $pf.Size = New-Object System.Drawing.Size(220, 80)
  $pf.StartPosition = "CenterScreen"
  $pf.FormBorderStyle = "None"
  $pf.BackColor = $script:AccentColor
  $pf.ForeColor = [System.Drawing.Color]::White
  $pf.TopMost = $true
  $pf.Opacity = 0.85
  $pl = New-Label "Move cursor and press F12 to pick" 12 12 200 36
  $pl.ForeColor = [System.Drawing.Color]::White
  $pf.Controls.Add($pl)
  $t = New-Object System.Windows.Forms.Timer
  $t.Interval = 50
  $t.Add_Tick({
    $p = Get-CursorPos
    $pl.Text = "X: $($p.X) Y: $($p.Y)`nF12 = pick, Esc = cancel"
    if ([Win32]::GetAsyncKeyState([Win32]::VK_F12) -ne 0) {
      $t.Stop()
      $numX.Value = $p.X
      $numY.Value = $p.Y
      $pf.Close()
      Write-Log "Picked coordinates $p.X,$p.Y"
    }
    if ([Win32]::GetAsyncKeyState([Win32]::VK_ESCAPE) -ne 0) {
      $t.Stop()
      $pf.Close()
    }
  })
  $t.Start()
  [void]$pf.ShowDialog()
})
$mousePanel.Controls.AddRange(@($btnMove, $btnClick, $btnRightClick, $btnPick))

$mousePanel.Controls.Add((New-Label "Drag" 20 104 120 24))
$numX1 = New-TimeBox 20 132 9999 0
$numX1.Width = 80
$numY1 = New-TimeBox 112 132 9999 0
$numY1.Width = 80
$numX2 = New-TimeBox 204 132 9999 200
$numX2.Width = 80
$numY2 = New-TimeBox 296 132 9999 200
$numY2.Width = 80
$mousePanel.Controls.AddRange(@($numX1, $numY1, $numX2, $numY2))
$mousePanel.Controls.Add((New-Label "From X" 20 160 80 18 -muted:$true))
$mousePanel.Controls.Add((New-Label "From Y" 112 160 80 18 -muted:$true))
$mousePanel.Controls.Add((New-Label "To X" 204 160 80 18 -muted:$true))
$mousePanel.Controls.Add((New-Label "To Y" 296 160 80 18 -muted:$true))
$btnDrag = New-Button "Drag" 388 128 80 32 -accent:$true
$btnDrag.Add_Click({ Send-Drag $numX1.Value $numY1.Value $numX2.Value $numY2.Value })
$mousePanel.Controls.Add($btnDrag)

$mousePanel.Controls.Add((New-Label "Scroll / Jiggle / Auto-click" 20 204 300 24))
$numScroll = New-TimeBox 20 232 1000 -100
$numScroll.Width = 80
$mousePanel.Controls.Add($numScroll)
$btnScroll = New-Button "Scroll" 112 228 80 28
$btnScroll.Add_Click({ Send-Scroll $numScroll.Value })
$mousePanel.Controls.Add($btnScroll)

$btnJiggle = New-Button "Jiggle" 204 228 80 28
$jiggleTimer = New-Object System.Windows.Forms.Timer
$jiggleTimer.Interval = 2000
$jiggleTimer.Add_Tick({
  $p = Get-CursorPos
  Send-Move ($p.X + 1) $p.Y
  Start-Sleep -Milliseconds 80
  Send-Move $p.X $p.Y
})
$btnJiggle.Add_Click({
  if ($jiggleTimer.Enabled) { $jiggleTimer.Stop(); $btnJiggle.Text = "Jiggle"; Write-Log "Jiggle off" }
  else { $jiggleTimer.Start(); $btnJiggle.Text = "Stop"; Write-Log "Jiggle on" }
})
$mousePanel.Controls.Add($btnJiggle)

$btnAutoClick = New-Button "Auto-click" 296 228 80 28
$autoClickTimer = New-Object System.Windows.Forms.Timer
$autoClickTimer.Interval = 500
$autoClickTimer.Add_Tick({
  $p = Get-CursorPos
  Send-Click $p.X $p.Y "left"
})
$btnAutoClick.Add_Click({
  if ($autoClickTimer.Enabled) { $autoClickTimer.Stop(); $btnAutoClick.Text = "Auto-click"; Write-Log "Auto-click off" }
  else { $autoClickTimer.Start(); $btnAutoClick.Text = "Stop"; Write-Log "Auto-click on" }
})
$mousePanel.Controls.Add($btnAutoClick)

$mousePanel.Controls.Add((New-Label "Cursor" 20 276 120 24))
$btnCursorHere = New-Button "Capture current" 20 304 120 28
$btnCursorHere.Add_Click({
  $p = Get-CursorPos
  $numX.Value = $p.X
  $numY.Value = $p.Y
  Write-Log "Cursor at $p.X,$p.Y"
})
$mousePanel.Controls.Add($btnCursorHere)

$btnCenterScreen = New-Button "Center screen" 152 304 120 28
$btnCenterScreen.Add_Click({
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $numX.Value = [int]($b.Width / 2)
  $numY.Value = [int]($b.Height / 2)
  Send-Move $numX.Value $numY.Value
})
$mousePanel.Controls.Add($btnCenterScreen)

# --- Sequences Tab ---
$seqPanel = New-Object System.Windows.Forms.Panel
$seqPanel.Dock = "Fill"
$seqPanel.AutoScroll = $true
$seqPanel.BackColor = $script:BackColor
$pageSeq.Controls.Add($seqPanel)

$seqPanel.Controls.Add((New-Label "Step list" 20 16 300 24))
$lstSteps = New-Object System.Windows.Forms.ListBox
$lstSteps.Location = New-Object System.Drawing.Point(20, 44)
$lstSteps.Size = New-Object System.Drawing.Size(420, 160)
$lstSteps.BackColor = $script:SurfaceColor
$lstSteps.ForeColor = $script:TextColor
$lstSteps.BorderStyle = "FixedSingle"
$seqPanel.Controls.Add($lstSteps)

$btnRecord = New-Button "Record" 452 44 100 28 -accent:$true
$btnStopRecord = New-Button "Stop" 564 44 100 28
$btnPlay = New-Button "Play" 452 80 100 28 -accent:$true
$btnClearSeq = New-Button "Clear" 564 80 100 28
$btnSaveSeq = New-Button "Save" 452 116 100 28
$btnLoadSeq = New-Button "Load" 564 116 100 28
$btnAddWait = New-Button "Add wait" 452 152 100 28
$btnDelStep = New-Button "Remove" 564 152 100 28
$seqPanel.Controls.AddRange(@($btnRecord, $btnStopRecord, $btnPlay, $btnClearSeq, $btnSaveSeq, $btnLoadSeq, $btnAddWait, $btnDelStep))

$seqPanel.Controls.Add((New-Label "Loop count" 20 216 80 24))
$numLoop = New-TimeBox 20 244 999 1
$numLoop.Width = 80
$seqPanel.Controls.Add($numLoop)
$seqPanel.Controls.Add((New-Label "Speed multiplier" 120 216 120 24))
$numSpeed = New-Object System.Windows.Forms.NumericUpDown
$numSpeed.Location = New-Object System.Drawing.Point(120, 244)
$numSpeed.Size = New-Object System.Drawing.Size(80, 24)
$numSpeed.Minimum = 0.1
$numSpeed.Maximum = 5.0
$numSpeed.Value = 1.0
$numSpeed.DecimalPlaces = 1
$numSpeed.Increment = 0.1
Style-Input $numSpeed
$seqPanel.Controls.Add($numSpeed)
$seqPanel.Controls.Add((New-Label "Random delay ms" 220 216 120 24))
$numRandom = New-TimeBox 220 244 5000 0
$numRandom.Width = 80
$seqPanel.Controls.Add($numRandom)

$recordTimer = New-Object System.Windows.Forms.Timer
$recordTimer.Interval = 100
$lastKeyState = @{}
$recordTimer.Add_Tick({
  if (-not $script:RecordingActive) { return }
  $p = Get-CursorPos
  $script:Recording += @{ Type = "move"; X = $p.X; Y = $p.Y; Time = Get-Date }
  $keys = @("A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","D0","D1","D2","D3","D4","D5","D6","D7","D8","D9","Enter","Space","Tab","Back")
  foreach ($k in $keys) {
    $vk = [int]([System.Windows.Forms.Keys]::$k)
    $state = [Win32]::GetAsyncKeyState($vk)
    $down = ($state -band 0x8000) -ne 0
    if ($down -and -not $lastKeyState[$k]) {
      $script:Recording += @{ Type = "key"; Key = $k; Time = Get-Date }
    }
    $lastKeyState[$k] = $down
  }
  $lb = [Win32]::GetAsyncKeyState([Win32]::VK_LBUTTON)
  $rb = [Win32]::GetAsyncKeyState([Win32]::VK_RBUTTON)
  $lDown = ($lb -band 0x8000) -ne 0
  $rDown = ($rb -band 0x8000) -ne 0
  if ($lDown -and -not $lastKeyState["LCLICK"]) {
    $p = Get-CursorPos
    $script:Recording += @{ Type = "click"; X = $p.X; Y = $p.Y; Button = "left"; Time = Get-Date }
  }
  $lastKeyState["LCLICK"] = $lDown
  if ($rDown -and -not $lastKeyState["RCLICK"]) {
    $p = Get-CursorPos
    $script:Recording += @{ Type = "click"; X = $p.X; Y = $p.Y; Button = "right"; Time = Get-Date }
  }
  $lastKeyState["RCLICK"] = $rDown
  if ($lstSteps.Items.Count -ne $script:Recording.Count) {
    $lstSteps.Items.Clear()
    $script:Recording | ForEach-Object { $lstSteps.Items.Add("$($_.Type) $($_.Key) $($_.X),$($_.Y)") }
  }
})

$btnRecord.Add_Click({
  $script:Recording = @()
  $script:RecordingActive = $true
  $btnRecord.Enabled = $false
  $btnStopRecord.Enabled = $true
  Write-Log "Recording started"
  $recordTimer.Start()
})
$btnStopRecord.Add_Click({
  $script:RecordingActive = $false
  $recordTimer.Stop()
  $btnRecord.Enabled = $true
  $btnStopRecord.Enabled = $true
  Write-Log "Recording stopped: $($script:Recording.Count) steps"
})
$btnClearSeq.Add_Click({
  $script:Recording = @()
  $lstSteps.Items.Clear()
  Write-Log "Steps cleared"
})
$btnPlay.Add_Click({
  if ($script:Recording.Count -eq 0) { return }
  Write-Log "Playing sequence"
  $loops = $numLoop.Value
  for ($l = 1; $l -le $loops; $l++) {
    foreach ($step in $script:Recording) {
      if ($script:Cancelled) { break }
      $delay = [int](100 / $numSpeed.Value)
      if ($numRandom.Value -gt 0) { $delay += Get-Random -Minimum 0 -Maximum ([int]$numRandom.Value) }
      if ($delay -gt 0) { Start-Sleep -Milliseconds $delay }
      if ($step.Type -eq "key") { Send-KeysRaw "{$($step.Key)}" }
      elseif ($step.Type -eq "move") { Send-Move $step.X $step.Y }
      elseif ($step.Type -eq "click") { Send-Click $step.X $step.Y $step.Button }
    }
  }
  Write-Log "Sequence done"
  Beep-Done
})
$btnAddWait.Add_Click({
  $script:Recording += @{ Type = "wait"; Ms = 500; Time = Get-Date }
  $lstSteps.Items.Add("wait 500ms")
})
$btnDelStep.Add_Click({
  if ($lstSteps.SelectedIndex -ge 0) {
    $script:Recording = $script:Recording | Where-Object { $_ -ne $script:Recording[$lstSteps.SelectedIndex] }
    $lstSteps.Items.RemoveAt($lstSteps.SelectedIndex)
  }
})
$btnSaveSeq.Add_Click({
  $name = [Microsoft.VisualBasic.Interaction]::InputBox("Profile name", "Save sequence", "default")
  if ($name) {
    $script:Profiles[$name] = $script:Recording | ForEach-Object { @{ Type = $_.Type; Key = $_.Key; X = $_.X; Y = $_.Y; Button = $_.Button; Ms = $_.Ms } }
    Save-State
    Write-Log "Saved sequence: $name"
  }
})
$btnLoadSeq.Add_Click({
  $name = [Microsoft.VisualBasic.Interaction]::InputBox("Profile name", "Load sequence", "default")
  if ($name -and $script:Profiles.ContainsKey($name)) {
    $script:Recording = $script:Profiles[$name]
    $lstSteps.Items.Clear()
    $script:Recording | ForEach-Object { $lstSteps.Items.Add("$($_.Type) $($_.Key) $($_.X),$($_.Y)") }
    Write-Log "Loaded sequence: $name"
  }
})

# --- Study Tab ---
$studyPanel = New-Object System.Windows.Forms.Panel
$studyPanel.Dock = "Fill"
$studyPanel.AutoScroll = $true
$studyPanel.BackColor = $script:BackColor
$pageStudy.Controls.Add($studyPanel)

$studyPanel.Controls.Add((New-Label "Study helpers" 20 16 300 24))

$btnAnki = New-Button "Anki mining template" 20 44 160 32 -accent:$true
$btnAnki.Add_Click({
  $sel = if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() } else { "" }
  $template = "Sentence: $sel`nMeaning: `nNotes: `n"
  [System.Windows.Forms.Clipboard]::SetText($template)
  Send-KeysRaw "^v"
  Write-Log "Anki mining template pasted"
})
$studyPanel.Controls.Add($btnAnki)

$btnDict = New-Button "Dictionary search" 192 44 140 32
$btnDict.Add_Click({
  $q = $txtType.Text
  if (-not $q) { $q = if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() } else { "" } }
  if ($q) {
    $url = "https://jisho.org/search/$q"
    Start-Process $url
    Write-Log "Opened dictionary: $q"
  }
})
$studyPanel.Controls.Add($btnDict)

$btnSubtitle = New-Button "Subtitle paste" 344 44 120 32
$btnSubtitle.Add_Click({
  $t = if ([System.Windows.Forms.Clipboard]::ContainsText()) { [System.Windows.Forms.Clipboard]::GetText() } else { "" }
  $t = $t -replace '\s+', ' '
  [System.Windows.Forms.Clipboard]::SetText($t)
  Send-KeysRaw "^v"
  Write-Log "Subtitle paste cleaned"
})
$studyPanel.Controls.Add($btnSubtitle)

$btnAutoCopy = New-Button "Auto-copy selection" 20 88 160 32
$btnAutoCopy.Add_Click({
  Send-KeysRaw "^c"
  Start-Sleep -Milliseconds 100
  if ([System.Windows.Forms.Clipboard]::ContainsText()) {
    $txtType.Text = [System.Windows.Forms.Clipboard]::GetText()
    Write-Log "Copied selection into input"
  }
})
$studyPanel.Controls.Add($btnAutoCopy)

$btnUrl = New-Button "Open URL" 192 88 100 32
$btnUrl.Add_Click({
  $url = $txtType.Text
  if ($url -and $url -match '^https?://') { Start-Process $url; Write-Log "Opened URL" }
  elseif ($url) { Start-Process "https://$url"; Write-Log "Opened URL" }
})
$studyPanel.Controls.Add($btnUrl)

$btnKana = New-Button "Kana practice" 304 88 120 32
$btnKana.Add_Click({
  $txtType.Text = (Ucp 0x3042,0x3044,0x3046,0x3048,0x304A,0x0020,0x304B,0x304D,0x304F,0x3051,0x3053,0x0020,0x3055,0x3057,0x3059,0x305B,0x305D)
  Write-Log "Kana practice loaded"
})
$studyPanel.Controls.Add($btnKana)

$studyPanel.Controls.Add((New-Label "Saved phrases" 20 140 300 24))
$btnPhrase1 = New-Button "Hello" 20 168 80 28
$btnPhrase1.Add_Click({ Send-TextRaw (Ucp 0x3053,0x3093,0x306B,0x3061,0x306F) })
$btnPhrase2 = New-Button "Thanks" 112 168 80 28
$btnPhrase2.Add_Click({ Send-TextRaw (Ucp 0x3042,0x308A,0x304C,0x3068,0x3046) })
$btnPhrase3 = New-Button "Sorry" 204 168 80 28
$btnPhrase3.Add_Click({ Send-TextRaw (Ucp 0x3059,0x307F,0x307E,0x305B,0x3093) })
$btnPhrase4 = New-Button "Yes" 296 168 80 28
$btnPhrase4.Add_Click({ Send-TextRaw (Ucp 0x306F,0x3044) })
$btnPhrase5 = New-Button "No" 388 168 80 28
$btnPhrase5.Add_Click({ Send-TextRaw (Ucp 0x3044,0x3044,0x3048) })
$studyPanel.Controls.AddRange(@($btnPhrase1, $btnPhrase2, $btnPhrase3, $btnPhrase4, $btnPhrase5))

# --- Tools Tab ---
$toolsPanel = New-Object System.Windows.Forms.Panel
$toolsPanel.Dock = "Fill"
$toolsPanel.AutoScroll = $true
$toolsPanel.BackColor = $script:BackColor
$pageTools.Controls.Add($toolsPanel)

$toolsPanel.Controls.Add((New-Label "Color / pixel" 20 16 200 24))
$btnColor = New-Button "Pick color" 20 44 100 28 -accent:$true
$btnColor.Add_Click({
  $p = Get-CursorPos
  $c = Get-PixelColor $p.X $p.Y
  $hex = "#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B
  [System.Windows.Forms.Clipboard]::SetText($hex)
  $txtType.Text = $hex
  Write-Log "Color picked: $hex at $p.X,$p.Y"
  Show-Balloon "Color" $hex
})
$toolsPanel.Controls.Add($btnColor)

$btnPixel = New-Button "Pixel inspector" 132 44 110 28
$btnPixel.Add_Click({
  $pf = New-Object System.Windows.Forms.Form
  $pf.Size = New-Object System.Drawing.Size(200, 80)
  $pf.FormBorderStyle = "None"
  $pf.BackColor = $script:AccentColor
  $pf.ForeColor = [System.Drawing.Color]::White
  $pf.TopMost = $true
  $pf.Opacity = 0.85
  $pl = New-Label "Move mouse..." 12 12 180 36
  $pl.ForeColor = [System.Drawing.Color]::White
  $pf.Controls.Add($pl)
  $t = New-Object System.Windows.Forms.Timer
  $t.Interval = 80
  $t.Add_Tick({
    $p = Get-CursorPos
    $c = Get-PixelColor $p.X $p.Y
    $hex = "#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B
    $pl.Text = "X:$($p.X) Y:$($p.Y)`n$hex R$($c.R) G$($c.G) B$($c.B)"
    if ([Win32]::GetAsyncKeyState([Win32]::VK_ESCAPE) -ne 0) { $t.Stop(); $pf.Close() }
  })
  $t.Start()
  [void]$pf.ShowDialog()
})
$toolsPanel.Controls.Add($btnPixel)

$btnScreenshot = New-Button "Screenshot to clipboard" 20 84 180 32 -accent:$true
$btnScreenshot.Add_Click({ Screenshot-Clipboard })
$toolsPanel.Controls.Add($btnScreenshot)

$btnAlwaysOnTop = New-Button "Always on top" 212 84 140 32
$btnAlwaysOnTop.Add_Click({
  $form.TopMost = -not $form.TopMost
  $btnAlwaysOnTop.Text = if ($form.TopMost) { "Disable topmost" } else { "Always on top" }
  $script:Settings.AlwaysOnTop = $form.TopMost
  Save-State
  Write-Log "Always on top: $($form.TopMost)"
})
$toolsPanel.Controls.Add($btnAlwaysOnTop)

$btnTray = New-Button "Minimize to tray" 364 84 140 32
$btnTray.Add_Click({
  $script:TrayIcon.Visible = $true
  $form.Hide()
  Show-Balloon "Automater" "Running in tray; double-click icon to restore"
  Write-Log "Minimized to tray"
})
$toolsPanel.Controls.Add($btnTray)

$btnCompact = New-Button "Compact mode" 20 128 140 32
$btnCompact.Add_Click({
  $script:Settings.Compact = -not $script:Settings.Compact
  if ($script:Settings.Compact) {
    $form.Size = New-Object System.Drawing.Size(520, 360)
  } else {
    $form.Size = New-Object System.Drawing.Size(900, 680)
  }
  Save-State
  Write-Log "Compact mode: $($script:Settings.Compact)"
})
$toolsPanel.Controls.Add($btnCompact)

$btnEmergency = New-Button "Emergency stop (F12)" 172 128 160 32
$btnEmergency.Add_Click({
  $script:Cancelled = $true
  $timerObj.Stop()
  $autoClickTimer.Stop()
  $jiggleTimer.Stop()
  $recordTimer.Stop()
  Write-Log "Emergency stop activated"
  Show-Balloon "Automater" "All actions stopped"
})
$toolsPanel.Controls.Add($btnEmergency)

$btnLog = New-Button "Open action log" 344 128 140 32
$btnLog.Add_Click({
  if (Test-Path $script:LogPath) { Start-Process $script:LogPath }
  Write-Log "Opened log"
})
$toolsPanel.Controls.Add($btnLog)

$btnExportLog = New-Button "Export log" 20 172 140 32
$btnExportLog.Add_Click({
  $dlg = New-Object System.Windows.Forms.SaveFileDialog
  $dlg.Filter = "Text files (*.txt)|*.txt"
  $dlg.FileName = "automater-log.txt"
  if ($dlg.ShowDialog() -eq "OK") { Copy-Item $script:LogPath $dlg.FileName -Force; Write-Log "Log exported" }
})
$toolsPanel.Controls.Add($btnExportLog)

$btnColorDialog = New-Button "Color dialog" 172 172 120 32
$btnColorDialog.Add_Click({
  $dlg = New-Object System.Windows.Forms.ColorDialog
  $dlg.FullOpen = $true
  if ($dlg.ShowDialog() -eq "OK") {
    $hex = "#{0:X2}{1:X2}{2:X2}" -f $dlg.Color.R, $dlg.Color.G, $dlg.Color.B
    $txtType.Text = $hex
    Write-Log "Color dialog: $hex"
  }
})
$toolsPanel.Controls.Add($btnColorDialog)

# --- System Tab ---
$sysPanel = New-Object System.Windows.Forms.Panel
$sysPanel.Dock = "Fill"
$sysPanel.AutoScroll = $true
$sysPanel.BackColor = $script:BackColor
$pageSystem.Controls.Add($sysPanel)

$sysPanel.Controls.Add((New-Label "Window title" 20 16 200 24))
$txtWindow = New-Object System.Windows.Forms.TextBox
$txtWindow.Location = New-Object System.Drawing.Point(20, 44)
$txtWindow.Size = New-Object System.Drawing.Size(300, 24)
Style-Input $txtWindow
$sysPanel.Controls.Add($txtWindow)

$btnFocus = New-Button "Focus" 332 40 80 28 -accent:$true
$btnFocus.Add_Click({
  $t = $txtWindow.Text
  $w = Get-Process | Where-Object { $_.MainWindowTitle -like "*$t*" } | Select-Object -First 1
  if ($w) { [Win32]::SetForegroundWindow($w.MainWindowHandle); [Win32]::ShowWindow($w.MainWindowHandle, [Win32]::SW_RESTORE); Write-Log "Focused window: $($w.MainWindowTitle)" }
  else { Write-Log "Window not found" }
})
$sysPanel.Controls.Add($btnFocus)

$btnRefreshWindows = New-Button "Refresh list" 424 40 100 28
$btnRefreshWindows.Add_Click({
  $comboWindows.Items.Clear()
  Get-WindowList | ForEach-Object { $comboWindows.Items.Add($_) }
  Write-Log "Window list refreshed"
})
$sysPanel.Controls.Add($btnRefreshWindows)

$sysPanel.Controls.Add((New-Label "Windows" 20 80 200 24))
$comboWindows = New-Object System.Windows.Forms.ComboBox
$comboWindows.Location = New-Object System.Drawing.Point(20, 108)
$comboWindows.Size = New-Object System.Drawing.Size(400, 24)
Style-Combo $comboWindows
$sysPanel.Controls.Add($comboWindows)

$sysPanel.Controls.Add((New-Label "Process name" 20 148 200 24))
$txtProcess = New-Object System.Windows.Forms.TextBox
$txtProcess.Location = New-Object System.Drawing.Point(20, 176)
$txtProcess.Size = New-Object System.Drawing.Size(200, 24)
Style-Input $txtProcess
$sysPanel.Controls.Add($txtProcess)

$btnStartProc = New-Button "Start" 232 172 80 28 -accent:$true
$btnStartProc.Add_Click({
  if ($txtProcess.Text) {
    Start-Process $txtProcess.Text -ErrorAction SilentlyContinue
    Write-Log "Started process: $($txtProcess.Text)"
  }
})
$btnKillProc = New-Button "Kill" 324 172 80 28
$btnKillProc.Add_Click({
  if ($txtProcess.Text) {
    Get-Process -Name $txtProcess.Text -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Log "Killed process: $($txtProcess.Text)"
  }
})
$sysPanel.Controls.AddRange(@($btnStartProc, $btnKillProc))

$sysPanel.Controls.Add((New-Label "Command" 20 216 200 24))
$txtCommand = New-Object System.Windows.Forms.TextBox
$txtCommand.Location = New-Object System.Drawing.Point(20, 244)
$txtCommand.Size = New-Object System.Drawing.Size(400, 24)
Style-Input $txtCommand
$sysPanel.Controls.Add($txtCommand)
$btnRunCmd = New-Button "Run" 432 240 80 28 -accent:$true
$btnRunCmd.Add_Click({
  if ($txtCommand.Text) {
    try { Start-Process $txtCommand.Text; Write-Log "Ran command: $($txtCommand.Text)" } catch { Write-Log "Failed to run command" }
  }
})
$sysPanel.Controls.Add($btnRunCmd)

$btnWaitWindow = New-Button "Wait for window" 20 284 140 28
$btnWaitWindow.Add_Click({
  $t = $txtWindow.Text
  if (-not $t) { return }
  Write-Log "Waiting for window: $t"
  while ($true) {
    $w = Get-Process | Where-Object { $_.MainWindowTitle -like "*$t*" } | Select-Object -First 1
    if ($w) { Write-Log "Window found: $($w.MainWindowTitle)"; break }
    Start-Sleep -Milliseconds 500
  }
})
$sysPanel.Controls.Add($btnWaitWindow)

$btnListProcesses = New-Button "List processes" 172 284 120 28
$btnListProcesses.Add_Click({
  $txtType.Text = ((Get-Process | Select-Object -First 20 Name, Id | Out-String).Trim())
  Write-Log "Process list copied to input"
})
$sysPanel.Controls.Add($btnListProcesses)

# --- Settings Tab ---
$setPanel = New-Object System.Windows.Forms.Panel
$setPanel.Dock = "Fill"
$setPanel.AutoScroll = $true
$setPanel.BackColor = $script:BackColor
$pageSettings.Controls.Add($setPanel)

$setPanel.Controls.Add((New-Label "Theme" 20 16 200 24))
$btnTheme = New-Button "Toggle dark / light" 20 44 160 32 -accent:$true
$btnTheme.Add_Click({
  $script:Settings.Theme = if ($script:Settings.Theme -eq "dark") { "light" } else { "dark" }
  Save-State
  Apply-Theme
  [System.Windows.Forms.MessageBox]::Show("Restart the automater to apply the theme change.", "Theme", "OK", "Information")
  Write-Log "Theme toggled to $($script:Settings.Theme)"
})
$setPanel.Controls.Add($btnTheme)

$setPanel.Controls.Add((New-Label "Accent color (hex)" 20 88 200 24))
$txtAccent = New-Object System.Windows.Forms.TextBox
$txtAccent.Location = New-Object System.Drawing.Point(20, 116)
$txtAccent.Size = New-Object System.Drawing.Size(120, 24)
$txtAccent.Text = $script:Settings.Accent
Style-Input $txtAccent
$setPanel.Controls.Add($txtAccent)

$btnSetAccent = New-Button "Set accent" 152 112 100 28 -accent:$true
$btnSetAccent.Add_Click({
  if ($txtAccent.Text -match '^#[0-9A-Fa-f]{6}$') {
    $script:Settings.Accent = $txtAccent.Text
    Save-State
    Apply-Theme
    Write-Log "Accent set to $($txtAccent.Text)"
  }
})
$setPanel.Controls.Add($btnSetAccent)

$chkSound = New-Object System.Windows.Forms.CheckBox
$chkSound.Text = "Sound on completion"
$chkSound.Location = New-Object System.Drawing.Point(20, 160)
$chkSound.Size = New-Object System.Drawing.Size(200, 24)
$chkSound.ForeColor = $script:TextColor
$chkSound.Checked = $script:Settings.Sound
$setPanel.Controls.Add($chkSound)
$chkSound.Add_CheckedChanged({ $script:Settings.Sound = $chkSound.Checked; Save-State; Write-Log "Sound: $($chkSound.Checked)" })

$chkStartup = New-Object System.Windows.Forms.CheckBox
$chkStartup.Text = "Run on startup"
$chkStartup.Location = New-Object System.Drawing.Point(20, 192)
$chkStartup.Size = New-Object System.Drawing.Size(200, 24)
$chkStartup.ForeColor = $script:TextColor
$chkStartup.Checked = $script:Settings.Startup
$setPanel.Controls.Add($chkStartup)
$chkStartup.Add_CheckedChanged({
  $script:Settings.Startup = $chkStartup.Checked
  Set-Startup $chkStartup.Checked
  Save-State
  Write-Log "Startup: $($chkStartup.Checked)"
})

$setPanel.Controls.Add((New-Label "Hotkey" 20 236 200 24))
$btnBindF12 = New-Button "Bind F12 as emergency stop" 20 264 200 32
$btnBindF12.Enabled = $false
$setPanel.Controls.Add($btnBindF12)
$setPanel.Controls.Add((New-Label "F12 is already bound to emergency stop." 20 300 300 18 -muted:$true))

$btnOpenData = New-Button "Open data folder" 20 332 160 32
$btnOpenData.Add_Click({ Start-Process "explorer.exe" $script:AppData; Write-Log "Opened data folder" })
$setPanel.Controls.Add($btnOpenData)

$btnReset = New-Button "Reset settings" 20 376 160 32
$btnReset.Add_Click({
  $script:Settings = @{ Theme = "dark"; Accent = "#A02830"; Compact = $false; Tray = $false; Sound = $false; Startup = $false; AlwaysOnTop = $false }
  $script:Snippets = @{}
  $script:Profiles = @{}
  Save-State
  Write-Log "Settings reset"
})
$setPanel.Controls.Add($btnReset)

# --- Log panel ---
$script:LogBox = New-Object System.Windows.Forms.TextBox
$script:LogBox.Multiline = $true
$script:LogBox.ScrollBars = "Vertical"
$script:LogBox.ReadOnly = $true
$script:LogBox.BackColor = $script:SurfaceColor
$script:LogBox.ForeColor = $script:MutedColor
$script:LogBox.Font = New-Object System.Drawing.Font("Consolas", 8)
$script:LogBox.Height = 100
$script:LogBox.Dock = "Bottom"
if (Test-Path $script:LogPath) {
  $tail = (Get-Content $script:LogPath -Tail 20 -Encoding UTF8 -ErrorAction SilentlyContinue) -join "`r`n"
  if ($tail -and -not $tail.EndsWith("`r`n")) { $tail += "`r`n" }
  $script:LogBox.Text = $tail
}

# --- Tray icon ---
$script:TrayIcon = New-Object System.Windows.Forms.NotifyIcon
$script:TrayIcon.Text = "Automater"
$script:TrayIcon.Icon = $form.Icon
$script:TrayIcon.Visible = $false
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$menuItemShow = New-Object System.Windows.Forms.ToolStripMenuItem "Show"
$menuItemShow.Add_Click({ $script:TrayIcon.Visible = $false; $form.Show(); $form.WindowState = "Normal"; $form.Activate() })
$menuItemExit = New-Object System.Windows.Forms.ToolStripMenuItem "Exit"
$menuItemExit.Add_Click({ $form.Close() })
$menu.Items.Add($menuItemShow)
$menu.Items.Add($menuItemExit)
$script:TrayIcon.ContextMenuStrip = $menu
$script:TrayIcon.Add_DoubleClick({ $script:TrayIcon.Visible = $false; $form.Show(); $form.WindowState = "Normal"; $form.Activate() })

# --- Compose form ---
$split = New-Object System.Windows.Forms.SplitContainer
$split.Dock = "Fill"
$split.Orientation = "Horizontal"
$split.Panel1.Controls.Add($tab)
$split.Panel2.Controls.Add($script:LogBox)
$split.Panel2MinSize = 80
$split.Panel2Collapsed = $false
$split.BackColor = $script:BackColor
$split.SplitterDistance = 480
$split.IsSplitterFixed = $false

$form.Controls.Add($split)
$form.Controls.Add($statusBar)
$form.Controls.Add($accentLine)
$form.Controls.Add($titleBar)

# --- Global emergency stop polling ---
$emergencyTimer = New-Object System.Windows.Forms.Timer
$emergencyTimer.Interval = 100
$emergencyTimer.Add_Tick({
  if (-not ('Win32' -as [type])) { return }
  if ([Win32]::GetAsyncKeyState([Win32]::VK_F12) -ne 0) {
    $script:Cancelled = $true
    $timerObj.Stop()
    $autoClickTimer.Stop()
    $jiggleTimer.Stop()
    $recordTimer.Stop()
    Write-Log "Emergency stop via F12"
  }
})
$emergencyTimer.Start()

$form.Add_FormClosing({
  $timerObj.Stop()
  $autoClickTimer.Stop()
  $jiggleTimer.Stop()
  $recordTimer.Stop()
  $emergencyTimer.Stop()
  $script:TrayIcon.Dispose()
  Save-State
})

$btnStartTimer.Enabled = $true
Write-Log "Automater started"

[void]$form.ShowDialog()
