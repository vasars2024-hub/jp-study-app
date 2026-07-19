import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRACTICE_FILTERS,
  categoryCounts,
  countMatching,
  dedupeGrammarByTitle,
  filterGrammarPoints,
  grammarTitleKey,
  hasActiveFilters,
  migrateLegacyFilters,
  sortGrammarPoints,
  type PracticeFilters,
} from '../data/grammar/practiceFilters';
import { GRAMMAR } from '../data/grammar';
import type { NormalizedGrammarPoint } from '../data/grammar/normalize';
import type { GrammarTagSource, GrammarVerification } from '../data/grammar/types';

function point(
  partial: Partial<NormalizedGrammarPoint> &
    Pick<NormalizedGrammarPoint, 'id' | 'title'> & {
      tagSource?: GrammarTagSource;
      registerSource?: GrammarTagSource;
      categorySource?: GrammarTagSource;
      verification?: GrammarVerification;
    },
): NormalizedGrammarPoint {
  const { tagSource, registerSource, categorySource, verification, ...rest } = partial;
  return {
    lang: 'ja',
    level: 'N5',
    meaning: 'test',
    structure: 'x',
    explanation: 'y',
    examples: [{ jp: 'ex', en: 'ex' }],
    functions: [],
    categories: [],
    register: 'neutral',
    provenance: {
      source: 'test',
      tagSource: tagSource ?? 'authored',
      registerSource: registerSource ?? tagSource ?? 'authored',
      categorySource: categorySource ?? tagSource ?? 'authored',
      verification: verification ?? 'verified',
      framework: 'jlpt',
      mappingConfidence: 1,
    },
    ...rest,
  };
}

function filters(overrides: Partial<PracticeFilters> = {}): PracticeFilters {
  return { ...DEFAULT_PRACTICE_FILTERS, ...overrides };
}

