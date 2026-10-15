/**
 * Main arms the lock by itself (lock3): after a stretch with no keyboard or
 * mouse input anywhere on the PC, when the PC goes to sleep, and when Windows
 * locks. Each is an opt-in in Settings -> Lockscreen, stored in main's lock
 * record (`lockscreenPin.ts` `autoLock`), so a renderer cannot switch it off
 * while the app is locked. Nothing here can unlock.
 *
 * Idle is the SYSTEM idle time (`powerMonitor.getSystemIdleTime`), not Gum's
 * own: leaving the PC is what the lock is for. Media playing in any Gum window
 * (a video, an episode, audio) counts as activity when the viewer can hear it or
 * see it: `trackMediaActivity` hears every webContents' `media-started-playing` /
 * `media-paused` and re-checks the real state on each poll, and the idle clock
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
  /**
   * Media playback in Gum's windows (`trackMediaActivity`); absent = system idle only.
   * `refresh` (when given) runs before each poll's check.
   */
  media?: Pick<MediaActivity, 'secondsSinceMedia'> & Partial<Pick<MediaActivity, 'refresh'>>;
  setInterval?(fn: () => void, ms: number): unknown;
  clearInterval?(handle: unknown): void;
  log?(message: string): void;
}

// ---- media playback as activity --------------------------------------------------

/** A frame of a webContents (Electron's `WebFrameMain`), for the visible-video look. */
export interface MediaFrameLike {
  executeJavaScript(code: string): Promise<unknown>;
}

/**
 * The slice of Electron's `WebContents` the tracker uses. The optional members are
 * how it re-checks what the events claim; a contents without them (a test stub) is
 * taken at its events' word.
 */
export interface MediaWebContentsLike {
  id: number;
  on(event: 'media-started-playing' | 'media-paused' | 'destroyed', listener: () => void): unknown;
  isDestroyed?(): boolean;
  /** Chromium's own "this tab makes sound": false for muted, silent or `--mute-audio` output. */
  isCurrentlyAudible?(): boolean;
  executeJavaScript?(code: string): Promise<unknown>;
  mainFrame?: { framesInSubtree: readonly MediaFrameLike[] } | null;
}

/** The slice of Electron's `app` the tracker listens to. */
export interface MediaAppLike {
  on(event: 'web-contents-created', listener: (event: unknown, contents: MediaWebContentsLike) => void): unknown;
}

export interface MediaActivity {
  /** Some Gum window is playing media the viewer can hear or see, right now. */
  playing(): boolean;
  /** 0 while playing; seconds since playback last stopped; null when nothing has played. */
  secondsSinceMedia(): number | null;
  /** Looks again at every contents that has played media (the idle poll runs it first). */
  refresh(): Promise<void>;
}

export const IDLE_POLL_MS = 15_000;
/** A look at a contents' videos that has not answered by then counts as "nothing seen". */
export const MEDIA_PROBE_TIMEOUT_MS = 5_000;
/** How long one look's "a video is on screen" holds: two polls and the probe's own time. */
export const MEDIA_SEEN_FRESH_MS = 2 * IDLE_POLL_MS + MEDIA_PROBE_TIMEOUT_MS;

/**
 * Run in each frame: is a video playing where the viewer can see it? A playing video in
 * a hidden or minimized window, under `display: none` (the media workspace's warm
 * player), zero-sized or transparent is not.
 */
export const VISIBLE_VIDEO_PROBE = `(() => {
  if (document.visibilityState !== 'visible') return false;
  for (const v of document.querySelectorAll('video')) {
    if (v.paused || v.ended || v.readyState < 2) continue;
    const r = v.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (typeof v.checkVisibility === 'function' && !v.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    return true;
  }
  return false;
})()`;

interface Watched {
  wc: MediaWebContentsLike;
  /** A `media-started-playing` not yet followed by a `media-paused`. */
  claimed: boolean;
  claimedAt: number;
  /** The last look's answer. */
  seen: { at: number; visible: boolean } | null;
  /** When the look in flight started; null when none is. */
  probing: number | null;
}

/**
 * Which of Gum's webContents are playing media the viewer can hear or see. Every
 * window, pop-out and webview is a webContents, so `web-contents-created` covers them
 * all; `existing` are the ones made before the tracker was installed.
 *
 * The events are only a hint. Chromium sends `media-started-playing` / `media-paused`
 * per media element without saying which, so two players in one window (a song and a
 * clip) used to read as "stopped" when either paused, and one missed `media-paused`
 * would have held the lock off forever. So the real state is re-checked: a contents
 * counts while Chromium says it is audible (`isCurrentlyAudible`, false for muted
 * output), or while a look inside its frames (`VISIBLE_VIDEO_PROBE`, each poll and at
 * each start) finds a video playing on screen. A silent player nobody can see (muted
 * music, a hidden warm video) is not activity, and a look that never answers counts as
 * nothing seen. A destroyed webContents stops counting (a window closed mid-video never
 * sends `media-paused`).
 */
