/**
 * Knowing when the game is actually running.
 *
 * Launch used to be `shell.openPath(exe)` with no way back: the playtime timer
 * started and ran until the user pressed Stop or quit the app, so an evening
 * with the game closed at 22:00 and the app left open overnight was booked as
 * ten hours of reading. Here the game is a tracked child process, and the
 * session ends when it exits.
 *
 * Launchers complicate that. Many VN executables are a small launcher that
 * starts the real game and exits within seconds (and Locale Emulator's
 * `LEProc.exe` always does exactly that). So a child that exits quickly is not
 * taken as "the game closed": the tracker switches to watching for any of the
 * install folder's executables in the process list, and only when none is
 * running does the session end. If the real process cannot be found at all,
 * the session falls back to capture inactivity: no new line for
 * `IDLE_TIMEOUT_MS` ends it.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import path from 'node:path';

export const LAUNCHER_GRACE_MS = 20_000;
export const PROCESS_POLL_MS = 5_000;
export const IDLE_TIMEOUT_MS = 10 * 60_000;
/** How long to look for the real game after a launcher exits before giving up on names. */
export const FIND_GAME_MS = 45_000;

export type GameTrackingMode = 'child' | 'process-name' | 'idle';

export interface GameTrackerDeps {
  spawn: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  /** Lower-case image names of running processes (e.g. `game.exe`). */
  listProcessNames: () => Promise<Set<string>>;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  /**
   * The child could not be started directly — typically an executable whose
   * manifest demands elevation, which `spawn` refuses (EACCES / error 740) but
   * the shell can start with a UAC prompt. The caller opens it that way; the
   * tracker then follows it by process name.
   */
  onSpawnError?: (error: Error) => void;
}

export interface GameLaunch {
  executablePath: string;
  /** Other executables in the install folder, lower-case base names. */
  candidateNames: readonly string[];
  /** Optional user-installed Locale Emulator `LEProc.exe`. Never bundled. */
  localeEmulatorPath?: string;
}

export interface TrackedGame {
  pid: number | null;
  mode: () => GameTrackingMode;
  /** Call when a line is captured; resets the idle clock. */
  noteActivity: () => void;
  /** Stop watching (does NOT kill the game). */
  dispose: () => void;
}

/** `LEProc.exe -run "<game>"` — Locale Emulator's documented command line. */
export function launchCommand(launch: GameLaunch): { command: string; args: string[] } {
  const le = launch.localeEmulatorPath?.trim();
  if (le && /leproc\.exe$/i.test(le)) return { command: le, args: ['-run', launch.executablePath] };
  return { command: launch.executablePath, args: [] };
}

/** Parse `tasklist /FO CSV /NH` output into lower-case image names. */
export function parseTasklistCsv(output: string): Set<string> {
  const names = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)"/.exec(line.trim());
    if (match) names.add(match[1].toLowerCase());
  }
  return names;
}

/** Executable names worth watching for — never the launcher tooling itself. */
export function candidateGameNames(executablePath: string, relativeFiles: readonly string[]): string[] {
  const ignored = /^(unins|uninstall|crash|unitycrashhandler|dxsetup|vc_redist|config|setup|leproc|lecommonlibrary)/i;
  const names = new Set<string>([path.basename(executablePath).toLowerCase()]);
  for (const file of relativeFiles) {
    const base = path.basename(file).toLowerCase();
    if (base.endsWith('.exe') && !ignored.test(base)) names.add(base);
  }
  return [...names].slice(0, 40);
}

export function trackGame(
  launch: GameLaunch,
  deps: GameTrackerDeps,
  onExit: (reason: GameTrackingMode) => void,
): TrackedGame {
  const now = deps.now ?? Date.now;
  const every = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const stopEvery = deps.clearInterval ?? ((handle: unknown) => clearInterval(handle as NodeJS.Timeout));
  const { command, args } = launchCommand(launch);
  const startedAt = now();
  let mode: GameTrackingMode = 'child';
  let lastActivity = startedAt;
  let timer: unknown = null;
  let finished = false;
  let seenGame = false;
  let watchingSince = 0;
  let polling = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (timer) stopEvery(timer);
    timer = null;
    onExit(mode);
  };

  const watchIdle = (): void => {
    mode = 'idle';
    lastActivity = Math.max(lastActivity, now());
    if (timer) stopEvery(timer);
    timer = every(() => {
      if (now() - lastActivity >= IDLE_TIMEOUT_MS) finish();
    }, PROCESS_POLL_MS);
  };

  const watchNames = (): void => {
    mode = 'process-name';
    watchingSince = now();
    if (timer) stopEvery(timer);
    timer = every(() => {
      if (polling || finished) return;
      polling = true;
      void deps.listProcessNames().then((running) => {
        if (finished) return;
        const alive = launch.candidateNames.some((name) => running.has(name));
        if (alive) seenGame = true;
        else if (seenGame) finish();
        else if (now() - watchingSince > FIND_GAME_MS) watchIdle();
      }).catch(() => {
        if (!finished) watchIdle();
      }).finally(() => {
        polling = false;
      });
    }, PROCESS_POLL_MS);
  };

  const child = deps.spawn(command, args, {
    cwd: path.dirname(launch.executablePath),
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  // The game must outlive the app if the user closes the app first.
  child.unref?.();
  child.once('error', (error) => {
    if (finished) return;
    deps.onSpawnError?.(error);
    watchNames();
  });
  child.once('exit', () => {
    if (finished) return;
    if (now() - startedAt < LAUNCHER_GRACE_MS) watchNames();
    else finish();
  });

  return {
    pid: typeof child.pid === 'number' ? child.pid : null,
    mode: () => mode,
    noteActivity: () => {
      lastActivity = now();
    },
    dispose: () => {
      finished = true;
      if (timer) stopEvery(timer);
      timer = null;
    },
  };
}
