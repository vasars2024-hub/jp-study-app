# Automation Builder - capture, session record, cursor move, saved configs
# Run: powershell -ExecutionPolicy Bypass -File "C:\Users\Arseniy\Projects\jp-study-app\automation-builder.ps1"
# During session record: do actions in browser/apps, then press F9 to stop.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Match physical screen pixels for Get/SetCursorPos (fixes wrong click targets on scaled DPI).
if (-not ("DpiBoot" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DpiBoot {
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();
    [DllImport("shcore.dll")]
    private static extern int SetProcessDpiAwareness(int value);
    public static void Enable() {
        try { SetProcessDpiAwareness(2); } catch { }
        try { SetProcessDPIAware(); } catch { }
    }
}
"@
}
[DpiBoot]::Enable()

if (-not ("AutoInput" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class AutoInput {
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

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

    // Union layout required so Marshal.SizeOf(INPUT) is correct on x64.
    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion U;
    }

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(POINT pt);

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    private const uint INPUT_MOUSE = 0;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint GA_ROOT = 2;
    private const int SW_RESTORE = 9;

    private static void SendMouse(uint downFlag, uint upFlag) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].U.mi.dwFlags = downFlag;
        inputs[1].type = INPUT_MOUSE;
        inputs[1].U.mi.dwFlags = upFlag;
        uint sent = SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != 2) {
            // Fallback if SendInput is blocked
            mouse_event((int)downFlag, 0, 0, 0, 0);
            mouse_event((int)upFlag, 0, 0, 0, 0);
        }
    }

    public static void LeftClick() {
        SendMouse(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
    }
    public static void RightClick() {
        SendMouse(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP);
    }
    public static void MiddleClick() {
        SendMouse(MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP);
    }

    public static POINT GetPos() {
        POINT p;
        GetCursorPos(out p);
        return p;
    }

    public static void FocusWindowAt(int x, int y) {
        POINT pt;
        pt.X = x;
        pt.Y = y;
        IntPtr hwnd = WindowFromPoint(pt);
        if (hwnd == IntPtr.Zero) return;
        IntPtr root = GetAncestor(hwnd, GA_ROOT);
        if (root == IntPtr.Zero) root = hwnd;
        if (IsIconic(root)) ShowWindow(root, SW_RESTORE);
        SetForegroundWindow(root);
    }

    public static bool MoveInstant(int x, int y) {
        if (!SetCursorPos(x, y)) return false;
        POINT p = GetPos();
        return Math.Abs(p.X - x) <= 2 && Math.Abs(p.Y - y) <= 2;
    }

    public static void MoveTo(int x, int y, int durationMs) {
        POINT start = GetPos();
        if (durationMs <= 0) {
            SetCursorPos(x, y);
            return;
        }
        int steps = Math.Max(1, durationMs / 16);
        for (int i = 1; i <= steps; i++) {
            double t = (double)i / steps;
            t = t < 0.5 ? 2 * t * t : 1 - Math.Pow(-2 * t + 2, 2) / 2;
            int cx = (int)(start.X + (x - start.X) * t);
            int cy = (int)(start.Y + (y - start.Y) * t);
            SetCursorPos(cx, cy);
            System.Threading.Thread.Sleep(durationMs / steps);
        }
        SetCursorPos(x, y);
    }
}
"@
}

if (-not ("KeyCapHook" -as [type])) {
Add-Type @"
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class KeyCapHook {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;

    public struct KeyEvent {
        public int Vk;
        public bool Ctrl;
        public bool Alt;
        public bool Shift;
    }

    public static readonly ConcurrentQueue<KeyEvent> Queue = new ConcurrentQueue<KeyEvent>();

    private static IntPtr _hook = IntPtr.Zero;
    private static LowLevelKeyboardProc _proc;
    private static bool _enabled = false;
    private static int _lastError = 0;

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public int vkCode;
        public int scanCode;
        public int flags;
        public int time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    public static bool IsActive { get { return _enabled && _hook != IntPtr.Zero; } }
    public static int LastError { get { return _lastError; } }
    public static int PendingCount { get { return Queue.Count; } }

    public static void Start() {
        if (_hook != IntPtr.Zero) {
            _enabled = true;
            return;
        }
        _proc = HookCallback;
        IntPtr hMod = LoadLibrary("user32.dll");
        if (hMod == IntPtr.Zero) {
            try {
                using (Process cur = Process.GetCurrentProcess())
                using (ProcessModule mod = cur.MainModule) {
                    hMod = GetModuleHandle(mod.ModuleName);
                }
            } catch {
                hMod = GetModuleHandle("powershell.exe");
                if (hMod == IntPtr.Zero) hMod = GetModuleHandle("pwsh.exe");
            }
        }
        _hook = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, hMod, 0);
        _lastError = Marshal.GetLastWin32Error();
        _enabled = (_hook != IntPtr.Zero);
    }

    public static void Stop() {
        _enabled = false;
        if (_hook != IntPtr.Zero) {
            UnhookWindowsHookEx(_hook);
            _hook = IntPtr.Zero;
        }
        KeyEvent discarded;
        while (Queue.TryDequeue(out discarded)) { }
    }

    public static string TakeOne() {
        KeyEvent ev;
        if (!Queue.TryDequeue(out ev)) return "";
        StringBuilder sb = new StringBuilder();
        sb.Append(ev.Vk);
        sb.Append('|');
        sb.Append(ev.Ctrl ? '1' : '0');
        sb.Append('|');
        sb.Append(ev.Alt ? '1' : '0');
        sb.Append('|');
        sb.Append(ev.Shift ? '1' : '0');
        return sb.ToString();
    }

    private static bool IsModifier(int vk) {
        return vk == 0x10 || vk == 0x11 || vk == 0x12 ||
               vk == 0xA0 || vk == 0xA1 || vk == 0xA2 || vk == 0xA3 || vk == 0xA4 || vk == 0xA5 ||
               vk == 0x5B || vk == 0x5C;
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (_enabled && nCode >= 0) {
            int msg = wParam.ToInt32();
            if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) {
                KBDLLHOOKSTRUCT info = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                int vk = info.vkCode;
                if (!IsModifier(vk)) {
                    KeyEvent ev = new KeyEvent();
                    ev.Vk = vk;
                    ev.Ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
                    ev.Alt = (GetAsyncKeyState(0x12) & 0x8000) != 0;
                    ev.Shift = (GetAsyncKeyState(0x10) & 0x8000) != 0;
                    Queue.Enqueue(ev);
                }
            }
        }
        return CallNextHookEx(_hook, nCode, wParam, lParam);
    }
}
"@
}

$script:steps = New-Object System.Collections.ArrayList
$script:running = $false
$script:cancel = $false
$script:captureMode = $null  # keys | click | session | null
$script:cdForm = $null
$script:lastActionAt = $null
$script:lastRecordPos = $null
$script:keyWasDown = @{}
$script:moveBuffer = New-Object System.Collections.ArrayList
$script:configDir = Join-Path $PSScriptRoot "automation-configs"
$script:moveSampleMinPx = 12
$script:moveMaxBuffer = 250

function Format-Duration([int]$seconds) {
    $h = [int][math]::Floor($seconds / 3600)
    $m = [int][math]::Floor(($seconds % 3600) / 60)
    $s = [int]($seconds % 60)
    return ("{0:D2}:{1:D2}:{2:D2}" -f $h, $m, $s)
}

function ConvertTo-SendKeys([System.Windows.Forms.Keys]$key, [bool]$ctrl, [bool]$alt, [bool]$shift) {
    $base = $key -band [System.Windows.Forms.Keys]::KeyCode
    if ($base -eq [System.Windows.Forms.Keys]::ControlKey -or
        $base -eq [System.Windows.Forms.Keys]::LControlKey -or
        $base -eq [System.Windows.Forms.Keys]::RControlKey -or
        $base -eq [System.Windows.Forms.Keys]::ShiftKey -or
        $base -eq [System.Windows.Forms.Keys]::LShiftKey -or
        $base -eq [System.Windows.Forms.Keys]::RShiftKey -or
        $base -eq [System.Windows.Forms.Keys]::Menu -or
        $base -eq [System.Windows.Forms.Keys]::LMenu -or
        $base -eq [System.Windows.Forms.Keys]::RMenu) {
        return $null
    }

    $token = switch ($base) {
        ([System.Windows.Forms.Keys]::Enter)    { "{ENTER}" }
        ([System.Windows.Forms.Keys]::Return)   { "{ENTER}" }
        ([System.Windows.Forms.Keys]::Tab)      { "{TAB}" }
        ([System.Windows.Forms.Keys]::Escape)   { "{ESC}" }
        ([System.Windows.Forms.Keys]::Back)     { "{BACKSPACE}" }
        ([System.Windows.Forms.Keys]::Delete)   { "{DELETE}" }
        ([System.Windows.Forms.Keys]::Insert)   { "{INSERT}" }
        ([System.Windows.Forms.Keys]::Home)     { "{HOME}" }
        ([System.Windows.Forms.Keys]::End)      { "{END}" }
        ([System.Windows.Forms.Keys]::PageUp)   { "{PGUP}" }
        ([System.Windows.Forms.Keys]::PageDown) { "{PGDN}" }
        ([System.Windows.Forms.Keys]::Up)       { "{UP}" }
        ([System.Windows.Forms.Keys]::Down)     { "{DOWN}" }
        ([System.Windows.Forms.Keys]::Left)     { "{LEFT}" }
        ([System.Windows.Forms.Keys]::Right)    { "{RIGHT}" }
        ([System.Windows.Forms.Keys]::Space)    { " " }
        ([System.Windows.Forms.Keys]::OemPeriod){ "." }
        ([System.Windows.Forms.Keys]::Oemcomma) { "," }
        ([System.Windows.Forms.Keys]::OemQuestion) { "?" }
        ([System.Windows.Forms.Keys]::OemMinus) { "-" }
        ([System.Windows.Forms.Keys]::Oemplus)  { "=" }
        ([System.Windows.Forms.Keys]::OemOpenBrackets) { "{[}" }
        ([System.Windows.Forms.Keys]::OemCloseBrackets){ "{]}" }
        ([System.Windows.Forms.Keys]::OemPipe)  { "\\|" }
        ([System.Windows.Forms.Keys]::OemQuotes){ "'" }
        ([System.Windows.Forms.Keys]::OemSemicolon) { ";" }
        ([System.Windows.Forms.Keys]::Oemtilde) { "``" }
        ([System.Windows.Forms.Keys]::F1)       { "{F1}" }
        ([System.Windows.Forms.Keys]::F2)       { "{F2}" }
        ([System.Windows.Forms.Keys]::F3)       { "{F3}" }
        ([System.Windows.Forms.Keys]::F4)       { "{F4}" }
        ([System.Windows.Forms.Keys]::F5)       { "{F5}" }
        ([System.Windows.Forms.Keys]::F6)       { "{F6}" }
        ([System.Windows.Forms.Keys]::F7)       { "{F7}" }
        ([System.Windows.Forms.Keys]::F8)       { "{F8}" }
        ([System.Windows.Forms.Keys]::F9)       { "{F9}" }
        ([System.Windows.Forms.Keys]::F10)      { "{F10}" }
        ([System.Windows.Forms.Keys]::F11)      { "{F11}" }
        ([System.Windows.Forms.Keys]::F12)      { "{F12}" }
        default {
            $name = $base.ToString()
            if ($name.Length -eq 1) { $name.ToLowerInvariant() }
            elseif ($name -match '^D([0-9])$') { $Matches[1] }
            elseif ($name -match '^NumPad([0-9])$') { $Matches[1] }
            else { "{$name}" }
        }
    }

    $prefix = ""
    if ($ctrl)  { $prefix += "^" }
    if ($alt)   { $prefix += "%" }
    if ($shift) { $prefix += "+" }
    return ($prefix + $token)
}

function Format-KeyLabel([string]$sendKeys) {
    $label = $sendKeys
    $label = $label -replace '\^', 'Ctrl+'
    $label = $label -replace '%', 'Alt+'
    $label = $label -replace '\+', 'Shift+'
    $label = $label -replace '\{ENTER\}', 'Enter'
    $label = $label -replace '\{TAB\}', 'Tab'
    $label = $label -replace '\{ESC\}', 'Esc'
    $label = $label -replace '\{BACKSPACE\}', 'Backspace'
    $label = $label -replace '\{DELETE\}', 'Delete'
    return $label
}

