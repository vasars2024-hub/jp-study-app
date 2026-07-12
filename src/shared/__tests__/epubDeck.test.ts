import { describe, expect, it } from 'vitest';
import { filterEpubCandidates, describeEpubFilterPipeline } from '../epubDeck';
import { buildSimpleEpubConfig } from '../simpleEpubMining';
import {
  DEFAULT_EPUB_EXPORT_OPTIONS,
  DEFAULT_MINING_LIMITS,
  type MiningCandidate,
  type TraditionalMiningConfig,
} from '../mining';

function makeCandidate(
  expression: string,
  count: number,
  primary?: number,
): MiningCandidate {
  return {
    expression,
    count,
    reading: undefined,
    sampleSentence: '',
    frequencies: primary == null ? { byDictionary: {} } : { primary, byDictionary: {} },
  };
}

function makeConfig(overrides?: Partial<TraditionalMiningConfig>): TraditionalMiningConfig {
  return {
    analyzer: 'kuromoji',
    limits: {
      ...DEFAULT_MINING_LIMITS,
      ...(overrides?.limits ?? {}),
    },
    templates: {
      front: '{expression}',
      back: '{meaning}',
      resetToAutomatic: false,
      ...(overrides?.templates ?? {}),
    },
    export: {
      ...DEFAULT_EPUB_EXPORT_OPTIONS,
      ...(overrides?.export ?? {}),
    },
  };
}

