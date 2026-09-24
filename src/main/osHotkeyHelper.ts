/**
 * Windows OS hotkey helper — keeps global accelerators alive even when
 * GrammarX is fully quit. A tiny PowerShell listener starts at logon, owns
 * RegisterHotKey for toggle / restart / open-app chords, and launches the app
 * with `--toggle`, `--restart`, or `--open=<section>`. The running Electron
 * process uses requestSingleInstanceLock so a second launch routes into the
 * existing process.
 *
 * Windows-only. Other platforms return `{ supported: false }`.
 */

import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { parseHotkeyChord } from '../shared/osHotkeyChord';
import { LEGACY_WIN_SECTION_ALIASES } from '../shared/desktop';

export { parseHotkeyChord } from '../shared/osHotkeyChord';

export interface OsHotkeyOpenBinding {
  section: string;
  chord: string;
}

export interface OsHotkeyBindings {
  toggle?: string;
  restart?: string;
  opens?: OsHotkeyOpenBinding[];
}

export interface OsHotkeyStatus {
  supported: boolean;
  installed: boolean;
  running: boolean;
  hotkey: string;
  restartHotkey?: string;
  openCount: number;
  error?: string;
}

interface OsHotkeyEntry {
  id: string;
  hotkey: string;
  modifiers: number;
  vk: number;
  actionArgs: string[];
}

interface OsHotkeyConfigV2 {
  version: 2;
  exe: string;
  cwd: string;
  baseArgs: string[];
  hotkeys: OsHotkeyEntry[];
}

/** Legacy single-hotkey config written by older builds. */
interface OsHotkeyConfigV1 {
  hotkey: string;
  modifiers: number;
  vk: number;
  exe: string;
  args: string[];
  cwd: string;
}

const DEFAULT_TOGGLE = 'Ctrl+Alt+Shift+G';
const DEFAULT_RESTART = 'Ctrl+Alt+Shift+R';

const OPEN_SECTIONS = new Set([
  'library',
  'novels',
  'reading',
  'dictionary',
  'grammar',
  'translate',
  'player',
  'video',
  'music',
  'anki',
  'flashcards',
  'games',
  'stats',
  'resources',
  'city',
  'musicwidget',
  'immersion',
  'calendar',
  'settings',
  'youtube',
  'scraper',
  // Added at gate 7b, and required for the alias above to mean anything: the
  // Files section shipped without ever reaching this list, so `--open=files`
  // was rejected here while main.ts's own ARGV set accepted it.
  'files',
  'visualnovels',
]);

function helperDir(): string {
  return path.join(app.getPath('userData'), 'os-hotkey');
}

function configPath(): string {
  return path.join(helperDir(), 'config.json');
}

function scriptPath(): string {
  return path.join(helperDir(), 'helper.ps1');
}

function startupCmdPath(): string {
  const startup = path.join(
    process.env.APPDATA || app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
  );
  return path.join(startup, 'GrammarX-OS-Hotkey.cmd');
}

function pidPath(): string {
  return path.join(helperDir(), 'helper.pid');
}

function firstChord(raw: string | undefined): string {
  if (!raw) return '';
  return raw.split('|')[0]!.trim();
}

function isMouseChord(chord: string): boolean {
  return /Mouse(Left|Middle|Right|4|5)/i.test(chord);
}

function buildEntry(
  id: string,
  chord: string,
  actionArgs: string[],
): OsHotkeyEntry | { error: string } {
  const hotkey = firstChord(chord);
  if (!hotkey || isMouseChord(hotkey)) {
    return { error: `Skip invalid OS chord for ${id}.` };
  }
  const parsed = parseHotkeyChord(hotkey);
  if (!parsed) {
    return { error: `OS hotkey needs modifiers plus a letter, digit, or F-key (${id}).` };
  }
  return {
    id,
    hotkey,
    modifiers: parsed.modifiers,
    vk: parsed.vk,
    actionArgs,
  };
}