describe('filterGrammarPoints', () => {
  const corpus = [
    point({
      id: '1',
      title: '〜てください',
      meaning: 'please do',
      categories: ['request.ask'],
      level: 'N5',
    }),
    point({
      id: '2',
      title: '〜なければならない',
      meaning: 'must / obligation',
      categories: ['obligation.necessity'],
      register: 'business',
      level: 'N4',
    }),
    point({
      id: '3',
      title: '是…的',
      lang: 'zh',
      level: 'HSK4',
      meaning: 'focus construction',
      categories: ['emphasis.emphasize'],
    }),
    point({
      id: '4',
      title: '吧',
      lang: 'zh',
      level: 'HSK2',
      meaning: 'suggestion particle',
      categories: ['request.invite'],
      register: 'casual',
    }),
  ];

  it('filters by language and level', () => {
    expect(
      filterGrammarPoints(corpus, filters({ lang: 'zh', levels: ['HSK2'] })).map((p) => p.id),
    ).toEqual(['4']);
  });

  it('ANDs categories with register', () => {
    const out = filterGrammarPoints(
      corpus,
      filters({ lang: 'ja', categories: ['obligation.necessity'], registers: ['business'] }),
    );
    expect(out.map((p) => p.id)).toEqual(['2']);
  });

  it('ORs within the category group', () => {
    const out = filterGrammarPoints(
      corpus,
      filters({ categories: ['request.ask', 'request.invite'] }),
    );
    expect(out.map((p) => p.id).sort()).toEqual(['1', '4']);
  });

  it('ORs within the level group', () => {
    const out = filterGrammarPoints(corpus, filters({ levels: ['N5', 'HSK2'] }));
    expect(out.map((p) => p.id).sort()).toEqual(['1', '4']);
  });

  it('ANDs across groups, returning nothing when they do not intersect', () => {
    // N5 exists and HSK2 exists, but no N5 point is Chinese.
    const out = filterGrammarPoints(corpus, filters({ lang: 'zh', levels: ['N5'] }));
    expect(out).toEqual([]);
  });

  it('lets exclusions win over inclusions', () => {
    const out = filterGrammarPoints(
      corpus,
      filters({
        categories: ['request.ask', 'request.invite'],
        excludeCategories: ['request.invite'],
      }),
    );
    expect(out.map((p) => p.id)).toEqual(['1']);
  });

  describe('register semantics — the Business regression', () => {
    /*
     * The bug: register was inferred by regex over the English gloss, so this
     * casual pattern was tagged 'business' because its meaning text contains
     * the word "formal". Filtering by Business surfaced it.
     */
    const misTagged = point({
      id: 'casual-but-tagged-business',
      title: '〜じゃん',
      meaning: 'a less formal way to say ね',
      register: 'business',
      tagSource: 'heuristic',
    });
    const genuine = point({
      id: 'genuinely-formal',
      title: 'お〜になる',
      meaning: 'honorific',
      register: 'business',
      tagSource: 'derived',
    });
    const pool = [misTagged, genuine];

    it('excludes gloss-inferred register matches by default', () => {
      const out = filterGrammarPoints(pool, filters({ registers: ['business'] }));
      expect(out.map((p) => p.id)).toEqual(['genuinely-formal']);
    });

    it('includes them only when the user opts out of verified-only', () => {
      const out = filterGrammarPoints(
        pool,
        filters({ registers: ['business'], verifiedTagsOnly: false }),
      );
      expect(out.map((p) => p.id).sort()).toEqual([
        'casual-but-tagged-business',
        'genuinely-formal',
      ]);
    });

    it('defaults verifiedTagsOnly to on', () => {
      expect(DEFAULT_PRACTICE_FILTERS.verifiedTagsOnly).toBe(true);
    });

    it('keeps a derived register usable when the categories are guesses', () => {
      /*
       * Regression, found by driving the panel in a browser: register and
       * category provenance were collapsed into one weakest-link field, so
       * every Japanese record whose register was derived from 敬語 morphology
       * — but whose categories came from the Mazii regex — failed the verified
       * gate. Filtering by Formal returned Chinese records exclusively.
       */
      const japaneseHonorific = point({
        id: 'ja-honorific',
        title: 'お〜になる',
        register: 'business',
        registerSource: 'derived',
        categorySource: 'heuristic',
      });
      const out = filterGrammarPoints([japaneseHonorific], filters({ registers: ['business'] }));
      expect(out.map((p) => p.id)).toEqual(['ja-honorific']);
    });

    it('still rejects a guessed register even when the categories are authored', () => {
      const inverse = point({
        id: 'guessed-register',
        title: 'x',
        register: 'business',
        registerSource: 'heuristic',
        categorySource: 'authored',
      });
      expect(filterGrammarPoints([inverse], filters({ registers: ['business'] }))).toEqual([]);
    });

    it('applies the same gate to category queries', () => {
      const guessed = point({
        id: 'guessed-category',
        title: 'x',
        categories: ['cause.reason'],
        tagSource: 'heuristic',
      });
      const known = point({
        id: 'known-category',
        title: 'y',
        categories: ['cause.reason'],
        tagSource: 'authored',
      });
      const out = filterGrammarPoints([guessed, known], filters({ categories: ['cause.reason'] }));
      expect(out.map((p) => p.id)).toEqual(['known-category']);
    });
  });

  describe('content gates', () => {
    const noExamples = point({
      id: 'bare',
      title: 'bare',
      examples: [],
      verification: 'missing',
    });
    const full = point({ id: 'full', title: 'full' });

    it('hides content-missing records when studyReadyOnly is on', () => {
      const out = filterGrammarPoints([noExamples, full], filters({ studyReadyOnly: true }));
      expect(out.map((p) => p.id)).toEqual(['full']);
    });

    it('filters on example presence independently', () => {
      const out = filterGrammarPoints([noExamples, full], filters({ requireExamples: true }));
      expect(out.map((p) => p.id)).toEqual(['full']);
    });
  });

  describe('search', () => {
    it('searches meaning and structure', () => {
      expect(filterGrammarPoints(corpus, filters({ query: 'focus' })).map((p) => p.id)).toEqual([
        '3',
      ]);
    });

    it('still finds records by their legacy tag wording', () => {
      const legacy = point({
        id: 'legacy',
        title: 'z',
        meaning: 'nothing relevant',
        functions: ['reverent-humble'],
      });
      // "Reverent/humble" is the old machine-translated label.
      expect(filterGrammarPoints([legacy], filters({ query: 'reverent' })).map((p) => p.id)).toEqual(
        ['legacy'],
      );
    });

    it('is case insensitive', () => {
      expect(filterGrammarPoints(corpus, filters({ query: 'FOCUS' })).map((p) => p.id)).toEqual([
        '3',
      ]);
    });
  });

  describe('counts', () => {
    it('agrees with the list the same filters produce', () => {
      const cases: PracticeFilters[] = [
        filters(),
        filters({ lang: 'zh' }),
        filters({ categories: ['request.ask'] }),
        filters({ registers: ['business'] }),
        filters({ levels: ['N5', 'N4'], query: 'e' }),
      ];
      for (const f of cases) {
        expect(countMatching(corpus, f)).toBe(filterGrammarPoints(corpus, f).length);
      }
    });

    it('computes category counts against the other active filters', () => {
      // Restricting to Chinese must not report the Japanese request.ask record.
      const counts = categoryCounts(corpus, filters({ lang: 'zh' }));
      expect(counts['request.ask']).toBeUndefined();
      expect(counts['request.invite']).toBe(1);
    });
  });

  describe('zero-result and reset states', () => {
    it('returns an empty array rather than throwing', () => {
      expect(filterGrammarPoints(corpus, filters({ query: 'zzzzz' }))).toEqual([]);
    });

    it('reports the default filter set as inactive', () => {
      expect(hasActiveFilters(DEFAULT_PRACTICE_FILTERS)).toBe(false);
    });

    it('reports any set filter as active', () => {
      expect(hasActiveFilters(filters({ levels: ['N5'] }))).toBe(true);
      expect(hasActiveFilters(filters({ query: ' x ' }))).toBe(true);
      expect(hasActiveFilters(filters({ query: '   ' }))).toBe(false);
    });
  });

  describe('sorting', () => {
    it('orders by level within a language', () => {
      const out = sortGrammarPoints(
        [point({ id: 'a', title: 'a', level: 'N1' }), point({ id: 'b', title: 'b', level: 'N5' })],
        'level',
      );
      expect(out.map((p) => p.id)).toEqual(['b', 'a']);
    });

    it('is stable for the random sort within a session', () => {
      const a = sortGrammarPoints(corpus, 'random').map((p) => p.id);
      const b = sortGrammarPoints(corpus, 'random').map((p) => p.id);
      expect(a).toEqual(b);
    });

    it('ranks more complete records first', () => {
      const sparse = point({ id: 'sparse', title: 's', examples: [], tagSource: 'heuristic' });
      const rich = point({ id: 'rich', title: 'r', categories: ['request.ask'] });
      expect(sortGrammarPoints([sparse, rich], 'completeness').map((p) => p.id)).toEqual([
        'rich',
        'sparse',
      ]);
    });
  });

  describe('dedupeGrammarByTitle', () => {
    it('dedupes by normalized title + lang', () => {
      const dupes = [
        point({ id: 'a', title: '〜て ください' }),
        point({ id: 'b', title: '〜てください' }),
        point({ id: 'c', title: '〜てください', lang: 'zh' }),
      ];
      expect(dedupeGrammarByTitle(dupes).map((p) => p.id)).toEqual(['a', 'c']);
    });

    it('matches across the two sources’ notations', () => {
      /*
       * The authored files write 〜前に, the Mazii dump writes "... 前に". A
       * whitespace-only key matched zero of the 189 such pairs, so every one
       * was displayed twice.
       */
      const authored = point({ id: 'core', title: '〜前に', examples: [{ jp: 'x', en: 'y' }] });
      const scraped = point({ id: 'mazii', title: '... 前に', examples: [] });
      expect(dedupeGrammarByTitle([authored, scraped]).map((p) => p.id)).toEqual(['core']);
    });

    it('keeps the record with real content regardless of order', () => {
      // index.ts emits N4_MAZII before N3, so the hollow copy can come first.
      const hollow = point({
        id: 'hollow',
        title: 'てもかまわない',
        meaning: 'it does not matter',
        explanation: 'it does not matter', // copy of meaning
        structure: 'てもかまわない', // copy of title
        examples: [],
      });
      const rich = point({
        id: 'rich',
        title: '〜てもかまわない',
        meaning: "it's fine even if",
        explanation: 'Granting permission, softer than 〜てもいい.',
        structure: 'V-te + もかまわない',
        examples: [{ jp: 'x', en: 'y' }],
      });
      expect(dedupeGrammarByTitle([hollow, rich]).map((p) => p.id)).toEqual(['rich']);
      expect(dedupeGrammarByTitle([rich, hollow]).map((p) => p.id)).toEqual(['rich']);
    });

    it('preserves a level disagreement instead of resolving it silently', () => {
      const n5 = point({
        id: 'core',
        title: '〜前に',
        level: 'N5',
        examples: [{ jp: 'x', en: 'y' }],
      });
      const n4 = point({ id: 'mazii', title: '...前に', level: 'N4', examples: [] });
      const [merged] = dedupeGrammarByTitle([n5, n4]);
      expect(merged.id).toBe('core');
      expect(merged.level).toBe('N5');
      expect(merged.alternateLevels).toEqual(['N4']);
    });

    it('leaves alternateLevels unset when the sources agree', () => {
      const a = point({ id: 'a', title: '〜らしい', level: 'N4', examples: [{ jp: 'x', en: 'y' }] });
      const b = point({ id: 'b', title: 'らしい', level: 'N4', examples: [] });
      expect(dedupeGrammarByTitle([a, b])[0].alternateLevels).toBeUndefined();
    });

    it('does not merge genuinely different patterns', () => {
      const a = point({ id: 'a', title: '〜ばかり' });
      const b = point({ id: 'b', title: '〜ばかりに' });
      expect(dedupeGrammarByTitle([a, b])).toHaveLength(2);
    });

    describe('Phase 1.5 notation gaps', () => {
      /*
       * Each of these surfaced as a visible double entry after the Phase 1
       * dedupe shipped. They are notation differences inside the Mazii dump,
       * not distinct patterns.
       */
      it('treats all three tilde characters as the same placeholder', () => {
        // 〜 wave dash, ～ fullwidth, ~ ASCII — the dump mixes all three.
        const wave = point({ id: 'wave', title: 'ほど〜ない' });
        const full = point({ id: 'full', title: 'ほど～ない' });
        const ascii = point({ id: 'ascii', title: 'ほど~ない' });
        expect(dedupeGrammarByTitle([wave, full, ascii])).toHaveLength(1);
      });

      it('ignores brackets around an optional trailing particle', () => {
        // Mazii writes ため(に); the authored files write 〜ために. The scraped
        // record carries the real dump's shape: no examples, explanation a copy
        // of meaning, structure a copy of title.
        const scraped = point({
          id: 'mazii',
          title: 'ため(に)',
          meaning: 'in order to',
          explanation: 'in order to',
          structure: 'ため(に)',
          examples: [],
        });
        const authored = point({
          id: 'core',
          title: '〜ために',
          meaning: 'in order to / for the sake of',
          explanation: 'Marks the purpose an action serves.',
          structure: 'V-dict / N + の + ために',
          examples: [{ jp: 'x', en: 'y' }],
        });
        expect(dedupeGrammarByTitle([scraped, authored]).map((p) => p.id)).toEqual(['core']);
      });

      it('treats both slash characters alike', () => {
        const a = point({ id: 'a', title: '〜なりに / 〜なりの', examples: [{ jp: 'x', en: 'y' }] });
        const b = point({ id: 'b', title: '～なりに／～なりの' });
        expect(dedupeGrammarByTitle([a, b]).map((p) => p.id)).toEqual(['a']);
      });

      it('strips only the brackets, not what they contain', () => {
        // Removing bracketed *content* would collapse these two into one.
        const a = point({ id: 'a', title: '以上(は)' });
        const b = point({ id: 'b', title: '以上(の)' });
        expect(dedupeGrammarByTitle([a, b])).toHaveLength(2);
      });
    });
  });

  /*
   * Corpus-level invariants.
   *
   * The lesson recorded in GRAMMARX_REDESIGN_PLAN.md §1.4 is that the unit
   * tests above stayed green for the entire period the shipped filters were
   * unusable, because they only ever exercised hand-built fixtures. These
   * assert against the real corpus instead.
   */
  describe('grammarTitleKey against the shipped corpus', () => {
    it('never produces an empty key', () => {
      const empty = GRAMMAR.filter((p) => grammarTitleKey(p.lang, p.title).split('|')[1] === '');
      expect(empty.map((p) => p.id)).toEqual([]);
    });

    it('does not collide two authored titles', () => {
      // Authored records are the ones carrying hand-written categories.
      const authored = GRAMMAR.filter((p) => p.provenance.categorySource === 'authored');
      expect(authored.length).toBeGreaterThan(300);

      const byKey = new Map<string, string[]>();
      for (const p of authored) {
        const k = grammarTitleKey(p.lang, p.title);
        byKey.set(k, [...(byKey.get(k) ?? []), p.id]);
      }
      const collisions = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
      expect(collisions).toEqual([]);
    });

    it('leaves no duplicate rows after dedupe', () => {
      const deduped = dedupeGrammarByTitle(GRAMMAR);
      const keys = deduped.map((p) => grammarTitleKey(p.lang, p.title));
      expect(keys.length).toBe(new Set(keys).size);
    });

    it('promotes imported-example records out of "missing" without touching authored ones', () => {
      /*
       * Attaching Tatoeba examples is the ONLY thing that promotes a scraped
       * record into study material — verificationFor() reports 'missing'
       * exactly when examples are absent, and studyReadyOnly excludes only
       * 'missing'. If that coupling is ever broken, this fails.
       */
      const imported = GRAMMAR.filter((p) =>
        p.examples.some((e) => e.source === 'tatoeba'),
      );
      expect(imported.length).toBeGreaterThan(500);
      for (const p of imported) {
        expect(p.provenance.verification).not.toBe('missing');
      }
    });

    it('never overwrites a hand-authored example with an imported one', () => {
      const authored = GRAMMAR.filter((p) => p.provenance.categorySource === 'authored');
      const contaminated = authored.filter((p) =>
        p.examples.some((e) => e.source === 'tatoeba'),
      );
      expect(contaminated.map((p) => p.id)).toEqual([]);
    });

    it('keeps every imported sentence traceable for attribution', () => {
      // CC-BY 2.0 FR: a sentence we redistribute must stay linkable to its source.
      const bad = GRAMMAR.flatMap((p) => p.examples)
        .filter((e) => e.source === 'tatoeba')
        .filter((e) => !e.sourceId || !/^\d+$/.test(e.sourceId));
      expect(bad).toEqual([]);
    });

    it('never lets a hollow record displace an authored one', () => {
      const authoredIds = new Set(
        GRAMMAR.filter((p) => p.provenance.categorySource === 'authored').map((p) => p.id),
      );
      const survivingIds = new Set(dedupeGrammarByTitle(GRAMMAR).map((p) => p.id));
      const lost = [...authoredIds].filter((id) => !survivingIds.has(id));
      expect(lost).toEqual([]);
    });
  });
});

