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
}

const EMPTY: OnboardingState = { completedAt: null, replays: 0, lastStepId: null };

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
  save({ ...current, completedAt: current.completedAt ?? new Date().toISOString(), lastStepId: null });
}

export function rememberStep(stepId: string): void {
  save({ ...loadOnboarding(), lastStepId: stepId });
}

/** Settings → Help → Replay. Re-arms the tour without erasing that it ran. */
export function replayTour(): void {
  const current = loadOnboarding();
  save({ completedAt: null, replays: current.replays + 1, lastStepId: null });
}