function launchBase(): { exe: string; cwd: string; baseArgs: string[] } {
  const exe = process.execPath;
  const baseArgs: string[] = [];
  if (!app.isPackaged) {
    baseArgs.push(app.getAppPath());
  }
  return {
    exe,
    cwd: app.isPackaged ? path.dirname(exe) : process.cwd(),
    baseArgs,
  };
}

function normalizeBindings(input: OsHotkeyBindings | string | undefined): OsHotkeyBindings {
  // Back-compat: older callers passed a single toggle string.
  if (typeof input === 'string') {
    return { toggle: input || DEFAULT_TOGGLE, opens: [] };
  }
  return {
    toggle: input?.toggle?.trim() || DEFAULT_TOGGLE,
    restart: input?.restart?.trim() || '',
    opens: Array.isArray(input?.opens) ? input!.opens! : [],
  };
}

function buildConfig(bindings: OsHotkeyBindings): OsHotkeyConfigV2 | { error: string } {
  const normalized = normalizeBindings(bindings);
  const base = launchBase();
  const hotkeys: OsHotkeyEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: OsHotkeyEntry | { error: string }, required: boolean): string | null => {
    if ('error' in entry) return required ? entry.error : null;
    const sig = `${entry.modifiers}:${entry.vk}`;
    if (seen.has(sig)) {
      return required
        ? `Duplicate OS chord "${entry.hotkey}" — each hotkey must be unique.`
        : null;
    }
    seen.add(sig);
    hotkeys.push(entry);
    return null;
  };

  const toggleEntry = buildEntry('toggle', normalized.toggle || DEFAULT_TOGGLE, ['--toggle']);
  const toggleErr = push(toggleEntry, true);
  if (toggleErr) return { error: toggleErr };

  if (normalized.restart) {
    const restartEntry = buildEntry('restart', normalized.restart, ['--restart']);
    const restartErr = push(restartEntry, true);
    if (restartErr) return { error: restartErr };
  }

  for (const open of normalized.opens || []) {
    const requested = String(open.section || '')
      .trim()
      .toLowerCase();
    // The config on disk outlives a section. A user who bound a chord to the
    // Notebook before gate 7b deleted it keeps a working hotkey, pointed at the
    // Files app that absorbed it, rather than one that silently stops firing.
    const section = LEGACY_WIN_SECTION_ALIASES[requested] ?? requested;
    if (!OPEN_SECTIONS.has(section)) continue;
    const chord = firstChord(open.chord);
    if (!chord || isMouseChord(chord)) continue;
    const entry = buildEntry(`open:${section}`, chord, [`--open=${section}`]);
    const err = push(entry, true);
    if (err) return { error: err };
  }

  return {
    version: 2,
    exe: base.exe,
    cwd: base.cwd,
    baseArgs: base.baseArgs,
    hotkeys,
  };
}

function migrateConfig(raw: unknown): OsHotkeyConfigV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version === 2 && Array.isArray(obj.hotkeys)) {
    return raw as OsHotkeyConfigV2;
  }
  // Legacy v1: single toggle chord baked into args.
  const v1 = raw as Partial<OsHotkeyConfigV1>;
  if (typeof v1.exe === 'string' && typeof v1.hotkey === 'string') {
    const args = Array.isArray(v1.args) ? v1.args.map(String) : [];
    const baseArgs = args.filter((a) => a !== '--toggle' && a !== '--grammarx-toggle');
    return {
      version: 2,
      exe: v1.exe,
      cwd: typeof v1.cwd === 'string' ? v1.cwd : '',
      baseArgs,
      hotkeys: [
        {
          id: 'toggle',
          hotkey: v1.hotkey,
          modifiers: Number(v1.modifiers) || 0,
          vk: Number(v1.vk) || 0,
          actionArgs: ['--toggle'],
        },
      ],
    };
  }
  return null;
}

