/**
 * Windows Live Captions capture — background poller and script store.
 *
 * Live Captions has no API. Its text is reachable only through UI Automation,
 * as a `CaptionsTextBlock` element inside the `LiveCaptionsDesktopWindow`, and
 * that element holds a rolling ~12-line window that evicts its oldest line
 * every few seconds of speech (see `shared/liveCaptions.ts` for the measured
 * numbers). Anything not read within seconds is lost at the source, so this has
 * to be a *persistent* poller rather than something the notebook calls when the
 * user opens it.
 *
 * The poller is a long-lived PowerShell child that owns the UI Automation
 * client and writes one compact JSON object per changed snapshot to stdout;
 * this module merges those snapshots (in `shared/liveCaptions.ts`, which is
 * where the tests live) and persists the resulting line log. Same shape as
 * `osHotkeyHelper` — script text written into `userData`, spawned with
 * `powershell.exe -NoProfile` — except this child is attached to the app rather
 * than detached at logon, because we need its output in-process.
 *
 * Windows-only; every entry point degrades to `{ supported: false }` elsewhere.
 */

import { app, ipcMain, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import {
  type CaptionLine,
  type CaptionScript,
  DEFAULT_SCRIPT_GAP_MS,
  mergeCaptionSnapshot,
  segmentScripts,
} from '../shared/liveCaptions';

export interface LiveCaptionsStatus {
  supported: boolean;
  /** Our poller child is alive. */
  capturing: boolean;
  /** The poller has found the Live Captions window and is reading it. */
  attached: boolean;
  /** Capture should resume automatically on next launch. */
  enabled: boolean;
  lineCount: number;
  scriptCount: number;
  lastLineAt?: number;
  error?: string;
}

const POLL_MS = 700;
/**
 * Lines kept in the hot merge window. The overlap search only ever looks at the
 * last ~12 (the size of the Live Captions window), so this just has to be
 * comfortably larger; keeping it bounded stops the per-poll array copy from
 * growing with a long session.
 */
const WORKING_MAX = 64;
const WORKING_KEEP = 32;
/** Hard cap on the persisted log so an unattended session cannot grow forever. */
const STORE_MAX_LINES = 100_000;
const FLUSH_DEBOUNCE_MS = 4000;

const CHANNEL_CHANGED = 'liveCaptions:changed';

/** stdin is deliberately 'ignore' — the poller only ever talks upstream. */
type PollerChild = ChildProcessByStdio<null, Readable, Readable>;

let child: PollerChild | null = null;
let archive: CaptionLine[] = [];
let working: CaptionLine[] = [];
let attached = false;
let lastError = '';
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;
let loaded = false;
let mainWindow: BrowserWindow | null = null;

function stateDir(): string {
  return path.join(app.getPath('userData'), 'live-captions');
}
function storePath(): string {
  return path.join(stateDir(), 'lines.json');
}
function scriptPath(): string {
  return path.join(stateDir(), 'poller.ps1');
}
function prefsPath(): string {
  return path.join(stateDir(), 'prefs.json');
}

function readEnabled(): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(prefsPath(), 'utf8')) as { enabled?: boolean };
    return Boolean(raw?.enabled);
  } catch {
    return false;
  }
}

function writeEnabled(enabled: boolean): void {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify({ enabled }), 'utf8');
  } catch {
    /* a lost preference is not worth failing capture over */
  }
}

function allLines(): CaptionLine[] {
  return archive.length ? [...archive, ...working] : working;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8')) as {
      version?: number;
      lines?: CaptionLine[];
    };
    const lines = Array.isArray(raw?.lines) ? raw.lines : [];
    const clean = lines.filter(
      (l): l is CaptionLine =>
        Boolean(l) && typeof l.text === 'string' && Number.isFinite(l.ts),
    );
    // Resume merging against the tail so a restart mid-conversation does not
    // re-append the lines still sitting in the Live Captions window.
    archive = clean.slice(0, Math.max(0, clean.length - WORKING_KEEP));
    working = clean.slice(Math.max(0, clean.length - WORKING_KEEP));
  } catch {
    archive = [];
    working = [];
  }
}

function flush(): void {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const lines = allLines().slice(-STORE_MAX_LINES);
    fs.writeFileSync(storePath(), JSON.stringify({ version: 1, lines }), 'utf8');
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }
}

