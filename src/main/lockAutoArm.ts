/**
 * Main arms the lock by itself (lock3): after a stretch with no keyboard or
 * mouse input anywhere on the PC, when the PC goes to sleep, and when Windows
 * locks. Each is an opt-in in Settings -> Lockscreen, stored in main's lock
 * record (`lockscreenPin.ts` `autoLock`), so a renderer cannot switch it off
 * while the app is locked. Nothing here can unlock.
 *
 * Idle is the SYSTEM idle time (`powerMonitor.getSystemIdleTime`), not Gum's
 * own: leaving the PC is what the lock is for. Media playing in any Gum window
 * (a video, an episode, audio) counts as activity: `trackMediaActivity` listens to
 * every webContents' `media-started-playing` / `media-paused`, and the idle clock
 * restarts from the moment playback stops, so a two-hour film does not lock the
 * app the second it ends. Settings says so next to the choice.
 *
 * No `electron` import: the power monitor is passed in, so the policy runs
 * under plain vitest. main.ts hands it Electron's `powerMonitor`.
 */
import type { AutoLockOptions } from '../shared/lockStatus';

export type AutoLockReason = 'idle' | 'sleep' | 'screen-lock';

export interface PowerMonitorLike {
  on(event: 'suspend' | 'lock-screen', listener: () => void): unknown;
  getSystemIdleTime(): number;
}

export interface LockAutoArmDeps {
  power: PowerMonitorLike;
  options(): AutoLockOptions;
  /** True when a PIN exists (without one there is nothing to arm). */
  canLock(): boolean;
  isLocked(): boolean;
  /** Arm the lock; returns whether it is locked now. */
  lock(reason: AutoLockReason): boolean;
  /** Media playback in Gum's windows (`trackMediaActivity`); absent = system idle only. */
  media?: Pick<MediaActivity, 'secondsSinceMedia'>;
  setInterval?(fn: () => void, ms: number): unknown;
  clearInterval?(handle: unknown): void;
  log?(message: string): void;
}

// ---- media playback as activity --------------------------------------------------

/** The slice of Electron's `WebContents` the tracker listens to. */
export interface MediaWebContentsLike {
  id: number;
  on(event: 'media-started-playing' | 'media-paused' | 'destroyed', listener: () => void): unknown;
}

/** The slice of Electron's `app` the tracker listens to. */
export interface MediaAppLike {
  on(event: 'web-contents-created', listener: (event: unknown, contents: MediaWebContentsLike) => void): unknown;
}

export interface MediaActivity {
  /** Some Gum window is playing media right now. */
  playing(): boolean;
  /** 0 while playing; seconds since playback last stopped; null when nothing has played. */
  secondsSinceMedia(): number | null;
}

/**
 * Which of Gum's webContents are playing media. Every window, pop-out and webview
 * is a webContents, so `web-contents-created` covers them all; `existing` are the
 * ones made before the tracker was installed. A destroyed webContents stops
 * counting (a window closed mid-video never sends `media-paused`).
 */
export function trackMediaActivity(
  app: MediaAppLike,
  existing: readonly MediaWebContentsLike[] = [],
  now: () => number = Date.now,
): MediaActivity {
  const playingIds = new Set<number>();
  let lastStoppedAt: number | null = null;
  const stop = (id: number) => {
    if (playingIds.delete(id) && playingIds.size === 0) lastStoppedAt = now();
  };
  const watch = (wc: MediaWebContentsLike) => {
    const id = wc.id;
    wc.on('media-started-playing', () => {
      playingIds.add(id);
    });
    wc.on('media-paused', () => stop(id));
    wc.on('destroyed', () => stop(id));
  };
  for (const wc of existing) watch(wc);
  app.on('web-contents-created', (_event, wc) => watch(wc));
  return {
    playing: () => playingIds.size > 0,
    secondsSinceMedia: () => {
      if (playingIds.size > 0) return 0;
      if (lastStoppedAt === null) return null;
      return Math.max(0, (now() - lastStoppedAt) / 1000);
    },
  };
}

export const IDLE_POLL_MS = 15_000;

export interface LockAutoArm {
  /** One idle check now (the poll's body; tests call it directly). */
  checkIdle(): boolean;
  stop(): void;
}

export function installLockAutoArm(deps: LockAutoArmDeps): LockAutoArm {
  const setI = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearI = deps.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  const arm = (reason: AutoLockReason): boolean => {
    try {
      if (deps.isLocked() || !deps.canLock()) return false;
      const did = deps.lock(reason);
      if (did) deps.log?.(`auto-lock: ${reason}`);
      return did;
    } catch {
      return false;
    }
  };
  const safeOptions = (): AutoLockOptions | null => {
    try {
      return deps.options();
    } catch {
      return null;
    }
  };
  deps.power.on('suspend', () => {
    if (safeOptions()?.onSleep) arm('sleep');
  });
  deps.power.on('lock-screen', () => {
    if (safeOptions()?.onScreenLock) arm('screen-lock');
  });
  const checkIdle = (): boolean => {
    const minutes = safeOptions()?.idleMinutes ?? 0;
    if (minutes <= 0) return false;
    let idleSeconds = 0;
    try {
      idleSeconds = deps.power.getSystemIdleTime();
    } catch {
      return false;
    }
    // Media playing (or stopped only a moment ago) is activity, not absence.
    try {
      const sinceMedia = deps.media?.secondsSinceMedia() ?? null;
      if (sinceMedia !== null) idleSeconds = Math.min(idleSeconds, sinceMedia);
    } catch {
      /* the tracker is advisory: fall back to the system idle time */
    }
    if (idleSeconds < minutes * 60) return false;
    return arm('idle');
  };
  const timer = setI(checkIdle, IDLE_POLL_MS);
  // A poll must never keep the process alive on its own.
  (timer as { unref?: () => void } | undefined)?.unref?.();
  return {
    checkIdle,
    stop: () => clearI(timer),
  };
}