const HELPER_PS1 = `# GrammarX OS hotkey helper — multi-hotkey Startup listener.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $here 'config.json'
$pidPath = Join-Path $here 'helper.pid'
$logPath = Join-Path $here 'helper.error.log'
Set-Content -Path $pidPath -Value $PID -Encoding ascii

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class GxHotkeyBinding {
  public int Id;
  public uint Mods;
  public uint Vk;
  public string Args;
}

public class GxHotkeyForm : Form {
  public const int WM_HOTKEY = 0x0312;
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  private readonly string _exe;
  private readonly string _cwd;
  private readonly string _log;
  private readonly List<GxHotkeyBinding> _bindings = new List<GxHotkeyBinding>();
  public GxHotkeyForm(string exe, string cwd, string logPath) {
    _exe = exe; _cwd = cwd; _log = logPath;
    ShowInTaskbar = false;
    WindowState = FormWindowState.Minimized;
    FormBorderStyle = FormBorderStyle.FixedToolWindow;
    Opacity = 0;
    ShowIcon = false;
  }
  public void AddBinding(int id, uint mods, uint vk, string args) {
    _bindings.Add(new GxHotkeyBinding { Id = id, Mods = mods, Vk = vk, Args = args ?? "" });
  }
  protected override void SetVisibleCore(bool value) {
    base.SetVisibleCore(false);
  }
  protected override void OnHandleCreated(EventArgs e) {
    base.OnHandleCreated(e);
    foreach (var b in _bindings) {
      if (!RegisterHotKey(Handle, b.Id, b.Mods, b.Vk)) {
        throw new InvalidOperationException(
          "RegisterHotKey failed for id " + b.Id + " — the shortcut is already in use (close Gum or pick another chord).");
      }
    }
  }
  protected override void WndProc(ref Message m) {
    if (m.Msg == WM_HOTKEY) {
      int id = m.WParam.ToInt32();
      foreach (var b in _bindings) {
        if (b.Id != id) continue;
        try {
          var psi = new ProcessStartInfo {
            FileName = _exe,
            Arguments = b.Args,
            WorkingDirectory = string.IsNullOrEmpty(_cwd) ? Environment.CurrentDirectory : _cwd,
            UseShellExecute = false,
          };
          Process.Start(psi);
        } catch (Exception ex) {
          try { File.AppendAllText(_log, DateTime.Now + " launch: " + ex.Message + Environment.NewLine); } catch {}
        }
        break;
      }
    }
    base.WndProc(ref m);
  }
  protected override void OnFormClosed(FormClosedEventArgs e) {
    foreach (var b in _bindings) {
      try { UnregisterHotKey(Handle, b.Id); } catch {}
    }
    base.OnFormClosed(e);
  }
}
"@ -ReferencedAssemblies System.Windows.Forms

function Read-Config {
  if (-not (Test-Path $configPath)) { throw "Missing config: $configPath" }
  Get-Content -Raw -Path $configPath | ConvertFrom-Json
}

function Quote-Arg([string]$a) {
  if ($null -eq $a) { return '""' }
  if ($a -match '\\s') { return '"' + ($a -replace '"', '\\"') + '"' }
  return $a
}

function Start-HotkeyLoop($cfg) {
  $baseQuoted = @()
  if ($null -ne $cfg.baseArgs) {
    $baseQuoted = @($cfg.baseArgs | ForEach-Object { Quote-Arg ([string]$_) })
  }
  $form = New-Object GxHotkeyForm([string]$cfg.exe, [string]$cfg.cwd, $logPath)
  $i = 0
  foreach ($hk in @($cfg.hotkeys)) {
    $i++
    $actionQuoted = @()
    if ($null -ne $hk.actionArgs) {
      $actionQuoted = @($hk.actionArgs | ForEach-Object { Quote-Arg ([string]$_) })
    }
    $all = @($baseQuoted) + @($actionQuoted)
    $argLine = ($all -join ' ').Trim()
    $form.AddBinding(
      [int]$i,
      [uint32]$hk.modifiers,
      [uint32]$hk.vk,
      [string]$argLine
    )
  }
  if ($i -lt 1) { throw "No hotkeys configured." }
  $null = $form.Handle
  [System.Windows.Forms.Application]::Run($form)
}

try {
  if (Test-Path $logPath) { Remove-Item $logPath -Force -ErrorAction SilentlyContinue }
  $cfg = Read-Config
  # Migrate legacy single-hotkey shape in-process if needed.
  if ($null -eq $cfg.version -or $cfg.version -ne 2) {
    $baseArgs = @()
    if ($null -ne $cfg.args) {
      $baseArgs = @($cfg.args | Where-Object { $_ -ne '--toggle' -and $_ -ne '--grammarx-toggle' })
    }
    $legacy = [pscustomobject]@{
      version = 2
      exe = [string]$cfg.exe
      cwd = [string]$cfg.cwd
      baseArgs = $baseArgs
      hotkeys = @(
        [pscustomobject]@{
          id = 'toggle'
          hotkey = [string]$cfg.hotkey
          modifiers = [uint32]$cfg.modifiers
          vk = [uint32]$cfg.vk
          actionArgs = @('--toggle')
        }
      )
    }
    $cfg = $legacy
  }
  Start-HotkeyLoop $cfg
} catch {
  $_ | Out-File -FilePath $logPath -Encoding utf8
  exit 1
} finally {
  Remove-Item -Path $pidPath -ErrorAction SilentlyContinue
}
`;

