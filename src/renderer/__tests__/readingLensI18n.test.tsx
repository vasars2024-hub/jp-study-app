// @vitest-environment jsdom
/**
 * Renders the Reading Lens renderer surfaces in all four languages and asserts
 * no catalog key reaches the user.
 *
 * The Lens is 1,298 lines of UI behind a global hotkey and a transparent,
 * always-on-top window. Nobody opens it to check a translation, and three of the
 * four surfaces here are only reachable *after* a successful screen OCR — so a
 * raw key or a missing `ja` string in them is invisible by hand indefinitely.
 *
 * The leak check is `helpers/i18nLeak.ts`, shared with the arcade and
 * visual-novel render tests; see that file for why it walks text nodes rather
 * than reading `textContent`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { UI_LANGS, type UiLang } from '../../shared/i18n/core';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import { setUiLang } from '../i18n';
import { leakedKeys } from './helpers/i18nLeak';

/**
 * `window.api` must exist before the panels are imported, not merely before they
 * are rendered — their import graph reaches modules that read `window.api` at
 * module-eval time. Hence the dynamic imports in `beforeAll`.
 */
const EMPTY_RESULT = new Proxy({}, { get: () => [] });

const LENS_INIT = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  mode: 'select' as const,
  scaleFactor: 1,
};

function installApiStub(): void {
  const api: Record<string, unknown> = {
    lensGetInit: async () => LENS_INIT,
    lensGetSettings: async () => ({
      enabled: true,
      hotkey: 'Ctrl+Shift+Space',
      supported: true,
      registered: true,
      open: false,
    }),
    lensSetInteractive: () => undefined,
    lensClose: async () => undefined,
    ankiStatus: async () => ({ ok: false, decks: [], models: [] }),
    lookupTerm: async () => ({ entries: [] }),
    // A rejected analysis exercises the panel's error branch, which is the one
    // with the most chrome and the one a user without an API key always sees.
    sentenceAnalyze: async () => {
      throw new Error('no key configured');
    },
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => {};
      return async (): Promise<unknown> => EMPTY_RESULT;
    },
  });
}

let Overlay: typeof import('../components/lens/ReadingLensOverlay').default;
let AnalysisPanel: typeof import('../components/lens/LensAnalysisPanel').default;
let ReaderPanel: typeof import('../components/lens/LensReaderPanel').default;
let SettingsSection: typeof import('../components/settings/pages/ReadingLensSection').default;

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Overlay = (await import('../components/lens/ReadingLensOverlay')).default;
  AnalysisPanel = (await import('../components/lens/LensAnalysisPanel')).default;
  ReaderPanel = (await import('../components/lens/LensReaderPanel')).default;
  SettingsSection = (await import('../components/settings/pages/ReadingLensSection')).default;
  /*
   * 60s, and unlike the sibling repairs this one genuinely IS a bigger number — because
   * here the cost is not removable from inside the test. These four dynamic imports pull
   * four React component graphs through Vite's transform, and that work happens once per
   * worker no matter how the hook is written; there is no repeated walk to memoise away
   * (contrast `mediaSurfaceImportGraph`, whose eight redundant graph walks were the whole
   * cause, and `deletedPlayerDependents`/`sourceNulBytes` at 084dcfea).
   *
   * The default `hookTimeout` is 10s, and under a full `vitest run` with eight workers
   * contending this hook exceeded it — which fails the FILE, so it prints no `> … failed`
   * line and gets miscounted as a passing suite by anyone grepping for one. It was named
   * that way on 2026-09-02. A hook timeout cannot mask a product regression: an assertion
   * failure in any case below still fails on the assertion, and a genuinely hung import
   * still fails, just later and with a truthful reason.
   */
}, 60_000);

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function renderIn(lang: UiLang, node: React.ReactElement): Promise<string> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await ensureCatalog(lang);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(node);
  });
  // Flush the effects that read lensGetInit / lensGetSettings and the analysis
  // request, so the panels settle into their loaded state before assertion.
  await act(async () => {});
  await act(async () => {});
  return host.textContent ?? '';
}

/**
 * `minChars` is set just under the shortest length actually measured across all
 * four languages. Measured 2026-08-05, en/ja/zh/ru:
 *
 *   overlay  69 / 39 / 29 / 79      analysis 64 / 43 / 39 / 66
 *   reader   43 / 25 / 20 / 53      section 239 / 124 / 96 / 255
 *
 * zh is the floor in every case — the same chrome in the most compact script.
 * A floor of 5 would pass on an empty surface and make the leak assertion below
 * vacuous, so these are tight enough that a surface which stops rendering its
 * chrome fails here rather than reporting "no keys leaked" about an empty div.
 */
const SURFACES: Array<{ name: string; node: () => React.ReactElement; minChars: number }> = [
  { name: 'ReadingLensOverlay (selecting)', node: () => <Overlay />, minChars: 24 },
  {
    name: 'LensAnalysisPanel',
    node: () => (
      <AnalysisPanel
        text="今日は良い天気ですね"
        region={{ x: 100, y: 100, width: 400, height: 80 }}
        onLookup={() => {}}
        onClose={() => {}}
      />
    ),
    minChars: 32,
  },
  {
    name: 'LensReaderPanel',
    node: () => (
      <ReaderPanel query="天気" context="今日は良い天気ですね" tokens={[]} x={200} y={200} onClose={() => {}} />
    ),
    minChars: 16,
  },
  { name: 'ReadingLensSection', node: () => <SettingsSection />, minChars: 80 },
];

describe('Reading Lens renderer i18n', () => {
  const rendered = new Map<string, string>();

  for (const lang of UI_LANGS) {
    for (const surface of SURFACES) {
      it(`renders ${surface.name} without leaking catalog keys in ${lang}`, async () => {
        const text = await renderIn(lang, surface.node());
        rendered.set(`${surface.name}/${lang}`, text);
        const label = `${surface.name} in ${lang}`;
        expect(text.length, `${label} rendered something`).toBeGreaterThan(surface.minChars);
        expect(leakedKeys(host), `${label}: no catalog key reaches the user`).toEqual([]);
        // A plural whose value is a `{one, few, many, other}` object instead of a
        // resolved string renders as "[object Object]".
        expect(text, label).not.toContain('[object Object]');
        expect(text, label).not.toContain('undefined');
      });
    }
  }

  it('actually switches script per language rather than falling back to English', () => {
    const cjk = /[぀-ヿ一-鿿]/g;
    const cyrillic = /[Ѐ-ӿ]/g;
    const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;
    // The settings section is the surface with the most static chrome, so it is
    // the one where a silent English fallback would be most visible.
    const key = (lang: UiLang): string => rendered.get(`ReadingLensSection/${lang}`) ?? '';

    expect(count(key('ja'), cjk), 'ja renders kana/kanji').toBeGreaterThan(10);
    expect(count(key('zh'), cjk), 'zh renders hanzi').toBeGreaterThan(10);
    expect(count(key('ru'), cyrillic), 'ru renders Cyrillic').toBeGreaterThan(10);
    expect(count(key('en'), cyrillic), 'en renders no Cyrillic').toBe(0);
    // ja and ru must not be the same bytes as en, which is what a failed catalog
    // load looks like.
    expect(key('ja')).not.toBe(key('en'));
    expect(key('ru')).not.toBe(key('en'));
  });
});
