/**
 * Whether the first-boot tour has run. Audit `T1`.
 *
 * The plan requires the tour to fire "exactly once" and to be replayable from
 * Settings. Those are two different questions, so this stores a completion
 * record rather than a boolean: `completedAt` answers "has it ever run", and a
 * replay clears it back to `null` without pretending the first run never
 * happened (`replays` keeps counting).
 *
 * Reads rebuild from known keys only. A corrupt or half-written value must not
 * be able to suppress the tour forever — the failure mode that matters here is
 * *silently never showing it*, which looks identical to the bug this closes.
 */
const KEY = 'jp-study.onboarding.v1';

export interface OnboardingState {
  /** ISO timestamp of the first completed (or skipped) run, else `null`. */
  completedAt: string | null;
  /** How many times the user replayed it from Settings. */
  replays: number;
  /** The step the user was on when they last left, for a resumed run. */
  lastStepId: string | null;
  /**
   * Chapters walked to their last step. The chapter menu ticks them; nothing
   * else depends on it, so a lost list only loses the ticks.
   */
  chaptersDone: string[];
  /**
   * The chapter a replay asked for (Help or Start → one chapter). Read once by
   * the overlay when it takes the replay, so it starts there instead of at the
   * welcome step.
   */
  requestedChapter: string | null;
}

const EMPTY: OnboardingState = { completedAt: null, replays: 0, lastStepId: null, chaptersDone: [], requestedChapter: null };

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    // Known-key rebuild: anything else in the blob is dropped rather than
    // carried forward, so a stale shape cannot persist across versions.
    return {
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
      replays: typeof parsed.replays === 'number' && parsed.replays >= 0 ? Math.floor(parsed.replays) : 0,
      lastStepId: typeof parsed.lastStepId === 'string' ? parsed.lastStepId : null,
      chaptersDone: Array.isArray(parsed.chaptersDone)
        ? [...new Set(parsed.chaptersDone.filter((id): id is string => typeof id === 'string'))].slice(0, 64)
        : [],
      requestedChapter: typeof parsed.requestedChapter === 'string' ? parsed.requestedChapter : null,
    };
  } catch {
    // Unparseable storage means we have no evidence the tour ran. Showing it a
    // second time is a small annoyance; never showing it is the defect.
    return { ...EMPTY };
  }
}

function save(state: OnboardingState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A tour that cannot persist still runs; it just may run again.
  }
}

/** True on a fresh profile, false once the user has finished or skipped it. */
export function shouldRunTour(): boolean {
  return loadOnboarding().completedAt === null;
}

/** Called on finish *and* on skip — both mean "do not fire again unprompted". */
export function markTourComplete(): void {
  const current = loadOnboarding();
  save({
    ...current,
    completedAt: current.completedAt ?? new Date().toISOString(),
    lastStepId: null,
    requestedChapter: null,
  });
}

/** A step id, or `TOUR_MENU_ID` for the chapter menu, so a tour left there resumes at the menu. */
export function rememberStep(stepId: string): void {
  save({ ...loadOnboarding(), lastStepId: stepId });
}

/** A chapter walked to its last step; the menu ticks it. */
export function markChapterDone(chapterId: string): void {
  const current = loadOnboarding();
  if (current.chaptersDone.includes(chapterId)) return;
  save({ ...current, chaptersDone: [...current.chaptersDone, chapterId] });
}

/** The chapter a replay asked for, consumed by the overlay that takes it. */
export function takeRequestedChapter(): string | null {
  const current = loadOnboarding();
  if (!current.requestedChapter) return null;
  save({ ...current, requestedChapter: null });
  return current.requestedChapter;
}

/**
 * Fired when the armed/disarmed state changes in THIS window. `TourOverlay`
 * reads `shouldRunTour()` once, at mount, so before this existed Settings →
 * Help → Replay wrote `completedAt: null`, printed "The tour will start again
 * now." and rendered nothing — measured live 2026-08-30: `.tour-root` stayed at
 * 0 while `replays` went 8 → 9. The message was true only of the NEXT app
 * start, which is not what "now" means.
 */
const REPLAY_EVENT = 'jp:onboarding-replay';

/**
 * The overlay's receipt: raised by whatever actually put a tour on screen.
 *
 * It exists because the status line is not the receipt. On THIS branch the
 * measurement is starker than a stale flag — `git cat-file -e
 * HEAD:src/renderer/components/onboarding/TourOverlay.tsx` fails: the overlay,
 * its stylesheet, its step script and its `App.tsx` mount are all untracked
 * work stranded since 2026-08-05, present only on the archive snapshot
 * `c41e78b8`. `HelpPage` and this store were committed without them in
 * `b63846ea`, so the shipped branch has a "Replay tour" button that says "The
 * tour will start again now" and CANNOT start anything.
 *
 * So the button reports what happened rather than what it asked for: armed, or
 * armed AND started. That is honest today, and becomes the success message on
 * its own the moment the overlay lands — no second change needed.
 */
const STARTED_EVENT = 'jp:onboarding-started';

/** Called by an overlay that has just put itself on screen. */
export function announceTourStarted(): void {
  window.dispatchEvent(new CustomEvent(STARTED_EVENT));
}

/** Subscribe to that receipt. Returns an unsubscribe fn. */
export function onTourStarted(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener(STARTED_EVENT, handler);
  return () => window.removeEventListener(STARTED_EVENT, handler);
}

/**
 * Subscribe to re-arming. Two sources, because the tour and the button that
 * re-arms it are not always in the same renderer:
 *
 * - the same-window `CustomEvent`, for Settings inside a desktop `.fwin`;
 * - the cross-window `storage` event, for `?popout=settings`, which is its own
 *   BrowserWindow and shares only the origin's localStorage. Without the second
 *   one the same false success comes back for anyone who pops Settings out.
 */
export function onTourArmChanged(cb: () => void): () => void {
  const onCustom = (): void => cb();
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === KEY) cb();
  };
  window.addEventListener(REPLAY_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(REPLAY_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Settings → Help → Replay, the Start menu's "Guided tour", and a chapter
 * picked on Help. Re-arms the tour without erasing that it ran; with a
 * chapter, the overlay starts at that chapter's first step.
 */
export function replayTour(chapterId?: string): void {
  const current = loadOnboarding();
  save({
    completedAt: null,
    replays: current.replays + 1,
    lastStepId: null,
    chaptersDone: current.chaptersDone,
    requestedChapter: chapterId ?? null,
  });
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT));
}
