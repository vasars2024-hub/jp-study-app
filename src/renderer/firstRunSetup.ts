/**
 * First-run setup: the record behind the guided "get studying in three
 * minutes" flow (study language, level, downloads, Anki, look) and the
 * "first five minutes" checklist that follows it.
 *
 * Small and dependency-light on purpose: `App.tsx` reads it synchronously at
 * boot to decide whether to lazy-load the setup dialog at all, so it must not
 * drag anything into the Study OS boot graph (`studyOsBootGraph.test.ts`).
 *
 * Who sees the setup: a profile with no record here AND no completed tour —
 * that is, a genuinely fresh profile. Someone upgrading from a build without
 * this flow already finished (or skipped) the tour, so they are not shown a
 * setup for an app they have been using; they can run it from Settings > Help.
 *
 * Resumable: the current step is persisted on every move, and "Later" only
 * hides the dialog for this session, so the next launch picks it up again at
 * the same step. Skippable: "Skip setup" records `skipped` and never re-fires.
 */
import { writeLocalStorageJson } from './localStorageWrite';
import { loadOnboarding } from './onboardingStore';

export const FIRST_RUN_KEY = 'jp-study.firstRun.v1';
/** Same-window change notice; other windows hear the `storage` event. */
export const FIRST_RUN_CHANGED_EVENT = 'jp:first-run-changed';

export const FIRST_RUN_STEPS = ['language', 'level', 'downloads', 'anki', 'theme', 'finish'] as const;
export type FirstRunStepId = (typeof FIRST_RUN_STEPS)[number];

export const FIRST_STEPS_TASKS = ['lookup', 'mine', 'review', 'media'] as const;
export type FirstStepsTaskId = (typeof FIRST_STEPS_TASKS)[number];

export const LEVEL_BANDS = ['beginner', 'elementary', 'intermediate', 'upper', 'advanced'] as const;
export type LevelBand = (typeof LEVEL_BANDS)[number];

export const FIRST_RUN_THEMES = ['study-os', 'aero', 'wired', 'blanc'] as const;
export type FirstRunTheme = (typeof FIRST_RUN_THEMES)[number];

export type FirstRunStatus = 'pending' | 'done' | 'skipped';

export interface FirstRunState {
  status: FirstRunStatus;
  step: FirstRunStepId;
  level: LevelBand | null;
  /** How many words the level step marked known (0 when the user opted out). */
  seededKnown: number;
  theme: FirstRunTheme | null;
  finishedAt: string | null;
  /** ISO time each first-steps task was first seen done, else null. */
  checklist: Record<FirstStepsTaskId, string | null>;
  checklistDismissed: boolean;
  /** When the checklist began counting; null = never armed (existing profiles). */
  checklistStartedAt: string | null;
  /** Deck size when the checklist armed, so "mine a sentence" means a NEW card. */
  deckBaseline: number | null;
}

function emptyChecklist(): Record<FirstStepsTaskId, string | null> {
  return { lookup: null, mine: null, review: null, media: null };
}

function fresh(): FirstRunState {
  return {
    status: 'pending',
    step: 'language',
    level: null,
    seededKnown: 0,
    theme: null,
    finishedAt: null,
    checklist: emptyChecklist(),
    checklistDismissed: false,
    checklistStartedAt: null,
    deckBaseline: null,
  };
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null;
}

/** Raw record, or null when none was ever written (or it is unreadable). */
function readRecord(): FirstRunState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(FIRST_RUN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FirstRunState> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const base = fresh();
    const checklist = emptyChecklist();
    const rawList = (parsed.checklist ?? {}) as Partial<Record<string, unknown>>;
    for (const id of FIRST_STEPS_TASKS) {
      const at = rawList[id];
      checklist[id] = typeof at === 'string' ? at : null;
    }
    return {
      status: oneOf(['pending', 'done', 'skipped'] as const, parsed.status) ?? base.status,
      step: oneOf(FIRST_RUN_STEPS, parsed.step) ?? base.step,
      level: oneOf(LEVEL_BANDS, parsed.level),
      seededKnown:
        typeof parsed.seededKnown === 'number' && parsed.seededKnown >= 0 ? Math.floor(parsed.seededKnown) : 0,
      theme: oneOf(FIRST_RUN_THEMES, parsed.theme),
      finishedAt: typeof parsed.finishedAt === 'string' ? parsed.finishedAt : null,
      checklist,
      checklistDismissed: parsed.checklistDismissed === true,
      checklistStartedAt: typeof parsed.checklistStartedAt === 'string' ? parsed.checklistStartedAt : null,
      deckBaseline:
        typeof parsed.deckBaseline === 'number' && parsed.deckBaseline >= 0 ? Math.floor(parsed.deckBaseline) : null,
    };
  } catch {
    return null;
  }
}