export function trackMediaActivity(
  app: MediaAppLike,
  existing: readonly MediaWebContentsLike[] = [],
  now: () => number = Date.now,
): MediaActivity {
  const watched = new Map<number, Watched>();
  /** The last moment media counted (the idle clock restarts from here). */
  let lastActiveAt: number | null = null;

  const destroyed = (w: Watched): boolean => {
    try {
      return w.wc.isDestroyed?.() === true;
    } catch {
      return true;
    }
  };
  const canLook = (wc: MediaWebContentsLike): boolean => typeof wc.executeJavaScript === 'function' || Boolean(wc.mainFrame);
  const verifiable = (wc: MediaWebContentsLike): boolean => typeof wc.isCurrentlyAudible === 'function' || canLook(wc);
  const active = (w: Watched, t: number): boolean => {
    if (destroyed(w)) return false;
    // A stub that cannot be asked: its events are all there is.
    if (!verifiable(w.wc)) return w.claimed;
    try {
      if (w.wc.isCurrentlyAudible?.()) return true;
    } catch {
      /* gone: not audible */
    }
    if (w.seen?.visible && t - w.seen.at <= MEDIA_SEEN_FRESH_MS) return true;
    // Just started, and the first look is on its way: the event holds for that long.
    return w.claimed && w.probing !== null && w.probing >= w.claimedAt && t - w.probing <= MEDIA_PROBE_TIMEOUT_MS;
  };

  const look = async (w: Watched): Promise<void> => {
    if (!canLook(w.wc) || destroyed(w)) return;
    const startedAt = now();
    w.probing = startedAt;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const frames = w.wc.mainFrame?.framesInSubtree;
      const exec = w.wc.executeJavaScript?.bind(w.wc);
      const targets: MediaFrameLike[] = frames?.length ? [...frames] : exec ? [{ executeJavaScript: exec }] : [];
      const answers = targets.map((frame) => Promise.resolve()
        .then(() => frame.executeJavaScript(VISIBLE_VIDEO_PROBE))
        .then((answer) => answer === true, () => false));
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), MEDIA_PROBE_TIMEOUT_MS);
        (timer as { unref?: () => void }).unref?.();
      });
      visible = await Promise.race([Promise.all(answers).then((list) => list.some(Boolean)), timeout]);
    } catch {
      visible = false;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    // A newer look started meanwhile: its answer is the one that counts.
    if (w.probing !== startedAt) return;
    w.probing = null;
    const t = now();
    w.seen = { at: t, visible };
    if (visible) lastActiveAt = t;
  };

  /** Playback stopped (or the contents went): the idle clock restarts if it counted. */
  const stopped = (w: Watched) => {
    const t = now();
    if (active(w, t)) lastActiveAt = t;
    w.claimed = false;
    w.seen = null;
  };
  const watch = (wc: MediaWebContentsLike) => {
    const w: Watched = { wc, claimed: false, claimedAt: 0, seen: null, probing: null };
    wc.on('media-started-playing', () => {
      watched.set(wc.id, w);
      w.claimed = true;
      w.claimedAt = now();
      void look(w);
    });
    wc.on('media-paused', () => {
      stopped(w);
      // Another player in the same contents may still be going.
      void look(w);
    });
    wc.on('destroyed', () => {
      stopped(w);
      watched.delete(wc.id);
    });
  };
  for (const wc of existing) watch(wc);
  app.on('web-contents-created', (_event, wc) => watch(wc));

  const anyActive = (): boolean => {
    const t = now();
    let any = false;
    for (const [id, w] of watched) {
      if (destroyed(w)) {
        watched.delete(id);
        continue;
      }
      if (active(w, t)) any = true;
    }
    if (any) lastActiveAt = t;
    return any;
  };
  return {
    playing: anyActive,
    secondsSinceMedia: () => {
      if (anyActive()) return 0;
      if (lastActiveAt === null) return null;
      return Math.max(0, (now() - lastActiveAt) / 1000);
    },
    refresh: async () => {
      await Promise.all([...watched.values()].map((w) => look(w)));
    },
  };
}

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
  // Each poll looks at the media again first, so a stale "playing" cannot hold the lock off.
  const poll = (): void => {
    // Idle lock off: nothing to look at.
    if ((safeOptions()?.idleMinutes ?? 0) <= 0) return;
    let refreshed: Promise<void> | undefined;
    try {
      refreshed = deps.media?.refresh?.();
    } catch {
      refreshed = undefined;
    }
    if (!refreshed) {
      checkIdle();
      return;
    }
    void refreshed.then(
      () => checkIdle(),
      () => checkIdle(),
    );
  };
  const timer = setI(poll, IDLE_POLL_MS);
  // A poll must never keep the process alive on its own.
  (timer as { unref?: () => void } | undefined)?.unref?.();
  return {
    checkIdle,
    stop: () => clearI(timer),
  };
}
