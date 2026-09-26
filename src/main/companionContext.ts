/**
 * What the desktop companion knows about the app the user is in.
 *
 * Every companion action starts from "the thing I am looking at in another
 * program": its selected text, its window title (a card's source), the word
 * just looked up. Getting any of that on Windows without a native module
 * means asking user32 — and a fresh PowerShell per keypress costs ~1 s of
 * Add-Type compilation, which is why the popup dictionary used to feel slow.
 *
 * One small PowerShell process is started once (after first paint) and kept:
 *   `<id> info`          → the foreground window's hwnd, title, pid, process name
 *   `<id> copy <hwnd>`   → waits until the hotkey's modifiers are released (a
 *                          Ctrl+C sent while Alt is still held arrives as
 *                          Ctrl+Alt+C), re-activates <hwnd> if another window
 *                          took the foreground (the radial wheel), and sends
 *                          Ctrl+C only when <hwnd> really is in front — never
 *                          into whatever window happened to be there, where a
 *                          Ctrl+C could interrupt a console program.
 * It answers one JSON line per request. If it cannot start (not Windows, a
 * locked-down PowerShell) everything degrades to the old one-shot SendKeys
 * and a clipboard read.
 */

import { clipboard } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface ForegroundInfo {
  hwnd: number;
  title: string;
  pid: number;
  process: string;
}

/** The last thing a companion surface looked up — "Mine the last lookup" mines it. */
export interface CompanionLookup {
  text: string;
  /** The sentence it was taken from, when the surface knew one. */
  sentence?: string;
  sourceTitle?: string;
  sourceApp?: string;
  at: number;
}

const HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -Namespace GumCompanion -Name Fg -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
'@
Add-Type -AssemblyName System.Windows.Forms
function Get-FgInfo {
  $h = [GumCompanion.Fg]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][GumCompanion.Fg]::GetWindowText($h, $sb, 512)
  $p = [uint32]0
  [void][GumCompanion.Fg]::GetWindowThreadProcessId($h, [ref]$p)
  $name = ''
  try { $name = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch { }
  return @{ hwnd = [int64]$h; title = $sb.ToString(); pid = [int]$p; process = $name }
}
function Wait-ModifiersUp {
  for ($i = 0; $i -lt 60; $i++) {
    $down = $false
    foreach ($vk in 0x10, 0x11, 0x12, 0x5B, 0x5C) {
      if ([GumCompanion.Fg]::GetAsyncKeyState($vk) -band 0x8000) { $down = $true }
    }
    if (-not $down) { return }
    Start-Sleep -Milliseconds 15
  }
}
[void](Get-FgInfo)
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Split(' ')
  $out = @{ id = $parts[0] }
  $cmd = if ($parts.Length -gt 1) { $parts[1] } else { '' }
  $arg = if ($parts.Length -gt 2) { $parts[2] } else { '0' }
  if ($cmd -eq 'info') {
    $out.info = Get-FgInfo
  } elseif ($cmd -eq 'copy') {
    Wait-ModifiersUp
    $target = [int64]$arg
    if ($target -ne 0 -and [GumCompanion.Fg]::IsWindow([IntPtr]$target) -and [int64][GumCompanion.Fg]::GetForegroundWindow() -ne $target) {
      [void][GumCompanion.Fg]::SetForegroundWindow([IntPtr]$target)
      Start-Sleep -Milliseconds 90
    }
    $info = Get-FgInfo
    if ($target -eq 0 -or $info.hwnd -eq $target) {
      [System.Windows.Forms.SendKeys]::SendWait('^c')
      $out.sent = $true
    } else {
      $out.sent = $false
    }
    $out.info = $info
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 3))
  [Console]::Out.Flush()
}
`;

type Pending = { resolve: (value: Record<string, unknown> | null) => void; timer: ReturnType<typeof setTimeout> };

let helper: ChildProcessWithoutNullStreams | null = null;
let helperReady: Promise<boolean> | null = null;
let helperFailed = false;
let seq = 0;
const pending = new Map<string, Pending>();

/** A helper not up in this long is stopped; the next command starts another. */
const HELPER_START_TIMEOUT_MS = 8000;

function spawnHelper(): Promise<boolean> {
  if (process.platform !== 'win32' || helperFailed) return Promise.resolve(false);
  if (helperReady) return helperReady;
  helperReady = new Promise<boolean>((resolve) => {
    let settled = false;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    /** `permanent`: PowerShell cannot run here at all, so nothing will ever ask it again. */
    const settle = (ok: boolean, permanent = true): void => {
      if (settled) return;
      settled = true;
      if (startTimer) clearTimeout(startTimer);
      if (!ok && permanent) helperFailed = true;
      resolve(ok);
    };
    try {
      const encoded = Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64');
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      helper = child;
      child.stdout.setEncoding('utf8');
      child.stderr.on('data', () => undefined);
      let buf = '';
      child.stdout.on('data', (chunk: string) => {
        buf += chunk;
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (!line) continue;
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (msg.ready === true) {
            settle(true);
            continue;
          }
          const id = typeof msg.id === 'string' ? msg.id : String(msg.id ?? '');
          const waiter = pending.get(id);
          if (waiter) {
            clearTimeout(waiter.timer);
            pending.delete(id);
            waiter.resolve(msg);
          }
        }
      });
      const gone = (): void => {
        // A helper stopped for being slow must not take its successor down with it.
        if (helper !== child) return;
        helper = null;
        helperReady = null;
        for (const [id, waiter] of pending) {
          clearTimeout(waiter.timer);
          waiter.resolve(null);
          pending.delete(id);
        }
        settle(false);
      };
      child.on('exit', gone);
      child.on('error', gone);
      // Add-Type compiles on first start, which a busy machine can make slow. A
      // helper not up in time is stopped (it used to be left running, and the
      // companion was marked broken for the rest of the session); the next
      // command tries a fresh one.
      startTimer = setTimeout(() => {
        if (helper === child) {
          helper = null;
          helperReady = null;
        }
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        settle(false, false);
      }, HELPER_START_TIMEOUT_MS);
    } catch {
      settle(false);
    }
  });
  return helperReady;
}

function ask(command: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  return spawnHelper().then((ok) => {
    if (!ok || !helper) return null;
    const id = String(++seq);
    return new Promise<Record<string, unknown> | null>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      try {
        helper!.stdin.write(`${id} ${command}\n`);
      } catch {
        clearTimeout(timer);
        pending.delete(id);
        resolve(null);
      }
    });
  });
}

export function parseForegroundInfo(raw: unknown): ForegroundInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const hwnd = Number(r.hwnd);
  if (!Number.isFinite(hwnd) || hwnd <= 0) return null;
  return {
    hwnd,
    title: typeof r.title === 'string' ? r.title.slice(0, 300) : '',
    pid: Number.isFinite(Number(r.pid)) ? Number(r.pid) : 0,
    process: typeof r.process === 'string' ? r.process.slice(0, 120) : '',
  };
}

/** Start the helper now so the first hotkey does not pay for PowerShell's boot. */
export function warmCompanionContext(): void {
  void spawnHelper();
}

export function stopCompanionContext(): void {
  try {
    helper?.stdin.end();
    helper?.kill();
  } catch {
    /* already gone */
  }
  helper = null;
  helperReady = null;
}

let lastForeground: ForegroundInfo | null = null;

/** True when the window belongs to Gum itself (its windows live in the main process). */
export function isOwnWindow(info: ForegroundInfo | null): boolean {
  return Boolean(info && info.pid === process.pid);
}

/**
 * The window the user is working in. Gum's own windows (the wheel, the popup)
 * never count: asked while one of them is in front, this answers the app that
 * was in front before it.
 */
export async function foregroundInfo(): Promise<ForegroundInfo | null> {
  const msg = await ask('info', 1500);
  const info = parseForegroundInfo(msg?.info);
  if (info && !isOwnWindow(info)) lastForeground = info;
  return info && !isOwnWindow(info) ? info : lastForeground;
}

export function lastForegroundInfo(): ForegroundInfo | null {
  return lastForeground;
}

/**
 * `foregroundInfo()`, but never slower than a hotkey can afford: a helper
 * still booting answers with the last window seen instead of holding the
 * Lens or the wheel back.
 */
export function quickForegroundInfo(budgetMs = 180): Promise<ForegroundInfo | null> {
  return Promise.race([
    foregroundInfo(),
    new Promise<ForegroundInfo | null>((resolve) => setTimeout(() => resolve(lastForeground), budgetMs)),
  ]);
}

/** Synthesize Ctrl+C with a one-shot PowerShell — the fallback when the helper is unavailable. */
function oneShotCopy(): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-STA',
          '-Command',
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')",
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
      child.on('exit', () => resolve());
      child.on('error', () => resolve());
    } catch {
      resolve();
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CapturedSelection {
  text: string;
  /** True when the text was newly copied from the window, false when it is the old clipboard. */
  fromSelection: boolean;
  source: ForegroundInfo | null;
}

/** Everything on the clipboard Electron can read back and write again. */
interface ClipboardSnapshot {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage | null;
  bookmark: { title: string; url: string } | null;
}

function snapshotClipboard(): ClipboardSnapshot {
  const read = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const image = read(() => clipboard.readImage(), null);
  const bookmark = read(() => (process.platform === 'darwin' || process.platform === 'win32' ? clipboard.readBookmark() : null), null);
  return {
    text: read(() => clipboard.readText(), ''),
    html: read(() => clipboard.readHTML(), ''),
    rtf: read(() => clipboard.readRTF(), ''),
    image: image && !image.isEmpty() ? image : null,
    bookmark: bookmark && bookmark.url ? bookmark : null,
  };
}

/**
 * Put a snapshot back, every format at once. Restoring only the text (as this
 * did) replaced a copied picture, and the formatting of copied rich text, with
 * a bare string — or with nothing at all when the picture had no text.
 */
function restoreClipboard(snapshot: ClipboardSnapshot): void {
  const data: Electron.Data = {};
  if (snapshot.text) data.text = snapshot.text;
  if (snapshot.html) data.html = snapshot.html;
  if (snapshot.rtf) data.rtf = snapshot.rtf;
  if (snapshot.image) data.image = snapshot.image;
  // A bookmark is the title of the URL that is the text.
  if (snapshot.bookmark && snapshot.text === snapshot.bookmark.url) data.bookmark = snapshot.bookmark.title;
  try {
    if (Object.keys(data).length) clipboard.write(data);
    else clipboard.clear();
  } catch {
    /* ignore */
  }
}

/**
 * Copy the selection out of the foreground window (or `target`, when a Gum
 * window such as the wheel is in front), read it, and put the user's clipboard
 * back — every format of it — so the lookup is non-destructive. When nothing
 * new was copied the old clipboard text is the answer, as it always was.
 */
export async function captureSelection(target?: ForegroundInfo | null): Promise<CapturedSelection> {
  const saved = snapshotClipboard();
  const before = saved.text;
  let source: ForegroundInfo | null = target ?? null;
  const msg = await ask(`copy ${target?.hwnd ?? 0}`, 2500);
  if (msg) {
    const info = parseForegroundInfo(msg.info);
    if (info && !isOwnWindow(info)) {
      source = info;
      lastForeground = info;
    }
    if (msg.sent !== true) return { text: before.trim(), fromSelection: false, source };
  } else if (!target) {
    await oneShotCopy();
  } else {
    // No helper and a Gum window in front: a blind Ctrl+C would copy from Gum.
    return { text: before.trim(), fromSelection: false, source };
  }
  // Give the target app a moment to service WM_COPY.
  let after = before;
  for (let i = 0; i < 6; i += 1) {
    await delay(40);
    after = clipboard.readText();
    if (after && after !== before) break;
  }
  if (after && after !== before) {
    setTimeout(() => restoreClipboard(saved), 350);
    return { text: after.trim(), fromSelection: true, source };
  }
  return { text: before.trim(), fromSelection: false, source };
}

// ---- last lookup ----------------------------------------------------------

let lastLookup: CompanionLookup | null = null;

export function noteCompanionLookup(entry: Omit<CompanionLookup, 'at'>): void {
  const text = entry.text.trim();
  if (!text) return;
  lastLookup = { ...entry, text: text.slice(0, 500), at: Date.now() };
}

export function lastCompanionLookup(): CompanionLookup | null {
  return lastLookup;
}