function scheduleFlush(): void {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DEBOUNCE_MS);
}

/**
 * Snapshots arrive about once a second, and the notebook panel answers a change
 * event by re-fetching every script over IPC. Notifying on each one would
 * re-segment and re-serialize the whole log once a second for text the user is
 * still speaking, so coalesce into a slower heartbeat. State changes
 * (attach/detach/stop) call `notifyRendererNow` and bypass this.
 */
const NOTIFY_THROTTLE_MS = 3000;
let notifyTimer: NodeJS.Timeout | null = null;

function notifyRendererNow(): void {
  if (notifyTimer) {
    clearTimeout(notifyTimer);
    notifyTimer = null;
  }
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CHANNEL_CHANGED, getLiveCaptionsStatus());
    }
  } catch {
    /* window torn down mid-send */
  }
}

function notifyRenderer(): void {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    notifyRendererNow();
  }, NOTIFY_THROTTLE_MS);
}

const POLLER_PS1 = String.raw`# GrammarX Live Captions poller.
# Reads the CaptionsTextBlock element out of LiveCaptions.exe via UI Automation
# and writes one compact JSON object per *changed* snapshot to stdout. Merging,
# de-duplication and persistence all happen on the Electron side.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$intervalMs = __INTERVAL__
$last = ''
$block = $null
$announcedWaiting = $false

function Emit($obj) {
  Write-Output ($obj | ConvertTo-Json -Compress -Depth 4)
}

function Resolve-Block {
  $proc = Get-Process -Name LiveCaptions -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $proc) { return $null }
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
  $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
  if (-not $win) { return $null }
  $idc = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'CaptionsTextBlock')
  return $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $idc)
}

Emit ([pscustomobject]@{ type = 'ready' })

while ($true) {
  try {
    if ($null -eq $block) {
      $block = Resolve-Block
      if ($null -eq $block) {
        # Live Captions is not running (or not showing yet). Say so once, then
        # keep looking quietly so stdout does not fill with status lines.
        if (-not $announcedWaiting) {
          Emit ([pscustomobject]@{ type = 'waiting' })
          $announcedWaiting = $true
        }
        Start-Sleep -Milliseconds 1500
        continue
      }
      $announcedWaiting = $false
      $last = ''
      Emit ([pscustomobject]@{ type = 'attached' })
    }
    $tp = $block.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    $txt = $tp.DocumentRange.GetText(-1)
    if ($txt -ne $last) {
      $last = $txt
      # Regex split: PowerShell -split takes a regex, so \r?\n works here. The
      # usual PowerShell newline escapes use backticks, which would terminate
      # the JS template literal this script is embedded in — do not use them.
      $lines = @($txt -split "\r?\n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      if ($lines.Count -gt 0) {
        Emit ([pscustomobject]@{
          type  = 'snapshot'
          t     = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
          lines = $lines
        })
      }
    }
  } catch {
    # The captions window was closed or the element went stale — drop it and
    # re-resolve on the next tick rather than dying.
    $block = $null
    $announcedWaiting = $false
    Emit ([pscustomobject]@{ type = 'detached'; message = $_.Exception.Message })
    Start-Sleep -Milliseconds 1000
    continue
  }
  Start-Sleep -Milliseconds $intervalMs
}
`;

function writePoller(): void {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(scriptPath(), POLLER_PS1.replace('__INTERVAL__', String(POLL_MS)), 'utf8');
}

function applySnapshot(lines: string[], ts: number): void {
  const before = working.length;
  const merged = mergeCaptionSnapshot(working, lines, ts);
  working = merged.lines;
  if (merged.appended === 0 && working.length === before) {
    // A pure in-place revision of the provisional tail still changes stored
    // text, so persist it — but there is nothing new for the renderer to show.
    scheduleFlush();
    return;
  }
  if (working.length > WORKING_MAX) {
    const spill = working.length - WORKING_KEEP;
    archive = [...archive, ...working.slice(0, spill)];
    working = working.slice(spill);
    if (archive.length > STORE_MAX_LINES) {
      archive = archive.slice(-STORE_MAX_LINES);
    }
  }
  scheduleFlush();
  notifyRenderer();
}