describe('filterEpubCandidates', () => {
  it('treats dictionary rank max 0 as no cap', () => {
    const config = makeConfig({
      export: {
        filterBy: 'deck-frequency',
        sortBy: 'deck-frequency',
        freqRangeMin: 500,
        freqRangeMax: 0,
        excludeKanaOnly: false,
      },
    });
    const filtered = filterEpubCandidates(
      [
        makeCandidate('common', 9, 100),
        makeCandidate('mid', 7, 500),
        makeCandidate('rare', 5, 9000),
      ],
      config,
    );
    expect(filtered.map((c) => c.expression)).toEqual(['mid', 'rare']);
  });

  it('does not apply maxCommonRank on top of dictionary rank filtering', () => {
    const config = makeConfig({
      limits: { maxCommonRank: 8000 },
      export: {
        filterBy: 'deck-frequency',
        sortBy: 'deck-frequency',
        freqRangeMin: 500,
        freqRangeMax: 0,
        excludeKanaOnly: false,
      },
    });
    const filtered = filterEpubCandidates(
      [
        makeCandidate('common', 9, 100),
        makeCandidate('mid', 7, 500),
        makeCandidate('rare', 5, 9000),
      ],
      config,
    );
    expect(filtered.map((c) => c.expression)).toEqual(['mid', 'rare']);
  });

  it('still applies maxCommonRank for book-rank filtering', () => {
    const config = makeConfig({
      limits: { maxCommonRank: 8000 },
      export: {
        filterBy: 'term-frequency',
        sortBy: 'deck-frequency',
        freqRangeMin: 0,
        freqRangeMax: 0,
        excludeKanaOnly: false,
      },
    });
    const filtered = filterEpubCandidates(
      [
        makeCandidate('common', 9, 100),
        makeCandidate('mid', 7, 500),
        makeCandidate('rare', 5, 9000),
      ],
      config,
    );
    expect(filtered.map((c) => c.expression)).toEqual(['rare']);
  });

  it('stacks book-frequency before dictionary-rank filtering', () => {
    const config = makeConfig({
      limits: { minFrequency: 2 },
      export: {
        filterBy: 'deck-frequency',
        freqRangeMin: 500,
        freqRangeMax: 0,
        excludeKanaOnly: false,
      },
    });
    const pool = [
      makeCandidate('hapax', 1, 600),
      makeCandidate('repeat', 2, 600),
      makeCandidate('common', 5, 100),
    ];
    const pipeline = describeEpubFilterPipeline(pool, config);
    expect(pipeline.steps.find((s) => s.id === 'book-frequency')?.count).toBe(2);
    expect(pipeline.steps.find((s) => s.id === 'dictionary-rank')?.count).toBe(1);
    expect(pipeline.final).toBe(1);
    expect(filterEpubCandidates(pool, config).map((c) => c.expression)).toEqual(['repeat']);
  });

  it('matches advanced and simple dictionary configs when minFrequency is shared', () => {
    const advanced = makeConfig({
      limits: { minFrequency: 1, maxCommonRank: 500 },
      export: {
        filterBy: 'deck-frequency',
        freqRangeMin: 500,
        freqRangeMax: 0,
        excludeKanaOnly: true,
        excludeNames: { japanese: true, chinese: true, russian: true, places: true },
      },
    });
    const simple = buildSimpleEpubConfig('dictionary', { freqMin: 500, freqMax: 0, minOccurrences: 1 });
    const pool = [
      makeCandidate('一度', 1, 700),
      makeCandidate('確認', 4, 1200),
      makeCandidate('こころ', 3, 900),
      makeCandidate('食べる', 8, 120),
    ];
    expect(filterEpubCandidates(pool, advanced).length).toBe(
      filterEpubCandidates(pool, simple).length,
    );
    expect(describeEpubFilterPipeline(pool, advanced).final).toBe(
      describeEpubFilterPipeline(pool, simple).final,
    );
  });

  it('drops hapax terms when minFrequency is 2', () => {
    const config = makeConfig({
      limits: { minFrequency: 2 },
      export: {
        filterBy: 'deck-frequency',
        freqRangeMin: 500,
        freqRangeMax: 0,
        excludeKanaOnly: false,
      },
    });
    const pool = [makeCandidate('hapax', 1, 700), makeCandidate('repeat', 2, 700)];
    expect(filterEpubCandidates(pool, config).length).toBe(1);
  });

  it('min frequency 2 + rank end 500: frequent low-rank word kept, rare high-rank word excluded', () => {
    // Spec QA scenario: "apple" ×3 ranked #50 stays; "zebra" ×1 ranked #4000 is
    // excluded on BOTH axes (below min occurrences and outside the rank window).
    const config = makeConfig({
      limits: { minFrequency: 2 },
      export: {
        filterBy: 'deck-frequency',
        freqRangeMin: 0,
        freqRangeMax: 500,
        excludeKanaOnly: false,
      },
    });
    const pool = [makeCandidate('林檎', 3, 50), makeCandidate('縞馬', 1, 4000)];
    expect(filterEpubCandidates(pool, config).map((c) => c.expression)).toEqual(['林檎']);
    // Each axis alone must also exclude it.
    const rankOnly = [makeCandidate('林檎', 3, 50), makeCandidate('縞馬', 3, 4000)];
    expect(filterEpubCandidates(rankOnly, config).map((c) => c.expression)).toEqual(['林檎']);
    const countOnly = [makeCandidate('林檎', 3, 50), makeCandidate('縞馬', 1, 400)];
    expect(filterEpubCandidates(countOnly, config).map((c) => c.expression)).toEqual(['林檎']);
  });

  it('kana-only exclusion is honored alongside every frequency mode', () => {
    const pool = [
      makeCandidate('こころ', 9, 100), // kana-only, would otherwise pass all filters
      makeCandidate('心臓', 9, 100),
    ];
    for (const filterBy of ['deck-frequency', 'term-frequency'] as const) {
      const config = makeConfig({
        limits: { minFrequency: 1 },
        export: {
          filterBy,
          freqRangeMin: 0,
          freqRangeMax: 0,
          excludeKanaOnly: true,
          excludeNames: { japanese: false, chinese: false, russian: false, places: false },
        },
      });
      expect(
        filterEpubCandidates(pool, config).map((c) => c.expression),
        `filterBy=${filterBy}`,
      ).toEqual(['心臓']);
    }
    // And in the occurrences strategy too.
    const occurrences = makeConfig({
      export: {
        strategy: 'occurrences',
        occurrenceFilterOp: 'gte',
        occurrenceThreshold: 1,
        excludeKanaOnly: true,
      },
    });
    expect(filterEpubCandidates(pool, occurrences).map((c) => c.expression)).toEqual(['心臓']);
  });
});