function Get-StepLabel($step) {
    switch ($step.Type) {
        "wait" {
            return "Wait $($step.Seconds)s"
        }
        "click" {
            $btn = if ($step.Button) { $step.Button } else { "left" }
            if ($null -ne $step.X -and $null -ne $step.Y) {
                return "Click $btn at ($($step.X), $($step.Y))"
            }
            return "Click $btn (current position)"
        }
        "move" {
            $ms = if ($null -ne $step.DurationMs) { $step.DurationMs } else { 300 }
            return "Move to ($($step.X), $($step.Y))  ${ms}ms"
        }
        "paste" { return "Paste" }
        "enter" { return "Enter" }
        "keys"  { return "$(Format-KeyLabel $step.Keys)" }
        "words" {
            $raw = if ($null -ne $step.Text) { [string]$step.Text } else { "" }
            $preview = ($raw -replace '\r?\n', ' / ').Trim()
            if ($preview.Length -gt 28) { $preview = $preview.Substring(0, 28) + "..." }
            if (-not $preview) { $preview = "(empty)" }
            $mode = if ($step.EnterAfterLine) { " + Enter/line" } else { "" }
            return "Words: $preview$mode"
        }
        default { return "$($step.Type)" }
    }
}

function Format-WordsPreview([string]$text, [int]$maxLen = 40) {
    $preview = ($text -replace '\r?\n', ' / ').Trim()
    if ($preview.Length -gt $maxLen) { return $preview.Substring(0, $maxLen) + "..." }
    if (-not $preview) { return "(empty)" }
    return $preview
}

function Invoke-WordsStep($step) {
    $text = if ($null -ne $step.Text) { [string]$step.Text } else { "" }
    if (-not $text) { return }

    Hide-CountdownForInput

    $prevClip = $null
    $hadClip = $false
    try {
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $prevClip = [System.Windows.Forms.Clipboard]::GetText()
            $hadClip = $true
        }
    } catch { }

    try {
        if ($step.EnterAfterLine) {
            $lines = $text -split '\r?\n'
            foreach ($line in $lines) {
                if ($script:cancel) { return }
                if ($line.Length -gt 0) {
                    [System.Windows.Forms.Clipboard]::SetText($line)
                    [System.Windows.Forms.SendKeys]::SendWait("^v")
                    Start-Sleep -Milliseconds 80
                }
                [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
                Start-Sleep -Milliseconds 120
                [System.Windows.Forms.Application]::DoEvents()
            }
        } else {
            [System.Windows.Forms.Clipboard]::SetText($text)
            [System.Windows.Forms.SendKeys]::SendWait("^v")
            Start-Sleep -Milliseconds 150
        }
    } finally {
        try {
            if ($hadClip) {
                [System.Windows.Forms.Clipboard]::SetText($prevClip)
            } else {
                [System.Windows.Forms.Clipboard]::Clear()
            }
        } catch { }
    }
}

function Test-PointOnForm([int]$x, [int]$y) {
    $screenPt = New-Object System.Drawing.Point($x, $y)
    $clientPt = $form.PointToClient($screenPt)
    return ($clientPt.X -ge 0 -and $clientPt.Y -ge 0 -and
            $clientPt.X -lt $form.ClientSize.Width -and $clientPt.Y -lt $form.ClientSize.Height)
}

function Refresh-List {
    $list.Items.Clear()
    for ($i = 0; $i -lt $script:steps.Count; $i++) {
        [void]$list.Items.Add("$($i + 1). $(Get-StepLabel $script:steps[$i])")
    }
}

function Add-Step([hashtable]$step) {
    [void]$script:steps.Add($step)
    Refresh-List
}

function Get-SelectedIndex { return $list.SelectedIndex }

function Stop-Capture {
    $wasSession = ($script:captureMode -eq "session")
    if ($wasSession -and $script:moveBuffer.Count -gt 0) {
        Flush-MoveBuffer
    }
    try { [KeyCapHook]::Stop() } catch { }
    $script:captureMode = $null
    $captureTimer.Stop()
    $lblCapture.Text = "Idle"
    $lblCapture.ForeColor = $ui.Muted
    $btnRecordKey.Text = "Key"
    $btnRecordClick.Text = "Click"
    $btnRecordSession.Text = "Record session"
    $btnRecordSession.BackColor = $ui.Accent
    if ($wasSession) {
        $lblStatus.Text = "Stopped. $($script:steps.Count) step(s)."
    }
}

function Add-RecordedWaitIfNeeded {
    if (-not $chkRecordWaits.Checked) { return }
    if ($null -eq $script:lastActionAt) { return }
    $elapsed = ((Get-Date) - $script:lastActionAt).TotalSeconds
    if ($elapsed -ge 0.8) {
        $secs = [math]::Max(1, [int][math]::Round($elapsed))
        Add-Step @{ Type = "wait"; Seconds = $secs }
    }
}

function Mark-ActionNow {
    $script:lastActionAt = Get-Date
}

function Clear-MoveBuffer {
    $script:moveBuffer = New-Object System.Collections.ArrayList
}

function Add-MoveSample([int]$x, [int]$y) {
    if (Test-PointOnForm $x $y) { return }
    $now = Get-Date
    if ($script:moveBuffer.Count -gt 0) {
        $last = $script:moveBuffer[$script:moveBuffer.Count - 1]
        $dx = [math]::Abs($x - [int]$last.X)
        $dy = [math]::Abs($y - [int]$last.Y)
        if ($dx -lt $script:moveSampleMinPx -and $dy -lt $script:moveSampleMinPx) { return }
    }
    [void]$script:moveBuffer.Add(@{ X = $x; Y = $y; At = $now })
    while ($script:moveBuffer.Count -gt $script:moveMaxBuffer) {
        $script:moveBuffer.RemoveAt(0)
    }
}

function Flush-MoveBuffer {
    param(
        [int]$FinalX = 0,
        [int]$FinalY = 0,
        [bool]$EnsureFinal = $false
    )

    $points = New-Object System.Collections.ArrayList
    foreach ($p in @($script:moveBuffer)) {
        [void]$points.Add($p)
    }

    if ($EnsureFinal) {
        $needFinal = $true
        if ($points.Count -gt 0) {
            $last = $points[$points.Count - 1]
            if ([math]::Abs([int]$last.X - $FinalX) -lt 3 -and [math]::Abs([int]$last.Y - $FinalY) -lt 3) {
                $needFinal = $false
                $last.X = $FinalX
                $last.Y = $FinalY
            }
        }
        if ($needFinal) {
            [void]$points.Add(@{ X = $FinalX; Y = $FinalY; At = Get-Date })
        }
    }

    # Seed from last known playback position so the path connects
    if ($points.Count -gt 0 -and $null -ne $script:lastRecordPos) {
        $first = $points[0]
        $dx0 = [math]::Abs([int]$first.X - [int]$script:lastRecordPos.X)
        $dy0 = [math]::Abs([int]$first.Y - [int]$script:lastRecordPos.Y)
        if ($dx0 -gt 4 -or $dy0 -gt 4) {
            $points.Insert(0, @{
                X = [int]$script:lastRecordPos.X
                Y = [int]$script:lastRecordPos.Y
                At = $first.At
            })
        }
    }

    if ($points.Count -lt 2) {
        Clear-MoveBuffer
        if ($points.Count -eq 1) {
            $only = $points[0]
            $script:lastRecordPos = @{ X = [int]$only.X; Y = [int]$only.Y }
        }
        return
    }

    # Downsample very long trails while keeping start/end
    $maxWaypoints = 40
    if ($points.Count -gt $maxWaypoints) {
        $reduced = New-Object System.Collections.ArrayList
        [void]$reduced.Add($points[0])
        $step = ($points.Count - 1) / ($maxWaypoints - 1)
        for ($i = 1; $i -lt ($maxWaypoints - 1); $i++) {
            $idx = [int][math]::Round($i * $step)
            if ($idx -le 0) { $idx = 1 }
            if ($idx -ge ($points.Count - 1)) { $idx = $points.Count - 2 }
            [void]$reduced.Add($points[$idx])
        }
        [void]$reduced.Add($points[$points.Count - 1])
        $points = $reduced
    }

    $defaultMs = [int]$numDur.Value
    if ($defaultMs -lt 50) { $defaultMs = 50 }

    for ($i = 1; $i -lt $points.Count; $i++) {
        $a = $points[$i - 1]
        $b = $points[$i]
        $dx = [math]::Abs([int]$b.X - [int]$a.X)
        $dy = [math]::Abs([int]$b.Y - [int]$a.Y)
        if ($dx -lt 2 -and $dy -lt 2) { continue }

        $ms = $defaultMs
        if ($null -ne $a.At -and $null -ne $b.At) {
            $ms = [int](($b.At - $a.At).TotalMilliseconds)
        }
        if ($ms -lt 30) { $ms = 30 }
        if ($ms -gt 1500) { $ms = 1500 }

        # Scale brief defaults by distance for smoother replay
        $dist = [math]::Sqrt(($dx * $dx) + ($dy * $dy))
        if ($ms -eq $defaultMs -and $dist -gt 80) {
            $ms = [math]::Min(1200, [math]::Max(80, [int]($dist * 1.2)))
        }

        Add-Step @{
            Type = "move"
            X = [int]$b.X
            Y = [int]$b.Y
            DurationMs = $ms
        }
        $script:lastRecordPos = @{ X = [int]$b.X; Y = [int]$b.Y }
    }

    Clear-MoveBuffer
}

function Add-RecordedKey([string]$send) {
    if (-not $send) { return }
    $p = [AutoInput]::GetPos()
    Add-MoveSample $p.X $p.Y
    Flush-MoveBuffer -FinalX $p.X -FinalY $p.Y -EnsureFinal $true
    Add-RecordedWaitIfNeeded
    if ($send -eq "^v") {
        Add-Step @{ Type = "paste" }
    } elseif ($send -eq "{ENTER}") {
        Add-Step @{ Type = "enter" }
    } else {
        Add-Step @{ Type = "keys"; Keys = $send }
    }
    # Keep tracking movement after key
    Clear-MoveBuffer
    [void]$script:moveBuffer.Add(@{ X = $p.X; Y = $p.Y; At = Get-Date })
    $script:lastRecordPos = @{ X = $p.X; Y = $p.Y }
    Mark-ActionNow
    $lblStatus.Text = "Recorded: $(Format-KeyLabel $send)"
}

function Add-RecordedClick([string]$btn, [int]$x, [int]$y) {
    # Path leading up to the click
    Add-MoveSample $x $y
    Flush-MoveBuffer -FinalX $x -FinalY $y -EnsureFinal $true
    Add-RecordedWaitIfNeeded

    # Exact land + click
    $needLand = $true
    if ($null -ne $script:lastRecordPos) {
        if ([math]::Abs([int]$script:lastRecordPos.X - $x) -lt 2 -and
            [math]::Abs([int]$script:lastRecordPos.Y - $y) -lt 2) {
            $needLand = $false
        }
    }
    if ($needLand) {
        Add-Step @{
            Type = "move"
            X = $x
            Y = $y
            DurationMs = [math]::Max(40, [int]([int]$numDur.Value / 2))
        }
    }

    Add-Step @{ Type = "click"; Button = $btn; X = $x; Y = $y }

    # Fresh trail for movement after the click
    Clear-MoveBuffer
    [void]$script:moveBuffer.Add(@{ X = $x; Y = $y; At = Get-Date })
    $script:lastRecordPos = @{ X = $x; Y = $y }
    $numX.Value = [math]::Max($numX.Minimum, [math]::Min($numX.Maximum, $x))
    $numY.Value = [math]::Max($numY.Minimum, [math]::Min($numY.Maximum, $y))
    Mark-ActionNow
    $lblStatus.Text = "Recorded $btn click at ($x, $y) with mouse path"
}

