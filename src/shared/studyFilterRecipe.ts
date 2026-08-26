import {
  DEFAULT_STUDY_FILTERS,
  normalizeStudyFilters,
  selectStudyVocabulary,
  type StudyOrchestratorDocument,
  type StudyVocabularyFilters,
  type StudyVocabularyWorkspace,
} from './mediaStudyOrchestrator';
import type { MediaItem } from './types';

/**
 * Rank 24 — portable Study recipe.
 *
 * A recipe is the user's vocabulary filter set as portable text: nothing more.
 * It carries no media id, no workspace id, no candidate, no timestamp and no
 * selection, which is what makes it both deterministic and safe to paste
 * anywhere — the same text applied to the same candidates always yields the same
 * cards, and exporting the same filters twice yields byte-identical text.
 *
 * There is deliberately no recipe store. Export produces text, import consumes
 * text, and applying goes through the existing reversible filter history
 * (`study:applyFilters`), so a pasted recipe is one `Undo filter` away from
 * gone. Adding a saved-recipe document would create a second source of truth
 * for filters, which this track does not do.
 */

/** Identifies our own text so arbitrary pasted JSON is never applied. */
export const STUDY_RECIPE_KIND = 'jp-study-app/study-filter-recipe';
export const STUDY_RECIPE_VERSION = 1;
/** Display-only provenance, capped so a pasted label cannot flood the panel. */
export const STUDY_RECIPE_LABEL_LIMIT = 120;
/** A recipe is nine fields; anything this long is not one. */
export const STUDY_RECIPE_TEXT_LIMIT = 4_000;
/** Bounded sample of words entering or leaving the deck, for the preview only. */
export const STUDY_RECIPE_SAMPLE_LIMIT = 6;

export type StudyFilterField = keyof StudyVocabularyFilters;

/**
 * Fixed field order. Serialization walks this list rather than the object's own
 * key order, so two workspaces that reached the same filters by different routes
 * still produce identical text.
 */
export const STUDY_RECIPE_FIELDS: readonly StudyFilterField[] = [
  'excludedJlptLevels',
  'minimumOccurrences',
  'excludeKnowledgeAtOrAbove',
  'excludeInternalDuplicates',
  'excludeAnkiDuplicates',
  'excludeAnkiMatureAtDays',
  'excludeProperNouns',
  'maximumCards',
  'rankingMode',
];

export interface StudyFilterRecipe {
  kind: typeof STUDY_RECIPE_KIND;
  version: typeof STUDY_RECIPE_VERSION;
  /** Where the recipe came from. Display only — never applied to a workspace. */
  label?: string;
  filters: StudyVocabularyFilters;
}

export type StudyFilterRecipeRejection =
  | 'empty'
  | 'too-large'
  | 'not-json'
  | 'not-an-object'
  | 'wrong-kind'
  | 'unsupported-version'
  | 'no-filters';

export type StudyFilterRecipeParse =
  | {
    ok: true;
    recipe: StudyFilterRecipe;
    /** Keys inside `filters` this version does not know. Ignored, but reported. */
    unknownFields: string[];
    /** Known keys whose value was unusable. Replaced by the app default. */
    invalidFields: StudyFilterField[];
    /** Known keys the text omitted. Also filled from the app default. */
    missingFields: StudyFilterField[];
  }
  | { ok: false; reason: StudyFilterRecipeRejection };

export type StudyFilterRecipeValue = string | number | boolean | null | readonly string[];

export interface StudyFilterRecipeChange {
  field: StudyFilterField;
  before: StudyFilterRecipeValue;
  after: StudyFilterRecipeValue;
}

export interface StudyFilterRecipePreview {
  /** Only the fields the recipe would actually change. */
  changes: StudyFilterRecipeChange[];
  /** True while the recipe matches the filters already in use. */
  identical: boolean;
  candidates: number;
  selectedBefore: number;
  selectedAfter: number;
  added: number;
  removed: number;
  /** Bounded samples for the panel; the counts above stay honest. */
  addedWords: string[];
  removedWords: string[];
}

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const wholeNumber = (value: unknown): number | undefined =>
  (typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined);

const nullableWholeNumber = (value: unknown): number | null | undefined =>
  (value === null ? null : wholeNumber(value));

const booleanValue = (value: unknown): boolean | undefined =>
  (typeof value === 'boolean' ? value : undefined);

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * `normalizeStudyFilters` keeps the excluded levels in insertion order, which is
 * right for the workspace but not stable enough for portable text, so the recipe
 * sorts them.
 */
function recipeFilters(
  input: Partial<StudyVocabularyFilters> | undefined,
): StudyVocabularyFilters {
  const filters = normalizeStudyFilters({ ...DEFAULT_STUDY_FILTERS, ...input });
  return { ...filters, excludedJlptLevels: [...filters.excludedJlptLevels].sort() };
}

