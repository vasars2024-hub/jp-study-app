// @vitest-environment jsdom
/**
 * D235 — the second half of D233. `src/shared/i18n/miningUi/` shipped 92 keys
 * of which 77 had no consumer; D233 wired the 36 `fm.*` ones. The remaining 41
 * were `jiten.*` (33) and `cardPreview.*` (8), and they turned out to be two
 * different defects wearing the same label:
 *
 *   - `jiten.*` is a real orphan. `JitenMiningPanel` called `t()` ZERO times
 *     and rendered all 33 strings as English literals, including two status
 *     sentences built inside an event handler and two module-level label maps
 *     in `shared/jiten.ts`. The catalog comment above the option keys already
 *     claimed the constants "now hold ids"; they did not. Fixed by wiring, and
 *     NOT ONE NEW KEY was added.
 *   - `cardPreview.*` is not an orphan at all, it is a DUPLICATE. All eight
 *     strings exist a second time as `anki.cardPreview.*` in the main catalogs,
 *     and those are the ones `AnkiCardPreview.tsx` consumes. The English values
 *     are byte-identical. Deleted from all four miningUi files (32 entries).
 *
 * Also caught here: the panel printed `selectedEntry.acquisitionStatus` raw —
 * "analyzed", "mined" — in every language, while `NovelsContent` has resolved
 * the very same enum through a translated map since D133's class. The map moved
 * to `shared/jiten.ts` beside the type it keys so both surfaces share it.
 *
 * The panel is mounted for real, in all four languages, because a source scan
 * cannot tell a wired `t()` from one whose key the catalog cannot answer, and
 * cannot see the `<option>` labels at all — those come from a record in another
 * module.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ensureCatalog, catalogFor } from '../../shared/i18n/catalogs';
import { translate } from '../../shared/i18n/core';
import { getUiLang, setUiLang } from '../i18n';
import {
  JITEN_DOWNLOAD_TYPE_KEYS,
  JITEN_ORDER_KEYS,
  JITEN_STATUS_KEY,
  type JitenPlanEntry,
  type JitenStore,
} from '../../shared/jiten';

type Lang = 'en' | 'ja' | 'zh' | 'ru';
const LANGS = ['en', 'ja', 'zh', 'ru'] as const;

const REPO = resolve(__dirname, '../../..');
const PANEL_SOURCE = readFileSync(
  resolve(REPO, 'src/renderer/components/JitenMiningPanel.tsx'),
  'utf8',
)
  // Comments stripped: a key or a literal named in prose is not a consumer.
  // This repo has a recorded case of a comment scoring a source ratchet green.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const PLAN: JitenPlanEntry = {
  id: 'plan-1',
  jitenDeckId: 4242,
  titleJp: 'よつばと！',
  acquisitionStatus: 'analyzed',
  tags: [],
  notes: '',
} as unknown as JitenPlanEntry;

const STORE: JitenStore = { plan: [PLAN] } as unknown as JitenStore;

/** An empty plan list takes the panel's other branch — its empty state. */
const EMPTY_STORE: JitenStore = { plan: [] } as unknown as JitenStore;

let store: JitenStore = STORE;

function installApiStub(): void {
  const api: Record<string, unknown> = {
    jitenGetStore: async () => store,
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => ({ ok: false });
    },
  });
}

let JitenMiningPanel: typeof import('../components/JitenMiningPanel').default;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  for (const lang of LANGS) await ensureCatalog(lang);
  JitenMiningPanel = (await import('../components/JitenMiningPanel')).default;
});

let root: Root | null = null;
let host: HTMLElement | null = null;
const originalLang = getUiLang();

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  store = STORE;
  setUiLang(originalLang);
});

/** Mounts the panel in `lang` and returns everything it painted. */
async function renderIn(lang: Lang): Promise<string> {
  await ensureCatalog(lang);
  setUiLang(lang);
  host = document.createElement('div');
  document.body.appendChild(host);
  const el = host;
  await act(async () => {
    root = createRoot(el);
    root.render(<JitenMiningPanel />);
  });
  // The store arrives from an async effect; flush it.
  await act(async () => {
    await Promise.resolve();
  });
  return el.textContent ?? '';
}

