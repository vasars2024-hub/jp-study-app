/**
 * Which scheduler a local deck uses, and the one call every review goes through.
 *
 * Before this file there was exactly one schedule, hardcoded: the SM-2 in
 * `localSrs.ts`. It still exists, unchanged, and is still the default — a user
 * who never opens the setting keeps the intervals their deck already has. What
 * this adds is the seam and a second implementation behind it, so the choice is
 * a setting rather than a rewrite.
 *
 * The load-bearing rule is that switching algorithms must not silently
 * reinterpret numbers. An SM-2 state carries an `ease`; an FSRS state carries
 * `stability` and `difficulty`; the two are not convertible without lying about
 * where they came from. So a state records which scheduler wrote it, and a
 * state handed to the OTHER scheduler is ADAPTED explicitly and once —
 * `adaptStateForAlgorithm` below — rather than having its fields read as if
 * they meant the same thing.
 *
 * Reset is a first-class operation for the same reason. There is no arithmetic
 * that turns a well-scheduled SM-2 card into a well-scheduled FSRS card, so a
 * user who wants a clean model gets a real reset instead of a silent one.
 *
 * Same-day steps (`learningSteps.ts`) sit in front of both schedulers. The
 * defaults reproduce the schedule this app always had — no learning steps, one
 * ten-minute relearning step — so turning steps on is the user's choice, and
 * Anki's "1m 10m" is one click away in the settings panel.
 *
 * FSRS follows Anki's FSRS-5 day model (`studyDay.ts`): a study day starts at
 * the configured hour (4 am by default); a review on the same study day as the
 * last one is FSRS-5's short-term step, anything later is a long-term review
 * over WHOLE study days; and a review card is due from the start of its due
 * day, so it can be reviewed any time that day, exactly as in Anki. The
 * optimiser trains on the same day rule, so a fit means what it was fitted on.
 *
 * FSRS-5 or FSRS-6 is a setting (`fsrsVersion`), FSRS-5 for every config
 * written before FSRS-6 existed, so an upgrade moves no interval. Presets are
 * Anki's deck option presets: a named set of the per-deck settings (retention,
 * maximum interval, steps, leech rule, FSRS version and parameters) that deck
 * folders are assigned to. The top-level fields are the Default preset, which
 * every folder without an assignment uses — again, exactly what it used before
 * presets existed. `schedulingConfigForFolder` is the one resolution.
 */
import {
  defaultFsrsWeights,
  fsrsInterval,
  fsrsMemoryFromSm2,
  fsrsReview,
  fsrsShortTermReview,
  fsrsVersionOf,
  isValidFsrsWeights,
  upgradeFsrsWeights,
  type FsrsGrade,
  type FsrsMemory,
  type FsrsVersion,
} from './fsrs';
import {
  DEFAULT_RELEARNING_STEPS,
  isInSteps,
  normalizeSteps,
  stepTransition,
  type SrsPhase,
} from './learningSteps';
import {
  LOCAL_SRS_DEFAULT_EASE,
  LOCAL_SRS_MIN_EASE,
  isLocalSrsState,
  scheduleLocalReview,
  type LocalSrsAlgorithm,
  type LocalSrsRating,
  type LocalSrsState,
} from './localSrs';
import { fuzzedInterval } from './srsFuzz';
import {
  DEFAULT_DAY_START_HOUR,
  normalizeDayStartHour,
  startOfStudyDayIndex,
  studyDayIndex,
  studyDaysBetween,
} from './studyDay';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_INTERVAL_CEILING = 36_500;

/** What a card that keeps lapsing gets: a tag only, or a tag and a suspension. */
export type LeechAction = 'tag' | 'suspend';

export interface SchedulingConfig {
  algorithm: LocalSrsAlgorithm;
  /**
   * FSRS only: the recall probability the intervals aim at. Higher means being
   * asked more often, not less — 0.95 is a stricter standard than 0.90.
   */
  desiredRetention: number;
  /** Both schedulers. A hard ceiling the user can lower; never raises one. */
  maximumIntervalDays: number;
  /** Same-day steps for a new card, in minutes. Empty: graduate on first Good. */
  learningStepsMinutes: number[];
  /** Same-day steps after a lapse, in minutes. Empty: straight back to a 1-day interval. */
  relearningStepsMinutes: number[];
  /**
   * Spread reviews: a small deterministic jitter on intervals of 3 days or more
   * (Anki's fuzz ranges), choosing the least-loaded day inside that range when
   * the caller can say how loaded each day is. Off by default so an existing
   * deck's intervals do not move on upgrade.
   */
  fuzz: boolean;
  /** Lapses at which a card becomes a leech (and again every half of it after). */
  leechThreshold: number;
  leechAction: LeechAction;
  /**
   * FSRS: a personal fit from `fsrsOptimizer.ts`, or parameters adopted from
   * an Anki import. Nineteen weights are FSRS-5's, twenty-one FSRS-6's. Absent
   * means the defaults of `fsrsVersion`.
   */
  fsrsWeights?: number[];
  /**
   * FSRS-5 or FSRS-6. 5 for every config written before FSRS-6 was offered, so
   * nobody's intervals change until they choose 6. See `effectiveFsrsWeights`
   * for how a stored fit of the other version is treated.
   */
  fsrsVersion: FsrsVersion;
  /** Named presets of the per-deck settings (Anki's deck option presets). */
  presets: SchedulingPreset[];
  /** Deck folder name → preset id. A folder without an entry uses the Default preset (the fields above). */
  folderPresets: Record<string, string>;
  /**
   * FSRS parameters read from the deck options of an imported Anki package.
   * Shown in Settings and adopted only when the user asks; never applied by
   * the import itself.
   */
  ankiFsrsImport?: AnkiFsrsImport;
  /**
   * Hour (0-23, local) at which a new study day starts: Anki's "next day
   * starts at". Decides same-day reviews, whole elapsed days, due days, the
   * new-card budget and every stats day.
   */
  dayStartHour: number;
  /**
   * Anki's learn-ahead limit, in minutes: when nothing else is left in a
   * sitting, a card in its steps due within this long is shown early. A step
   * due later than that is waited for, not skipped.
   */
  learnAheadMinutes: number;
}