function orderedFilters(filters: StudyVocabularyFilters): RawRecord {
  const ordered: RawRecord = {};
  for (const field of STUDY_RECIPE_FIELDS) ordered[field] = filters[field];
  return ordered;
}

const recipeLabel = (label: string | undefined): string =>
  (label ?? '').replace(/\s+/g, ' ').trim().slice(0, STUDY_RECIPE_LABEL_LIMIT);

/**
 * Builds a recipe from whatever filter set is in hand. The label is provenance
 * for a human reading a saved recipe later; it is never applied.
 */
export function createStudyFilterRecipe(
  filters: Partial<StudyVocabularyFilters> | undefined,
  label?: string,
): StudyFilterRecipe {
  const trimmed = recipeLabel(label);
  return {
    kind: STUDY_RECIPE_KIND,
    version: STUDY_RECIPE_VERSION,
    ...(trimmed ? { label: trimmed } : {}),
    filters: recipeFilters(filters),
  };
}

export function serializeStudyFilterRecipe(recipe: StudyFilterRecipe): string {
  const label = recipeLabel(recipe.label);
  const body: RawRecord = { kind: STUDY_RECIPE_KIND, version: STUDY_RECIPE_VERSION };
  if (label) body.label = label;
  body.filters = orderedFilters(recipeFilters(recipe.filters));
  return JSON.stringify(body, null, 2);
}

/** Short display code so two recipes can be told apart at a glance. */
export function studyFilterRecipeCode(filters: Partial<StudyVocabularyFilters>): string {
  return stableHash(JSON.stringify(orderedFilters(recipeFilters(filters))));
}

interface SanitizedFilters {
  patch: Partial<StudyVocabularyFilters>;
  recognized: StudyFilterField[];
  invalid: StudyFilterField[];
  missing: StudyFilterField[];
  unknown: string[];
}

function sanitizeFilters(raw: RawRecord): SanitizedFilters {
  const patch: Partial<StudyVocabularyFilters> = {};
  const recognized: StudyFilterField[] = [];
  const invalid: StudyFilterField[] = [];
  const missing: StudyFilterField[] = [];
  const unknown = Object.keys(raw)
    .filter((key) => !STUDY_RECIPE_FIELDS.includes(key as StudyFilterField));

  const read = <K extends StudyFilterField>(
    field: K,
    value: StudyVocabularyFilters[K] | undefined,
  ): void => {
    if (!(field in raw)) {
      missing.push(field);
      return;
    }
    if (value === undefined) {
      invalid.push(field);
      return;
    }
    patch[field] = value;
    recognized.push(field);
  };

  const levels = raw.excludedJlptLevels;
  read(
    'excludedJlptLevels',
    Array.isArray(levels) && levels.every((entry) => typeof entry === 'string')
      ? (levels as string[])
      : undefined,
  );
  read('minimumOccurrences', wholeNumber(raw.minimumOccurrences));
  read(
    'excludeKnowledgeAtOrAbove',
    wholeNumber(raw.excludeKnowledgeAtOrAbove) as
      StudyVocabularyFilters['excludeKnowledgeAtOrAbove'] | undefined,
  );
  read('excludeInternalDuplicates', booleanValue(raw.excludeInternalDuplicates));
  read('excludeAnkiDuplicates', booleanValue(raw.excludeAnkiDuplicates));
  read('excludeAnkiMatureAtDays', nullableWholeNumber(raw.excludeAnkiMatureAtDays));
  read('excludeProperNouns', booleanValue(raw.excludeProperNouns));
  read('maximumCards', nullableWholeNumber(raw.maximumCards));
  read(
    'rankingMode',
    raw.rankingMode === 'frequency-all' || raw.rankingMode === 'frequency-unrated'
      ? raw.rankingMode
      : undefined,
  );

  return { patch, recognized, invalid, missing, unknown };
}

/**
 * Reads pasted text. Every rejection is a code the caller localizes, because a
 * recipe that cannot be read must say why rather than silently doing nothing.
 *
 * A trimmed or partly damaged recipe is completed from the app's own defaults —
 * never from the workspace it is being pasted into. Filling gaps from the
 * current workspace would make the same text mean different things in different
 * places, which is exactly what a portable recipe must not do. The preview shows
 * every resulting field, so a default that arrived this way is visible before it
 * is applied.
 */
export function parseStudyFilterRecipe(text: string): StudyFilterRecipeParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > STUDY_RECIPE_TEXT_LIMIT) return { ok: false, reason: 'too-large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'not-an-object' };
  if (parsed.kind !== STUDY_RECIPE_KIND) return { ok: false, reason: 'wrong-kind' };

  const version = wholeNumber(parsed.version);
  if (version === undefined || version < 1 || version > STUDY_RECIPE_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }
  if (!isRecord(parsed.filters)) return { ok: false, reason: 'no-filters' };

  const sanitized = sanitizeFilters(parsed.filters);
  if (!sanitized.recognized.length) return { ok: false, reason: 'no-filters' };

  return {
    ok: true,
    recipe: createStudyFilterRecipe(
      sanitized.patch,
      typeof parsed.label === 'string' ? parsed.label : undefined,
    ),
    unknownFields: sanitized.unknown,
    invalidFields: sanitized.invalid,
    missingFields: sanitized.missing,
  };
}

