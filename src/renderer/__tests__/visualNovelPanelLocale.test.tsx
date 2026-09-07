// @vitest-environment jsdom
/**
 * D179 — `VisualNovelPanel` had 119 `vnPanel.*` keys with no consumer.
 *
 * The whole block was written AND translated into ja/zh/ru, and the panel
 * rendered English literals beside it: 17 `t()` calls against 67 untranslated
 * strings measured by `i18n-partial-check`. Every existing gate passed — the
 * keys were translated (`i18n-check`), the file did adopt `t()` at all
 * (`i18n-hardcoded-check`), and the partial scan only ratchets, so a file that
 * had always been bad stayed baselined at its own badness. So this is pure
 * wiring, and these are the guards that keep it wired.
 *
 * Mounting follows `visualNovelRemoveReports.test.tsx`: `window.api` has to
 * exist before the panel is IMPORTED, because its import graph reads
 * `window.api.onPlayerSync` at module-eval time.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { normalizeVisualNovelDatabase } from '../../shared/visualNovel';
import { analyzeVisualNovelCharacterSpeech } from '../../shared/visualNovelLanguage';
import { ensureCatalog, catalogFor } from '../../shared/i18n/catalogs';
import { getUiLang, setUiLang } from '../i18n';

const SRC = join(__dirname, '..', '..');
type Lang = 'en' | 'ja' | 'zh' | 'ru';
const LANGS = ['en', 'ja', 'zh', 'ru'] as const;

const seed = normalizeVisualNovelDatabase({
  version: 1,
  entries: [{
    id: 'vn-1',
    title: 'Sample Visual Novel',
    japaneseTitle: 'サンプルノベル',
    engine: 'kirikiri',
    executablePath: 'C:/Games/Sample/sample.exe',
    status: 'reading',
    completionPct: 42,
    totalPlaytimeSec: 3600,
    routes: [{
      id: 'route-1',
      name: 'Sample route',
      character: '',
      status: 'not-started',
      guideNotes: '',
      endings: [],
    }],
  }],
});

const EMPTY_RESULT = new Proxy({}, { get: () => [] });

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: async () => seed,
    visualNovelHookState: async () => null,
    visualNovelSessionState: async () => ({ startedAt: null }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => EMPTY_RESULT;
    },
  });
}

let Panel: typeof import('../components/immersion/VisualNovelPanel').default;
let maps: typeof import('../components/immersion/VisualNovelPanel');

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  maps = await import('../components/immersion/VisualNovelPanel');
  Panel = maps.default;
});

/**
 * The usage gate, and the one that generalises: the panel is the ONLY consumer
 * of `vnPanel.*`, so any key the catalogs define must be reachable from this
 * file (or from `vnActionReason.ts`, which owns the disabled-reason strings, and
 * `VisualNovelSentenceAssist`/`VisualNovelCommunityPanel`, which share a few).
 */
describe('every vnPanel key has a consumer', () => {
  const files = [
    'renderer/components/immersion/VisualNovelPanel.tsx',
    'renderer/components/immersion/VisualNovelSentenceAssist.tsx',
    'renderer/components/immersion/VisualNovelCommunityPanel.tsx',
    'renderer/components/immersion/captureKindKeys.ts',
    'shared/vnActionReason.ts',
  ].map((rel) => readFileSync(join(SRC, rel), 'utf8')).join('\n');

  const en = readFileSync(join(SRC, 'shared/i18n/catalogs/en.ts'), 'utf8');

  const keys = [...new Set(
    en.split('\n')
      .map((line) => /^\s*'(vnPanel\.[\w.]+)'\s*:/.exec(line)?.[1])
      .filter((key): key is string => !!key),
  )];

  it('has not lost the block it is guarding', () => {
    // 119 were orphaned; the block is larger than that because 17 were already
    // wired. A floor, not an equality — new keys are welcome, deletions are not.
    expect(keys.length).toBeGreaterThanOrEqual(130);
  });

  it('is reachable from the components that own it', () => {
    const orphans = keys.filter((key) => {
      if (files.includes(`'${key}'`) || files.includes(`\`${key}\``)) return false;
      return true;
    });
    expect(orphans, 'vnPanel keys with no consumer').toEqual([]);
  });
});

/**
 * Every key the module-level maps can PRODUCE must exist in all four catalogs.
 * A key missing from `en` too renders as the key itself and no catalog check
 * fires, so this is the only gate that sees it.
 */