/** Every jiten.* key the English catalog defines. */
function jitenKeys(): string[] {
  return Object.keys(catalogFor('en'))
    .filter((k) => k.startsWith('jiten.'))
    .sort();
}

/** Keys the panel and the two label maps between them ask for. */
function requestedKeys(): string[] {
  const out = new Set<string>();
  for (const m of PANEL_SOURCE.matchAll(/\bt\(\s*'(jiten\.[a-zA-Z0-9.]+)'/g)) out.add(m[1]);
  for (const key of Object.values(JITEN_DOWNLOAD_TYPE_KEYS)) out.add(key);
  for (const key of Object.values(JITEN_ORDER_KEYS)) out.add(key);
  return [...out].sort();
}

describe('the jiten.* module and its consumer are connected in both directions', () => {
  it('leaves no jiten.* key without a consumer', () => {
    const requested = new Set(requestedKeys());
    const orphaned = jitenKeys().filter((k) => !requested.has(k));
    expect(orphaned, 'these jiten.* keys went back to having no consumer').toEqual([]);
    // The guard against a "fix" that wires three keys and calls it done.
    expect(requested.size).toBeGreaterThanOrEqual(33);
  });

  it('asks for nothing the English catalog cannot answer', () => {
    const en = catalogFor('en');
    for (const key of requestedKeys()) {
      expect(en[key], `en cannot answer ${key}`).toBeDefined();
    }
  });

  it.each(LANGS)('answers every requested key in %s', (lang) => {
    const catalog = catalogFor(lang);
    for (const key of requestedKeys()) {
      expect(catalog[key], `${lang} cannot answer ${key}`).toBeDefined();
    }
  });

  /**
   * The two status sentences are built inside `mineDeck`'s catch/return paths
   * and handed to `setStatus`. CLAUDE.md names this shape explicitly — a status
   * message built in an event handler is not in a scored JSX position, so no
   * scanner reads it. Assert both directions: the key is asked for, and the
   * literal it replaced is gone.
   */
  it('routes the error and success sentences through the catalog', () => {
    for (const key of ['jiten.mining.err.noDeck', 'jiten.mining.err.noCards', 'jiten.mining.saved']) {
      expect(PANEL_SOURCE, `${key} is not used`).toContain(`'${key}'`);
    }
    for (const literal of [
      "'Jiten did not return a deck.'",
      "'No usable cards were found in the Jiten deck.'",
      'Saved ${cards.length} Jiten cards',
    ]) {
      expect(PANEL_SOURCE, `the literal ${literal} is still there`).not.toContain(literal);
    }
  });
});

describe('the panel renders translated, not English, in every language', () => {
  /**
   * Chosen because they are the strings a user cannot miss: the heading, the
   * three select labels, the two checkbox labels and the primary button. If any
   * one survives the language switch the shell is half-translated, which reads
   * worse than wholly English.
   */
  const MUST_NOT_SURVIVE = [
    'Jiten vocab mining',
    'Mine a Jiten media deck directly into the local flashcard library',
    'Planned title',
    'Deck scope',
    'Card order',
    'Min occurrences',
    'Max occurrences',
    'Exclude kana-only terms',
    'Skip example sentences',
    'Mine Jiten vocab',
    'Full deck',
    'Deck frequency',
  ];

  /**
   * The control that makes the negative above mean something. A `not.toContain`
   * on a string the mount never renders passes in every language and proves
   * nothing — this repo has a recorded case of three languages reading green on
   * a string the component does not paint at all. So assert the same list
   * PRESENT in English, from the same mount, first.
   */
  it('paints all of them in English', async () => {
    const text = await renderIn('en');
    for (const phrase of MUST_NOT_SURVIVE) {
      expect(text, `en never rendered "${phrase}" — the negative control below is vacuous`).toContain(
        phrase,
      );
    }
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops every one of them in %s', async (lang) => {
    const text = await renderIn(lang);
    for (const phrase of MUST_NOT_SURVIVE) {
      expect(text, `${lang} still shows "${phrase}"`).not.toContain(phrase);
    }
    // And it is not blank — a component that threw would also "drop" them.
    expect(text.length).toBeGreaterThan(80);
  });

  it.each(LANGS)('renders the empty state from the catalog in %s', async (lang) => {
    store = EMPTY_STORE;
    const text = await renderIn(lang);
    expect(text).toContain(translate('jiten.mining.empty', {}, { lang, catalog: catalogFor(lang), fallback: {} }));
  });
});

describe('the acquisition status is a translated word, not a wire value', () => {
  it.each(LANGS)('never prints the raw enum in %s', async (lang) => {
    const text = await renderIn(lang);
    const expected = translate(JITEN_STATUS_KEY.analyzed, {}, {
      lang,
      catalog: catalogFor(lang),
      fallback: {},
    });
    expect(text, `${lang} did not render the status`).toContain(expected);
    if (lang !== 'en') {
      // 'analyzed' is the wire value AND the English word, so only the three
      // translated languages can carry this assertion.
      expect(text, `${lang} printed the raw wire value`).not.toContain('analyzed');
    }
  });

  it('covers every member of the union', () => {
    // A status added to the type without a key here would print raw again.
    expect(Object.keys(JITEN_STATUS_KEY).sort()).toEqual(
      ['analyzed', 'downloaded', 'error', 'imported', 'linked', 'mined', 'planned'],
    );
    const en = catalogFor('en');
    for (const key of Object.values(JITEN_STATUS_KEY)) {
      expect(en[key], `en cannot answer ${key}`).toBeDefined();
    }
  });
});

describe('the counted strings keep their slots', () => {
  /**
   * Russian needs all four CLDR arms and both keys carry `{count}`; `saved`
   * also carries `{title}`. An arm that drops a slot is unrenderable and no
   * catalog check would see it — this repo has a recorded case of `{name}`
   * surviving in the `one` arm alone.
   */
  const SLOTTED: Array<[string, Record<string, string | number>, string[]]> = [
    ['jiten.mining.importedCount', { count: 5 }, ['5']],
    ['jiten.mining.saved', { count: 5, title: 'Yotsuba' }, ['5', 'Yotsuba']],
  ];

  it.each(LANGS)('fills every slot in %s', (lang) => {
    for (const [key, vars, expected] of SLOTTED) {
      const rendered = translate(key, vars, { lang, catalog: catalogFor(lang), fallback: {} });
      expect(rendered, `${lang} never answered ${key}`).not.toBe(key);
      expect(rendered, `${lang} printed a raw slot in ${key}`).not.toMatch(/\{[a-z]+\}/i);
      for (const value of expected) {
        expect(rendered, `${lang} dropped "${value}" from ${key}`).toContain(value);
      }
    }
  });

  it('gives Russian all four plural arms on both', () => {
    const ru = catalogFor('ru');
    for (const key of ['jiten.mining.importedCount', 'jiten.mining.saved']) {
      const value = ru[key];
      expect(typeof value, `ru's ${key} is not a plural record`).toBe('object');
      expect(Object.keys(value as object).sort()).toEqual(['few', 'many', 'one', 'other']);
    }
  });
});

describe('cardPreview.* was a duplicate, and it is gone', () => {
  it('no longer exists in any miningUi catalog', () => {
    for (const lang of LANGS) {
      const source = readFileSync(resolve(REPO, `src/shared/i18n/miningUi/${lang}.ts`), 'utf8');
      expect(source, `${lang} still carries the dead block`).not.toMatch(/'cardPreview\./);
    }
  });

  it('leaves the WIRED anki.cardPreview.* keys untouched, all eight, in all four', () => {
    // The half that must NOT be deleted. `AnkiCardPreview.tsx` consumes these.
    const suffixes = [
      'label',
      'frameTitle',
      'emptyHint',
      'profileHint',
      'expressionFallback',
      'front',
      'back',
      'sampleHint',
    ];
    for (const lang of LANGS) {
      const catalog = catalogFor(lang);
      for (const suffix of suffixes) {
        expect(catalog[`anki.cardPreview.${suffix}`], `${lang} lost anki.cardPreview.${suffix}`).toBeDefined();
      }
    }
  });
});