function Get-WatchVirtualKeys {
    $vks = New-Object System.Collections.Generic.List[int]
    foreach ($vk in @(0x08, 0x09, 0x0D, 0x1B, 0x20, 0x2D, 0x2E, 0x24, 0x23, 0x21, 0x22, 0x25, 0x26, 0x27, 0x28)) {
        [void]$vks.Add($vk)
    }
    for ($vk = 0x30; $vk -le 0x39; $vk++) { [void]$vks.Add($vk) }
    for ($vk = 0x41; $vk -le 0x5A; $vk++) { [void]$vks.Add($vk) }
    for ($vk = 0x70; $vk -le 0x7B; $vk++) {
        if ($vk -eq 0x78) { continue } # F9 = stop
        [void]$vks.Add($vk)
    }
    return $vks
}

$script:watchKeys = Get-WatchVirtualKeys

function Ensure-ConfigDir {
    if (-not (Test-Path -LiteralPath $script:configDir)) {
        New-Item -ItemType Directory -Path $script:configDir -Force | Out-Null
    }
}

function Get-SafeConfigName([string]$name) {
    $safe = ($name.Trim() -replace '[<>:"/\\|?*]', '_').Trim()
    if (-not $safe) { $safe = "unnamed" }
    return $safe
}

function Get-ConfigPath([string]$name) {
    return (Join-Path $script:configDir ((Get-SafeConfigName $name) + ".json"))
}

function ConvertTo-StepObjects($steps) {
    $out = @()
    foreach ($s in $steps) {
        $obj = [ordered]@{ type = $s.Type }
        switch ($s.Type) {
            "wait"  { $obj.seconds = [int]$s.Seconds }
            "move"  {
                $obj.x = [int]$s.X; $obj.y = [int]$s.Y
                $obj.durationMs = if ($null -ne $s.DurationMs) { [int]$s.DurationMs } else { 300 }
            }
            "click" {
                $obj.button = if ($s.Button) { $s.Button } else { "left" }
                if ($null -ne $s.X) { $obj.x = [int]$s.X }
                if ($null -ne $s.Y) { $obj.y = [int]$s.Y }
            }
            "keys"  { $obj.keys = [string]$s.Keys }
            "words" {
                $obj.text = [string]$s.Text
                $obj.enterAfterLine = [bool]$s.EnterAfterLine
            }
            "paste" { }
            "enter" { }
        }
        $out += [pscustomobject]$obj
    }
    return $out
}

function ConvertFrom-StepObjects($arr) {
    if ($null -eq $arr) { return (New-Object System.Collections.ArrayList) }
    if ($arr -isnot [System.Array]) { $arr = @($arr) }
    $listOut = New-Object System.Collections.ArrayList
    foreach ($s in $arr) {
        $t = [string]$s.type
        $h = @{ Type = $t }
        switch ($t) {
            "wait"  { $h.Seconds = [int]$s.seconds }
            "move"  {
                $h.X = [int]$s.x; $h.Y = [int]$s.y
                $h.DurationMs = if ($null -ne $s.durationMs) { [int]$s.durationMs } else { 300 }
            }
            "click" {
                $h.Button = if ($s.button) { [string]$s.button } else { "left" }
                if ($null -ne $s.x) { $h.X = [int]$s.x }
                if ($null -ne $s.y) { $h.Y = [int]$s.y }
            }
            "keys"  { $h.Keys = [string]$s.keys }
            "words" {
                $h.Text = if ($null -ne $s.text) { [string]$s.text } else { "" }
                $h.EnterAfterLine = [bool]$s.enterAfterLine
            }
        }
        [void]$listOut.Add($h)
    }
    return $listOut
}