/**
 * One named preset: the settings Anki keeps per deck options preset. The
 * algorithm, fuzz, the day start and the learn-ahead limit stay collection-wide,
 * as they are in Anki.
 */
export interface SchedulingPreset {
  id: string;
  name: string;
  desiredRetention: number;
  maximumIntervalDays: number;
  learningStepsMinutes: number[];
  relearningStepsMinutes: number[];
  leechThreshold: number;
  leechAction: LeechAction;
  fsrsVersion: FsrsVersion;
  fsrsWeights?: number[];
}

/** The fields a preset overrides; everything else comes from the top level. */
export type PresetSettings = Omit<SchedulingPreset, 'id' | 'name'>;

/** What an Anki package's deck options said about FSRS. */
export interface AnkiFsrsImport {
  /** Nineteen (FSRS-5) or twenty-one (FSRS-6) weights, inside their bounds. */
  weights: number[];
  /** The preset's (or the deck's own) desired retention, when it had one. */
  desiredRetention?: number;
  /** The preset's maximum interval in days, when it had one. */
  maximumIntervalDays?: number;
  /** Anki's name for the preset, e.g. "Default" or "Japanese". */
  presetName?: string;
  /** The Anki deck the imported cards came from. */
  deckName?: string;
  /** The package's file name. */
  fileName?: string;
  importedAt: number;
}

export const DEFAULT_LOCAL_LEECH_THRESHOLD = 8;
export const DEFAULT_LEARN_AHEAD_MINUTES = 20;
export const MAX_LEARN_AHEAD_MINUTES = 1440;
/** More presets than this is a list nobody can assign from. */
export const MAX_SCHEDULING_PRESETS = 24;
/** The id the Default preset (the top-level settings) answers to. */
export const DEFAULT_PRESET_ID = 'default';

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  // SM-2, because it is what every existing deck is already scheduled by.
  algorithm: 'sm2',
  desiredRetention: 0.9,
  maximumIntervalDays: MAX_INTERVAL_CEILING,
  learningStepsMinutes: [],
  relearningStepsMinutes: [...DEFAULT_RELEARNING_STEPS],
  fuzz: false,
  leechThreshold: DEFAULT_LOCAL_LEECH_THRESHOLD,
  leechAction: 'tag',
  dayStartHour: DEFAULT_DAY_START_HOUR,
  learnAheadMinutes: DEFAULT_LEARN_AHEAD_MINUTES,
  fsrsVersion: 5,
  presets: [],
  folderPresets: {},
};

export const MIN_LOCAL_RETENTION = 0.7;
export const MAX_LOCAL_RETENTION = 0.97;

function normalizeRetention(value: unknown, fallback: number): number {
  const retention = Number(value);
  return value !== null && value !== undefined && Number.isFinite(retention)
    ? Math.min(MAX_LOCAL_RETENTION, Math.max(MIN_LOCAL_RETENTION, retention))
    : fallback;
}

function normalizeMaximum(value: unknown, fallback: number): number {
  const maximum = Number(value);
  return Number.isFinite(maximum) && maximum >= 1 ? Math.min(MAX_INTERVAL_CEILING, Math.floor(maximum)) : fallback;
}

function normalizeLeech(value: unknown, fallback: number): number {
  const leech = Number(value);
  return Number.isFinite(leech) && leech >= 2 ? Math.min(99, Math.floor(leech)) : fallback;
}

function normalizeVersion(value: unknown): FsrsVersion {
  return value === 6 ? 6 : 5;
}

