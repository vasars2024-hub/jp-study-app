// @vitest-environment jsdom
/**
 * D174/D175/D176 — three defects with ONE shape: the translations were written,
 * translated into ja/zh/ru, and never wired to the component that needed them.
 *
 * `mediaProfile.*` is 15 keys, complete in all four catalogs, with **zero call
 * sites**; `MediaLanguageProfileCard` rendered `Known vocabulary`,
 * `Unique words`, `{n} study sessions` and the raw machine token `native` as
 * English literals on both surfaces that host it. `vnPanel.duration.{hm,m}` is
 * the same story next door in `VisualNovelPanel`.
 *
 * Nothing in the repo could catch this: `i18n-check` asks whether a key is
 * TRANSLATED, `i18n-hardcoded-check` asks whether a file adopts `t()` at all,
 * and `partial-i18n-scan` scores files that already call `t()` — a file with no
 * `t()` and a fully-translated key block of its own is invisible to all three.
 * So the guard here is a USAGE gate: every `mediaProfile.*` / `vnPanel.duration.*`
 * key must have a consumer, and every key the card can ask for must exist.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureCatalog, catalogFor } from '../../shared/i18n/catalogs';
import { getUiLang, setUiLang } from '../i18n';
import MediaLanguageProfileCard, { recommendationKey } from '../components/media/MediaLanguageProfileCard';
import { recommendationKind } from '../mediaStudyWorkflow';

const SRC = join(__dirname, '..', '..');

type Lang = 'en' | 'ja' | 'zh' | 'ru';
const LANGS = ['en', 'ja', 'zh', 'ru'] as const;

async function switchTo(lang: Lang): Promise<void> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await new Promise((r) => setTimeout(r, 0));
  expect(getUiLang(), `the switch to ${lang} never landed`).toBe(lang);
}

describe('recommendationKind', () => {
  it('cuts at the same two thresholds the English sentence always used', () => {
    expect(recommendationKind(1)).toBe('comfortable');
    expect(recommendationKind(0.9)).toBe('comfortable');
    expect(recommendationKind(0.899)).toBe('challenging');
    expect(recommendationKind(0.75)).toBe('challenging');
    expect(recommendationKind(0.749)).toBe('intensive');
    expect(recommendationKind(0)).toBe('intensive');
  });
});

describe('recommendationKey', () => {
  it('only appends a level to the two verdicts that ever mentioned one', () => {
    expect(recommendationKey({ knownRatio: 0.95, jlptLevel: 'N3' }))
      .toBe('mediaProfile.recommendation.comfortable');
    expect(recommendationKey({ knownRatio: 0.8, jlptLevel: null }))
      .toBe('mediaProfile.recommendation.challenging');
    expect(recommendationKey({ knownRatio: 0.8, jlptLevel: 'N3' }))
      .toBe('mediaProfile.recommendation.challengingAt');
    expect(recommendationKey({ knownRatio: 0.1, jlptLevel: null }))
      .toBe('mediaProfile.recommendation.intensive');
    expect(recommendationKey({ knownRatio: 0.1, jlptLevel: 'N1' }))
      .toBe('mediaProfile.recommendation.intensiveAt');
  });

  /**
   * A key the catalogs do not answer renders as the key itself and no catalog
   * check fires, because it is missing from `en` too. So enumerate every key the
   * card can produce and prove all four languages answer it.
   */
  it('produces only keys that all four catalogs answer', async () => {
    const reachable = new Set<string>();
    for (const knownRatio of [1, 0.9, 0.8, 0.75, 0.5, 0]) {
      for (const jlptLevel of [null, 'N3']) {
        reachable.add(recommendationKey({ knownRatio, jlptLevel }));
      }
    }
    expect(reachable.size, 'the card can reach five distinct sentences').toBe(5);
    for (const lang of LANGS) {
      await ensureCatalog(lang);
      const catalog = catalogFor(lang);
      for (const key of reachable) {
        expect(catalog[key], `${lang} cannot answer ${key}`).toBeTypeOf('string');
      }
    }
  });
});

/**
 * The usage gate. This is the test that would have caught all three defects on
 * the day the keys landed, and it is the only one of these that generalises.
 */
