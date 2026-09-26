/**
 * Kills a child process and everything it started.
 *
 * On Windows a child is NOT reaped with its parent, so a plain `kill()` on
 * yt-dlp leaves its ffmpeg/deno helpers running; `taskkill /T /F` takes the
 * whole tree. Synchronous by design, so it is safe from `exit` handlers and
 * from a deadline timer that must leave "busy" immediately.
 */
import { spawnSync, type ChildProcess } from 'node:child_process';

export function killProcessTree(proc: Pick<ChildProcess, 'pid' | 'kill'> | null | undefined): void {
  if (!proc) return;
  const pid = proc.pid;
  if (process.platform === 'win32' && typeof pid === 'number') {
    try {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      return;
    } catch {
      /* fall through to a direct kill */
    }
  }
  try {
    proc.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}