/** The settings a preset carries, read from anything and filled from `base`. */
function normalizePresetSettings(value: Partial<PresetSettings> | null | undefined, base: PresetSettings): PresetSettings {
  const settings: PresetSettings = {
    desiredRetention: normalizeRetention(value?.desiredRetention, base.desiredRetention),
    maximumIntervalDays: normalizeMaximum(value?.maximumIntervalDays, base.maximumIntervalDays),
    learningStepsMinutes: normalizeSteps(value?.learningStepsMinutes, base.learningStepsMinutes),
    relearningStepsMinutes: normalizeSteps(value?.relearningStepsMinutes, base.relearningStepsMinutes),
    leechThreshold: normalizeLeech(value?.leechThreshold, base.leechThreshold),
    leechAction: value?.leechAction === 'suspend' ? 'suspend' : value?.leechAction === 'tag' ? 'tag' : base.leechAction,
    fsrsVersion: value?.fsrsVersion === undefined ? base.fsrsVersion : normalizeVersion(value.fsrsVersion),
  };
  if (isValidFsrsWeights(value?.fsrsWeights)) settings.fsrsWeights = [...(value?.fsrsWeights ?? [])];
  return settings;
}

/** The Default preset's settings: the top level of a config. */
export function defaultPresetSettings(config: SchedulingConfig): PresetSettings {
  const settings: PresetSettings = {
    desiredRetention: config.desiredRetention,
    maximumIntervalDays: config.maximumIntervalDays,
    learningStepsMinutes: [...config.learningStepsMinutes],
    relearningStepsMinutes: [...config.relearningStepsMinutes],
    leechThreshold: config.leechThreshold,
    leechAction: config.leechAction,
    fsrsVersion: config.fsrsVersion,
  };
  if (config.fsrsWeights) settings.fsrsWeights = [...config.fsrsWeights];
  return settings;
}

const PRESET_ID = /^[A-Za-z0-9_-]{1,40}$/;

export function normalizeSchedulingPreset(value: unknown, base: PresetSettings): SchedulingPreset | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SchedulingPreset>;
  if (typeof raw.id !== 'string' || !PRESET_ID.test(raw.id) || raw.id === DEFAULT_PRESET_ID) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
  if (!name) return null;
  return { id: raw.id, name, ...normalizePresetSettings(raw, base) };
}

function normalizeAnkiFsrsImport(value: unknown): AnkiFsrsImport | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<AnkiFsrsImport>;
  if (!isValidFsrsWeights(raw.weights)) return undefined;
  const at = Number(raw.importedAt);
  const out: AnkiFsrsImport = { weights: [...raw.weights], importedAt: Number.isFinite(at) && at > 0 ? at : 0 };
  if (raw.desiredRetention !== undefined) {
    const retention = Number(raw.desiredRetention);
    if (Number.isFinite(retention) && retention >= 0.5 && retention <= 0.999) out.desiredRetention = retention;
  }
  const maximum = normalizeMaximum(raw.maximumIntervalDays, 0);
  if (maximum) out.maximumIntervalDays = maximum;
  for (const key of ['presetName', 'deckName', 'fileName'] as const) {
    const text = raw[key];
    if (typeof text === 'string' && text.trim()) out[key] = text.trim().slice(0, 200);
  }
  return out;
}

export function normalizeSchedulingConfig(
  value?: Partial<SchedulingConfig> | null,
): SchedulingConfig {
  const learnAhead = value?.learnAheadMinutes === undefined || value?.learnAheadMinutes === null
    ? Number.NaN
    : Number(value.learnAheadMinutes);
  const config: SchedulingConfig = {
    algorithm: value?.algorithm === 'fsrs' ? 'fsrs' : 'sm2',
    desiredRetention: normalizeRetention(value?.desiredRetention, DEFAULT_SCHEDULING_CONFIG.desiredRetention),
    maximumIntervalDays: normalizeMaximum(value?.maximumIntervalDays, DEFAULT_SCHEDULING_CONFIG.maximumIntervalDays),
    learningStepsMinutes: normalizeSteps(value?.learningStepsMinutes, DEFAULT_SCHEDULING_CONFIG.learningStepsMinutes),
    relearningStepsMinutes: normalizeSteps(
      value?.relearningStepsMinutes,
      DEFAULT_SCHEDULING_CONFIG.relearningStepsMinutes,
    ),
    fuzz: value?.fuzz === true,
    leechThreshold: normalizeLeech(value?.leechThreshold, DEFAULT_LOCAL_LEECH_THRESHOLD),
    leechAction: value?.leechAction === 'suspend' ? 'suspend' : 'tag',
    dayStartHour: normalizeDayStartHour(value?.dayStartHour),
    learnAheadMinutes: Number.isFinite(learnAhead) && learnAhead >= 0
      ? Math.min(MAX_LEARN_AHEAD_MINUTES, Math.round(learnAhead))
      : DEFAULT_LEARN_AHEAD_MINUTES,
    fsrsVersion: normalizeVersion(value?.fsrsVersion),
    presets: [],
    folderPresets: {},
  };
  const weights = value?.fsrsWeights;
  if (isValidFsrsWeights(weights)) config.fsrsWeights = [...weights];

  const base = defaultPresetSettings(config);
  const seen = new Set<string>();
  const rawPresets: unknown[] = Array.isArray(value?.presets) ? value?.presets ?? [] : [];
  for (const raw of rawPresets) {
    const preset = normalizeSchedulingPreset(raw, base);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    config.presets.push(preset);
    if (config.presets.length >= MAX_SCHEDULING_PRESETS) break;
  }
  const folders = value?.folderPresets;
  if (folders && typeof folders === 'object' && !Array.isArray(folders)) {
    for (const [folder, id] of Object.entries(folders)) {
      // An assignment to a preset that is gone is the Default preset: dropped.
      if (typeof id === 'string' && seen.has(id) && folder.trim()) config.folderPresets[folder] = id;
    }
  }
  const imported = normalizeAnkiFsrsImport(value?.ankiFsrsImport);
  if (imported) config.ankiFsrsImport = imported;
  return config;
}

