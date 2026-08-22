import type { AgentPermissionLevel, AgentToolOperationId } from './localAgent';

export type AgentProfileRole = 'tutor' | 'media' | 'research' | 'automation' | 'custom';
export type AgentResponseLength = 'brief' | 'balanced' | 'detailed';
export type AgentExplanationDepth = 'simple' | 'standard' | 'deep';
export type AgentResponseLanguage = 'english' | 'japanese' | 'mixed';
export type AgentTeachingStyle = 'academic' | 'casual' | 'immersion' | 'tutor';
export type AgentCorrectionStyle = 'gentle' | 'detailed' | 'strict';

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  role: AgentProfileRole;
  preferredModelFileName: string;
  permission: AgentPermissionLevel;
  enabledOperations: AgentToolOperationId[];
  /**
   * Built-in profiles only. The user's operation edits are stored as a DELTA against the
   * factory list rather than as a copy of it, so a narrowing survives a reload *and* an
   * operation a future version adds to a built-in still appears. `enabledOperations` above
   * is the computed result; these two are what persist.
   */
  disabledOperations?: AgentToolOperationId[];
  addedOperations?: AgentToolOperationId[];
  responseLength: AgentResponseLength;
  explanationDepth: AgentExplanationDepth;
  language: AgentResponseLanguage;
  teachingStyle: AgentTeachingStyle;
  correctionStyle: AgentCorrectionStyle;
  enabled: boolean;
  builtIn?: boolean;
}

export interface AgentProfileStore {
  version: 1;
  activeProfileId: string;
  profiles: AgentProfile[];
}

const ALL_OPERATIONS: AgentToolOperationId[] = [
  'media.search', 'media.add-item', 'media.analyze-subtitles', 'media.generate-profile',
  'media.organize-files', 'media.delete-item', 'anime.search', 'anime.track',
  'anime.check-releases', 'anime.update-metadata', 'anime.analyze-difficulty',
  'anime.fetch-external-metadata', 'visual-novel.search', 'visual-novel.add',
  'visual-novel.track-route', 'visual-novel.extract-text', 'visual-novel.generate-vocabulary',
  'flashcard.list-decks', 'flashcard.create-deck', 'flashcard.add-cards', 'flashcard.delete-cards',
  'flashcard.modify-cards', 'flashcard.schedule-reviews', 'flashcard.delete-deck',
  'flashcard.list-card-presets', 'flashcard.generate-cards',
  'study.get-context', 'study.list-opportunities', 'study.prepare-media',
  'study.filter-vocabulary', 'study.undo-filter', 'study.preview-cards',
  'study.create-cards', 'study.preview-anki', 'study.export-anki',
  'study.resume-session', 'study.open-context',
  'dictionary.lookup', 'dictionary.explain-grammar', 'dictionary.analyze-sentence',
  'dictionary.search-knowledge', 'calendar.list', 'calendar.schedule-session',
  'calendar.create-reminder', 'calendar.delete-event', 'settings.read',
  'settings.change-preference', 'settings.configure-module', 'settings.reset',
  'settings.preview-theme', 'settings.apply-theme', 'settings.reset-theme', 'settings.undo-theme',
  'settings.preview-css', 'settings.apply-css', 'settings.reset-css',
];
const OPERATIONS = new Set<AgentToolOperationId>(ALL_OPERATIONS);
const PROFILE_ROLES = new Set<AgentProfileRole>(['tutor', 'media', 'research', 'automation', 'custom']);
const PERMISSIONS = new Set<AgentPermissionLevel>(['read-only', 'limited-actions', 'full-automation']);
const RESPONSE_LENGTHS = new Set<AgentResponseLength>(['brief', 'balanced', 'detailed']);
const EXPLANATION_DEPTHS = new Set<AgentExplanationDepth>(['simple', 'standard', 'deep']);
const LANGUAGES = new Set<AgentResponseLanguage>(['english', 'japanese', 'mixed']);
const TEACHING_STYLES = new Set<AgentTeachingStyle>(['academic', 'casual', 'immersion', 'tutor']);
const CORRECTION_STYLES = new Set<AgentCorrectionStyle>(['gentle', 'detailed', 'strict']);