const valueKey = (value: StudyFilterRecipeValue): string =>
  (Array.isArray(value) ? [...value].sort().join('\0') : String(value));

/** Only the fields that would actually move, so the panel shows a real diff. */
export function studyFilterRecipeChanges(
  current: Partial<StudyVocabularyFilters> | undefined,
  recipe: StudyFilterRecipe,
): StudyFilterRecipeChange[] {
  const before = recipeFilters(current);
  const after = recipeFilters(recipe.filters);
  return STUDY_RECIPE_FIELDS
    .map((field) => ({ field, before: before[field], after: after[field] }))
    .filter((change) => valueKey(change.before) !== valueKey(change.after));
}

export interface StudyFilterRecipeSource {
  workspaceId: string;
  /** Where these filters were last used, for the panel to name honestly. */
  label: string;
  filters: StudyVocabularyFilters;
  updatedAt: number;
}

const seriesKeyOf = (item: Pick<MediaItem, 'seriesKey'>): string =>
  item.seriesKey?.trim().toLocaleLowerCase() ?? '';

const displayTitle = (item: Pick<MediaItem, 'title' | 'fileName'>): string =>
  item.title.trim() || item.fileName.trim();

/**
 * The recipe's reason for existing is that preparing the *next* episode starts
 * from the app defaults, throwing away the filters the user tuned on the last
 * one. This finds that previous workspace — same canonical series, real media,
 * genuinely different filters — so the panel can offer it in one click instead of
 * asking the user to go and copy it by hand.
 *
 * It reads only what the Study document and media library already hold, suggests
 * nothing when the current filters already match, and never applies anything: the
 * caller fills the paste box, and the user still applies explicitly.
 */
export function studyFilterRecipeSource(
  items: readonly MediaItem[],
  document: StudyOrchestratorDocument,
  workspace: StudyVocabularyWorkspace,
): StudyFilterRecipeSource | null {
  const item = items.find((entry) => entry.id === workspace.context.mediaId);
  const seriesKey = item ? seriesKeyOf(item) : '';
  if (!seriesKey) return null;
  const current = studyFilterRecipeCode(workspace.filters);

  return Object.values(document.workspaces)
    .filter((candidate) => {
      if (candidate.id === workspace.id) return false;
      if (candidate.context.sourceKind === 'lookup-history') return false;
      const source = items.find((entry) => entry.id === candidate.context.mediaId);
      if (!source || seriesKeyOf(source) !== seriesKey) return false;
      // A workspace whose filters already match teaches the user nothing.
      return studyFilterRecipeCode(candidate.filters) !== current;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((candidate) => {
      const source = items.find((entry) => entry.id === candidate.context.mediaId);
      return {
        workspaceId: candidate.id,
        label: source ? displayTitle(source) : candidate.context.mediaId,
        filters: recipeFilters(candidate.filters),
        updatedAt: candidate.updatedAt,
      };
    })[0] ?? null;
}

/**
 * Read-only projection of what applying the recipe would do to this workspace.
 * It runs the existing selection function over the stored candidates and writes
 * nothing, so it is safe to recompute on every render — which is also why there
 * is no staleness guard here: the preview is derived from the live workspace
 * rather than remembered from an earlier one.
 */
export function previewStudyFilterRecipe(
  workspace: StudyVocabularyWorkspace,
  recipe: StudyFilterRecipe,
): StudyFilterRecipePreview {
  const changes = studyFilterRecipeChanges(workspace.filters, recipe);
  const beforeIds = new Set(workspace.selectionIds);
  const afterIds = new Set(
    selectStudyVocabulary(workspace.candidates, recipe.filters).map((candidate) => candidate.id),
  );
  const words = new Map(workspace.candidates.map((candidate) => [candidate.id, candidate.word]));
  const enteringIds = [...afterIds].filter((id) => !beforeIds.has(id));
  const leavingIds = [...beforeIds].filter((id) => !afterIds.has(id));
  const sample = (ids: string[]): string[] => ids
    .map((id) => words.get(id) ?? '')
    .filter(Boolean)
    .slice(0, STUDY_RECIPE_SAMPLE_LIMIT);
  return {
    changes,
    identical: !changes.length,
    candidates: workspace.candidates.length,
    selectedBefore: beforeIds.size,
    selectedAfter: afterIds.size,
    added: enteringIds.length,
    removed: leavingIds.length,
    addedWords: sample(enteringIds),
    removedWords: sample(leavingIds),
  };
}