/**
 * The weights the scheduler runs for these settings.
 *
 * - FSRS-6 with a stored FSRS-6 fit: that fit.
 * - FSRS-6 with a stored FSRS-5 fit: the fit carried over unchanged
 *   (`upgradeFsrsWeights`, w19 = 0 and decay 0.5), as Anki does, so turning
 *   FSRS-6 on keeps a personal fit's intervals until the user optimises again.
 * - FSRS-5 with a stored FSRS-6 fit: FSRS-5 cannot run FSRS-6 weights, so the
 *   FSRS-5 defaults run (the fit stays stored for a switch back).
 * - Nothing stored: the version's published defaults.
 */
export function effectiveFsrsWeights(
  settings: Pick<SchedulingConfig, 'fsrsVersion' | 'fsrsWeights'>,
): readonly number[] {
  const stored = settings.fsrsWeights;
  if (settings.fsrsVersion === 6) return stored ? upgradeFsrsWeights(stored) : defaultFsrsWeights(6);
  return stored && fsrsVersionOf(stored) === 5 ? stored : defaultFsrsWeights(5);
}

/** Whether the stored fit is what runs (false: the defaults run, see `effectiveFsrsWeights`). */
export function personalFsrsWeightsInUse(settings: Pick<SchedulingConfig, 'fsrsVersion' | 'fsrsWeights'>): boolean {
  const stored = settings.fsrsWeights;
  if (!stored) return false;
  return settings.fsrsVersion === 6 || fsrsVersionOf(stored) === 5;
}

/** The preset `id` names, or null for the Default preset or an id that no longer exists. */
export function findSchedulingPreset(config: SchedulingConfig, id: string | null | undefined): SchedulingPreset | null {
  if (!id || id === DEFAULT_PRESET_ID) return null;
  return config.presets.find((preset) => preset.id === id) ?? null;
}

/** The settings of one preset (the Default preset's when `id` is not one). */
export function presetSettings(config: SchedulingConfig, id: string | null | undefined): PresetSettings {
  const preset = findSchedulingPreset(config, id);
  if (!preset) return defaultPresetSettings(config);
  const { id: _id, name: _name, ...settings } = preset;
  return settings;
}

/** A whole config with one preset's settings in place of the Default preset's. */
export function schedulingConfigForPreset(config: SchedulingConfig, id: string | null | undefined): SchedulingConfig {
  const preset = findSchedulingPreset(config, id);
  if (!preset) return config;
  const resolved: SchedulingConfig = {
    ...config,
    desiredRetention: preset.desiredRetention,
    maximumIntervalDays: preset.maximumIntervalDays,
    learningStepsMinutes: preset.learningStepsMinutes,
    relearningStepsMinutes: preset.relearningStepsMinutes,
    leechThreshold: preset.leechThreshold,
    leechAction: preset.leechAction,
    fsrsVersion: preset.fsrsVersion,
  };
  if (preset.fsrsWeights) resolved.fsrsWeights = preset.fsrsWeights;
  else delete resolved.fsrsWeights;
  return resolved;
}

/** The preset a deck folder is assigned to, or `DEFAULT_PRESET_ID`. */
export function presetIdForFolder(config: SchedulingConfig, folder: string | null | undefined): string {
  if (!folder) return DEFAULT_PRESET_ID;
  const id = config.folderPresets[folder];
  return id && findSchedulingPreset(config, id) ? id : DEFAULT_PRESET_ID;
}

/** The config a card in `folder` is scheduled with: its folder's preset over the shared settings. */
export function schedulingConfigForFolder(config: SchedulingConfig, folder: string | null | undefined): SchedulingConfig {
  return schedulingConfigForPreset(config, presetIdForFolder(config, folder));
}

/**
 * `config` with one preset's settings changed (the top level for the Default
 * preset). Returns the config unchanged for an id that is not a preset.
 */
export function withPresetSettings(
  config: SchedulingConfig,
  id: string | null | undefined,
  patch: Partial<PresetSettings>,
): SchedulingConfig {
  const preset = findSchedulingPreset(config, id);
  if (!preset) {
    const next: SchedulingConfig = { ...config, ...patch };
    if ('fsrsWeights' in patch && patch.fsrsWeights === undefined) delete next.fsrsWeights;
    return normalizeSchedulingConfig(next);
  }
  const updated: SchedulingPreset = { ...preset, ...patch };
  if ('fsrsWeights' in patch && patch.fsrsWeights === undefined) delete updated.fsrsWeights;
  return normalizeSchedulingConfig({
    ...config,
    presets: config.presets.map((p) => (p.id === preset.id ? updated : p)),
  });
}

/**
 * Add a preset copied from `fromId`'s settings (the Default preset's by
 * default), named `name`. Returns the config and the new id, or null at the
 * preset limit.
 */