const TUTOR_OPERATIONS: AgentToolOperationId[] = [
  'dictionary.lookup', 'dictionary.explain-grammar', 'dictionary.analyze-sentence',
  'dictionary.search-knowledge', 'flashcard.list-decks', 'flashcard.add-cards', 'flashcard.delete-cards',
  'flashcard.create-deck', 'flashcard.list-card-presets', 'flashcard.generate-cards',
  'calendar.list', 'calendar.schedule-session',
  'study.get-context', 'study.list-opportunities', 'study.filter-vocabulary',
  'study.undo-filter', 'study.preview-cards', 'study.create-cards',
  'study.preview-anki', 'study.export-anki', 'study.resume-session', 'study.open-context',
];
const MEDIA_OPERATIONS: AgentToolOperationId[] = [
  'media.search', 'media.add-item', 'media.analyze-subtitles', 'media.generate-profile',
  'dictionary.search-knowledge', 'dictionary.lookup', 'anime.search', 'anime.analyze-difficulty',
  'study.get-context', 'study.list-opportunities', 'study.prepare-media',
  'study.filter-vocabulary', 'study.undo-filter', 'study.preview-cards',
  'study.create-cards', 'study.preview-anki', 'study.export-anki',
  'study.resume-session', 'study.open-context',
];
const RESEARCH_OPERATIONS: AgentToolOperationId[] = [
  'dictionary.search-knowledge', 'dictionary.lookup', 'media.search', 'anime.search',
  'visual-novel.search', 'calendar.list', 'settings.read',
];
const AUTOMATION_OPERATIONS: AgentToolOperationId[] = [
  'media.search', 'media.organize-files', 'anime.check-releases', 'flashcard.list-decks',
  'flashcard.create-deck', 'flashcard.add-cards', 'flashcard.delete-cards', 'flashcard.schedule-reviews',
  'calendar.list', 'calendar.schedule-session', 'calendar.create-reminder',
  'study.get-context', 'study.list-opportunities', 'study.prepare-media',
  'study.filter-vocabulary', 'study.undo-filter', 'study.preview-cards',
  'study.create-cards', 'study.preview-anki', 'study.export-anki',
  'study.resume-session', 'study.open-context',
  'settings.preview-theme', 'settings.apply-theme', 'settings.reset-theme', 'settings.undo-theme',
  'settings.preview-css', 'settings.apply-css', 'settings.reset-css',
];

function builtIn(
  id: string,
  name: string,
  description: string,
  role: AgentProfileRole,
  operations: AgentToolOperationId[],
  patch: Partial<AgentProfile> = {},
): AgentProfile {
  return {
    id,
    name,
    description,
    role,
    preferredModelFileName: '',
    permission: 'limited-actions',
    enabledOperations: operations,
    responseLength: 'balanced',
    explanationDepth: role === 'tutor' ? 'deep' : 'standard',
    language: 'english',
    teachingStyle: role === 'tutor' ? 'tutor' : 'academic',
    correctionStyle: 'gentle',
    enabled: true,
    builtIn: true,
    ...patch,
  };
}

export const DEFAULT_AGENT_PROFILES: readonly AgentProfile[] = [
  builtIn('study-tutor', 'Study Tutor', 'Grammar, vocabulary, corrections, and study planning.', 'tutor', TUTOR_OPERATIONS, { language: 'mixed' }),
  builtIn('media-assistant', 'Media Assistant', 'Find, analyze, and organize Japanese media.', 'media', MEDIA_OPERATIONS),
  builtIn('research-assistant', 'Research Assistant', 'Search local knowledge and summarize stored information.', 'research', RESEARCH_OPERATIONS),
  builtIn('automation-assistant', 'Automation Assistant', 'Run approved recurring study and library workflows.', 'automation', AUTOMATION_OPERATIONS, { permission: 'full-automation' }),
];

export const EMPTY_AGENT_PROFILE_STORE: AgentProfileStore = {
  version: 1,
  activeProfileId: 'study-tutor',
  profiles: DEFAULT_AGENT_PROFILES.map((profile) => ({ ...profile, enabledOperations: [...profile.enabledOperations] })),
};

function boundedText(value: unknown, max: number, fallback: string): string {
  const result = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return result || fallback;
}

function enumValue<T>(set: Set<T>, value: unknown, fallback: T): T {
  return set.has(value as T) ? value as T : fallback;
}