function writeHelperFiles(config: OsHotkeyConfigV2): void {
  fs.mkdirSync(helperDir(), { recursive: true });
  fs.writeFileSync(scriptPath(), HELPER_PS1, 'utf8');
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

function writeStartupCmd(): void {
  const cmd = `@echo off\r\npowershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath()}"\r\n`;
  fs.mkdirSync(path.dirname(startupCmdPath()), { recursive: true });
  fs.writeFileSync(startupCmdPath(), cmd, 'utf8');
}

function readPid(): number | null {
  try {
    const raw = fs.readFileSync(pidPath(), 'utf8').trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — install is rare and must confirm the helper stayed up */
  }
}

function stopHelperProcess(): void {
  const pid = readPid();
  if (pid && isPidAlive(pid)) {
    try {
      process.kill(pid);
    } catch {
      /* already gone */
    }
  }
  try {
    fs.unlinkSync(pidPath());
  } catch {
    /* ignore */
  }
  if (process.platform === 'win32') {
    try {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*os-hotkey*helper.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { windowsHide: true, timeout: 5000 },
      );
    } catch {
      /* ignore */
    }
  }
  sleepSync(400);
}

function startHelperProcess(): { ok: boolean; error?: string } {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'OS hotkey helper is Windows-only.' };
  }
  stopHelperProcess();
  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: helperDir(),
      },
    );
    child.unref();
    for (let i = 0; i < 25; i++) {
      sleepSync(100);
      const errPath = path.join(helperDir(), 'helper.error.log');
      if (fs.existsSync(errPath)) {
        const msg = fs.readFileSync(errPath, 'utf8').trim();
        return { ok: false, error: msg || 'Helper failed to start.' };
      }
      const pid = readPid();
      if (pid && isPidAlive(pid)) return { ok: true };
    }
    return {
      ok: false,
      error:
        'Helper did not stay running. If Gum still holds the shortcut, remove and reinstall the helper.',
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function readStoredConfig(): OsHotkeyConfigV2 | null {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as unknown;
    return migrateConfig(raw);
  } catch {
    return null;
  }
}

export function isOsHotkeyHelperInstalled(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    return fs.existsSync(startupCmdPath()) && fs.existsSync(configPath()) && fs.existsSync(scriptPath());
  } catch {
    return false;
  }
}

export function getOsHotkeyStatus(): OsHotkeyStatus {
  if (process.platform !== 'win32') {
    return { supported: false, installed: false, running: false, hotkey: DEFAULT_TOGGLE, openCount: 0 };
  }
  const installed = isOsHotkeyHelperInstalled();
  let hotkey = DEFAULT_TOGGLE;
  let restartHotkey: string | undefined;
  let openCount = 0;
  const cfg = readStoredConfig();
  if (cfg) {
    const toggle = cfg.hotkeys.find((h) => h.id === 'toggle');
    if (toggle?.hotkey) hotkey = toggle.hotkey;
    const restart = cfg.hotkeys.find((h) => h.id === 'restart');
    if (restart?.hotkey) restartHotkey = restart.hotkey;
    openCount = cfg.hotkeys.filter((h) => h.id.startsWith('open:')).length;
  }
  const pid = readPid();
  const running = Boolean(pid && isPidAlive(pid));
  return { supported: true, installed, running, hotkey, restartHotkey, openCount };
}