export function withNewPreset(
  config: SchedulingConfig,
  name: string,
  fromId: string = DEFAULT_PRESET_ID,
  idSeed = Date.now(),
  overrides: Partial<PresetSettings> = {},
): { config: SchedulingConfig; id: string } | null {
  if (config.presets.length >= MAX_SCHEDULING_PRESETS) return null;
  const taken = new Set(config.presets.map((p) => p.id));
  let n = 0;
  let id = `p${idSeed.toString(36)}`;
  while (taken.has(id)) id = `p${idSeed.toString(36)}-${(n += 1)}`;
  const label = name.trim().slice(0, 60) || id;
  const settings: PresetSettings = { ...presetSettings(config, fromId), ...overrides };
  if ('fsrsWeights' in overrides && overrides.fsrsWeights === undefined) delete settings.fsrsWeights;
  const next = normalizeSchedulingConfig({ ...config, presets: [...config.presets, { id, name: label, ...settings }] });
  return next.presets.some((p) => p.id === id) ? { config: next, id } : null;
}

/** Remove a preset; folders assigned to it go back to the Default preset. */
export function withoutPreset(config: SchedulingConfig, id: string): SchedulingConfig {
  const folderPresets: Record<string, string> = {};
  for (const [folder, assigned] of Object.entries(config.folderPresets)) if (assigned !== id) folderPresets[folder] = assigned;
  return normalizeSchedulingConfig({ ...config, presets: config.presets.filter((p) => p.id !== id), folderPresets });
}

/** Rename a preset (an empty name is refused: the config comes back unchanged). */
export function withPresetName(config: SchedulingConfig, id: string, name: string): SchedulingConfig {
  const label = name.trim().slice(0, 60);
  if (!label) return config;
  return normalizeSchedulingConfig({
    ...config,
    presets: config.presets.map((p) => (p.id === id ? { ...p, name: label } : p)),
  });
}

/** Assign a folder to a preset (`DEFAULT_PRESET_ID` removes the assignment). */
export function withFolderPreset(config: SchedulingConfig, folder: string, id: string): SchedulingConfig {
  const folderPresets = { ...config.folderPresets };
  if (id === DEFAULT_PRESET_ID || !findSchedulingPreset(config, id)) delete folderPresets[folder];
  else folderPresets[folder] = id;
  return normalizeSchedulingConfig({ ...config, folderPresets });
}

/** Which scheduler wrote a state. Version-1 states predate the choice. */
export function stateAlgorithm(state: unknown): LocalSrsAlgorithm | null {
  if (!isLocalSrsState(state)) return null;
  return state.algorithm ?? 'sm2';
}

/**
 * Read an on-disk state, whatever version wrote it, or `undefined`.
 *
 * A version-1 state is stamped as the SM-2 state it always was. Nothing is
 * invented: no stability, no difficulty, no algorithm it never ran under.
 * Anything that is not a valid state at all comes back `undefined`, which every
 * caller already treats as "new card, due now".
 */
export function migrateSrsState(value: unknown): LocalSrsState | undefined {
  if (!isLocalSrsState(value)) return undefined;
  if (value.version === 2 && value.algorithm) return value;
  return { ...value, version: 2, algorithm: value.algorithm ?? 'sm2' };
}

/**
 * A card with no schedule at all: new, due now, no history.
 *
 * Returning `undefined` rather than a zeroed state is the point — every reader
 * in the app already treats a missing `srs` as an unseen card, so a reset card
 * is indistinguishable from one that was never studied, which is what a reset
 * is supposed to mean.
 */
export function resetSrsState(): undefined {
  return undefined;
}

const GRADES: Record<LocalSrsRating, FsrsGrade> = { again: 1, hard: 2, good: 3, easy: 4 };

/**
 * The memory FSRS continues from. A state FSRS wrote carries it. A graduated
 * card that only ever had an SM-2 schedule (a deck switched to FSRS) gets
 * fsrs-rs's `memory_state_from_sm2` estimate from its ease and interval, as
 * Anki does: never a restart as a new card, which sent a 200-day card back
 * after three days. A card still in its first steps has no memory yet.
 */
function memoryOf(state: LocalSrsState | undefined, weights: readonly number[]): FsrsMemory | null {
  if (!state) return null;
  if (state.stability !== undefined && state.difficulty !== undefined) {
    return { stability: state.stability, difficulty: state.difficulty };
  }
  if (state.intervalDays >= 1) return fsrsMemoryFromSm2(state.ease, state.intervalDays, 0.9, weights);
  return null;
}

/**
 * Bring a state under `algorithm` without pretending the old numbers were the
 * new ones.
 *
 * SM-2 → FSRS drops `stability`/`difficulty` if they are somehow present and
 * lets FSRS treat the card as new: the model has no history for it, and an ease
 * factor is not a difficulty. The card keeps its due date and its counts, so
 * the user does not lose their place — only the model restarts.
 *
 * FSRS → SM-2 keeps the ease the state already carries (or the default) and
 * drops the memory pair. Same bargain in the other direction.
 */