describe('migrateLegacyFilters', () => {
  it('maps legacy function ids to canonical categories', () => {
    const out = migrateLegacyFilters({ functions: ['reverent-humble', 'cause-reason'] });
    expect(out.categories.sort()).toEqual(['cause.reason', 'register.honorific'].sort());
  });

  it('turns the business/casual booleans into a register list', () => {
    expect(migrateLegacyFilters({ business: true }).registers).toEqual(['business']);
    expect(migrateLegacyFilters({ business: true, casual: true }).registers.sort()).toEqual([
      'business',
      'casual',
    ]);
    expect(migrateLegacyFilters({}).registers).toEqual([]);
  });

  it('preserves language, levels and query', () => {
    const out = migrateLegacyFilters({ lang: 'zh', levels: ['HSK3'], query: 'test' });
    expect(out.lang).toBe('zh');
    expect(out.levels).toEqual(['HSK3']);
    expect(out.query).toBe('test');
  });

  it('does not shrink a returning user’s register results without warning', () => {
    // They were matching heuristic tags before; keep that until they opt in.
    expect(migrateLegacyFilters({ business: true }).verifiedTagsOnly).toBe(false);
  });

  it('turns verified-only on for users who had no register filter', () => {
    expect(migrateLegacyFilters({ levels: ['N5'] }).verifiedTagsOnly).toBe(true);
  });

  it('drops the "other" fallback instead of resolving it to a category', () => {
    expect(migrateLegacyFilters({ functions: ['other'] }).categories).toEqual([]);
  });

  it('survives malformed persisted data', () => {
    const out = migrateLegacyFilters({
      levels: 'not-an-array' as never,
      functions: null as never,
      query: 42 as never,
    });
    expect(out.levels).toEqual([]);
    expect(out.categories).toEqual([]);
    expect(out.query).toBe('');
  });
});