describe('the wire-value maps only produce keys the catalogs answer', () => {
  it('resolves in all four languages', async () => {
    const all = [
      ...Object.values(maps.SCOPE_KEYS),
      ...Object.values(maps.STATUS_KEYS),
      ...Object.values(maps.ROUTE_STATUS_KEYS),
      ...Object.values(maps.COMPAT_KEYS),
      ...Object.values(maps.POLITENESS_KEYS),
      ...Object.values(maps.REGISTER_KEYS),
      ...Object.values(maps.MARKER_KEYS),
    ];
    expect(all.length).toBe(4 + 5 + 3 + 4 + 3 + 3 + 4);
    for (const lang of LANGS) {
      await ensureCatalog(lang);
      const catalog = catalogFor(lang);
      for (const key of all) {
        expect(catalog[key], `${lang} cannot answer ${key}`).toBeTypeOf('string');
      }
    }
  });

  /**
   * The analyzer is a shared module and emits its markers as English tokens. If
   * someone adds a fifth marker there, `MARKER_KEYS` misses it and the panel
   * renders that raw English token in every language. Derived from the
   * analyzer's own source so it cannot drift silently.
   */
  it('covers every marker the analyzer can emit', () => {
    const analyzer = readFileSync(join(SRC, 'shared/visualNovelLanguage.ts'), 'utf8');
    const markers = [...analyzer.matchAll(/\?\s*\['([^']+)'\]\s*:\s*\[\]/g)].map((m) => m[1]);
    expect(markers.length, 'the marker list moved — re-read the analyzer').toBe(4);
    for (const marker of markers) {
      expect(maps.MARKER_KEYS[marker], `no key for the "${marker}" marker`).toBeTypeOf('string');
    }
  });
});

describe('speechSummary', () => {
  const t = (key: string, vars?: Record<string, unknown>): string =>
    vars ? `${key}(${Object.values(vars).join(',')})` : key;

  it('composes register, pronouns and markers from the structured fields', () => {
    const line = maps.speechSummary({
      speaker: '主人公',
      lineCount: 3,
      characterCount: 30,
      politeness: 'casual',
      pronouns: ['俺', '自分'],
      sentenceEndings: ['だ'],
      markers: ['assertive', 'expressive elongation'],
      summary: 'casual register; uses 俺・自分; assertive, expressive elongation',
    }, t);
    expect(line).toBe(
      'vnPanel.speech.register.casual; vnPanel.speech.uses(俺・自分); '
      + 'vnPanel.marker.assertive, vnPanel.marker.expressiveElongation',
    );
    // The English `summary` the analyzer emits is NOT what the panel renders.
    expect(line).not.toContain('casual register');
  });

  it('drops the pronoun clause when there is none, as the analyzer did', () => {
    const line = maps.speechSummary({
      speaker: 'A',
      lineCount: 1,
      characterCount: 1,
      politeness: 'formal',
      pronouns: [],
      sentenceEndings: [],
      markers: [],
      summary: 'formal register',
    }, t);
    expect(line).toBe('vnPanel.speech.register.formal');
  });

  it('falls back to a marker token it has no key for, never to a key string', () => {
    const line = maps.speechSummary({
      speaker: 'A',
      lineCount: 1,
      characterCount: 1,
      politeness: 'mixed',
      pronouns: [],
      sentenceEndings: [],
      markers: ['a marker nobody has translated'],
      summary: '',
    }, t);
    expect(line).toBe('vnPanel.speech.register.mixed; a marker nobody has translated');
  });

  it('still reads the real analyzer output, not just hand-built profiles', () => {
    const [profile] = analyzeVisualNovelCharacterSpeech([{
      id: 'c1',
      visualNovelId: 'vn-1',
      kind: 'dialogue',
      japanese: '俺だぜ、行くぞ',
      translation: '',
      speaker: '主人公',
      routeId: '',
      chapter: '',
      scene: '',
      source: 'manual',
      createdAt: 0,
    }]);
    expect(profile, 'the analyzer produced no profile to summarise').toBeTruthy();
    expect(maps.speechSummary(profile, t)).toContain('vnPanel.speech.register.');
  });
});

describe('VisualNovelPanel renders in the interface language', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
    setUiLang('en');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  async function render(lang: Lang): Promise<string> {
    await ensureCatalog(lang);
    setUiLang(lang);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(getUiLang(), `the switch to ${lang} never landed`).toBe(lang);
    host = document.createElement('div');
    document.body.append(host);
    const mounted = createRoot(host);
    root = mounted;
    await act(async () => {
      mounted.render(<Panel onClose={(): undefined => undefined} />);
    });
    return host.textContent ?? '';
  }

  it('is English by default', async () => {
    const text = await render('en');
    for (const expected of [
      'Immersion library',
      'Visual Novels',
      'Back to browser',
      'Reading overlay',
      'Routes and endings',
      'Create study deck cards',
    ]) {
      expect(text, `missing "${expected}"`).toContain(expected);
    }
  });

  /**
   * The negative half is what makes this a test rather than a screenshot: the
   * English literals must be GONE, not merely joined by Japanese ones.
   */
  it.each(['ja', 'zh', 'ru'] as const)('drops every English literal in %s', async (lang) => {
    const text = await render(lang);
    for (const gone of [
      'Immersion library',
      'Back to browser',
      'Reading overlay',
      'Routes and endings',
      'Create study deck cards',
      'Open VN study deck',
      'Capture screen text',
      'Add to library',
      'Entire visual novel',
    ]) {
      expect(text, `"${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const catalog = catalogFor(lang);
    expect(text, 'the kicker did not translate').toContain(catalog['vnPanel.kicker'] as string);
    expect(text, 'the overlay heading did not translate').toContain(catalog['vnPanel.overlayHead'] as string);
    expect(text, 'the routes heading did not translate').toContain(catalog['vnPanel.routesHead'] as string);
  });

  /**
   * The entry list and the summary line render machine tokens (`reading`,
   * `supported`) unless the maps resolve them. `kirikiri` is the engine NAME
   * and is deliberately NOT translated — it is data, not chrome, so the summary
   * line proves both halves of the scope rule in one read.
   */
  it('shows the status and compatibility as words, not wire values', async () => {
    const text = await render('ja');
    const catalog = catalogFor('ja');
    expect(text).toContain(catalog['vnPanel.status.reading'] as string);
    // `normalizeVisualNovelDatabase` derives this from the engine: kirikiri is
    // a supported engine, so the seed's compatibility is `supported`.
    expect(text).toContain(catalog['vnPanel.compat.supported'] as string);
    expect(text, 'the engine name is data and must survive').toContain('kirikiri');
    // `reading` also appears inside `Reading overlay`, so anchor on the token
    // in its own separator context rather than on the bare word.
    expect(text).not.toContain('· supported ·');
  });
});