export function adaptStateForAlgorithm(
  state: LocalSrsState | undefined,
  algorithm: LocalSrsAlgorithm,
): LocalSrsState | undefined {
  if (!state) return undefined;
  if ((state.algorithm ?? 'sm2') === algorithm) return state;
  // Rebuilt field by field rather than spread-and-delete: the memory pair must
  // be ABSENT, and an `undefined` property still serialises into the store.
  const carried: LocalSrsState = {
    version: 2,
    algorithm,
    dueAt: state.dueAt,
    intervalDays: state.intervalDays,
    ease: Number.isFinite(state.ease) && state.ease >= LOCAL_SRS_MIN_EASE
      ? state.ease
      : LOCAL_SRS_DEFAULT_EASE,
    repetitions: state.repetitions,
    lapses: state.lapses,
    lastReviewedAt: state.lastReviewedAt,
    lastRating: state.lastRating,
  };
  // A card halfway through its steps stays there: the steps are the same for
  // both algorithms.
  if (state.phase) {
    carried.phase = state.phase;
    if (state.step !== undefined) carried.step = state.step;
  }
  return carried;
}

/**
 * Whole study days since the last review: FSRS's `delta_t`, as Anki counts
 * it. 0 is "the same study day", which is what makes a review short-term.
 */
function elapsedStudyDays(state: LocalSrsState | undefined, now: number, config: SchedulingConfig): number {
  if (!state?.lastReviewedAt) return 0;
  return Math.max(0, studyDaysBetween(state.lastReviewedAt, now, config.dayStartHour));
}

/**
 * Due from the START of the study day `intervalDays` after today's: a review
 * card is due for its whole due day, as in Anki, rather than at the minute of
 * the day it was last answered. Step states (minutes) are left alone.
 */
function alignToStudyDay(state: LocalSrsState, config: SchedulingConfig, now: number): LocalSrsState {
  if (state.phase || state.intervalDays < 1) return state;
  const days = Math.round(state.intervalDays);
  const dueAt = startOfStudyDayIndex(studyDayIndex(now, config.dayStartHour) + days, config.dayStartHour);
  return dueAt === state.dueAt ? state : { ...state, dueAt };
}

/** The step list a card in `phase` is walking, or a new card's. */
function stepsFor(phase: SrsPhase, config: SchedulingConfig): number[] {
  return phase === 'relearning' ? config.relearningStepsMinutes : config.learningStepsMinutes;
}

/** A state still inside steps: interval 0, due after the step's delay. */
function inStepState(
  base: LocalSrsState,
  phase: SrsPhase,
  step: number,
  delayMinutes: number,
  now: number,
): LocalSrsState {
  return {
    ...base,
    dueAt: now + Math.round(delayMinutes * MINUTE_MS),
    intervalDays: 0,
    lastReviewedAt: now,
    phase,
    step,
  };
}

/**
 * A graduated card outside steps, with a real day interval: the only state in
 * which an Again counts as a lapse (and so toward the leech threshold).
 *
 * Existing decks: before 2026-10-08 a new card's first Again (no learning
 * steps) and an Again on an interval-0 card each counted as a lapse, so some
 * stored `lapses` (and leech tags) are higher than Anki would show. Stored
 * counts are deliberately NOT rewritten — the review log cannot reliably say
 * which past lapses were spurious — so the inflation only stops growing.
 */
function isReviewState(state: LocalSrsState | undefined): boolean {
  return state !== undefined && !isInSteps(state) && state.intervalDays >= 1;
}

/** Copy without the step fields: the card has left its steps. */
function graduated(state: LocalSrsState): LocalSrsState {
  if (state.phase === undefined && state.step === undefined) return state;
  const rest: LocalSrsState = { ...state };
  delete rest.phase;
  delete rest.step;
  return rest;
}

/** Optional context a caller can give so intervals can be spread. */
export interface ScheduleOptions {
  /** A stable identity for this card (its id). Fuzz is seeded from it. */
  fuzzKey?: string;
  /** How many reviews already fall on the day `dayOffset` days from now. */
  dueLoad?: (dayOffset: number) => number;
}

function applyCeiling(state: LocalSrsState, config: SchedulingConfig, now: number): LocalSrsState {
  if (state.phase || state.intervalDays <= config.maximumIntervalDays) return state;
  // The ceiling is the user's, so it caps the due date too rather than being a
  // display-only number that the schedule ignores.
  return {
    ...state,
    intervalDays: config.maximumIntervalDays,
    dueAt: now + config.maximumIntervalDays * DAY_MS,
  };
}

function applyFuzz(
  state: LocalSrsState,
  config: SchedulingConfig,
  now: number,
  options: ScheduleOptions | undefined,
): LocalSrsState {
  if (!config.fuzz || !options?.fuzzKey || state.phase || state.intervalDays < 1) return state;
  const days = fuzzedInterval(state.intervalDays, {
    seed: `${options.fuzzKey}:${now}`,
    maximumIntervalDays: config.maximumIntervalDays,
    dueLoad: options.dueLoad,
  });
  if (days === state.intervalDays) return state;
  return { ...state, intervalDays: days, dueAt: now + days * DAY_MS };
}

