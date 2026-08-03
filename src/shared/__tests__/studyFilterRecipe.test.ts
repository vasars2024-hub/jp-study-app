import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDY_FILTERS,
  applyStudyVocabularyFilters,
  createEmptyStudyOrchestratorDocument,
  undoStudyVocabularyFilter,
  type StudyVocabularyCandidate,
  type StudyVocabularyFilters,
  type StudyVocabularyWorkspace,
} from '../mediaStudyOrchestrator';
import type { MediaItem } from '../types';
import {
  STUDY_RECIPE_FIELDS,
  STUDY_RECIPE_KIND,
  STUDY_RECIPE_LABEL_LIMIT,
  STUDY_RECIPE_SAMPLE_LIMIT,
  STUDY_RECIPE_TEXT_LIMIT,
  STUDY_RECIPE_VERSION,
  createStudyFilterRecipe,
  parseStudyFilterRecipe,
  previewStudyFilterRecipe,
  serializeStudyFilterRecipe,
  studyFilterRecipeChanges,
  studyFilterRecipeCode,
  studyFilterRecipeSource,
} from '../studyFilterRecipe';

function candidate(
  index: number,
  patch: Partial<StudyVocabularyCandidate> = {},
): StudyVocabularyCandidate {
  return {
    id: `candidate-${index}`,
    word: `語${index}`,
    surface: `語${index}`,
    reading: `ご${index}`,
    occurrences: 5,
    sentence: `語${index}が必要だ。`,
    timestamp: index,
    jlptLevel: null,
    frequencyRank: index,
    knowledgeLevel: 0,
    proper: false,
    internalDuplicate: false,
    ankiDuplicate: false,
    ...patch,
  };
}

function workspace(
  candidates: readonly StudyVocabularyCandidate[],
  filters: Partial<StudyVocabularyFilters> = {},
): StudyVocabularyWorkspace {
  const merged: StudyVocabularyFilters = { ...DEFAULT_STUDY_FILTERS, ...filters };
  const selectionIds = candidates
    .filter((entry) => entry.occurrences >= merged.minimumOccurrences)
    .slice(0, merged.maximumCards ?? candidates.length)
    .map((entry) => entry.id);
  return {
    id: 'workspace-1',
    context: { mediaId: 'media-1', sourceKind: 'media', subtitleRecordId: 'sub-1' },
    readinessId: 'readiness-1',
    createdAt: 1_000,
    updatedAt: 1_000,
    candidates: [...candidates],
    filters: merged,
    selectionIds,
    history: [],
    exports: [],
  };
}

const twenty = Array.from({ length: 20 }, (_, index) => candidate(index + 1));