function Write-ConfigFile([string]$name, $payload) {
    Ensure-ConfigDir
    $name = Get-SafeConfigName $name
    if ($payload -is [hashtable] -or $payload -is [System.Collections.Specialized.OrderedDictionary]) {
        $payload["name"] = $name
    } else {
        $payload | Add-Member -NotePropertyName name -NotePropertyValue $name -Force
    }
    $path = Get-ConfigPath $name
    ($payload | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Save-Config([string]$name) {
    $payload = [ordered]@{
        name = (Get-SafeConfigName $name)
        initialHours = [int]$numHours.Value
        initialMinutes = [int]$numMins.Value
        initialSeconds = [int]$numSecs.Value
        betweenSeconds = [int]$numBetweenSecs.Value
        betweenMilliseconds = [int]$numBetweenMs.Value
        moveDurationMs = [int]$numDur.Value
        steps = @(ConvertTo-StepObjects $script:steps)
    }
    return (Write-ConfigFile $name $payload)
}

function Load-Config([string]$name) {
    $path = Get-ConfigPath $name
    if (-not (Test-Path -LiteralPath $path)) { throw "Config not found: $name" }
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $data = $raw | ConvertFrom-Json
    $script:steps.Clear()
    $loaded = ConvertFrom-StepObjects $data.steps
    foreach ($s in $loaded) { [void]$script:steps.Add($s) }
    Refresh-List
    if ($null -ne $data.initialHours) { $numHours.Value = [decimal][math]::Min(99, [int]$data.initialHours) }
    if ($null -ne $data.initialMinutes) { $numMins.Value = [decimal][math]::Min(59, [int]$data.initialMinutes) }
    if ($null -ne $data.initialSeconds) { $numSecs.Value = [decimal][math]::Min(59, [int]$data.initialSeconds) }
    if ($null -ne $data.betweenSeconds) { $numBetweenSecs.Value = [decimal][math]::Min(3600, [int]$data.betweenSeconds) }
    if ($null -ne $data.betweenMilliseconds) { $numBetweenMs.Value = [decimal][math]::Min(999, [int]$data.betweenMilliseconds) }
    if ($null -ne $data.moveDurationMs) { $numDur.Value = [decimal][math]::Min(10000, [int]$data.moveDurationMs) }
    $cboConfigs.Text = $name
}

function Refresh-ConfigList {
    Ensure-ConfigDir
    $cboConfigs.Items.Clear()
    Get-ChildItem -LiteralPath $script:configDir -Filter "*.json" -ErrorAction SilentlyContinue |
        Sort-Object Name |
        ForEach-Object { [void]$cboConfigs.Items.Add([IO.Path]::GetFileNameWithoutExtension($_.Name)) }
}

function Seed-BuiltinConfigs {
    Ensure-ConfigDir
    $pressPath = Get-ConfigPath "press-enter-later"
    if (-not (Test-Path -LiteralPath $pressPath)) {
        Write-ConfigFile "press-enter-later" ([ordered]@{
            initialHours = 6; initialMinutes = 0; initialSeconds = 0
            betweenSeconds = 0; betweenMilliseconds = 500; moveDurationMs = 300
            steps = @(
                [pscustomobject]@{ type = "enter" }
            )
        }) | Out-Null
    }
    $pastePath = Get-ConfigPath "paste-enter-later"
    if (-not (Test-Path -LiteralPath $pastePath)) {
        Write-ConfigFile "paste-enter-later" ([ordered]@{
            initialHours = 6; initialMinutes = 0; initialSeconds = 0
            betweenSeconds = 0; betweenMilliseconds = 500; moveDurationMs = 300
            steps = @(
                [pscustomobject]@{ type = "keys"; keys = "^n" }
                [pscustomobject]@{ type = "click"; button = "left" }
                [pscustomobject]@{ type = "paste" }
                [pscustomobject]@{ type = "enter" }
            )
        }) | Out-Null
    }
}

# --- Form (minimal dark, logical sections, collapsible) ---
$ui = @{
    Bg     = [System.Drawing.Color]::FromArgb(16, 16, 18)
    Panel  = [System.Drawing.Color]::FromArgb(22, 22, 24)
    Header = [System.Drawing.Color]::FromArgb(26, 26, 28)
    Text   = [System.Drawing.Color]::FromArgb(210, 210, 214)
    Muted  = [System.Drawing.Color]::FromArgb(120, 120, 128)
    Accent = [System.Drawing.Color]::FromArgb(150, 45, 52)
    Border = [System.Drawing.Color]::FromArgb(40, 40, 44)
    Input  = [System.Drawing.Color]::FromArgb(18, 18, 20)
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Automation"
$form.ClientSize = New-Object System.Drawing.Size(480, 700)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "None"
$form.MaximizeBox = $false
$form.KeyPreview = $true
$form.BackColor = $ui.Bg
$form.ForeColor = $ui.Text
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.Padding = New-Object System.Windows.Forms.Padding(1)

# Drag support for borderless window
if (-not ("BorderlessDrag" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class BorderlessDrag {
    [DllImport("user32.dll")] public static extern bool ReleaseCapture();
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
    public const int WM_NCLBUTTONDOWN = 0xA1;
    public const int HTCAPTION = 0x2;
    public static void Drag(IntPtr handle) {
        ReleaseCapture();
        SendMessage(handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
    }
}
"@
}

function Style-Button($btn) {
    $btn.FlatStyle = "Flat"
    $btn.FlatAppearance.BorderColor = $ui.Border
    $btn.FlatAppearance.BorderSize = 1
    $btn.BackColor = $ui.Header
    $btn.ForeColor = $ui.Text
    $btn.Cursor = [System.Windows.Forms.Cursors]::Hand
    $btn.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
}

function Style-Input($ctrl) {
    $ctrl.BackColor = $ui.Input
    $ctrl.ForeColor = $ui.Text
    if ($ctrl -is [System.Windows.Forms.TextBox] -or $ctrl -is [System.Windows.Forms.ComboBox] -or $ctrl -is [System.Windows.Forms.ListBox] -or $ctrl -is [System.Windows.Forms.NumericUpDown]) {
        try { $ctrl.BorderStyle = "FixedSingle" } catch { }
    }
}

function Style-MutedLabel($lbl) {
    $lbl.ForeColor = $ui.Muted
    $lbl.Font = New-Object System.Drawing.Font("Segoe UI", 8)
}

function Style-ChromeButton($btn) {
    $btn.FlatStyle = "Flat"
    $btn.FlatAppearance.BorderSize = 0
    $btn.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(180, 55, 62)
    $btn.FlatAppearance.MouseDownBackColor = [System.Drawing.Color]::FromArgb(120, 30, 36)
    $btn.BackColor = $ui.Accent
    $btn.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 248)
    $btn.Cursor = [System.Windows.Forms.Cursors]::Hand
    $btn.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
    $btn.TextAlign = "MiddleCenter"
}

# Custom title bar (replaces default Windows chrome)
$titleBar = New-Object System.Windows.Forms.Panel
$titleBar.Dock = "Top"
$titleBar.Height = 40
$titleBar.BackColor = [System.Drawing.Color]::FromArgb(20, 20, 22)
$form.Controls.Add($titleBar)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Automation"
$lblTitle.Location = New-Object System.Drawing.Point(14, 10)
$lblTitle.Size = New-Object System.Drawing.Size(280, 22)
$lblTitle.ForeColor = $ui.Text
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$lblTitle.BackColor = [System.Drawing.Color]::Transparent
$titleBar.Controls.Add($lblTitle)

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Text = "X"
$btnClose.Size = New-Object System.Drawing.Size(40, 28)
$btnClose.Location = New-Object System.Drawing.Point(430, 6)
Style-ChromeButton $btnClose
$btnClose.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(190, 40, 48)
$titleBar.Controls.Add($btnClose)

$btnMin = New-Object System.Windows.Forms.Button
$btnMin.Text = "_"
$btnMin.Size = New-Object System.Drawing.Size(40, 28)
$btnMin.Location = New-Object System.Drawing.Point(386, 6)
Style-ChromeButton $btnMin
$titleBar.Controls.Add($btnMin)

$dragHandler = {
    [BorderlessDrag]::Drag($form.Handle)
}
$titleBar.Add_MouseDown($dragHandler)
$lblTitle.Add_MouseDown($dragHandler)

$btnMin.Add_Click({ $form.WindowState = "Minimized" })
$btnClose.Add_Click({ $form.Close() })

$titleBar.Add_Resize({
    $btnClose.Left = $titleBar.ClientSize.Width - 48
    $btnMin.Left = $titleBar.ClientSize.Width - 92
})

# Thin red accent line under title
$accentLine = New-Object System.Windows.Forms.Panel
$accentLine.Dock = "Top"
$accentLine.Height = 1
$accentLine.BackColor = $ui.Accent
$form.Controls.Add($accentLine)

# Outer border paint for borderless form
$form.Add_Paint({
    param($sender, $e)
    $pen = New-Object System.Drawing.Pen $ui.Border, 1
    $e.Graphics.DrawRectangle($pen, 0, 0, $form.ClientSize.Width - 1, $form.ClientSize.Height - 1)
    $pen.Dispose()
})

$script:sectionList = New-Object System.Collections.ArrayList

function Update-SectionHeaders {
    foreach ($s in $script:sectionList) {
        $mark = if ($s.Expanded) { "-" } else { "+" }
        $s.Header.Text = "  $mark   $($s.Title)"
    }
}

function Layout-Sections {
    $y = 8
    $w = $scrollInner.ClientSize.Width
    if ($w -lt 100) { $w = 440 }
    foreach ($s in $script:sectionList) {
        $s.Wrap.Location = New-Object System.Drawing.Point(8, $y)
        $s.Wrap.Width = $w - 16
        $s.Header.Width = $s.Wrap.Width
        $s.Body.Width = $s.Wrap.Width
        if ($s.Expanded) {
            $s.Body.Visible = $true
            $s.Body.Height = $s.BodyHeight
            $s.Wrap.Height = 32 + $s.BodyHeight
        } else {
            $s.Body.Visible = $false
            $s.Body.Height = 0
            $s.Wrap.Height = 32
        }
        $y += $s.Wrap.Height + 6
    }
    $scrollInner.Height = [math]::Max($y + 8, $scrollHost.ClientSize.Height)
    Update-SectionHeaders
}

function New-CollapsibleSection([string]$title, [bool]$expanded, [int]$bodyHeight) {
    $wrap = New-Object System.Windows.Forms.Panel
    $wrap.BackColor = $ui.Panel
    $wrap.Size = New-Object System.Drawing.Size(440, 32)

    $header = New-Object System.Windows.Forms.Button
    $header.FlatStyle = "Flat"
    $header.FlatAppearance.BorderSize = 0
    $header.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(32, 32, 36)
    $header.BackColor = $ui.Header
    $header.ForeColor = $ui.Text
    $header.TextAlign = "MiddleLeft"
    $header.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9)
    $header.Height = 32
    $header.Location = New-Object System.Drawing.Point(0, 0)
    $header.Cursor = [System.Windows.Forms.Cursors]::Hand
    $wrap.Controls.Add($header)

    $body = New-Object System.Windows.Forms.Panel
    $body.Location = New-Object System.Drawing.Point(0, 32)
    $body.BackColor = $ui.Panel
    $body.Height = $bodyHeight
    $wrap.Controls.Add($body)

    $entry = [pscustomobject]@{
        Title      = $title
        Expanded   = $expanded
        BodyHeight = $bodyHeight
        Wrap       = $wrap
        Header     = $header
        Body       = $body
    }
    $header.Add_Click({
        $entry.Expanded = -not $entry.Expanded
        Layout-Sections
    }.GetNewClosure())

    [void]$script:sectionList.Add($entry)
    $scrollInner.Controls.Add($wrap)
    return $entry
}

# Bottom run bar (always visible)
$bottomBar = New-Object System.Windows.Forms.Panel
$bottomBar.Dock = "Bottom"
$bottomBar.Height = 72
$bottomBar.BackColor = $ui.Header
$form.Controls.Add($bottomBar)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "Ready"
$lblStatus.Location = New-Object System.Drawing.Point(12, 10)
$lblStatus.Size = New-Object System.Drawing.Size(280, 52)
$lblStatus.ForeColor = $ui.Muted
$form.Controls.Add($lblStatus) | Out-Null
$bottomBar.Controls.Add($lblStatus)

$btnRun = New-Object System.Windows.Forms.Button
$btnRun.Text = "Run"
$btnRun.Location = New-Object System.Drawing.Point(290, 16)
$btnRun.Size = New-Object System.Drawing.Size(80, 40)
Style-Button $btnRun
$btnRun.BackColor = $ui.Accent
$btnRun.FlatAppearance.BorderColor = $ui.Accent
$btnRun.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$bottomBar.Controls.Add($btnRun)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = "Stop"
$btnStop.Location = New-Object System.Drawing.Point(378, 16)
$btnStop.Size = New-Object System.Drawing.Size(80, 40)
Style-Button $btnStop
$btnStop.Enabled = $false
$bottomBar.Controls.Add($btnStop)

# Scroll host for sections
$scrollHost = New-Object System.Windows.Forms.Panel
$scrollHost.Dock = "Fill"
$scrollHost.BackColor = $ui.Bg
$scrollHost.AutoScroll = $true
$form.Controls.Add($scrollHost)

$scrollInner = New-Object System.Windows.Forms.Panel
$scrollInner.Location = New-Object System.Drawing.Point(0, 0)
$scrollInner.Width = 455
$scrollInner.BackColor = $ui.Bg
$scrollHost.Controls.Add($scrollInner)

# Keep chrome on top of docked layout
$titleBar.BringToFront()
$accentLine.BringToFront()
$bottomBar.BringToFront()
$scrollHost.SendToBack()

# ===== 1. Config =====
$secConfig = New-CollapsibleSection "1  Config" $true 78
$b1 = $secConfig.Body

$cboConfigs = New-Object System.Windows.Forms.ComboBox
$cboConfigs.Location = New-Object System.Drawing.Point(12, 12)
$cboConfigs.Size = New-Object System.Drawing.Size(200, 24)
$cboConfigs.DropDownStyle = "DropDown"
$cboConfigs.FlatStyle = "Flat"
Style-Input $cboConfigs
$b1.Controls.Add($cboConfigs)

$btnLoadCfg = New-Object System.Windows.Forms.Button
$btnLoadCfg.Text = "Load"
$btnLoadCfg.Location = New-Object System.Drawing.Point(220, 10)
$btnLoadCfg.Size = New-Object System.Drawing.Size(56, 28)
Style-Button $btnLoadCfg
$b1.Controls.Add($btnLoadCfg)

$btnSaveCfg = New-Object System.Windows.Forms.Button
$btnSaveCfg.Text = "Save"
$btnSaveCfg.Location = New-Object System.Drawing.Point(280, 10)
$btnSaveCfg.Size = New-Object System.Drawing.Size(56, 28)
Style-Button $btnSaveCfg
$b1.Controls.Add($btnSaveCfg)

$btnDeleteCfg = New-Object System.Windows.Forms.Button
$btnDeleteCfg.Text = "Delete"
$btnDeleteCfg.Location = New-Object System.Drawing.Point(340, 10)
$btnDeleteCfg.Size = New-Object System.Drawing.Size(56, 28)
Style-Button $btnDeleteCfg
$b1.Controls.Add($btnDeleteCfg)

$btnRefreshCfg = New-Object System.Windows.Forms.Button
$btnRefreshCfg.Text = "Refresh"
$btnRefreshCfg.Location = New-Object System.Drawing.Point(12, 44)
$btnRefreshCfg.Size = New-Object System.Drawing.Size(70, 26)
Style-Button $btnRefreshCfg
$b1.Controls.Add($btnRefreshCfg)

$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Text = "Configs in automation-configs\"
$lblHint.Location = New-Object System.Drawing.Point(90, 48)
$lblHint.Size = New-Object System.Drawing.Size(300, 18)
Style-MutedLabel $lblHint
$b1.Controls.Add($lblHint)

# ===== 2. Record =====
$secRecord = New-CollapsibleSection "2  Record" $true 154
$b2 = $secRecord.Body

$lblCapture = New-Object System.Windows.Forms.Label
$lblCapture.Text = "Idle"
$lblCapture.Location = New-Object System.Drawing.Point(12, 8)
$lblCapture.Size = New-Object System.Drawing.Size(410, 18)
Style-MutedLabel $lblCapture
$b2.Controls.Add($lblCapture)

$btnRecordSession = New-Object System.Windows.Forms.Button
$btnRecordSession.Text = "Record session"
$btnRecordSession.Location = New-Object System.Drawing.Point(12, 32)
$btnRecordSession.Size = New-Object System.Drawing.Size(120, 30)
Style-Button $btnRecordSession
$btnRecordSession.BackColor = $ui.Accent
$btnRecordSession.FlatAppearance.BorderColor = $ui.Accent
$b2.Controls.Add($btnRecordSession)

$btnRecordKey = New-Object System.Windows.Forms.Button
$btnRecordKey.Text = "Key"
$btnRecordKey.Location = New-Object System.Drawing.Point(140, 32)
$btnRecordKey.Size = New-Object System.Drawing.Size(56, 30)
Style-Button $btnRecordKey
$b2.Controls.Add($btnRecordKey)

$btnRecordClick = New-Object System.Windows.Forms.Button
$btnRecordClick.Text = "Click"
$btnRecordClick.Location = New-Object System.Drawing.Point(200, 32)
$btnRecordClick.Size = New-Object System.Drawing.Size(56, 30)
Style-Button $btnRecordClick
$b2.Controls.Add($btnRecordClick)

$btnCancelCap = New-Object System.Windows.Forms.Button
$btnCancelCap.Text = "Cancel"
$btnCancelCap.Location = New-Object System.Drawing.Point(264, 32)
$btnCancelCap.Size = New-Object System.Drawing.Size(64, 30)
Style-Button $btnCancelCap
$b2.Controls.Add($btnCancelCap)

$btnPaste = New-Object System.Windows.Forms.Button
$btnPaste.Text = "Paste"
$btnPaste.Location = New-Object System.Drawing.Point(12, 70)
$btnPaste.Size = New-Object System.Drawing.Size(56, 26)
Style-Button $btnPaste
$b2.Controls.Add($btnPaste)

$btnEnter = New-Object System.Windows.Forms.Button
$btnEnter.Text = "Enter"
$btnEnter.Location = New-Object System.Drawing.Point(72, 70)
$btnEnter.Size = New-Object System.Drawing.Size(56, 26)
Style-Button $btnEnter
$b2.Controls.Add($btnEnter)

$btnWait = New-Object System.Windows.Forms.Button
$btnWait.Text = "Wait"
$btnWait.Location = New-Object System.Drawing.Point(132, 70)
$btnWait.Size = New-Object System.Drawing.Size(56, 26)
Style-Button $btnWait
$b2.Controls.Add($btnWait)

$btnWords = New-Object System.Windows.Forms.Button
$btnWords.Text = "Words"
$btnWords.Location = New-Object System.Drawing.Point(192, 70)
$btnWords.Size = New-Object System.Drawing.Size(64, 26)
Style-Button $btnWords
$b2.Controls.Add($btnWords)

$chkClearOnRecord = New-Object System.Windows.Forms.CheckBox
$chkClearOnRecord.Text = "Clear on start"
$chkClearOnRecord.Location = New-Object System.Drawing.Point(12, 104)
$chkClearOnRecord.Size = New-Object System.Drawing.Size(110, 22)
$chkClearOnRecord.Checked = $true
$chkClearOnRecord.ForeColor = $ui.Muted
$b2.Controls.Add($chkClearOnRecord)

$chkRecordWaits = New-Object System.Windows.Forms.CheckBox
$chkRecordWaits.Text = "Record waits"
$chkRecordWaits.Location = New-Object System.Drawing.Point(130, 104)
$chkRecordWaits.Size = New-Object System.Drawing.Size(110, 22)
$chkRecordWaits.Checked = $true
$chkRecordWaits.ForeColor = $ui.Muted
$b2.Controls.Add($chkRecordWaits)

$lblRecTip = New-Object System.Windows.Forms.Label
$lblRecTip.Text = "Session: act in another app, F9 to stop. Words: type/paste text later."
$lblRecTip.Location = New-Object System.Drawing.Point(12, 130)
$lblRecTip.Size = New-Object System.Drawing.Size(410, 18)
Style-MutedLabel $lblRecTip
$b2.Controls.Add($lblRecTip)

# ===== 3. Steps =====
$secSteps = New-CollapsibleSection "3  Steps" $true 168
$b3 = $secSteps.Body

$list = New-Object System.Windows.Forms.ListBox
$list.Location = New-Object System.Drawing.Point(12, 8)
$list.Size = New-Object System.Drawing.Size(330, 148)
Style-Input $list
$list.BorderStyle = "None"
$b3.Controls.Add($list)

$btnUp = New-Object System.Windows.Forms.Button
$btnUp.Text = "Up"
$btnUp.Location = New-Object System.Drawing.Point(350, 8)
$btnUp.Size = New-Object System.Drawing.Size(72, 28)
Style-Button $btnUp
$b3.Controls.Add($btnUp)

$btnDown = New-Object System.Windows.Forms.Button
$btnDown.Text = "Down"
$btnDown.Location = New-Object System.Drawing.Point(350, 42)
$btnDown.Size = New-Object System.Drawing.Size(72, 28)
Style-Button $btnDown
$b3.Controls.Add($btnDown)

$btnRemove = New-Object System.Windows.Forms.Button
$btnRemove.Text = "Remove"
$btnRemove.Location = New-Object System.Drawing.Point(350, 76)
$btnRemove.Size = New-Object System.Drawing.Size(72, 28)
Style-Button $btnRemove
$b3.Controls.Add($btnRemove)

$btnClear = New-Object System.Windows.Forms.Button
$btnClear.Text = "Clear"
$btnClear.Location = New-Object System.Drawing.Point(350, 110)
$btnClear.Size = New-Object System.Drawing.Size(72, 28)
Style-Button $btnClear
$b3.Controls.Add($btnClear)

# ===== 4. Cursor (collapsed) =====
$secCursor = New-CollapsibleSection "4  Cursor" $false 100
$b4 = $secCursor.Body

$lblX = New-Object System.Windows.Forms.Label
$lblX.Text = "X"
$lblX.Location = New-Object System.Drawing.Point(12, 14)
$lblX.AutoSize = $true
$lblX.ForeColor = $ui.Muted
$b4.Controls.Add($lblX)

$numX = New-Object System.Windows.Forms.NumericUpDown
$numX.Location = New-Object System.Drawing.Point(30, 10)
$numX.Size = New-Object System.Drawing.Size(70, 24)
$numX.Maximum = 10000
$numX.Minimum = -10000
Style-Input $numX
$b4.Controls.Add($numX)

$lblY = New-Object System.Windows.Forms.Label
$lblY.Text = "Y"
$lblY.Location = New-Object System.Drawing.Point(108, 14)
$lblY.AutoSize = $true
$lblY.ForeColor = $ui.Muted
$b4.Controls.Add($lblY)

$numY = New-Object System.Windows.Forms.NumericUpDown
$numY.Location = New-Object System.Drawing.Point(126, 10)
$numY.Size = New-Object System.Drawing.Size(70, 24)
$numY.Maximum = 10000
$numY.Minimum = -10000
Style-Input $numY
$b4.Controls.Add($numY)

$lblDur = New-Object System.Windows.Forms.Label
$lblDur.Text = "ms"
$lblDur.Location = New-Object System.Drawing.Point(206, 14)
$lblDur.AutoSize = $true
$lblDur.ForeColor = $ui.Muted
$b4.Controls.Add($lblDur)

$numDur = New-Object System.Windows.Forms.NumericUpDown
$numDur.Location = New-Object System.Drawing.Point(230, 10)
$numDur.Size = New-Object System.Drawing.Size(60, 24)
$numDur.Maximum = 10000
$numDur.Value = 300
Style-Input $numDur
$b4.Controls.Add($numDur)

$btnGrabPos = New-Object System.Windows.Forms.Button
$btnGrabPos.Text = "Grab"
$btnGrabPos.Location = New-Object System.Drawing.Point(300, 8)
$btnGrabPos.Size = New-Object System.Drawing.Size(56, 28)
Style-Button $btnGrabPos
$b4.Controls.Add($btnGrabPos)

$btnPreview = New-Object System.Windows.Forms.Button
$btnPreview.Text = "Preview"
$btnPreview.Location = New-Object System.Drawing.Point(360, 8)
$btnPreview.Size = New-Object System.Drawing.Size(64, 28)
Style-Button $btnPreview
$b4.Controls.Add($btnPreview)

$lblLivePos = New-Object System.Windows.Forms.Label
$lblLivePos.Text = "Cursor (0, 0)"
$lblLivePos.Location = New-Object System.Drawing.Point(12, 44)
$lblLivePos.Size = New-Object System.Drawing.Size(180, 18)
Style-MutedLabel $lblLivePos
$b4.Controls.Add($lblLivePos)

$btnAddMove = New-Object System.Windows.Forms.Button
$btnAddMove.Text = "Add move"
$btnAddMove.Location = New-Object System.Drawing.Point(200, 40)
$btnAddMove.Size = New-Object System.Drawing.Size(88, 28)
Style-Button $btnAddMove
$b4.Controls.Add($btnAddMove)

$btnAddMoveClick = New-Object System.Windows.Forms.Button
$btnAddMoveClick.Text = "Move + click"
$btnAddMoveClick.Location = New-Object System.Drawing.Point(294, 40)
$btnAddMoveClick.Size = New-Object System.Drawing.Size(100, 28)
Style-Button $btnAddMoveClick
$b4.Controls.Add($btnAddMoveClick)

# Keep compatibility for unused preview-return references if any
$btnPreviewReturn = New-Object System.Windows.Forms.Button
$btnPreviewReturn.Visible = $false
$b4.Controls.Add($btnPreviewReturn)

# ===== 5. Timing (collapsed) =====
$secTiming = New-CollapsibleSection "5  Timing" $false 88
$b5 = $secTiming.Body

$lblInit = New-Object System.Windows.Forms.Label
$lblInit.Text = "Initial delay"
$lblInit.Location = New-Object System.Drawing.Point(12, 12)
$lblInit.AutoSize = $true
$lblInit.ForeColor = $ui.Muted
$b5.Controls.Add($lblInit)

$numHours = New-Object System.Windows.Forms.NumericUpDown
$numHours.Location = New-Object System.Drawing.Point(100, 10)
$numHours.Size = New-Object System.Drawing.Size(48, 24)
$numHours.Maximum = 99
$numHours.Value = 6
Style-Input $numHours
$b5.Controls.Add($numHours)

$lblH = New-Object System.Windows.Forms.Label
$lblH.Text = "h"
$lblH.Location = New-Object System.Drawing.Point(152, 14)
$lblH.AutoSize = $true
$lblH.ForeColor = $ui.Muted
$b5.Controls.Add($lblH)

$numMins = New-Object System.Windows.Forms.NumericUpDown
$numMins.Location = New-Object System.Drawing.Point(172, 10)
$numMins.Size = New-Object System.Drawing.Size(48, 24)
$numMins.Maximum = 59
Style-Input $numMins
$b5.Controls.Add($numMins)

$lblM = New-Object System.Windows.Forms.Label
$lblM.Text = "m"
$lblM.Location = New-Object System.Drawing.Point(224, 14)
$lblM.AutoSize = $true
$lblM.ForeColor = $ui.Muted
$b5.Controls.Add($lblM)

$numSecs = New-Object System.Windows.Forms.NumericUpDown
$numSecs.Location = New-Object System.Drawing.Point(244, 10)
$numSecs.Size = New-Object System.Drawing.Size(48, 24)
$numSecs.Maximum = 59
Style-Input $numSecs
$b5.Controls.Add($numSecs)

$lblS = New-Object System.Windows.Forms.Label
$lblS.Text = "s"
$lblS.Location = New-Object System.Drawing.Point(296, 14)
$lblS.AutoSize = $true
$lblS.ForeColor = $ui.Muted
$b5.Controls.Add($lblS)

$lblBetween = New-Object System.Windows.Forms.Label
$lblBetween.Text = "Between actions"
$lblBetween.Location = New-Object System.Drawing.Point(12, 48)
$lblBetween.AutoSize = $true
$lblBetween.ForeColor = $ui.Muted
$b5.Controls.Add($lblBetween)

$numBetweenSecs = New-Object System.Windows.Forms.NumericUpDown
$numBetweenSecs.Location = New-Object System.Drawing.Point(120, 46)
$numBetweenSecs.Size = New-Object System.Drawing.Size(48, 24)
$numBetweenSecs.Maximum = 3600
Style-Input $numBetweenSecs
$b5.Controls.Add($numBetweenSecs)

$lblBetweenS = New-Object System.Windows.Forms.Label
$lblBetweenS.Text = "s"
$lblBetweenS.Location = New-Object System.Drawing.Point(172, 50)
$lblBetweenS.AutoSize = $true
$lblBetweenS.ForeColor = $ui.Muted
$b5.Controls.Add($lblBetweenS)

$numBetweenMs = New-Object System.Windows.Forms.NumericUpDown
$numBetweenMs.Location = New-Object System.Drawing.Point(192, 46)
$numBetweenMs.Size = New-Object System.Drawing.Size(60, 24)
$numBetweenMs.Maximum = 999
$numBetweenMs.Increment = 50
$numBetweenMs.Value = 500
Style-Input $numBetweenMs
$b5.Controls.Add($numBetweenMs)

$lblBetweenMs = New-Object System.Windows.Forms.Label
$lblBetweenMs.Text = "ms"
$lblBetweenMs.Location = New-Object System.Drawing.Point(256, 50)
$lblBetweenMs.AutoSize = $true
$lblBetweenMs.ForeColor = $ui.Muted
$b5.Controls.Add($lblBetweenMs)

Layout-Sections
$form.Add_Shown({ Layout-Sections })

# Timers
$posTimer = New-Object System.Windows.Forms.Timer
$posTimer.Interval = 100
$posTimer.Add_Tick({
    $p = [AutoInput]::GetPos()
    $lblLivePos.Text = "Cursor ($($p.X), $($p.Y))"
})
$posTimer.Start()

$captureTimer = New-Object System.Windows.Forms.Timer
$captureTimer.Interval = 25
$script:prevL = $false
$script:prevR = $false
$script:prevM = $false
$script:prevF9 = $false

$captureTimer.Add_Tick({
    if ($script:captureMode -ne "click" -and $script:captureMode -ne "session" -and $script:captureMode -ne "keys") { return }

    # Drain global keyboard hook for session + single-key capture
    if ($script:captureMode -eq "session" -or $script:captureMode -eq "keys") {
        if ($script:captureMode -eq "session") {
            $cur = [AutoInput]::GetPos()
            Add-MoveSample $cur.X $cur.Y
        }

        while ($true) {
            $packet = [KeyCapHook]::TakeOne()
            if (-not $packet) { break }

            $parts = $packet.Split('|')
            if ($parts.Count -lt 4) { continue }
            $vkOut = [int]$parts[0]
            $ctrlOut = ($parts[1] -eq '1')
            $altOut = ($parts[2] -eq '1')
            $shiftOut = ($parts[3] -eq '1')

            if ($vkOut -eq 0x78) { # F9
                if ($script:captureMode -eq "session") {
                    Stop-Capture
                    return
                }
                continue
            }

            # Session: only record keys when another window is focused
            if ($script:captureMode -eq "session") {
                $fg = [KeyCapHook]::GetForegroundWindow()
                if ($fg -eq $form.Handle) {
                    $lblCapture.Text = "Heard key (focus another app to record) - F9 stop"
                    $lblCapture.ForeColor = $ui.Muted
                    continue
                }
            }

            $keyEnum = [System.Windows.Forms.Keys]$vkOut
            $send = ConvertTo-SendKeys $keyEnum $ctrlOut $altOut $shiftOut
            if (-not $send) {
                $lblCapture.Text = "Heard VK $vkOut (unsupported)"
                continue
            }

            $heard = Format-KeyLabel $send
            $lblCapture.Text = "Detected: $heard"
            $lblCapture.ForeColor = $ui.Accent
            $lblStatus.Text = "Detected: $heard"

            if ($script:captureMode -eq "keys") {
                Add-Step @{ Type = "keys"; Keys = $send }
                Stop-Capture
                $lblStatus.Text = "Captured: $heard"
                $lblCapture.Text = "Captured: $heard"
                return
            }

            Add-RecordedKey $send
            $lblCapture.Text = "Recording ($($script:steps.Count)) last: $heard - F9 stop"
        }
    }

    if ($script:captureMode -ne "click" -and $script:captureMode -ne "session") { return }

    $l = ([AutoInput]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
    $r = ([AutoInput]::GetAsyncKeyState(0x02) -band 0x8000) -ne 0
    $m = ([AutoInput]::GetAsyncKeyState(0x04) -band 0x8000) -ne 0

    $btn = $null
    if ($l -and -not $script:prevL) { $btn = "left" }
    elseif ($r -and -not $script:prevR) { $btn = "right" }
    elseif ($m -and -not $script:prevM) { $btn = "middle" }

    $script:prevL = $l
    $script:prevR = $r
    $script:prevM = $m

    if ($btn) {
        $p = [AutoInput]::GetPos()
        if (Test-PointOnForm $p.X $p.Y) {
            if ($script:captureMode -eq "click") {
                $lblCapture.Text = "Click outside this window..."
            }
        } else {
            if ($script:captureMode -eq "session") {
                Add-RecordedClick $btn $p.X $p.Y
                $lblCapture.Text = "Recording ($($script:steps.Count) steps) - F9 stop"
            } else {
                Add-Step @{ Type = "click"; Button = $btn; X = $p.X; Y = $p.Y }
                $numX.Value = [math]::Max($numX.Minimum, [math]::Min($numX.Maximum, $p.X))
                $numY.Value = [math]::Max($numY.Minimum, [math]::Min($numY.Maximum, $p.Y))
                Stop-Capture
                $lblStatus.Text = "Captured $btn click at ($($p.X), $($p.Y))"
            }
        }
    }
})

$form.Add_KeyDown({
    param($sender, $e)
    if ($script:captureMode -ne "keys") { return }

    if ($e.KeyCode -eq [System.Windows.Forms.Keys]::ControlKey -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::LControlKey -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::RControlKey -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::ShiftKey -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::LShiftKey -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::RShiftKey -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::Menu -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::LMenu -or
        $e.KeyCode -eq [System.Windows.Forms.Keys]::RMenu) {
        $lblCapture.Text = "Modifier held..."
        return
    }

    $send = ConvertTo-SendKeys $e.KeyCode $e.Control $e.Alt $e.Shift
    if (-not $send) {
        $lblCapture.Text = "Unsupported key: $($e.KeyCode)"
        return
    }

    $e.SuppressKeyPress = $true
    $e.Handled = $true
    $heard = Format-KeyLabel $send
    Add-Step @{ Type = "keys"; Keys = $send }
    Stop-Capture
    $lblStatus.Text = "Captured: $heard"
    $lblCapture.Text = "Captured: $heard"
})

$btnRecordKey.Add_Click({
    if ($script:captureMode -eq "keys") { Stop-Capture; return }
    if ($script:captureMode -eq "session") { Stop-Capture }
    $script:captureMode = "keys"
    try {
        [KeyCapHook]::Start()
        if (-not [KeyCapHook]::IsActive) {
            $lblCapture.Text = "Hook failed (err $([KeyCapHook]::LastError)) - try form KeyDown"
            $lblStatus.Text = "Keyboard hook failed"
        }
    } catch {
        $lblStatus.Text = "Hook error: $($_.Exception.Message)"
    }
    $lblCapture.Text = "Listening for keys... press any combo"
    $lblCapture.ForeColor = $ui.Accent
    $btnRecordKey.Text = "..."
    $btnRecordClick.Text = "Click"
    $btnRecordSession.Text = "Record session"
    $captureTimer.Start()
    $form.Focus()
})

$btnRecordClick.Add_Click({
    if ($script:captureMode -eq "click") { Stop-Capture; return }
    if ($script:captureMode -eq "session") { Stop-Capture }
    $script:captureMode = "click"
    $script:prevL = $true; $script:prevR = $true; $script:prevM = $true
    $lblCapture.Text = "Click outside this window..."
    $lblCapture.ForeColor = $ui.Accent
    $btnRecordClick.Text = "..."
    $btnRecordKey.Text = "Key"
    $btnRecordSession.Text = "Record session"
    $captureTimer.Start()
})

$btnRecordSession.Add_Click({
    if ($script:captureMode -eq "session") { Stop-Capture; return }
    if ($chkClearOnRecord.Checked) {
        $script:steps.Clear()
        Refresh-List
    }
    $script:captureMode = "session"
    $script:lastActionAt = $null
    $script:lastRecordPos = $null
    $script:keyWasDown = @{}
    Clear-MoveBuffer
    $startPos = [AutoInput]::GetPos()
    [void]$script:moveBuffer.Add(@{ X = $startPos.X; Y = $startPos.Y; At = Get-Date })
    $script:lastRecordPos = @{ X = $startPos.X; Y = $startPos.Y }
    $script:prevL = $true; $script:prevR = $true; $script:prevM = $true
    try {
        [KeyCapHook]::Start()
        if (-not [KeyCapHook]::IsActive) {
            [System.Windows.Forms.MessageBox]::Show(
                "Could not install keyboard hook. Clicks and mouse moves still record.",
                "Automation"
            ) | Out-Null
        }
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Keyboard hook failed: $($_.Exception.Message)", "Automation") | Out-Null
    }
    $lblCapture.Text = "Recording - use another app. F9 stops."
    $lblCapture.ForeColor = $ui.Accent
    $btnRecordSession.Text = "F9 to stop"
    $btnRecordSession.BackColor = [System.Drawing.Color]::FromArgb(100, 30, 36)
    $btnRecordKey.Text = "Key"
    $btnRecordClick.Text = "Click"
    $lblStatus.Text = "Recording session..."
    $captureTimer.Start()
})

$btnCancelCap.Add_Click({ Stop-Capture })
$btnPaste.Add_Click({ Add-Step @{ Type = "paste" } })
$btnEnter.Add_Click({ Add-Step @{ Type = "enter" } })

$btnWords.Add_Click({
    $prompt = New-Object System.Windows.Forms.Form
    $prompt.Text = "Automate words"
    $prompt.ClientSize = New-Object System.Drawing.Size(420, 280)
    $prompt.StartPosition = "CenterParent"
    $prompt.FormBorderStyle = "FixedDialog"
    $prompt.MaximizeBox = $false
    $prompt.MinimizeBox = $false
    $prompt.BackColor = $form.BackColor
    $prompt.ForeColor = $form.ForeColor
    $prompt.Font = $form.Font

    $l = New-Object System.Windows.Forms.Label
    $l.Text = "Text to type when the timer runs (Japanese OK):"
    $l.Location = New-Object System.Drawing.Point(16, 14)
    $l.Size = New-Object System.Drawing.Size(380, 18)
    $l.ForeColor = $ui.Muted
    $prompt.Controls.Add($l)

    $tb = New-Object System.Windows.Forms.TextBox
    $tb.Location = New-Object System.Drawing.Point(16, 38)
    $tb.Size = New-Object System.Drawing.Size(388, 150)
    $tb.Multiline = $true
    $tb.ScrollBars = "Vertical"
    $tb.AcceptsReturn = $true
    $tb.AcceptsTab = $false
    Style-Input $tb
    $prompt.Controls.Add($tb)

    $chkEnter = New-Object System.Windows.Forms.CheckBox
    $chkEnter.Text = "Press Enter after each line"
    $chkEnter.Location = New-Object System.Drawing.Point(16, 198)
    $chkEnter.Size = New-Object System.Drawing.Size(220, 22)
    $chkEnter.Checked = $true
    $chkEnter.ForeColor = $ui.Muted
    $prompt.Controls.Add($chkEnter)

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = "Add"
    $ok.Location = New-Object System.Drawing.Point(220, 232)
    $ok.Size = New-Object System.Drawing.Size(88, 30)
    Style-Button $ok
    $ok.BackColor = $ui.Accent
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $prompt.Controls.Add($ok)

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = "Cancel"
    $cancel.Location = New-Object System.Drawing.Point(316, 232)
    $cancel.Size = New-Object System.Drawing.Size(88, 30)
    Style-Button $cancel
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $prompt.Controls.Add($cancel)
    $prompt.CancelButton = $cancel

    if ($prompt.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $text = $tb.Text
        if (-not [string]::IsNullOrWhiteSpace($text)) {
            Add-Step @{
                Type = "words"
                Text = $text
                EnterAfterLine = [bool]$chkEnter.Checked
            }
            $lblStatus.Text = "Added words: $(Format-WordsPreview $text)"
        }
    }
    $prompt.Dispose()
})

$btnWait.Add_Click({
    $prompt = New-Object System.Windows.Forms.Form
    $prompt.Text = "Wait duration"
    $prompt.Size = New-Object System.Drawing.Size(280, 140)
    $prompt.StartPosition = "CenterParent"
    $prompt.FormBorderStyle = "FixedDialog"
    $prompt.MaximizeBox = $false
    $prompt.MinimizeBox = $false
    $prompt.BackColor = $form.BackColor
    $prompt.ForeColor = $form.ForeColor

    $l = New-Object System.Windows.Forms.Label
    $l.Text = "Seconds:"
    $l.Location = New-Object System.Drawing.Point(16, 20)
    $l.AutoSize = $true
    $prompt.Controls.Add($l)

    $n = New-Object System.Windows.Forms.NumericUpDown
    $n.Location = New-Object System.Drawing.Point(80, 18)
    $n.Size = New-Object System.Drawing.Size(160, 24)
    $n.Maximum = 86400
    $n.Value = 1
    $prompt.Controls.Add($n)

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = "Add"
    $ok.Location = New-Object System.Drawing.Point(80, 60)
    $ok.Size = New-Object System.Drawing.Size(100, 28)
    Style-Button $ok
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $prompt.Controls.Add($ok)
    $prompt.AcceptButton = $ok

    if ($prompt.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        Add-Step @{ Type = "wait"; Seconds = [int]$n.Value }
    }
    $prompt.Dispose()
})

$btnGrabPos.Add_Click({
    $p = [AutoInput]::GetPos()
    $numX.Value = [math]::Max($numX.Minimum, [math]::Min($numX.Maximum, $p.X))
    $numY.Value = [math]::Max($numY.Minimum, [math]::Min($numY.Maximum, $p.Y))
    $lblStatus.Text = "Grabbed cursor ($($p.X), $($p.Y))"
})

$btnAddMove.Add_Click({
    Add-Step @{ Type = "move"; X = [int]$numX.Value; Y = [int]$numY.Value; DurationMs = [int]$numDur.Value }
})

$btnAddMoveClick.Add_Click({
    Add-Step @{ Type = "move"; X = [int]$numX.Value; Y = [int]$numY.Value; DurationMs = [int]$numDur.Value }
    Add-Step @{ Type = "click"; Button = "left"; X = [int]$numX.Value; Y = [int]$numY.Value }
})

$btnPreview.Add_Click({
    $x = [int]$numX.Value; $y = [int]$numY.Value; $ms = [int]$numDur.Value
    $lblStatus.Text = "Preview: moving to ($x, $y)..."
    [System.Windows.Forms.Application]::DoEvents()
    [AutoInput]::MoveTo($x, $y, $ms)
    $lblStatus.Text = "Preview done at ($x, $y)."
})

$btnSaveCfg.Add_Click({
    $name = $cboConfigs.Text.Trim()
    if (-not $name) {
        [System.Windows.Forms.MessageBox]::Show("Enter a config name first.", "Automation Builder") | Out-Null
        return
    }
    try {
        $path = Save-Config $name
        Refresh-ConfigList
        $cboConfigs.Text = (Get-SafeConfigName $name)
        $lblStatus.Text = "Saved: $path"
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Save failed: $($_.Exception.Message)", "Automation Builder") | Out-Null
    }
})

$btnLoadCfg.Add_Click({
    $name = $cboConfigs.Text.Trim()
    if (-not $name) {
        [System.Windows.Forms.MessageBox]::Show("Pick or type a config name.", "Automation Builder") | Out-Null
        return
    }
    try {
        Load-Config $name
        $lblStatus.Text = "Loaded config: $name"
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Load failed: $($_.Exception.Message)", "Automation Builder") | Out-Null
    }
})

$btnDeleteCfg.Add_Click({
    $name = $cboConfigs.Text.Trim()
    if (-not $name) { return }
    $path = Get-ConfigPath $name
    if (-not (Test-Path -LiteralPath $path)) {
        [System.Windows.Forms.MessageBox]::Show("Config not found.", "Automation Builder") | Out-Null
        return
    }
    $r = [System.Windows.Forms.MessageBox]::Show(
        "Delete config '$name'?",
        "Automation Builder",
        [System.Windows.Forms.MessageBoxButtons]::YesNo
    )
    if ($r -eq [System.Windows.Forms.DialogResult]::Yes) {
        Remove-Item -LiteralPath $path -Force
        Refresh-ConfigList
        $cboConfigs.Text = ""
        $lblStatus.Text = "Deleted: $name"
    }
})

$btnRefreshCfg.Add_Click({
    Refresh-ConfigList
    $lblStatus.Text = "Config list refreshed."
})

$btnRemove.Add_Click({
    $i = Get-SelectedIndex
    if ($i -ge 0) {
        $script:steps.RemoveAt($i)
        Refresh-List
        if ($script:steps.Count -gt 0) {
            $list.SelectedIndex = [math]::Min($i, $script:steps.Count - 1)
        }
    }
})

$btnClear.Add_Click({ $script:steps.Clear(); Refresh-List })

$btnUp.Add_Click({
    $i = Get-SelectedIndex
    if ($i -gt 0) {
        $tmp = $script:steps[$i - 1]
        $script:steps[$i - 1] = $script:steps[$i]
        $script:steps[$i] = $tmp
        Refresh-List
        $list.SelectedIndex = $i - 1
    }
})

$btnDown.Add_Click({
    $i = Get-SelectedIndex
    if ($i -ge 0 -and $i -lt ($script:steps.Count - 1)) {
        $tmp = $script:steps[$i + 1]
        $script:steps[$i + 1] = $script:steps[$i]
        $script:steps[$i] = $tmp
        Refresh-List
        $list.SelectedIndex = $i + 1
    }
})

function Close-CountdownWindow {
    if ($null -ne $script:cdForm -and -not $script:cdForm.IsDisposed) {
        try { $script:cdForm.Close() } catch { }
        try { $script:cdForm.Dispose() } catch { }
    }
    $script:cdForm = $null
    $script:cdTime = $null
    $script:cdPhase = $null
    $script:cdList = $null
    $script:cdProgress = $null
    $script:cdActiveIndex = -1
    $script:cdHiddenForInput = $false
}

function Show-CountdownWindow {
    Close-CountdownWindow

    $cd = New-Object System.Windows.Forms.Form
    $cd.Text = "Countdown"
    $cd.ClientSize = New-Object System.Drawing.Size(400, 536)
    $cd.StartPosition = "CenterScreen"
    $cd.FormBorderStyle = "None"
    $cd.MaximizeBox = $false
    $cd.MinimizeBox = $false
    $cd.TopMost = $true
    $cd.ShowInTaskbar = $true
    $cd.KeyPreview = $true
    $cd.BackColor = [System.Drawing.Color]::FromArgb(12, 12, 14)
    $cd.ForeColor = [System.Drawing.Color]::FromArgb(220, 220, 224)
    $cd.Font = New-Object System.Drawing.Font("Segoe UI", 9)

    $cdTitle = New-Object System.Windows.Forms.Panel
    $cdTitle.Dock = "Top"
    $cdTitle.Height = 36
    $cdTitle.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 20)
    $cd.Controls.Add($cdTitle)

    $cdTitleLbl = New-Object System.Windows.Forms.Label
    $cdTitleLbl.Text = "Countdown"
    $cdTitleLbl.Location = New-Object System.Drawing.Point(14, 8)
    $cdTitleLbl.Size = New-Object System.Drawing.Size(240, 20)
    $cdTitleLbl.ForeColor = [System.Drawing.Color]::FromArgb(210, 210, 214)
    $cdTitleLbl.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9.5)
    $cdTitle.Controls.Add($cdTitleLbl)

    $cdBtnClose = New-Object System.Windows.Forms.Button
    $cdBtnClose.Text = "X"
    $cdBtnClose.Size = New-Object System.Drawing.Size(36, 26)
    $cdBtnClose.Location = New-Object System.Drawing.Point(354, 5)
    $cdBtnClose.FlatStyle = "Flat"
    $cdBtnClose.FlatAppearance.BorderSize = 0
    $cdBtnClose.BackColor = [System.Drawing.Color]::FromArgb(150, 45, 52)
    $cdBtnClose.ForeColor = [System.Drawing.Color]::White
    $cdBtnClose.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
    $cdBtnClose.Cursor = [System.Windows.Forms.Cursors]::Hand
    $cdTitle.Controls.Add($cdBtnClose)

    $cdBtnMin = New-Object System.Windows.Forms.Button
    $cdBtnMin.Text = "_"
    $cdBtnMin.Size = New-Object System.Drawing.Size(36, 26)
    $cdBtnMin.Location = New-Object System.Drawing.Point(314, 5)
    $cdBtnMin.FlatStyle = "Flat"
    $cdBtnMin.FlatAppearance.BorderSize = 0
    $cdBtnMin.BackColor = [System.Drawing.Color]::FromArgb(150, 45, 52)
    $cdBtnMin.ForeColor = [System.Drawing.Color]::White
    $cdBtnMin.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
    $cdBtnMin.Cursor = [System.Windows.Forms.Cursors]::Hand
    $cdTitle.Controls.Add($cdBtnMin)

    # Bind script handle before events — local $cd is gone when handlers fire.
    $script:cdForm = $cd

    $dragCountdown = {
        if ($null -ne $script:cdForm -and -not $script:cdForm.IsDisposed) {
            [BorderlessDrag]::Drag($script:cdForm.Handle)
        }
    }
    $cdTitle.Add_MouseDown($dragCountdown)
    $cdTitleLbl.Add_MouseDown($dragCountdown)
    $cdBtnMin.Add_Click({
        if ($null -ne $script:cdForm -and -not $script:cdForm.IsDisposed) {
            $script:cdForm.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
        }
    })
    $cdBtnClose.Add_Click({
        $script:cancel = $true
        if ($null -ne $script:cdForm -and -not $script:cdForm.IsDisposed) {
            $script:cdForm.Close()
        }
    })

    $cd.Add_Paint({
        param($sender, $e)
        $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 40, 44)), 1
        $e.Graphics.DrawRectangle($pen, 0, 0, $sender.ClientSize.Width - 1, $sender.ClientSize.Height - 1)
        $pen.Dispose()
    })

    # Docked stop bar so it is never clipped
    $stopBar = New-Object System.Windows.Forms.Panel
    $stopBar.Dock = "Bottom"
    $stopBar.Height = 64
    $stopBar.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 20)
    $cd.Controls.Add($stopBar)

    $btnCdStop = New-Object System.Windows.Forms.Button
    $btnCdStop.Text = "Stop plan"
    $btnCdStop.Size = New-Object System.Drawing.Size(160, 40)
    $btnCdStop.Location = New-Object System.Drawing.Point(120, 12)
    $btnCdStop.FlatStyle = "Flat"
    $btnCdStop.FlatAppearance.BorderSize = 0
    $btnCdStop.BackColor = [System.Drawing.Color]::FromArgb(150, 45, 52)
    $btnCdStop.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 248)
    $btnCdStop.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
    $btnCdStop.Cursor = [System.Windows.Forms.Cursors]::Hand
    $btnCdStop.TabIndex = 0
    $stopBar.Controls.Add($btnCdStop)

    $content = New-Object System.Windows.Forms.Panel
    $content.Dock = "Fill"
    $content.BackColor = [System.Drawing.Color]::FromArgb(12, 12, 14)
    $cd.Controls.Add($content)
    $content.BringToFront()
    $stopBar.BringToFront()
    $cdTitle.BringToFront()

    $lblPhase = New-Object System.Windows.Forms.Label
    $lblPhase.Text = "Starting"
    $lblPhase.Location = New-Object System.Drawing.Point(24, 16)
    $lblPhase.Size = New-Object System.Drawing.Size(350, 22)
    $lblPhase.ForeColor = [System.Drawing.Color]::FromArgb(130, 130, 138)
    $content.Controls.Add($lblPhase)

    $lblTime = New-Object System.Windows.Forms.Label
    $lblTime.Text = "00:00:00"
    $lblTime.Location = New-Object System.Drawing.Point(16, 44)
    $lblTime.Size = New-Object System.Drawing.Size(368, 72)
    $lblTime.TextAlign = "MiddleCenter"
    $lblTime.ForeColor = [System.Drawing.Color]::FromArgb(240, 240, 245)
    $lblTime.Font = New-Object System.Drawing.Font("Segoe UI Light", 36)
    $content.Controls.Add($lblTime)

    $prog = New-Object System.Windows.Forms.ProgressBar
    $prog.Location = New-Object System.Drawing.Point(28, 124)
    $prog.Size = New-Object System.Drawing.Size(344, 4)
    $prog.Style = "Continuous"
    $prog.Minimum = 0
    $prog.Maximum = 1000
    $prog.Value = 0
    $content.Controls.Add($prog)

    $lblActs = New-Object System.Windows.Forms.Label
    $lblActs.Text = "Actions"
    $lblActs.Location = New-Object System.Drawing.Point(28, 140)
    $lblActs.Size = New-Object System.Drawing.Size(200, 18)
    $lblActs.ForeColor = [System.Drawing.Color]::FromArgb(110, 110, 118)
    $lblActs.Font = New-Object System.Drawing.Font("Segoe UI", 8)
    $content.Controls.Add($lblActs)

    $lst = New-Object System.Windows.Forms.ListBox
    $lst.Location = New-Object System.Drawing.Point(24, 162)
    $lst.Size = New-Object System.Drawing.Size(352, 250)
    $lst.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 20)
    $lst.ForeColor = [System.Drawing.Color]::FromArgb(180, 180, 188)
    $lst.BorderStyle = "None"
    $lst.Font = New-Object System.Drawing.Font("Consolas", 9.5)
    $lst.IntegralHeight = $false
    $content.Controls.Add($lst)

    for ($i = 0; $i -lt $script:steps.Count; $i++) {
        [void]$lst.Items.Add("    $($i + 1)  $(Get-StepLabel $script:steps[$i])")
    }

    $stopAction = {
        $script:cancel = $true
        if ($null -ne $script:cdPhase -and -not $script:cdPhase.IsDisposed) {
            $script:cdPhase.Text = "Stopping..."
        }
        if ($null -ne $script:cdTime -and -not $script:cdTime.IsDisposed) {
            $script:cdTime.Text = "--:--:--"
        }
        try { $lblStatus.Text = "Stopping..." } catch { }
    }

    $btnCdStop.Add_Click($stopAction)
    $cd.Add_KeyDown({
        param($sender, $e)
        if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
            & $stopAction
            $e.Handled = $true
        }
    })

    $cd.Add_FormClosing({
        param($sender, $e)
        if (-not $script:cancel -and $script:running) {
            $script:cancel = $true
        }
    })

    $cd.AcceptButton = $null
    $cd.CancelButton = $btnCdStop

    $script:cdForm = $cd
    $script:cdTime = $lblTime
    $script:cdPhase = $lblPhase
    $script:cdList = $lst
    $script:cdProgress = $prog
    $script:cdActiveIndex = -1
    $script:cdTotalInitial = 0
    $script:cdStopBtn = $btnCdStop
    $script:cdHiddenForInput = $false

    # Show without owner so the borderless window can be dragged freely.
    $cd.Show()
    $btnCdStop.Focus()
    [System.Windows.Forms.Application]::DoEvents()
}