export function installOsHotkeyHelper(
  bindings: OsHotkeyBindings | string = { toggle: DEFAULT_TOGGLE },
): { ok: boolean; error?: string; status: OsHotkeyStatus } {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'OS hotkey helper is Windows-only.',
      status: getOsHotkeyStatus(),
    };
  }
  const built = buildConfig(normalizeBindings(bindings));
  if ('error' in built) {
    return { ok: false, error: built.error, status: getOsHotkeyStatus() };
  }
  try {
    writeHelperFiles(built);
    writeStartupCmd();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: getOsHotkeyStatus(),
    };
  }
  const started = startHelperProcess();
  return { ok: started.ok, error: started.error, status: getOsHotkeyStatus() };
}

export function uninstallOsHotkeyHelper(): { ok: boolean; error?: string; status: OsHotkeyStatus } {
  if (process.platform !== 'win32') {
    return { ok: true, status: getOsHotkeyStatus() };
  }
  stopHelperProcess();
  try {
    fs.unlinkSync(startupCmdPath());
  } catch {
    /* ignore */
  }
  return { ok: true, status: getOsHotkeyStatus() };
}

/** Rewrite helper chords (and relaunch) when the user rebinds shortcuts. */
export function syncOsHotkeyHelperBindings(
  bindings: OsHotkeyBindings | string,
): { ok: boolean; error?: string; status: OsHotkeyStatus } {
  if (!isOsHotkeyHelperInstalled()) {
    return { ok: true, status: getOsHotkeyStatus() };
  }
  const built = buildConfig(normalizeBindings(bindings));
  if ('error' in built) {
    return { ok: false, error: built.error, status: getOsHotkeyStatus() };
  }
  try {
    writeHelperFiles(built);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: getOsHotkeyStatus(),
    };
  }
  const started = startHelperProcess();
  return { ok: started.ok, error: started.error, status: getOsHotkeyStatus() };
}

/** @deprecated Prefer syncOsHotkeyHelperBindings — kept for any leftover callers. */
export function syncOsHotkeyHelperChord(hotkey: string): { ok: boolean; error?: string } {
  const res = syncOsHotkeyHelperBindings({ toggle: hotkey || DEFAULT_TOGGLE });
  return { ok: res.ok, error: res.error };
}

function parseBindingsArg(raw: unknown): OsHotkeyBindings {
  if (typeof raw === 'string') return { toggle: raw };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const opens: OsHotkeyOpenBinding[] = [];
    if (Array.isArray(o.opens)) {
      for (const item of o.opens) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        if (typeof row.section === 'string' && typeof row.chord === 'string') {
          opens.push({ section: row.section, chord: row.chord });
        }
      }
    }
    return {
      toggle: typeof o.toggle === 'string' ? o.toggle : DEFAULT_TOGGLE,
      restart: typeof o.restart === 'string' ? o.restart : '',
      opens,
    };
  }
  return { toggle: DEFAULT_TOGGLE, restart: DEFAULT_RESTART, opens: [] };
}

export function registerOsHotkeyHelperIpc(): void {
  ipcMain.handle('osHotkey:status', (): OsHotkeyStatus => getOsHotkeyStatus());
  ipcMain.handle('osHotkey:install', (_e, bindings: unknown) => {
    return installOsHotkeyHelper(parseBindingsArg(bindings));
  });
  ipcMain.handle('osHotkey:sync', (_e, bindings: unknown) => {
    return syncOsHotkeyHelperBindings(parseBindingsArg(bindings));
  });
  ipcMain.handle('osHotkey:uninstall', () => uninstallOsHotkeyHelper());
}