const FACTORY_BY_ID = new Map(DEFAULT_AGENT_PROFILES.map((profile) => [profile.id, profile]));

function operationList(value: unknown): AgentToolOperationId[] {
  return Array.isArray(value)
    ? value.filter((operation): operation is AgentToolOperationId => OPERATIONS.has(operation as AgentToolOperationId))
    : [];
}

/**
 * The one place a delta becomes a list. Both the read path (`applyBuiltInOverride`) and the
 * write path (`setAgentProfileOperations`) go through here, so a save is a fixed point of the
 * next load rather than something that happens to agree with it.
 */
function mergeOperations(
  factory: AgentProfile,
  disabled: readonly AgentToolOperationId[],
  added: readonly AgentToolOperationId[],
): AgentToolOperationId[] {
  const disabledSet = new Set(disabled);
  return [
    ...factory.enabledOperations.filter((operation) => !disabledSet.has(operation)),
    ...added.filter((operation) => !factory.enabledOperations.includes(operation) && !disabledSet.has(operation)),
  ];
}

/**
 * Apply a stored user edit on top of a factory built-in.
 *
 * Until 2026-08-02 this did not happen at all: `normalizeAgentProfiles` seeded its map with
 * the built-ins and then skipped any stored profile whose id was already taken, so every
 * edit to a built-in was discarded on load. Slice 53 measured the consequence live — a
 * profile narrowed from 19 operations to 18 ran the removed operation anyway, with no error.
 *
 * Identity is factory-owned so a future version can re-word a built-in and a stored entry
 * cannot impersonate one. Preferences are the user's. Operations are a delta over the
 * CURRENT factory list, never a frozen copy of it.
 */
function applyBuiltInOverride(factory: AgentProfile, candidate: Partial<AgentProfile>): AgentProfile {
  let disabled = operationList(candidate.disabledOperations);
  let added = operationList(candidate.addedOperations);

  // A store written before the delta existed carries a whole list instead. Convert it, so an
  // edit the user made earlier — and has never once seen take effect — finally applies.
  //
  // `hasDelta` tests for a NON-EMPTY delta on purpose. An earlier version of this function
  // emitted `disabledOperations: []` on every profile it returned, so any store that had been
  // through it once carried empty arrays for ever after — and a `!== undefined` test read those
  // as "already a delta" and dropped the very edit this function exists to keep. The live
  // Phase 7 gate caught it; every unit test here passed, because they hand this function a
  // hand-written store while the app hands it one that has already been normalized once.
  const hasDelta = disabled.length > 0 || added.length > 0;
  if (!hasDelta && Array.isArray(candidate.enabledOperations)) {
    const legacy = new Set(operationList(candidate.enabledOperations));
    disabled = factory.enabledOperations.filter((operation) => !legacy.has(operation));
    added = [...legacy].filter((operation) => !factory.enabledOperations.includes(operation));
  }

  const enabledOperations = mergeOperations(factory, disabled, added);

  return {
    ...factory,
    preferredModelFileName: boundedText(candidate.preferredModelFileName, 240, factory.preferredModelFileName),
    permission: enumValue(PERMISSIONS, candidate.permission, factory.permission),
    enabledOperations,
    // Omitted entirely when empty, rather than written as `[]`. A profile with no user edit
    // must round-trip back through here indistinguishable from one that was never edited —
    // otherwise the stored shape itself changes the meaning of the NEXT load.
    ...(disabled.length ? { disabledOperations: disabled } : {}),
    ...(added.length ? { addedOperations: added } : {}),
    responseLength: enumValue(RESPONSE_LENGTHS, candidate.responseLength, factory.responseLength),
    explanationDepth: enumValue(EXPLANATION_DEPTHS, candidate.explanationDepth, factory.explanationDepth),
    language: enumValue(LANGUAGES, candidate.language, factory.language),
    teachingStyle: enumValue(TEACHING_STYLES, candidate.teachingStyle, factory.teachingStyle),
    correctionStyle: enumValue(CORRECTION_STYLES, candidate.correctionStyle, factory.correctionStyle),
    enabled: candidate.enabled === undefined ? factory.enabled : candidate.enabled !== false,
    // id / name / description / role / builtIn deliberately NOT taken from the candidate.
  };
}