describe('portable Study recipe — serialization', () => {
  it('writes the kind, version and every filter field in a fixed order', () => {
    const text = serializeStudyFilterRecipe(createStudyFilterRecipe(DEFAULT_STUDY_FILTERS));
    const body = JSON.parse(text) as {
      kind: string;
      version: number;
      filters: Record<string, unknown>;
    };
    expect(body.kind).toBe(STUDY_RECIPE_KIND);
    expect(body.version).toBe(STUDY_RECIPE_VERSION);
    expect(Object.keys(body)).toEqual(['kind', 'version', 'filters']);
    expect(Object.keys(body.filters)).toEqual([...STUDY_RECIPE_FIELDS]);
  });

  it('is byte-stable across key order and excluded-level order', () => {
    const first = createStudyFilterRecipe({
      maximumCards: 40,
      excludedJlptLevels: ['N5', 'N4'],
      rankingMode: 'frequency-all',
    });
    const second = createStudyFilterRecipe({
      rankingMode: 'frequency-all',
      excludedJlptLevels: ['n4', 'N5', 'N5'],
      maximumCards: 40,
    });
    expect(serializeStudyFilterRecipe(first)).toBe(serializeStudyFilterRecipe(second));
    expect(studyFilterRecipeCode(first.filters)).toBe(studyFilterRecipeCode(second.filters));
  });

  it('gives a different code once a filter genuinely moves', () => {
    expect(studyFilterRecipeCode({ ...DEFAULT_STUDY_FILTERS, maximumCards: 30 }))
      .not.toBe(studyFilterRecipeCode({ ...DEFAULT_STUDY_FILTERS, maximumCards: 31 }));
  });

  it('round-trips through text unchanged', () => {
    const recipe = createStudyFilterRecipe({
      excludedJlptLevels: ['N5'],
      minimumOccurrences: 3,
      excludeAnkiDuplicates: true,
      excludeAnkiMatureAtDays: 21,
      excludeProperNouns: false,
      maximumCards: null,
      rankingMode: 'frequency-all',
    }, 'The Big O - 01');
    const text = serializeStudyFilterRecipe(recipe);
    const parsed = parseStudyFilterRecipe(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe).toEqual(recipe);
    expect(serializeStudyFilterRecipe(parsed.recipe)).toBe(text);
    expect(parsed.missingFields).toEqual([]);
    expect(parsed.invalidFields).toEqual([]);
    expect(parsed.unknownFields).toEqual([]);
  });

  it('normalizes the label and omits it when blank', () => {
    const labelled = createStudyFilterRecipe(DEFAULT_STUDY_FILTERS, `  The Big O\n - 01  `);
    expect(labelled.label).toBe('The Big O - 01');
    expect(createStudyFilterRecipe(DEFAULT_STUDY_FILTERS, '   ').label).toBeUndefined();
    expect(serializeStudyFilterRecipe(createStudyFilterRecipe(DEFAULT_STUDY_FILTERS, '')))
      .not.toContain('label');
    const long = createStudyFilterRecipe(DEFAULT_STUDY_FILTERS, 'あ'.repeat(400));
    expect(long.label).toHaveLength(STUDY_RECIPE_LABEL_LIMIT);
  });

  it('never carries an id, timestamp or selection', () => {
    const text = serializeStudyFilterRecipe(
      createStudyFilterRecipe(DEFAULT_STUDY_FILTERS, 'The Big O - 01'),
    );
    for (const forbidden of ['mediaId', 'workspaceId', 'subtitleRecordId', 'selectionIds', 'At"']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('portable Study recipe — rejections', () => {
  const rejection = (text: string): string => {
    const parsed = parseStudyFilterRecipe(text);
    return parsed.ok ? 'accepted' : parsed.reason;
  };

  it('refuses empty and oversized text', () => {
    expect(rejection('')).toBe('empty');
    expect(rejection('   \n  ')).toBe('empty');
    expect(rejection(`"${'x'.repeat(STUDY_RECIPE_TEXT_LIMIT + 1)}"`)).toBe('too-large');
  });

  it('refuses text that is not a JSON object', () => {
    expect(rejection('not json at all')).toBe('not-json');
    expect(rejection('{"kind":')).toBe('not-json');
    expect(rejection('[1,2,3]')).toBe('not-an-object');
    expect(rejection('42')).toBe('not-an-object');
    expect(rejection('null')).toBe('not-an-object');
  });

  it('refuses JSON that is not one of our recipes', () => {
    expect(rejection(JSON.stringify({ filters: { maximumCards: 10 } }))).toBe('wrong-kind');
    expect(rejection(JSON.stringify({
      kind: 'some-other-app/filters',
      version: 1,
      filters: { maximumCards: 10 },
    }))).toBe('wrong-kind');
  });

  it('refuses a version this build cannot honour', () => {
    const base = { kind: STUDY_RECIPE_KIND, filters: { maximumCards: 10 } };
    expect(rejection(JSON.stringify({ ...base, version: STUDY_RECIPE_VERSION + 1 })))
      .toBe('unsupported-version');
    expect(rejection(JSON.stringify({ ...base, version: 0 }))).toBe('unsupported-version');
    expect(rejection(JSON.stringify({ ...base, version: '1' }))).toBe('unsupported-version');
    expect(rejection(JSON.stringify(base))).toBe('unsupported-version');
  });

  it('refuses a recipe with no readable filter at all', () => {
    const base = { kind: STUDY_RECIPE_KIND, version: STUDY_RECIPE_VERSION };
    expect(rejection(JSON.stringify(base))).toBe('no-filters');
    expect(rejection(JSON.stringify({ ...base, filters: [] }))).toBe('no-filters');
    expect(rejection(JSON.stringify({ ...base, filters: {} }))).toBe('no-filters');
    expect(rejection(JSON.stringify({ ...base, filters: { nonsense: true } }))).toBe('no-filters');
    expect(rejection(JSON.stringify({
      ...base,
      filters: { maximumCards: 'thirty', excludeProperNouns: 'yes' },
    }))).toBe('no-filters');
  });
});

describe('portable Study recipe — repair and reporting', () => {
  it('reports unknown fields and ignores them', () => {
    const parsed = parseStudyFilterRecipe(JSON.stringify({
      kind: STUDY_RECIPE_KIND,
      version: STUDY_RECIPE_VERSION,
      filters: { maximumCards: 12, futureField: 'later', anotherOne: 1 },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.unknownFields).toEqual(['futureField', 'anotherOne']);
    expect(parsed.recipe.filters.maximumCards).toBe(12);
    expect(serializeStudyFilterRecipe(parsed.recipe)).not.toContain('futureField');
  });

  it('reports unreadable values and falls back to the app default', () => {
    const parsed = parseStudyFilterRecipe(JSON.stringify({
      kind: STUDY_RECIPE_KIND,
      version: STUDY_RECIPE_VERSION,
      filters: {
        maximumCards: 12,
        minimumOccurrences: 'three',
        excludeProperNouns: 'no',
        excludedJlptLevels: ['N5', 4],
      },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.invalidFields)
      .toEqual(['excludedJlptLevels', 'minimumOccurrences', 'excludeProperNouns']);
    expect(parsed.recipe.filters.minimumOccurrences)
      .toBe(DEFAULT_STUDY_FILTERS.minimumOccurrences);
    expect(parsed.recipe.filters.excludeProperNouns)
      .toBe(DEFAULT_STUDY_FILTERS.excludeProperNouns);
    expect(parsed.recipe.filters.excludedJlptLevels).toEqual([]);
  });

  it('fills omitted fields from the app default, never from the target workspace', () => {
    const text = JSON.stringify({
      kind: STUDY_RECIPE_KIND,
      version: STUDY_RECIPE_VERSION,
      filters: { maximumCards: 12 },
    });
    const parsed = parseStudyFilterRecipe(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.missingFields).toEqual(
      STUDY_RECIPE_FIELDS.filter((field) => field !== 'maximumCards'),
    );
    expect(parsed.recipe.filters).toEqual({
      ...DEFAULT_STUDY_FILTERS,
      maximumCards: 12,
    });

    // The same text must mean the same thing in a workspace whose current
    // filters are nothing like the defaults.
    const foreign = workspace(twenty, {
      excludedJlptLevels: ['N5', 'N4'],
      minimumOccurrences: 4,
      excludeProperNouns: false,
      rankingMode: 'frequency-all',
    });
    const applied = applyStudyVocabularyFilters(foreign, parsed.recipe.filters);
    expect(applied.workspace.filters).toEqual(parsed.recipe.filters);
  });

  it('clamps hostile values through the existing filter normalizer', () => {
    const parsed = parseStudyFilterRecipe(JSON.stringify({
      kind: STUDY_RECIPE_KIND,
      version: STUDY_RECIPE_VERSION,
      filters: {
        excludedJlptLevels: [' n5 ', 'N5', 'n1'],
        minimumOccurrences: 0,
        excludeKnowledgeAtOrAbove: 9,
        excludeAnkiMatureAtDays: -30,
        maximumCards: -5,
      },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe.filters.excludedJlptLevels).toEqual(['N1', 'N5']);
    expect(parsed.recipe.filters.minimumOccurrences).toBe(1);
    expect(parsed.recipe.filters.excludeKnowledgeAtOrAbove).toBe(4);
    expect(parsed.recipe.filters.excludeAnkiMatureAtDays).toBe(0);
    expect(parsed.recipe.filters.maximumCards).toBe(0);
  });

  it('accepts an explicit null for the two nullable fields', () => {
    const parsed = parseStudyFilterRecipe(JSON.stringify({
      kind: STUDY_RECIPE_KIND,
      version: STUDY_RECIPE_VERSION,
      filters: { maximumCards: null, excludeAnkiMatureAtDays: null },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe.filters.maximumCards).toBeNull();
    expect(parsed.recipe.filters.excludeAnkiMatureAtDays).toBeNull();
    expect(parsed.invalidFields).toEqual([]);
  });
});

describe('portable Study recipe — preview', () => {
  it('lists only the fields that would move', () => {
    const current = workspace(twenty, { maximumCards: 10 });
    const recipe = createStudyFilterRecipe({
      ...current.filters,
      maximumCards: 5,
      excludedJlptLevels: ['N5'],
    });
    const changes = studyFilterRecipeChanges(current.filters, recipe);
    expect(changes.map((change) => change.field)).toEqual(['excludedJlptLevels', 'maximumCards']);
    expect(changes[1]).toEqual({ field: 'maximumCards', before: 10, after: 5 });
  });

  it('treats a matching recipe as identical and changes nothing', () => {
    const current = workspace(twenty, { maximumCards: 10 });
    const preview = previewStudyFilterRecipe(
      current,
      createStudyFilterRecipe(current.filters),
    );
    expect(preview.identical).toBe(true);
    expect(preview.changes).toEqual([]);
    expect(preview.added).toBe(0);
    expect(preview.removed).toBe(0);
    expect(preview.selectedBefore).toBe(preview.selectedAfter);
  });

  it('counts the selection delta and keeps the word sample bounded', () => {
    const current = workspace(twenty, { maximumCards: 20 });
    expect(current.selectionIds).toHaveLength(20);
    const preview = previewStudyFilterRecipe(
      current,
      createStudyFilterRecipe({ ...current.filters, maximumCards: 8 }),
    );
    expect(preview.candidates).toBe(20);
    expect(preview.selectedBefore).toBe(20);
    expect(preview.selectedAfter).toBe(8);
    expect(preview.added).toBe(0);
    expect(preview.removed).toBe(12);
    expect(preview.removedWords).toHaveLength(STUDY_RECIPE_SAMPLE_LIMIT);
    expect(preview.addedWords).toEqual([]);
  });

  it('reports words the recipe would newly include', () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) => candidate(index + 1, { occurrences: 9 })),
      ...Array.from({ length: 3 }, (_, index) => candidate(index + 10, { occurrences: 2 })),
    ];
    const current = workspace(candidates, { minimumOccurrences: 5, maximumCards: null });
    expect(current.selectionIds).toHaveLength(4);
    const preview = previewStudyFilterRecipe(
      current,
      createStudyFilterRecipe({ ...current.filters, minimumOccurrences: 1 }),
    );
    expect(preview.added).toBe(3);
    expect(preview.removed).toBe(0);
    expect(preview.addedWords).toEqual(['語10', '語11', '語12']);
  });

  it('reads only stored candidates, so an empty workspace previews cleanly', () => {
    const preview = previewStudyFilterRecipe(
      workspace([]),
      createStudyFilterRecipe({ maximumCards: 5 }),
    );
    expect(preview.candidates).toBe(0);
    expect(preview.selectedAfter).toBe(0);
    expect(preview.addedWords).toEqual([]);
  });
});

describe('portable Study recipe — reusing an earlier episode', () => {
  const episode = (id: string, number: number, seriesKey = 'the-big-o'): MediaItem => ({
    id,
    title: `The Big O - ${String(number).padStart(2, '0')}`,
    seriesTitle: 'The Big O',
    seriesKey,
    path: `C:\\media\\big-o-${number}.mkv`,
    fileName: `big-o-${number}.mkv`,
    addedAt: number,
    season: 1,
    episode: number,
    episodeKind: 'episode',
  });

  function documentWith(
    entries: ReadonlyArray<{ id: string; mediaId: string; filters?: Partial<StudyVocabularyFilters>; updatedAt: number; sourceKind?: 'media' | 'lookup-history' }>,
  ) {
    const doc = createEmptyStudyOrchestratorDocument();
    for (const entry of entries) {
      doc.workspaces[entry.id] = {
        ...workspace(twenty, entry.filters),
        id: entry.id,
        updatedAt: entry.updatedAt,
        context: {
          mediaId: entry.mediaId,
          sourceKind: entry.sourceKind ?? 'media',
          subtitleRecordId: `sub-${entry.mediaId}`,
        },
      };
    }
    return doc;
  }

  it('offers the newest other workspace of the same series', () => {
    const doc = documentWith([
      { id: 'ws-1', mediaId: 'media-1', filters: { maximumCards: 12, minimumOccurrences: 2 }, updatedAt: 2_000 },
      { id: 'ws-2', mediaId: 'media-2', updatedAt: 3_000 },
      { id: 'ws-3', mediaId: 'media-3', filters: { maximumCards: 9 }, updatedAt: 1_000 },
    ]);
    const source = studyFilterRecipeSource(
      [episode('media-1', 1), episode('media-2', 2), episode('media-3', 3)],
      doc,
      doc.workspaces['ws-2'],
    );
    expect(source?.workspaceId).toBe('ws-1');
    expect(source?.label).toBe('The Big O - 01');
    expect(source?.filters.maximumCards).toBe(12);
    expect(source?.filters.minimumOccurrences).toBe(2);
  });

  it('says nothing when the only other workspace already matches', () => {
    const doc = documentWith([
      { id: 'ws-1', mediaId: 'media-1', updatedAt: 2_000 },
      { id: 'ws-2', mediaId: 'media-2', updatedAt: 3_000 },
    ]);
    expect(studyFilterRecipeSource(
      [episode('media-1', 1), episode('media-2', 2)],
      doc,
      doc.workspaces['ws-2'],
    )).toBeNull();
  });

  it('never crosses series, lookup packs, or missing media', () => {
    const doc = documentWith([
      { id: 'other-series', mediaId: 'media-9', filters: { maximumCards: 5 }, updatedAt: 9_000 },
      { id: 'lookup', mediaId: 'study-lookup-history', filters: { maximumCards: 7 }, updatedAt: 8_000, sourceKind: 'lookup-history' },
      { id: 'gone', mediaId: 'media-removed', filters: { maximumCards: 6 }, updatedAt: 7_000 },
      { id: 'ws-2', mediaId: 'media-2', updatedAt: 3_000 },
    ]);
    expect(studyFilterRecipeSource(
      [episode('media-9', 9, 'cowboy-bebop'), episode('media-2', 2)],
      doc,
      doc.workspaces['ws-2'],
    )).toBeNull();
  });

  it('says nothing for media without a series identity', () => {
    const doc = documentWith([
      { id: 'ws-1', mediaId: 'media-1', filters: { maximumCards: 12 }, updatedAt: 2_000 },
      { id: 'ws-2', mediaId: 'media-2', updatedAt: 3_000 },
    ]);
    const loose = { ...episode('media-2', 2), seriesKey: undefined };
    expect(studyFilterRecipeSource(
      [episode('media-1', 1), loose],
      doc,
      doc.workspaces['ws-2'],
    )).toBeNull();
  });

  it('hands back text the paste box can parse straight through', () => {
    const doc = documentWith([
      { id: 'ws-1', mediaId: 'media-1', filters: { maximumCards: 12, excludedJlptLevels: ['N5'] }, updatedAt: 2_000 },
      { id: 'ws-2', mediaId: 'media-2', updatedAt: 3_000 },
    ]);
    const source = studyFilterRecipeSource(
      [episode('media-1', 1), episode('media-2', 2)],
      doc,
      doc.workspaces['ws-2'],
    );
    expect(source).not.toBeNull();
    if (!source) return;
    const text = serializeStudyFilterRecipe(
      createStudyFilterRecipe(source.filters, source.label),
    );
    const parsed = parseStudyFilterRecipe(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.recipe.filters).toEqual(source.filters);
    expect(parsed.recipe.label).toBe('The Big O - 01');
    const preview = previewStudyFilterRecipe(doc.workspaces['ws-2'], parsed.recipe);
    expect(preview.identical).toBe(false);
    expect(preview.changes.map((change) => change.field))
      .toEqual(['excludedJlptLevels', 'maximumCards']);
  });
});

describe('portable Study recipe — reversible application', () => {
  it('applies as one entry in the existing filter history and undoes exactly', () => {
    const current = workspace(twenty, { maximumCards: 20 });
    const recipe = createStudyFilterRecipe({
      ...current.filters,
      maximumCards: 6,
      excludeAnkiDuplicates: true,
    });
    const preview = previewStudyFilterRecipe(current, recipe);

    const applied = applyStudyVocabularyFilters(current, recipe.filters, 2_000);
    expect(applied.workspace.history).toHaveLength(1);
    expect(applied.workspace.filters).toEqual(recipe.filters);
    expect(applied.workspace.selectionIds).toHaveLength(preview.selectedAfter);
    expect(applied.operation.removedCount).toBe(preview.removed);
    expect(applied.operation.remainingCount).toBe(preview.selectedAfter);

    const undone = undoStudyVocabularyFilter(applied.workspace, 3_000);
    expect(undone.workspace.filters).toEqual(current.filters);
    expect(undone.workspace.selectionIds).toEqual(current.selectionIds);
    expect(undone.workspace.history).toEqual([]);
  });

  it('is idempotent: re-applying the same recipe removes nothing further', () => {
    const current = workspace(twenty, { maximumCards: 20 });
    const recipe = createStudyFilterRecipe({ ...current.filters, maximumCards: 6 });
    const once = applyStudyVocabularyFilters(current, recipe.filters, 2_000);
    const twice = applyStudyVocabularyFilters(once.workspace, recipe.filters, 2_100);
    expect(twice.operation.removedCount).toBe(0);
    expect(twice.workspace.selectionIds).toEqual(once.workspace.selectionIds);
    expect(previewStudyFilterRecipe(once.workspace, recipe).identical).toBe(true);
  });

  it('exports the applied filters back to identical text', () => {
    const current = workspace(twenty, { maximumCards: 20 });
    const recipe = createStudyFilterRecipe({ ...current.filters, excludedJlptLevels: ['N4', 'N5'] });
    const applied = applyStudyVocabularyFilters(current, recipe.filters, 2_000);
    expect(serializeStudyFilterRecipe(createStudyFilterRecipe(applied.workspace.filters)))
      .toBe(serializeStudyFilterRecipe(recipe));
  });
});