function handleLine(raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith('{')) return;
  let msg: { type?: string; t?: number; lines?: string[] | string; message?: string };
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  switch (msg.type) {
    case 'attached':
      attached = true;
      lastError = '';
      notifyRendererNow();
      break;
    case 'waiting':
      attached = false;
      notifyRendererNow();
      break;
    case 'detached':
      attached = false;
      lastError = msg.message || '';
      notifyRendererNow();
      break;
    case 'snapshot': {
      // PowerShell's ConvertTo-Json unwraps a one-element array into a bare
      // string, so a single-line snapshot arrives as a string, not an array.
      const lines = Array.isArray(msg.lines)
        ? msg.lines
        : typeof msg.lines === 'string'
          ? [msg.lines]
          : [];
      if (lines.length) applySnapshot(lines, Number(msg.t) || Date.now());
      break;
    }
    default:
      break;
  }
}

export function startLiveCaptionsCapture(): { ok: boolean; error?: string } {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Live Captions capture is Windows-only.' };
  }
  if (child) return { ok: true };
  load();
  try {
    writePoller();
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: stateDir() },
    );
    child = proc;
    lastError = '';

    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      buf += chunk;
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) handleLine(line);
      if (buf.length > 64_000) buf = ''; // never let a stuck partial line grow
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      const t = chunk.trim();
      if (t) lastError = t.slice(0, 400);
    });
    proc.on('exit', () => {
      if (child === proc) {
        child = null;
        attached = false;
        flush();
        notifyRendererNow();
      }
    });
    proc.on('error', (err) => {
      lastError = err.message;
      if (child === proc) {
        child = null;
        attached = false;
        notifyRendererNow();
      }
    });
    writeEnabled(true);
    notifyRendererNow();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastError = message;
    child = null;
    return { ok: false, error: message };
  }
}

export function stopLiveCaptionsCapture(): { ok: boolean } {
  const proc = child;
  child = null;
  attached = false;
  if (proc) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  writeEnabled(false);
  flush();
  notifyRendererNow();
  return { ok: true };
}

export function getLiveCaptionsStatus(): LiveCaptionsStatus {
  if (process.platform !== 'win32') {
    return {
      supported: false,
      capturing: false,
      attached: false,
      enabled: false,
      lineCount: 0,
      scriptCount: 0,
    };
  }
  load();
  const lines = allLines();
  return {
    supported: true,
    capturing: Boolean(child),
    attached,
    enabled: readEnabled(),
    lineCount: lines.length,
    scriptCount: segmentScripts(lines).length,
    lastLineAt: lines.length ? lines[lines.length - 1]!.ts : undefined,
    error: lastError || undefined,
  };
}

/** Every captured script, oldest first. */
export function listLiveCaptionScripts(gapMs = DEFAULT_SCRIPT_GAP_MS): CaptionScript[] {
  if (process.platform !== 'win32') return [];
  load();
  return segmentScripts(allLines(), gapMs);
}

/** Drop everything captured so far. */
export function clearLiveCaptions(): { ok: boolean } {
  archive = [];
  working = [];
  dirty = true;
  flush();
  notifyRendererNow();
  return { ok: true };
}

export function registerLiveCaptionsIpc(getWindow: () => BrowserWindow | null): void {
  mainWindow = getWindow();
  ipcMain.handle('liveCaptions:status', () => {
    mainWindow = getWindow();
    return getLiveCaptionsStatus();
  });
  ipcMain.handle('liveCaptions:start', () => {
    mainWindow = getWindow();
    const r = startLiveCaptionsCapture();
    return { ...r, status: getLiveCaptionsStatus() };
  });
  ipcMain.handle('liveCaptions:stop', () => {
    const r = stopLiveCaptionsCapture();
    return { ...r, status: getLiveCaptionsStatus() };
  });
  ipcMain.handle('liveCaptions:scripts', () => listLiveCaptionScripts());
  ipcMain.handle('liveCaptions:clear', () => ({
    ...clearLiveCaptions(),
    status: getLiveCaptionsStatus(),
  }));

  app.on('before-quit', () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    const proc = child;
    child = null;
    if (proc) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
    flush();
  });

  // "Automatic" means automatic across restarts too — if the user left capture
  // on, resume it without making them re-arm it every launch.
  if (process.platform === 'win32' && readEnabled()) {
    startLiveCaptionsCapture();
  }
}