function Set-CountdownPhase([string]$text) {
    if ($null -ne $script:cdPhase -and -not $script:cdPhase.IsDisposed) {
        $script:cdPhase.Text = $text
    }
}

function Set-CountdownTime([string]$text) {
    if ($null -ne $script:cdTime -and -not $script:cdTime.IsDisposed) {
        $script:cdTime.Text = $text
    }
}

function Set-CountdownProgress([double]$ratio) {
    if ($null -eq $script:cdProgress -or $script:cdProgress.IsDisposed) { return }
    if ($ratio -lt 0) { $ratio = 0 }
    if ($ratio -gt 1) { $ratio = 1 }
    $script:cdProgress.Value = [int]($ratio * 1000)
}

function Set-CountdownActiveStep([int]$index) {
    if ($null -eq $script:cdList -or $script:cdList.IsDisposed) { return }
    $script:cdActiveIndex = $index
    for ($i = 0; $i -lt $script:cdList.Items.Count; $i++) {
        $raw = Get-StepLabel $script:steps[$i]
        if ($i -lt $index) {
            $script:cdList.Items[$i] = "  ·  $($i + 1)  $raw"
        } elseif ($i -eq $index) {
            $script:cdList.Items[$i] = "  >  $($i + 1)  $raw"
        } else {
            $script:cdList.Items[$i] = "     $($i + 1)  $raw"
        }
    }
    if ($index -ge 0 -and $index -lt $script:cdList.Items.Count) {
        $script:cdList.TopIndex = [math]::Max(0, $index - 3)
        $script:cdList.SelectedIndex = $index
    }
    $n = $script:steps.Count
    if ($index -ge 0) {
        Set-CountdownPhase "Action $($index + 1) of $n"
        if ($n -gt 0) { Set-CountdownProgress (($index) / [double]$n) }
    }
}

