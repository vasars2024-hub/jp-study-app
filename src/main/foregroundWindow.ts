/**
 * The title of the window in front — which video, stream or game a clip mined
 * from system audio came from. Windows-only; '' anywhere else, when the window
 * in front is Gum itself, or when the lookup takes too long.
 *
 * One short PowerShell call per mine (not a resident process): mining is a
 * deliberate, occasional act, and it runs alongside the audio cut and encode,
 * so its time is hidden behind theirs.
 */
import { execFile } from 'node:child_process';

const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Add-Type -Namespace GumFg -Name W -MemberDefinition \'',
  '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();',
  '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);',
  '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);',
  "'",
  '$h = [GumFg.W]::GetForegroundWindow()',
  '$sb = New-Object System.Text.StringBuilder 512',
  '[void][GumFg.W]::GetWindowText($h, $sb, 512)',
  '$p = [uint32]0',
  '[void][GumFg.W]::GetWindowThreadProcessId($h, [ref]$p)',
  'Write-Output ("" + $p + "|" + $sb.ToString())',
].join('\n');

const TIMEOUT_MS = 4000;

/** `pid|title` → the title, unless it is this process's own window. */
export function parseForegroundOutput(stdout: string, ownPid: number = process.pid): string {
  const line = stdout.split(/\r?\n/).find((l) => /^\d+\|/.test(l.trim()));
  if (!line) return '';
  const trimmed = line.trim();
  const bar = trimmed.indexOf('|');
  const pid = Number(trimmed.slice(0, bar));
  const title = trimmed.slice(bar + 1).trim();
  if (!title || pid === ownPid) return '';
  return title.slice(0, 300);
}

export function foregroundWindowTitle(): Promise<string> {
  if (process.platform !== 'win32') return Promise.resolve('');
  return new Promise((resolve) => {
    try {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
        { windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8', maxBuffer: 64 * 1024 },
        (error, stdout) => resolve(error ? '' : parseForegroundOutput(String(stdout ?? ''))),
      );
    } catch {
      resolve('');
    }
  });
}