describe('every translated key in these blocks has a consumer', () => {
  const files = [
    'renderer/components/media/MediaLanguageProfileCard.tsx',
    'renderer/components/immersion/VisualNovelPanel.tsx',
    'renderer/mediaStudyWorkflow.ts',
  ].map((rel) => readFileSync(join(SRC, rel), 'utf8')).join('\n');

  const en = readFileSync(join(SRC, 'shared/i18n/catalogs/en.ts'), 'utf8');

  function keysMatching(prefix: string): string[] {
    const found = new Set<string>();
    for (const line of en.split('\n')) {
      const m = /^\s*'((?:mediaProfile|vnPanel)\.[\w.]+)'\s*:/.exec(line);
      if (m && m[1].startsWith(prefix)) found.add(m[1]);
    }
    return [...found];
  }

  // `mediaProfile.minutes` ('{count} min') used to make 20. This gate found it
  // orphaned on its first run — the card's duration line now goes through the
  // shared `formatDuration`, which speaks the language AND handles hours, so the
  // key was deleted from all four catalogs rather than wired to nothing.
  it.each([
    ['mediaProfile.', 19],
    ['vnPanel.duration.', 2],
  ])('%s is reachable from the components that own it', (prefix, atLeast) => {
    const keys = keysMatching(prefix);
    expect(keys.length, `${prefix} lost its keys`).toBeGreaterThanOrEqual(atLeast);

    const orphans = keys.filter((key) => {
      // Either the literal key, or the dynamic-suffix form the card builds:
      // `mediaProfile.band.${band}` / `mediaProfile.recommendation.${kind}`.
      if (files.includes(`'${key}'`) || files.includes(`\`${key}\``)) return true;
      const stem = key.slice(0, key.lastIndexOf('.') + 1);
      return files.includes(`${stem}$`);
    });
    expect(orphans, `${prefix} keys with no consumer`).toEqual(keys);
  });
});

describe('MediaLanguageProfileCard renders in the interface language', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    setUiLang('en');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    vi.restoreAllMocks();
  });

  /**
   * A profile whose `recommendation` field carries the OLD frozen English
   * sentence, which is what every profile already in the user's store looks
   * like. The card must ignore it and re-derive from `knownRatio`.
   */
  const PROFILE = {
    mediaId: 'vn:test',
    title: 'テスト',
    updatedAt: 0,
    analyzedCharacters: 100,
    truncated: false,
    difficulty: {
      score: 62,
      band: 'native' as const,
      jlptLevel: null,
      confidence: 0.5,
      knownRatio: 0.5,
      unknownRatio: 0.5,
      recommendation: 'Intensive study content.',
    },
    vocabulary: {
      totalOccurrences: 10,
      uniqueWords: 7,
      knownWordsEstimate: 3,
      unknownWordsEstimate: 4,
      jlptDistribution: {},
      top: [],
    },
    kanji: { totalOccurrences: 4, uniqueKanji: 3, jlptDistribution: {}, top: [] },
    grammar: { totalHits: 0, uniquePatterns: 0, levelDistribution: {}, top: [] },
  };

  async function render(lang: Lang): Promise<string> {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) =>
      key.includes('media-study')
        ? JSON.stringify({ version: 1, profiles: { 'vn:test': PROFILE }, sessions: [] })
        : null,
    );
    await switchTo(lang);
    await act(async () => {
      root.render(<MediaLanguageProfileCard mediaId="vn:test" />);
    });
    return host.textContent ?? '';
  }

  it('is English by default, and the band is a WORD, not the machine token', async () => {
    const text = await render('en');
    expect(text, 'the card did not render — check the store shape').toContain('テスト');
    expect(text).toContain('Known vocabulary');
    expect(text).toContain('Unique words');
    // `band` is the token `native`; rendered raw it is lower case even in English.
    expect(text).toContain('Native');
    expect(text).not.toContain('native');
  });

  it('speaks Japanese, with no English chrome left behind', async () => {
    const text = await render('ja');
    expect(text).toContain('既知の語彙');
    expect(text).toContain('ネイティブ');
    for (const english of ['Known vocabulary', 'Unique words', 'Unique kanji', 'Saved language profile']) {
      expect(text, `${english} survived the switch`).not.toContain(english);
    }
  });

  it('re-derives the verdict rather than printing the sentence frozen in the store', async () => {
    const ru = await render('ru');
    expect(
      ru,
      'the English sentence baked into the profile at analysis time is on screen',
    ).not.toContain('Intensive study content.');
    expect(ru).toContain('интенсивного');
  });
});