/**
 * The factory allow-list a built-in resets to, or `undefined` for a custom profile.
 *
 * Exposed so the editor's "restore defaults" control restores the CURRENT factory list rather
 * than a list the renderer froze at some earlier version — the same reason the stored form is a
 * delta in the first place.
 */
export function factoryAgentProfileOperations(id: string): readonly AgentToolOperationId[] | undefined {
  return FACTORY_BY_ID.get(id)?.enabledOperations;
}

/**
 * Whether a built-in still runs the factory allow-list. Always `false` for a custom profile,
 * which has no factory list to be equal to — the editor uses this only to decide whether to
 * offer "restore defaults", and that control is meaningless off a built-in.
 */
export function agentProfileOperationsAreFactoryDefault(profile: AgentProfile): boolean {
  if (!FACTORY_BY_ID.has(profile.id)) return false;
  return !profile.disabledOperations?.length && !profile.addedOperations?.length;
}

/**
 * Turn the allow-list a user picked in the UI into what actually persists.
 *
 * Slice 63. Until now nothing in `src/renderer` wrote `disabledOperations` at all: the only way
 * to narrow a profile was to hand-edit localStorage, which is what the Phase 7 gate did. So the
 * refusal path was correct, proven against shipped bytes, and unreachable.
 *
 * Three things this has to get right, each of which has already cost this track a slice:
 *
 *  - **Write the delta, not the list.** A whole `enabledOperations` list would depend on the
 *    legacy conversion in `applyBuiltInOverride`, which by design only runs when the delta is
 *    empty — the exact path slice 58 found could be masked by a stored `[]`.
 *  - **Emit no delta key at all when there is no edit,** so an untouched profile round-trips
 *    indistinguishable from one that was never touched. A stored `disabledOperations: []` is
 *    what made the legacy guard skip a real edit and let the factory list silently win.
 *  - **Delete a stale delta when the user un-narrows.** `{ ...profile }` carries the previous
 *    arrays forward underneath a freshly recomputed `enabledOperations`, and the next load
 *    applies them and undoes the user's re-enable. Hence the destructure below rather than a
 *    plain spread.
 *
 * `enabledOperations` is written alongside the delta and computed the same way the load path
 * computes it, so saving is a fixed point of loading. That matters for the un-narrow case: with
 * an empty delta the load path falls back to reading `enabledOperations`, and a stale value
 * there would re-derive the narrowing the user just removed.
 *
 * An empty `nextEnabled` is a legitimate, maximally-restrictive choice and is stored as such —
 * on a built-in it becomes a NON-empty `disabledOperations` naming every factory operation, so
 * the next load reads it as a real delta rather than as "no edit".
 */
export function setAgentProfileOperations(
  profile: AgentProfile,
  nextEnabled: readonly AgentToolOperationId[],
): AgentProfile {
  const selection = [...new Set(operationList(nextEnabled))];
  // Destructured out, not spread over: the point is that these keys are ABSENT unless earned.
  const { disabledOperations: _disabled, addedOperations: _added, ...rest } = profile;

  const factory = FACTORY_BY_ID.get(profile.id);
  if (!factory) return { ...rest, enabledOperations: selection };

  const chosen = new Set(selection);
  const disabled = factory.enabledOperations.filter((operation) => !chosen.has(operation));
  const added = selection.filter((operation) => !factory.enabledOperations.includes(operation));

  return {
    ...rest,
    enabledOperations: mergeOperations(factory, disabled, added),
    ...(disabled.length ? { disabledOperations: disabled } : {}),
    ...(added.length ? { addedOperations: added } : {}),
  };
}