function Set-UiRunning([bool]$isRunning) {
    $script:running = $isRunning
    $btnRun.Enabled = -not $isRunning
    $btnStop.Enabled = $isRunning
    $numHours.Enabled = -not $isRunning
    $numMins.Enabled = -not $isRunning
    $numSecs.Enabled = -not $isRunning
    $numBetweenSecs.Enabled = -not $isRunning
    $numBetweenMs.Enabled = -not $isRunning
    $btnRecordKey.Enabled = -not $isRunning
    $btnRecordClick.Enabled = -not $isRunning
    $btnRecordSession.Enabled = -not $isRunning
    $btnPaste.Enabled = -not $isRunning
    $btnEnter.Enabled = -not $isRunning
    $btnWait.Enabled = -not $isRunning
    $btnWords.Enabled = -not $isRunning
    $btnUp.Enabled = -not $isRunning
    $btnDown.Enabled = -not $isRunning
    $btnRemove.Enabled = -not $isRunning
    $btnClear.Enabled = -not $isRunning
    $btnAddMove.Enabled = -not $isRunning
    $btnAddMoveClick.Enabled = -not $isRunning
    $btnPreview.Enabled = -not $isRunning
    $btnGrabPos.Enabled = -not $isRunning
    $btnSaveCfg.Enabled = -not $isRunning
    $btnLoadCfg.Enabled = -not $isRunning
    $btnDeleteCfg.Enabled = -not $isRunning
    $cboConfigs.Enabled = -not $isRunning
}