function scheduleSm2(
  prior: LocalSrsState | undefined,
  rating: LocalSrsRating,
  config: SchedulingConfig,
  now: number,
): LocalSrsState {
  const learningNew = !prior && config.learningStepsMinutes.length > 0;
  if (learningNew || (prior && isInSteps(prior))) {
    const phase: SrsPhase = prior?.phase ?? 'learning';
    const outcome = stepTransition(stepsFor(phase, config), prior?.step ?? 0, rating);
    if (outcome.kind === 'step') {
      const base: LocalSrsState = prior ?? {
        version: 2,
        algorithm: 'sm2',
        dueAt: now,
        intervalDays: 0,
        ease: LOCAL_SRS_DEFAULT_EASE,
        repetitions: 0,
        lapses: 0,
        lastReviewedAt: now,
        lastRating: rating,
      };
      return inStepState({ ...base, lastRating: rating }, phase, outcome.step, outcome.delayMinutes, now);
    }
    // Graduating is the day scheduler's first Good (1 day) or Easy (4 days) —
    // the same numbers a card without steps gets, so steps only ADD reviews.
    return scheduleLocalReview(prior ? graduated(prior) : undefined, outcome.easy ? 'easy' : 'good', now);
  }

  if (rating === 'again') {
    // Only a card in review state lapses (Anki's rule). A new card's first
    // Again with no learning steps, or an Again on a legacy interval-0 card, is
    // not a lapse: the day scheduler counts one regardless, so it is undone here.
    const raw = scheduleLocalReview(prior, 'again', now);
    const lapsed = isReviewState(prior) ? raw : { ...raw, lapses: prior?.lapses ?? 0 };
    if (!prior) return lapsed;
    const steps = config.relearningStepsMinutes;
    if (steps.length === 0) {
      // No relearning steps: Anki puts the card straight back at the minimum interval.
      return { ...lapsed, intervalDays: 1, dueAt: now + DAY_MS };
    }
    return inStepState(lapsed, 'relearning', 0, steps[0], now);
  }

  return scheduleLocalReview(prior, rating, now);
}

/** Interval in whole days for a stability, inside the user's ceiling. */
function fsrsDays(stability: number, config: SchedulingConfig, weights: readonly number[]): number {
  const raw = fsrsInterval(stability, config.desiredRetention, weights);
  return Math.min(config.maximumIntervalDays, Math.max(1, Math.round(raw)));
}

/**
 * The memory after rating `grade`: a first sighting, a same-day (short-term)
 * step, or a long-term review over whole study days. fsrs-rs's rule, which is
 * Anki's and the optimiser's.
 */
function nextFsrsMemory(
  prior: FsrsMemory | null,
  grade: FsrsGrade,
  elapsed: number,
  weights: readonly number[],
): FsrsMemory {
  if (!prior) return fsrsReview(null, grade, 0, weights);
  return elapsed === 0 ? fsrsShortTermReview(prior, grade, weights) : fsrsReview(prior, grade, elapsed, weights);
}

/**
 * Hard <= Good < Easy, as Anki and ts-fsrs enforce for FSRS intervals: the
 * model can put Hard above Good (a fitted hard penalty above 1 is legal) or
 * Easy level with Good after rounding, and a button that promises more for a
 * worse answer is a lie. `graduating` is a card leaving its learning steps (or
 * a new card with none), where Hard is not a review answer and only
 * Good < Easy applies.
 */
function orderedFsrsDays(
  rating: Exclude<LocalSrsRating, 'again'>,
  prior: FsrsMemory | null,
  elapsed: number,
  weights: readonly number[],
  config: SchedulingConfig,
  graduating: boolean,
): number {
  const days = (grade: FsrsGrade) => fsrsDays(nextFsrsMemory(prior, grade, elapsed, weights).stability, config, weights);
  const rawGood = days(3);
  const hard = graduating ? 0 : Math.min(days(2), rawGood);
  if (rating === 'hard') return graduating ? days(2) : hard;
  const good = graduating ? rawGood : Math.max(rawGood, hard + 1);
  if (rating === 'good') return good;
  return Math.max(days(4), good + 1);
}

