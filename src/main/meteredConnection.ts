/**
 * Is the internet connection metered? Asked before an AUTOMATIC update check,
 * because on Squirrel a check is also the download (a full package is ~385 MB).
 *
 * Electron has no API for this and Chromium's `navigator.connection` does not
 * expose it on desktop. Windows does, through WinRT
 * (`NetworkInformation.GetInternetConnectionProfile().GetConnectionCost()`),
 * which Windows PowerShell 5.1 can load. One hidden, non-interactive
 * `powershell.exe` with a timeout; any failure is "cannot tell" (null), and the
 * caller then checks as it always did — the guard only ever skips, never blocks.
 *
 * Metered = the cost type is Fixed or Variable (a data plan, a "metered
 * connection" toggle in Windows Settings), or the connection is roaming or over
 * its data limit.
 */
import { execFile } from 'node:child_process';

export type ConnectionCost = 'unrestricted' | 'metered' | 'unknown';

export const METERED_PROBE_TIMEOUT_MS = 8_000;

const PROBE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[void][Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]',
  '$p = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()',
  "if ($null -eq $p) { 'none' } else { $c = $p.GetConnectionCost(); '{0}|{1}|{2}' -f $c.NetworkCostType, $c.Roaming, $c.OverDataLimit }",
].join('; ');

/** `Unrestricted|False|False` -> unrestricted; `Fixed|...`, `...|True|...` -> metered. */
export function parseConnectionCost(stdout: string): ConnectionCost {
  const line = String(stdout || '').trim().split(/\r?\n/).pop()?.trim() ?? '';
  const [costType = '', roaming = '', overLimit = ''] = line.split('|').map((s) => s.trim().toLowerCase());
  if (!costType || costType === 'none') return 'unknown';
  if (roaming === 'true' || overLimit === 'true') return 'metered';
  if (costType === 'fixed' || costType === 'variable') return 'metered';
  if (costType === 'unrestricted') return 'unrestricted';
  return 'unknown';
}

export type ProbeRunner = (file: string, args: readonly string[], timeoutMs: number) => Promise<string>;

const defaultRunner: ProbeRunner = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout))),
    );
  });

export async function probeConnectionCost(
  run: ProbeRunner = defaultRunner,
  platform: string = process.platform,
): Promise<ConnectionCost> {
  if (platform !== 'win32') return 'unknown';
  try {
    const out = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PROBE_SCRIPT],
      METERED_PROBE_TIMEOUT_MS,
    );
    return parseConnectionCost(out);
  } catch {
    return 'unknown';
  }
}

/** The updater's guard shape: true metered, false not, null cannot tell. */
export async function isConnectionMetered(run?: ProbeRunner, platform?: string): Promise<boolean | null> {
  const cost = await probeConnectionCost(run, platform);
  return cost === 'unknown' ? null : cost === 'metered';
}