function Wait-SecondsCountdown([int]$total, [string]$label) {
    if ($total -le 0) { return $true }
    $script:cdTotalInitial = $total
    Set-CountdownPhase $label
    for ($remaining = $total; $remaining -gt 0; $remaining--) {
        if ($script:cancel) { return $false }
        $lblStatus.Text = "$label - Remaining: $(Format-Duration $remaining)"
        Set-CountdownTime (Format-Duration $remaining)
        Set-CountdownProgress (1.0 - ($remaining / [double]$total))
        [System.Windows.Forms.Application]::DoEvents()
        $elapsed = 0
        while ($elapsed -lt 1000) {
            if ($script:cancel) { return $false }
            Start-Sleep -Milliseconds 50
            $elapsed += 50
            [System.Windows.Forms.Application]::DoEvents()
        }
    }
    Set-CountdownTime "00:00:00"
    Set-CountdownProgress 1.0
    return $true
}

function Wait-MillisecondsCancelable([int]$totalMs, [string]$label) {
    if ($totalMs -le 0) { return $true }
    $remaining = $totalMs
    while ($remaining -gt 0) {
        if ($script:cancel) { return $false }
        $lblStatus.Text = "$label - ${remaining}ms"
        Set-CountdownPhase $label
        Set-CountdownTime ("{0:D2}:{1:D2}.{2:D3}" -f 0, [int][math]::Floor($remaining / 1000), ($remaining % 1000))
        [System.Windows.Forms.Application]::DoEvents()
        $chunk = [math]::Min(50, $remaining)
        Start-Sleep -Milliseconds $chunk
        $remaining -= $chunk
    }
    return $true
}