function scheduleFsrs(
  previous: LocalSrsState | undefined,
  rating: LocalSrsRating,
  config: SchedulingConfig,
  now: number,
): LocalSrsState {
  const weights = effectiveFsrsWeights(config);
  const grade = GRADES[rating];
  const prior = memoryOf(previous, weights);
  const elapsed = elapsedStudyDays(previous, now, config);
  const inSteps = previous ? isInSteps(previous) : config.learningStepsMinutes.length > 0;
  // A review on the same STUDY day as the last one is a short-term review
  // (FSRS-5's w17/w18): a step, or a card studied twice tonight even across
  // midnight. A later day is long-term, over whole days. The optimiser
  // (`fsrsOptimizer.ts`) and the replay (`fsrsMemoryReplay.ts`) use this rule.
  const memory = nextFsrsMemory(prior, grade, elapsed, weights);

  const common = {
    version: 2 as const,
    algorithm: 'fsrs' as const,
    ease: previous?.ease ?? LOCAL_SRS_DEFAULT_EASE,
    lastReviewedAt: now,
    lastRating: rating,
    stability: memory.stability,
    difficulty: memory.difficulty,
  };
  const reviewState = (lapses: number, repetitions: number, intervalDays: number): LocalSrsState => (
    { ...common, dueAt: now + intervalDays * DAY_MS, intervalDays, repetitions, lapses }
  );

  if (inSteps) {
    const phase: SrsPhase = previous?.phase ?? 'learning';
    const outcome = stepTransition(stepsFor(phase, config), previous?.step ?? 0, rating);
    if (outcome.kind === 'step') {
      return {
        ...common,
        dueAt: now + Math.round(outcome.delayMinutes * MINUTE_MS),
        intervalDays: 0,
        repetitions: previous?.repetitions ?? 0,
        lapses: previous?.lapses ?? 0,
        phase,
        step: outcome.step,
      };
    }
    const days = rating === 'again'
      ? fsrsDays(memory.stability, config, weights)
      : orderedFsrsDays(outcome.easy ? 'easy' : rating, prior, elapsed, weights, config, true);
    return reviewState(previous?.lapses ?? 0, (previous?.repetitions ?? 0) + 1, days);
  }

  if (rating === 'again') {
    // A lapse is forgetting a card in review state. A brand-new card's first
    // Again (no learning steps) is not one: Anki leaves its lapse count at 0.
    const lapses = (previous?.lapses ?? 0) + (isReviewState(previous) ? 1 : 0);
    const steps = config.relearningStepsMinutes;
    if (steps.length === 0) return reviewState(lapses, 0, fsrsDays(memory.stability, config, weights));
    return {
      ...common,
      dueAt: now + Math.round(steps[0] * MINUTE_MS),
      intervalDays: 0,
      repetitions: 0,
      lapses,
      phase: 'relearning',
      step: 0,
    };
  }

  // A new card with no learning steps graduates on its first answer.
  const days = orderedFsrsDays(rating, prior, elapsed, weights, config, !previous);
  return reviewState(previous?.lapses ?? 0, (previous?.repetitions ?? 0) + 1, days);
}

/**
 * Schedule one review under whichever algorithm the deck is configured for.
 *
 * The single entry point: nothing else in the app should call a scheduler
 * directly, or the setting stops meaning anything on that path.
 */
export function scheduleReview(
  previous: unknown,
  rating: LocalSrsRating,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG,
  now = Date.now(),
  options?: ScheduleOptions,
): LocalSrsState {
  const normalized = normalizeSchedulingConfig(config);
  const at = Number.isFinite(now) ? now : Date.now();
  const prior = adaptStateForAlgorithm(migrateSrsState(previous), normalized.algorithm);
  if (normalized.algorithm === 'fsrs') {
    const next = scheduleFsrs(prior, rating, normalized, at);
    return alignToStudyDay(applyFuzz(applyCeiling(next, normalized, at), normalized, at, options), normalized, at);
  }
  return applyFuzz(applyCeiling(scheduleSm2(prior, rating, normalized, at), normalized, at), normalized, at, options);
}

const RATINGS: LocalSrsRating[] = ['again', 'hard', 'good', 'easy'];

/**
 * What each of the four buttons would do, without doing it.
 *
 * The host already showed Hard/Good/Easy previews by calling the scheduler
 * three times; this makes that one call and covers Again too, so a user can see
 * that Again is a ten-minute step rather than guessing.
 */
export function previewSchedule(
  previous: unknown,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG,
  now = Date.now(),
): Record<LocalSrsRating, number> {
  const at = Number.isFinite(now) ? now : Date.now();
  const preview = {} as Record<LocalSrsRating, number>;
  for (const rating of RATINGS) {
    preview[rating] = scheduleReview(previous, rating, config, at).intervalDays;
  }
  return preview;
}

/**
 * The wait each button would produce, in (fractional) days — what a button
 * label should say. Unlike `previewSchedule` this sees a step: a 1-minute
 * learning step reads as one minute, not as a zero-day interval. Never fuzzed:
 * a preview shows the schedule, the jitter is applied when the grade lands.
 */
export function previewScheduleDelays(
  previous: unknown,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG,
  now = Date.now(),
): Record<LocalSrsRating, number> {
  const at = Number.isFinite(now) ? now : Date.now();
  const preview = {} as Record<LocalSrsRating, number>;
  for (const rating of RATINGS) {
    const next = scheduleReview(previous, rating, config, at);
    // A day interval reads as its days: an FSRS card is due from the start of
    // its due day, so "dueAt - now" would say 2.7 days for a 3-day interval.
    preview[rating] = next.algorithm === 'fsrs' && !next.phase && next.intervalDays >= 1
      ? next.intervalDays
      : Math.max(0, next.dueAt - at) / DAY_MS;
  }
  return preview;
}

/**
 * Whether a lapse count just reached a leech point: the threshold itself, then
 * every half-threshold after it (Anki's rule), so a card that keeps failing is
 * flagged again rather than only once.
 */
export function isLeechLapse(lapses: number, threshold: number): boolean {
  const limit = Math.max(1, Math.floor(threshold));
  if (lapses < limit) return false;
  const every = Math.max(1, Math.ceil(limit / 2));
  return (lapses - limit) % every === 0;
}