export function loadFirstRun(): FirstRunState {
  return readRecord() ?? fresh();
}

function save(state: FirstRunState): void {
  writeLocalStorageJson(FIRST_RUN_KEY, state);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FIRST_RUN_CHANGED_EVENT));
}

export function patchFirstRun(patch: Partial<FirstRunState>): FirstRunState {
  const next = { ...loadFirstRun(), ...patch };
  save(next);
  return next;
}

/** "Later" hides the dialog for the rest of this session only. */
let deferredThisSession = false;

/**
 * Should the setup dialog show now? A record in `pending` resumes; no record
 * at all only counts on a fresh profile (the tour has never been finished).
 */
export function firstRunSetupPending(): boolean {
  if (deferredThisSession) return false;
  const record = readRecord();
  if (record) return record.status === 'pending';
  return loadOnboarding().completedAt === null;
}

export function deferFirstRunSetup(): void {
  deferredThisSession = true;
  // Persist the record (and its step) so the next launch resumes rather than
  // re-deriving "fresh profile" from the tour state.
  save(loadFirstRun());
}

/** Finish or skip. Both arm the first-steps checklist. */
export function closeFirstRunSetup(outcome: 'done' | 'skipped', deckSize: number | null = null): FirstRunState {
  const current = loadFirstRun();
  return patchFirstRun({
    status: outcome,
    step: outcome === 'done' ? 'finish' : current.step,
    finishedAt: new Date().toISOString(),
    checklistStartedAt: current.checklistStartedAt ?? new Date().toISOString(),
    deckBaseline: current.deckBaseline ?? deckSize,
  });
}

/** Settings > Help > "Run setup again". Keeps the checklist's progress. */
export function restartFirstRunSetup(): void {
  deferredThisSession = false;
  patchFirstRun({ status: 'pending', step: 'language' });
}

export function markFirstStepDone(task: FirstStepsTaskId, at = new Date()): boolean {
  const current = loadFirstRun();
  if (!current.checklistStartedAt || current.checklist[task]) return false;
  save({ ...current, checklist: { ...current.checklist, [task]: at.toISOString() } });
  return true;
}

export function dismissFirstStepsChecklist(): void {
  patchFirstRun({ checklistDismissed: true });
}

export function firstStepsDoneCount(state: FirstRunState = loadFirstRun()): number {
  return FIRST_STEPS_TASKS.filter((id) => state.checklist[id]).length;
}

/** Whether the checklist card belongs on screen. */
export function firstStepsChecklistVisible(state: FirstRunState = loadFirstRun()): boolean {
  if (state.status === 'pending' || !state.checklistStartedAt || state.checklistDismissed) return false;
  return true;
}

/** Subscribe to changes from this window and from other windows. */
export function onFirstRunChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onCustom = (): void => cb();
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === FIRST_RUN_KEY) cb();
  };
  window.addEventListener(FIRST_RUN_CHANGED_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(FIRST_RUN_CHANGED_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

/** Test seam: forget the in-memory "Later". */
export function resetFirstRunSessionForTests(): void {
  deferredThisSession = false;
}

/**
 * How many of the most common words each self-estimated band marks known.
 * Applied to the bundled starter frequency list of the study language, so the
 * real count is capped by that list's length (a few hundred words).
 */
export const LEVEL_SEED_COUNTS: Record<LevelBand, number> = {
  beginner: 0,
  elementary: 100,
  intermediate: 250,
  upper: 400,
  advanced: Number.POSITIVE_INFINITY,
};