function Hide-CountdownForInput {
    # TopMost countdown steals hits after the timer; hide it during mouse/key playback.
    if ($null -eq $script:cdForm -or $script:cdForm.IsDisposed) { return }
    try {
        if ($script:cdForm.Visible) {
            $script:cdForm.TopMost = $false
            $script:cdForm.Hide()
            $script:cdHiddenForInput = $true
        }
    } catch { }
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 80
}

function Restore-CountdownAfterInput {
    if ($null -eq $script:cdForm -or $script:cdForm.IsDisposed) { return }
    try {
        if ($script:cdHiddenForInput -or -not $script:cdForm.Visible) {
            $script:cdForm.Show()
            $script:cdForm.TopMost = $true
            $script:cdHiddenForInput = $false
        }
    } catch { }
    [System.Windows.Forms.Application]::DoEvents()
}

function Invoke-ClickStep($step) {
    $btn = if ($step.Button) { $step.Button } else { "left" }
    $hasPos = ($null -ne $step.X -and $null -ne $step.Y)
    $x = 0; $y = 0
    if ($hasPos) {
        $x = [int]$step.X
        $y = [int]$step.Y
    } else {
        $p = [AutoInput]::GetPos()
        $x = $p.X
        $y = $p.Y
    }

    Hide-CountdownForInput

    if ($hasPos) {
        # Retry land — DPI / multi-monitor can drop the first SetCursorPos
        $landed = $false
        for ($attempt = 0; $attempt -lt 3; $attempt++) {
            if ([AutoInput]::MoveInstant($x, $y)) { $landed = $true; break }
            Start-Sleep -Milliseconds 40
        }
        if (-not $landed) {
            [AutoInput]::SetCursorPos($x, $y)
        }
        Start-Sleep -Milliseconds 60
        [AutoInput]::FocusWindowAt($x, $y)
        Start-Sleep -Milliseconds 40
        [AutoInput]::MoveInstant($x, $y) | Out-Null
        Start-Sleep -Milliseconds 30
    }

    switch ($btn) {
        "right"  { [AutoInput]::RightClick() }
        "middle" { [AutoInput]::MiddleClick() }
        default  { [AutoInput]::LeftClick() }
    }
}

function Invoke-Steps {
    $betweenMs = [int]($numBetweenSecs.Value * 1000 + $numBetweenMs.Value)
    $all = @($script:steps)
    # Once the timer ends, keep countdown out of the way for the whole action run.
    Hide-CountdownForInput
    for ($i = 0; $i -lt $all.Count; $i++) {
        $step = $all[$i]
        if ($script:cancel) {
            Restore-CountdownAfterInput
            return $false
        }
        Set-CountdownActiveStep $i
        Set-CountdownTime "--:--:--"
        switch ($step.Type) {
            "wait" {
                Restore-CountdownAfterInput
                $lblStatus.Text = "Waiting $($step.Seconds)s..."
                if (-not (Wait-SecondsCountdown $step.Seconds "Wait")) {
                    Restore-CountdownAfterInput
                    return $false
                }
                Hide-CountdownForInput
            }
            "move" {
                $ms = if ($null -ne $step.DurationMs) { [int]$step.DurationMs } else { 300 }
                $lblStatus.Text = "Moving cursor to ($($step.X), $($step.Y))..."
                Set-CountdownPhase "Moving to ($($step.X), $($step.Y))"
                [System.Windows.Forms.Application]::DoEvents()
                Hide-CountdownForInput
                [AutoInput]::MoveTo([int]$step.X, [int]$step.Y, $ms)
                Start-Sleep -Milliseconds 50
            }
            "click" {
                $btnLabel = if ($step.Button) { $step.Button } else { "left" }
                if ($null -ne $step.X -and $null -ne $step.Y) {
                    $lblStatus.Text = "Click $btnLabel at ($($step.X), $($step.Y))..."
                    Set-CountdownPhase "Click $btnLabel ($($step.X), $($step.Y))"
                } else {
                    $lblStatus.Text = "Click $btnLabel (current position)..."
                    Set-CountdownPhase "Click $btnLabel"
                }
                [System.Windows.Forms.Application]::DoEvents()
                Invoke-ClickStep $step
                Start-Sleep -Milliseconds 200
            }
            "paste" {
                $lblStatus.Text = "Paste..."
                Set-CountdownPhase "Paste"
                [System.Windows.Forms.Application]::DoEvents()
                Hide-CountdownForInput
                [System.Windows.Forms.SendKeys]::SendWait("^v")
                Start-Sleep -Milliseconds 200
            }
            "words" {
                $preview = Format-WordsPreview $step.Text
                $lblStatus.Text = "Typing words: $preview"
                Set-CountdownPhase "Words: $preview"
                [System.Windows.Forms.Application]::DoEvents()
                Invoke-WordsStep $step
                Start-Sleep -Milliseconds 200
            }
            "enter" {
                $lblStatus.Text = "Enter..."
                Set-CountdownPhase "Enter"
                [System.Windows.Forms.Application]::DoEvents()
                Hide-CountdownForInput
                [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
                Start-Sleep -Milliseconds 200
            }
            "keys" {
                $lblStatus.Text = "Keys: $(Format-KeyLabel $step.Keys)"
                Set-CountdownPhase "$(Format-KeyLabel $step.Keys)"
                [System.Windows.Forms.Application]::DoEvents()
                Hide-CountdownForInput
                [System.Windows.Forms.SendKeys]::SendWait($step.Keys)
                Start-Sleep -Milliseconds 500
            }
        }
        [System.Windows.Forms.Application]::DoEvents()
        if ($i -lt ($all.Count - 1) -and $betweenMs -gt 0) {
            Restore-CountdownAfterInput
            if (-not (Wait-MillisecondsCancelable $betweenMs "Between actions")) {
                Restore-CountdownAfterInput
                return $false
            }
            Hide-CountdownForInput
        }
    }
    Restore-CountdownAfterInput
    Set-CountdownActiveStep ($all.Count - 1)
    Set-CountdownProgress 1.0
    Set-CountdownPhase "Complete"
    Set-CountdownTime "00:00:00"
    return $true
}

$btnRun.Add_Click({
    if ($script:steps.Count -eq 0) {
        [System.Windows.Forms.MessageBox]::Show("Add at least one step first.", "Automation") | Out-Null
        return
    }
    Stop-Capture
    $script:cancel = $false
    Set-UiRunning $true
    Show-CountdownWindow

    $initial = [int]($numHours.Value * 3600 + $numMins.Value * 60 + $numSecs.Value)
    $ok = $true
    if ($initial -gt 0) {
        $ok = Wait-SecondsCountdown $initial "Initial delay"
    } else {
        Set-CountdownPhase "Ready"
        Set-CountdownTime "00:00:00"
    }
    if ($ok -and -not $script:cancel) {
        $ok = Invoke-Steps
    }
    if ($script:cancel) {
        Set-CountdownPhase "Stopped"
        $lblStatus.Text = "Stopped."
    } elseif ($ok) {
        Set-CountdownPhase "Done"
        $lblStatus.Text = "Done."
    } else {
        Set-CountdownPhase "Stopped"
        $lblStatus.Text = "Stopped."
    }
    Start-Sleep -Milliseconds 600
    Close-CountdownWindow
    Set-UiRunning $false
})

$btnStop.Add_Click({
    $script:cancel = $true
    $lblStatus.Text = "Stopping..."
    Set-CountdownPhase "Stopping..."
})

$form.Add_FormClosing({
    $script:cancel = $true
    try { [KeyCapHook]::Stop() } catch { }
    Close-CountdownWindow
    $posTimer.Stop()
    $captureTimer.Stop()
})

# Seed built-in configs (original-style), then load paste-enter-later as default
Seed-BuiltinConfigs
Refresh-ConfigList
try {
    Load-Config "paste-enter-later"
} catch {
    Add-Step @{ Type = "keys"; Keys = "^n" }
    Add-Step @{ Type = "click"; Button = "left" }
    Add-Step @{ Type = "paste" }
    Add-Step @{ Type = "enter" }
}

$p0 = [AutoInput]::GetPos()
$numX.Value = [math]::Max($numX.Minimum, [math]::Min($numX.Maximum, $p0.X))
$numY.Value = [math]::Max($numY.Minimum, [math]::Min($numY.Maximum, $p0.Y))

[void]$form.ShowDialog()
$posTimer.Dispose()
$captureTimer.Dispose()
$form.Dispose()