export function normalizeAgentProfiles(input: unknown): AgentProfileStore {
  const raw = input && typeof input === 'object' ? input as Partial<AgentProfileStore> : {};
  const custom = Array.isArray(raw.profiles) ? raw.profiles : [];
  const byId = new Map<string, AgentProfile>();
  for (const profile of EMPTY_AGENT_PROFILE_STORE.profiles) byId.set(profile.id, profile);
  for (const value of custom.slice(0, 100)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Partial<AgentProfile>;
    const id = boundedText(candidate.id, 100, '');
    if (!id) continue;
    // A stored entry for a built-in is an OVERRIDE, not a duplicate to be dropped. Applied
    // against the factory definition rather than the map, so two entries for the same id
    // cannot compound.
    const factory = FACTORY_BY_ID.get(id);
    if (factory) {
      byId.set(id, applyBuiltInOverride(factory, candidate));
      continue;
    }
    if (byId.has(id)) continue;
    const operations = Array.isArray(candidate.enabledOperations)
      ? candidate.enabledOperations.filter((operation): operation is AgentToolOperationId => OPERATIONS.has(operation as AgentToolOperationId)).slice(0, ALL_OPERATIONS.length)
      : ['dictionary.lookup', 'dictionary.search-knowledge'] as AgentToolOperationId[];
    byId.set(id, {
      id,
      name: boundedText(candidate.name, 100, 'Custom assistant'),
      description: boundedText(candidate.description, 500, 'Custom local assistant profile.'),
      role: enumValue(PROFILE_ROLES, candidate.role, 'custom'),
      preferredModelFileName: boundedText(candidate.preferredModelFileName, 240, ''),
      permission: enumValue(PERMISSIONS, candidate.permission, 'read-only'),
      enabledOperations: operations,
      responseLength: enumValue(RESPONSE_LENGTHS, candidate.responseLength, 'balanced'),
      explanationDepth: enumValue(EXPLANATION_DEPTHS, candidate.explanationDepth, 'standard'),
      language: enumValue(LANGUAGES, candidate.language, 'english'),
      teachingStyle: enumValue(TEACHING_STYLES, candidate.teachingStyle, 'tutor'),
      correctionStyle: enumValue(CORRECTION_STYLES, candidate.correctionStyle, 'gentle'),
      enabled: candidate.enabled !== false,
      builtIn: false,
    });
  }
  const profiles = [...byId.values()];
  const activeProfileId = profiles.some((profile) => profile.id === raw.activeProfileId && profile.enabled)
    ? raw.activeProfileId as string
    : EMPTY_AGENT_PROFILE_STORE.activeProfileId;
  return { version: 1, activeProfileId, profiles };
}

export function getActiveAgentProfile(store: AgentProfileStore): AgentProfile {
  const normalized = normalizeAgentProfiles(store);
  return normalized.profiles.find((profile) => profile.id === normalized.activeProfileId)
    ?? normalized.profiles[0];
}

const AGENT_PERMISSION_RANK: Record<AgentPermissionLevel, number> = {
  'read-only': 0,
  'limited-actions': 1,
  'full-automation': 2,
};

/**
 * Combine two permission levels by taking the lower one.
 *
 * Every permission that arrives from somewhere other than the user's live
 * setting — a profile, a stored automation, a policy crossing IPC — may only
 * ever narrow what is allowed, never widen it. Stating that as one function
 * keeps the rule from being re-derived (and inverted) at each new boundary.
 */
export function narrowAgentPermission(
  a: AgentPermissionLevel,
  b: AgentPermissionLevel,
): AgentPermissionLevel {
  return AGENT_PERMISSION_RANK[a] <= AGENT_PERMISSION_RANK[b] ? a : b;
}

/**
 * Return `source` with its permission narrowed by `ceiling`.
 *
 * Enforcing a ceiling only at execution is not enough: the planner is handed the
 * live settings and shapes both the system prompt and the approved-operation set
 * from them, so an automation created at `read-only` would plan full-automation
 * steps that execution then refuses one by one. Bounding the settings the plan is
 * built from makes the level shown beside the automation describe what it will
 * actually propose.
 *
 * Returns the same object when nothing narrows, so a caller with no ceiling
 * cannot be told apart from one that never had this applied.
 */
export function underPermissionCeiling<T extends { permission: AgentPermissionLevel }>(
  source: T,
  ceiling: AgentPermissionLevel | undefined,
): T {
  if (!ceiling) return source;
  const permission = narrowAgentPermission(source.permission, ceiling);
  return permission === source.permission ? source : { ...source, permission };
}

export function effectiveAgentPermission(
  globalPermission: AgentPermissionLevel,
  profile: AgentProfile | undefined,
): AgentPermissionLevel {
  if (!profile) return globalPermission;
  return narrowAgentPermission(globalPermission, profile.permission);
}
