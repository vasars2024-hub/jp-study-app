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
 * The usage gate, and the one that generalises: the visual-novel surface is the
 * ONLY consumer of these seven namespaces, so any key the catalogs define must
 * be reachable from one of its files (`vnActionReason.ts` owns the
 * disabled-reason strings; `captureKindKeys.ts` owns the five capture kinds).
 *
 * The floors are the block sizes measured when they were wired. A floor, not an
 * equality — new keys are welcome, quietly deleting a block is not.
 */
describe('every vn* key has a consumer', () => {
  const files = [
    'renderer/components/immersion/VisualNovelPanel.tsx',
    'renderer/components/immersion/VisualNovelSentenceAssist.tsx',
    'renderer/components/immersion/VisualNovelCommunityPanel.tsx',
    'renderer/components/immersion/VisualNovelMetadataEditor.tsx',
    'renderer/components/immersion/VisualNovelImportPanel.tsx',
    'renderer/components/immersion/VisualNovelReleaseCatalog.tsx',
    'renderer/components/immersion/VisualNovelSourcePanel.tsx',
    'renderer/components/immersion/VisualNovelScriptImportPanel.tsx',
    'renderer/components/immersion/captureKindKeys.ts',
    'shared/vnActionReason.ts',
    'shared/visualNovelSourceFailure.ts',
  ].map((rel) => readFileSync(join(SRC, rel), 'utf8')).join('\n');

  const en = readFileSync(join(SRC, 'shared/i18n/catalogs/en.ts'), 'utf8');

  function keysFor(prefix: string): string[] {
    return [...new Set(
      en.split('\n')
        .map((line) => /^\s*'((?:vn[A-Z]\w*)\.[\w.-]+)'\s*:/.exec(line)?.[1])
        .filter((key): key is string => !!key && key.startsWith(prefix)),
    )];
  }

  it.each([
    ['vnPanel.', 130],
    ['vnMeta.', 33],
    ['vnCommunity.', 38],
    ['vnImport.', 21],
    ['vnRelease.', 14],
    ['vnSource.', 13],
    ['vnScript.', 11],
  ])('%s is reachable from the components that own it', (prefix, floor) => {
    const keys = keysFor(prefix);
    expect(keys.length, `${prefix} lost its keys`).toBeGreaterThanOrEqual(floor);
    const orphans = keys.filter((key) => !files.includes(`'${key}'`) && !files.includes(`\`${key}\``));
    expect(orphans, `${prefix} keys with no consumer`).toEqual([]);
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

  /**
   * Every string a `not.toContain` will later assert is GONE.
   *
   * The English case asserts all of them PRESENT first, which is the control
   * that makes the negative half mean anything: a string this mount never
   * renders — the library rail's add form does not, because `ReadingCanvas`
   * measures before it lays a tool out and jsdom reports width 0 — passes
   * `not.toContain` in all three languages while proving nothing. `Local
   * discovery` was in this list until that control caught it, and it is covered
   * by its own mount below instead.
   */
  const ENGLISH_LITERALS = [
    'Immersion library',
    'Visual Novels',
    'Back to browser',
    'Capture screen text',
    'Add captured line',
    'Entire visual novel',
    'Create study deck cards',
    'Open VN study deck',
    'Reading overlay',
    'Reading progress',
    'Save progress',
    'Routes and endings',
    'Route guide notes',
    'Remove route',
    // The sibling panels the panel composes, all of which were English-only in
    // every language until this turn.
    'Library metadata',
    'Display title',
    'Save metadata',
    'Metadata sources',
    'Search VNDB',
    'Community and study sharing',
    'Language report',
    'Export study bundle',
    'Script extraction',
    'Choose scripts',
  ];

  it('is English by default, and renders every literal the other cases assert is gone', async () => {
    const text = await render('en');
    for (const expected of ENGLISH_LITERALS) {
      expect(text, `missing "${expected}"`).toContain(expected);
    }
  });

  /**
   * The negative half is what makes this a test rather than a screenshot: the
   * English literals must be GONE, not merely joined by Japanese ones.
   */
  it.each(['ja', 'zh', 'ru'] as const)('drops every English literal in %s', async (lang) => {
    const text = await render(lang);
    for (const gone of ENGLISH_LITERALS) {
      expect(text, `"${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const catalog = catalogFor(lang);
    expect(text, 'the kicker did not translate').toContain(catalog['vnPanel.kicker'] as string);
    expect(text, 'the overlay heading did not translate').toContain(catalog['vnPanel.overlayHead'] as string);
    expect(text, 'the routes heading did not translate').toContain(catalog['vnPanel.routesHead'] as string);
    expect(text, 'the metadata editor did not translate').toContain(catalog['vnMeta.summary'] as string);
    expect(text, 'the community panel did not translate').toContain(catalog['vnCommunity.summary'] as string);
    expect(text, 'the source panel did not translate').toContain(catalog['vnSource.head'] as string);
    expect(text, 'the script panel did not translate').toContain(catalog['vnScript.head'] as string);
  });

  /**
   * The engine picker is the one place the scope rule cuts both ways in a
   * single control: `Custom` and `Unknown` are chrome and translate, while
   * Ren'Py, KiriKiri, NScripter, Unity, RPG Maker and TyranoBuilder are product
   * names and must survive untranslated. `i18n-partial-check` baselines the
   * last three as legitimately-literal; this proves they are still rendered.
   */
  it('translates the engine picker\'s two labels and none of its product names', async () => {
    const text = await render('ru');
    const catalog = catalogFor('ru');
    expect(text).toContain(catalog['vnMeta.engineCustom'] as string);
    expect(text).toContain(catalog['vnMeta.engineUnknown'] as string);
    for (const name of ["Ren'Py", 'KiriKiri', 'NScripter', 'Unity', 'RPG Maker', 'TyranoBuilder']) {
      expect(text, `the engine name "${name}" was translated away`).toContain(name);
    }
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
    // `normalizeVisualNovelDatabase` derives this from the engine. KiriKiri is
    // `partial`, not `supported`: script import reads only unpacked `.ks`, and a
    // shipped KiriKiri game keeps its scripts inside `.xp3` archives.
    expect(text).toContain(catalog['vnPanel.compat.partial'] as string);
    // Shown by its product name (VISUAL_NOVEL_ENGINE_NAMES), never translated; only the
    // UI words `unknown` / `custom` are.
    expect(text, 'the engine name is data and must survive').toContain('KiriKiri');
    // `reading` also appears inside `Reading overlay`, so anchor on the token
    // in its own separator context rather than on the bare word.
    expect(text).not.toContain('· partial ·');
  });
});

/**
 * `VisualNovelImportPanel` lives inside the library rail's add-form disclosure,
 * and `ReadingCanvas` lays a tool out only after it measures — in jsdom that
 * measurement is 0, so the rail never renders and nothing about `vnImport.*`
 * can be read off the composed panel. Mount it on its own instead. This is the
 * whole reason `ENGLISH_LITERALS` doubles as a presence control up there.
 */
describe('VisualNovelImportPanel renders in the interface language', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  let ImportPanel: typeof import('../components/immersion/VisualNovelImportPanel').default;

  beforeAll(async () => {
    ImportPanel = (await import('../components/immersion/VisualNovelImportPanel')).default;
  });

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
    host = document.createElement('div');
    document.body.append(host);
    const mounted = createRoot(host);
    root = mounted;
    await act(async () => {
      mounted.render(
        <ImportPanel onImported={(): undefined => undefined} onStatus={(): undefined => undefined} />,
      );
    });
    return host.textContent ?? '';
  }

  const LITERALS = ['Local discovery', 'Import JSON', 'Export JSON', 'Scan folder'];

  it('is English by default', async () => {
    const text = await render('en');
    for (const expected of LITERALS) expect(text, `missing "${expected}"`).toContain(expected);
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops every English literal in %s', async (lang) => {
    const text = await render(lang);
    for (const gone of LITERALS) {
      expect(text, `"${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    expect(text).toContain(catalogFor(lang)['vnImport.head'] as string);
  });

  /**
   * The section's accessible name is the only `vnImport` string that is not
   * visible text, so `textContent` cannot see it — and an aria-label left in
   * English is exactly the defect class the accessible-name pass hunts.
   */
  it('translates the section\'s accessible name too', async () => {
    await render('ja');
    const section = host.querySelector('section.visual-novel-import');
    expect(section?.getAttribute('aria-label')).toBe(catalogFor('ja')['vnImport.aria.section']);
  });
});
