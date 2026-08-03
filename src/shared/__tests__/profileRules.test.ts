/**
 * Pure profile-rules engine tests (no Electron).
 */
import { describe, expect, it } from 'vitest';
import {
  buildRouteContext,
  detectMineLanguage,
  firstShadowingRuleIndex,
  normalizeProfileRulesStore,
  resolveProfileId,
  resolveProfileMatch,
  ruleMatches,
  ruleMatchesEverything,
  ruleSupersetOf,
  type ProfileRule,
} from '../profileRules';

describe('profileRules', () => {
  const base: ProfileRule = {
    id: 'r1',
    enabled: true,
    label: 'Chrome sentences JA',
    profileId: 'prof-chrome-ja',
    match: { source: 'extension', cardKind: 'sentence', language: 'ja' },
  };

  it('matches all specified dimensions', () => {
    expect(
      ruleMatches(base, { source: 'extension', cardKind: 'sentence', language: 'ja' }),
    ).toBe(true);
    expect(ruleMatches(base, { source: 'epub', cardKind: 'sentence', language: 'ja' })).toBe(false);
    expect(ruleMatches(base, { source: 'extension', cardKind: 'word', language: 'ja' })).toBe(false);
    expect(
      ruleMatches(base, { source: 'extension', cardKind: 'sentence', language: 'zh' }),
    ).toBe(false);
  });

  it('matches optional category dimension', () => {
    const newsRule: ProfileRule = {
      ...base,
      id: 'news',
      label: 'News mines',
      match: { source: 'extension', cardKind: 'any', language: 'any', category: 'news' },
    };
    expect(
      ruleMatches(newsRule, {
        source: 'extension',
        cardKind: 'word',
        language: 'ja',
        category: 'news',
      }),
    ).toBe(true);
    expect(
      ruleMatches(newsRule, {
        source: 'extension',
        cardKind: 'word',
        language: 'ja',
        category: 'manga',
      }),
    ).toBe(false);
    expect(
      ruleMatches(newsRule, { source: 'extension', cardKind: 'word', language: 'ja' }),
    ).toBe(false);
  });

  it('treats any/undefined as wildcard', () => {
    const anyRule: ProfileRule = {
      ...base,
      id: 'r2',
      match: { source: 'any', cardKind: 'word', language: 'any', category: 'any' },
    };
    expect(ruleMatches(anyRule, { source: 'audio', cardKind: 'word', language: 'ru' })).toBe(true);
  });

  it('ignores disabled rules', () => {
    expect(
      ruleMatches({ ...base, enabled: false }, { source: 'extension', cardKind: 'sentence', language: 'ja' }),
    ).toBe(false);
  });

  it('resolveProfileId uses first match then default', () => {
    const rules: ProfileRule[] = [
      { ...base, id: 'a', profileId: 'p-a' },
      {
        id: 'b',
        enabled: true,
        label: 'audio',
        profileId: 'p-audio',
        match: { source: 'audio', cardKind: 'any', language: 'any' },
      },
    ];
    expect(
      resolveProfileId(rules, { source: 'extension', cardKind: 'sentence', language: 'ja' }, 'default'),
    ).toBe('p-a');
    expect(
      resolveProfileId(rules, { source: 'audio', cardKind: 'sentence', language: 'ja' }, 'default'),
    ).toBe('p-audio');
    expect(
      resolveProfileId(rules, { source: 'epub', cardKind: 'word', language: 'zh' }, 'default'),
    ).toBe('default');
  });

  it('treats subtitle and recorded audio as separate rule sources', () => {
    const subtitleRule: ProfileRule = {
      id: 'subtitle',
      enabled: true,
      label: 'Subtitle cards',
      profileId: 'p-subtitle',
      match: { source: 'subtitle', cardKind: 'any', language: 'any' },
    };
    expect(
      ruleMatches(subtitleRule, {
        source: 'subtitle',
        cardKind: 'sentence',
        language: 'ja',
      }),
    ).toBe(true);
    expect(
      ruleMatches(subtitleRule, {
        source: 'audio',
        cardKind: 'sentence',
        language: 'ja',
      }),
    ).toBe(false);
  });

  it('resolveProfileMatch returns rule label metadata', () => {
    const rules: ProfileRule[] = [
      {
        id: 'yt',
        enabled: true,
        label: 'YT profile',
        profileId: 'p-yt',
        match: { source: 'extension', category: 'youtube', cardKind: 'any', language: 'any' },
      },
    ];
    const hit = resolveProfileMatch(
      rules,
      { source: 'extension', cardKind: 'word', language: 'ja', category: 'youtube' },
      'default',
    );
    expect(hit.profileId).toBe('p-yt');
    expect(hit.matchedRule?.label).toBe('YT profile');
    expect(hit.usedDefault).toBe(false);

    const miss = resolveProfileMatch(
      rules,
      { source: 'extension', cardKind: 'word', language: 'ja', category: 'news' },
      'default',
    );
    expect(miss.profileId).toBe('default');
    expect(miss.usedDefault).toBe(true);
  });

  it('detectMineLanguage heuristics', () => {
    expect(detectMineLanguage('今日はいい天気です。')).toBe('ja');
    expect(detectMineLanguage('今天天气很好')).toBe('zh');
    expect(detectMineLanguage('Привет мир')).toBe('ru');
    expect(detectMineLanguage('hello')).toBe('unknown');
  });

  it('buildRouteContext fills defaults and resolves language', () => {
    // Explicit language wins.
    expect(buildRouteContext({ source: 'reader', cardKind: 'sentence', language: 'zh' })).toEqual({
      source: 'reader',
      cardKind: 'sentence',
      language: 'zh',
      category: undefined,
    });
    // Defaults: source→other, cardKind→word; language auto-detected from text.
    expect(buildRouteContext(undefined, { text: '今日はいい天気' })).toEqual({
      source: 'other',
      cardKind: 'word',
      language: 'ja',
      category: undefined,
    });
    // Undetectable text falls back to the provided fallback language.
    expect(buildRouteContext({ source: 'dictionary' }, { text: 'hello', fallbackLanguage: 'ja' })).toEqual({
      source: 'dictionary',
      cardKind: 'word',
      language: 'ja',
      category: undefined,
    });
    // 'any'/none category is normalized to undefined.
    expect(buildRouteContext({ category: 'any' }).category).toBeUndefined();
    expect(buildRouteContext({ source: 'extension', category: 'news' }).category).toBe('news');
  });

  it('ruleMatchesEverything detects catch-all rules', () => {
    expect(ruleMatchesEverything({ ...base, match: {} })).toBe(true);
    expect(
      ruleMatchesEverything({
        ...base,
        match: { source: 'any', cardKind: 'any', language: 'any', category: 'any' },
      }),
    ).toBe(true);
    expect(ruleMatchesEverything(base)).toBe(false); // base pins source/cardKind/language
  });

  it('ruleSupersetOf and firstShadowingRuleIndex flag unreachable rules', () => {
    const catchAll: ProfileRule = {
      id: 'all',
      enabled: true,
      label: 'everything',
      profileId: 'p-all',
      match: {},
    };
    // catchAll matches every context that `base` matches.
    expect(ruleSupersetOf(catchAll, base)).toBe(true);
    // base is more specific, so it does NOT superset the catch-all.
    expect(ruleSupersetOf(base, catchAll)).toBe(false);

    // A catch-all placed first shadows a specific rule after it.
    const rules: ProfileRule[] = [catchAll, { ...base, id: 'later' }];
    expect(firstShadowingRuleIndex(rules, 1)).toBe(0);
    // Reverse order: the specific rule first is reachable.
    const reversed: ProfileRule[] = [{ ...base, id: 'first' }, catchAll];
    expect(firstShadowingRuleIndex(reversed, 1)).toBe(-1);
    // A disabled earlier rule cannot shadow.
    const disabledFirst: ProfileRule[] = [{ ...catchAll, enabled: false }, { ...base, id: 'x' }];
    expect(firstShadowingRuleIndex(disabledFirst, 1)).toBe(-1);
  });

  it('normalizeProfileRulesStore drops bad rules', () => {
    const store = normalizeProfileRulesStore({
      rules: [
        { id: 'ok', profileId: 'p1', enabled: true, match: { source: 'chrome' } },
        { id: 'bad', profileId: '', match: {} },
        {
          profileId: 'p2',
          match: { source: 'extension', cardKind: 'sentence', category: 'manga' },
        },
      ],
    });
    expect(store.schemaVersion).toBe(2);
    expect(store.rules).toHaveLength(2);
    expect(store.rules[0].match.source).toBe('any'); // invalid 'chrome' → any
    expect(store.rules[1].profileId).toBe('p2');
    expect(store.rules[1].match.source).toBe('extension');
    expect(store.rules[1].match.category).toBe('manga');
  });

  it('migrates a v1 audio rule to audio and subtitle rules in place', () => {
    const store = normalizeProfileRulesStore({
      schemaVersion: 1,
      rules: [
        {
          id: 'video',
          enabled: true,
          label: 'Video mining',
          profileId: 'p-video',
          match: { source: 'audio', cardKind: 'sentence', language: 'ja' },
        },
        {
          id: 'fallback',
          enabled: true,
          label: 'Fallback',
          profileId: 'p-default',
          match: { source: 'any', cardKind: 'any', language: 'any' },
        },
      ],
    });

    expect(store.schemaVersion).toBe(2);
    expect(store.rules.map((rule) => rule.match.source)).toEqual([
      'audio',
      'subtitle',
      'any',
    ]);
    expect(store.rules[1]).toMatchObject({
      id: 'video-subtitle',
      label: 'Video mining — subtitles',
      profileId: 'p-video',
      match: { source: 'subtitle', cardKind: 'sentence', language: 'ja' },
    });
    expect(
      resolveProfileId(
        store.rules,
        { source: 'subtitle', cardKind: 'sentence', language: 'ja' },
        'default',
      ),
    ).toBe('p-video');
  });

  it('keeps a v2 audio rule audio-only', () => {
    const store = normalizeProfileRulesStore({
      schemaVersion: 2,
      rules: [
        {
          id: 'recording',
          enabled: true,
          label: 'Recorded audio',
          profileId: 'p-audio',
          match: { source: 'audio', cardKind: 'any', language: 'any' },
        },
      ],
    });

    expect(store.rules).toHaveLength(1);
    expect(
      resolveProfileId(
        store.rules,
        { source: 'subtitle', cardKind: 'sentence', language: 'ja' },
        'default',
      ),
    ).toBe('default');
  });
});
