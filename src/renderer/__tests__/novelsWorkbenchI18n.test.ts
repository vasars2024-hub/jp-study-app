// @vitest-environment jsdom

/**
 * The Novels workbench rendered raw English everywhere while the catalogs
 * already carried a full, translated `novels.*` section that no app code
 * referenced: measured 2026-09-06, **90 of 99 `novels.*` keys were translated
 * in all four languages and never used**. Every label, option, column header,
 * empty state, action button and source-manager field in `NovelsContent.tsx`
 * was a literal.
 *
 * Neither existing guard sees this. `tools/i18n-check.cjs` only compares
 * catalogs to each other, and the JSX census in `i18n.test.ts` scores *added*
 * hardcoded text against a baseline, so a file that was always English stays
 * inside its allowance. So this suite renders the real components and asserts
 * that switching the UI language changes what they say.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JitenSourceProfile, JitenStore } from '../../shared/jiten';
import {
  NovelsFilters,
  NovelsInspector,
  NovelsTable,
  useNovels,
} from '../components/novels/NovelsContent';
import { getUiLang, setUiLang } from '../i18n';

function profile(id: string, name: string): JitenSourceProfile {
  return { id, name, enabled: true, mode: 'external', searchUrlTemplate: 'https://x/{titleJp}' };
}

function store(): JitenStore {
  return {
    config: { apiBaseUrl: 'https://jiten.test', apiKey: '' },
    sourceProfiles: [profile('a', 'BookWalker')],
    plan: [],
  };
}

let host: HTMLDivElement;
let root: Root;
let state: ReturnType<typeof useNovels> | null = null;
let originalApiDescriptor: PropertyDescriptor | undefined;

function Harness() {
  state = useNovels();
  return createElement(
    'div',
    null,
    createElement(NovelsFilters, { state }),
    createElement(NovelsTable, { state }),
    createElement(NovelsInspector, { state }),
  );
}

async function switchTo(lang: 'en' | 'ja') {
  await act(async () => {
    setUiLang(lang);
    // The language chunk loads async; a fixed microtask count reads as "the
    // switch did not happen".
    for (let i = 0; i < 60 && getUiLang() !== lang; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  });
  expect(getUiLang()).toBe(lang);
}

beforeEach(async () => {
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state = null;
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      jitenGetStore: vi.fn().mockResolvedValue(store()),
      novelsGet: vi.fn().mockResolvedValue(null),
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(Harness));
    await Promise.resolve();
  });
  await act(async () => {
    state?.setShowSources(true);
    // The bundled catalogue is ~200 titles, so the empty state only appears
    // behind a filter that matches nothing.
    state?.setQuery('zzzqqq-no-such-book');
    await Promise.resolve();
  });
});

afterEach(async () => {
  await switchTo('en');
  await act(async () => root.unmount());
  host.remove();
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor);
  } else {
    delete (window as unknown as { api?: unknown }).api;
  }
  vi.restoreAllMocks();
});

/** Every visible chunk of text in the rendered workbench, whitespace-collapsed. */
function shown(): string {
  return (host.textContent ?? '').replace(/\s+/g, ' ');
}

describe('the Novels workbench speaks the UI language', () => {
  it('keeps unavailable actions keyboard reachable with a visible, linked reason', async () => {
    await act(async () => state?.setQuery(''));
    const candidate = state?.candidates.find((item) => !item.jitenDeckId);
    expect(candidate).toBeDefined();
    await act(async () => state?.selectCandidate(candidate?.id ?? ''));
    const button = [...host.querySelectorAll<HTMLButtonElement>('.jiten-actions button')]
      .find((item) => item.textContent?.includes('Jiten'));
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    const reasonId = button?.getAttribute('aria-describedby');
    expect(reasonId).toBe('novels-reason-mine');
    expect(host.querySelector(`#${reasonId}`)?.textContent).toContain('Jiten');
    const mine = vi.spyOn(state as NonNullable<typeof state>, 'mineJitenSelected');
    await act(async () => button?.click());
    expect(mine).not.toHaveBeenCalled();
  });

  it('renders the filter rail, table head and empty states in English by default', () => {
    // The control: without it, a component that renders nothing at all would
    // pass every "no English" assertion below.
    const text = shown();
    for (const label of ['Type', 'Difficulty', 'Genre or tag', 'Source', 'Import', 'Mining', 'Sort']) {
      expect(text).toContain(label);
    }
    expect(text).toContain('No titles match the current filters.');
    expect(text).toContain('Select a title to inspect it.');
    expect(text).toContain('Save sources');
  });

  it('renders all of it in Japanese once the UI language is Japanese', async () => {
    await switchTo('ja');
    const text = shown();
    // Exact catalog strings, not "some non-Latin text": a key with no entry
    // renders the key itself, which is also not English prose.
    expect(text).toContain('種類');
    expect(text).toContain('ジャンル・タグ');
    expect(text).toContain('現在の絞り込みに一致する作品はありません。');
    expect(text).toContain('作品を選ぶと詳細が表示されます。');
    expect(text).toContain('取得元を保存');
    expect(text).not.toContain('novels.');

    // ...and none of the English survives.
    for (const label of ['Genre or tag', 'No titles match the current filters.', 'Select a title to inspect it.', 'Save sources']) {
      expect(text).not.toContain(label);
    }
  });

  it('names the source row and its Remove button', async () => {
    // These three were the only truly nameless controls on the surface: the
    // name box announced as a bare edit field and every Remove announced the
    // same word.
    // No `type` attribute on that input, so an attribute selector misses it.
    const nameBox = [...host.querySelectorAll<HTMLInputElement>('.jiten-source-row input')].find(
      (input) => input.type === 'text' && !input.placeholder.includes('URL'),
    );
    expect(nameBox?.getAttribute('aria-label')).toBe('Source name');
    expect(nameBox?.value).toBe('BookWalker');
    const remove = host.querySelector<HTMLButtonElement>('.jiten-source-row button');
    expect(remove?.getAttribute('aria-label')).toBe('Remove BookWalker');
    const mode = host.querySelector<HTMLSelectElement>('.jiten-source-row select');
    expect(mode?.getAttribute('aria-label')).toBe('Link mode');
  });

  it('keeps the search-URL placeholder token literal rather than eating it as a slot', () => {
    // `{titleJp}` is the template token the user types, but it is also the
    // shape of an i18n variable slot -- so the catalog spells it `{token}` and
    // the caller supplies the literal. If that ever regresses, the placeholder
    // silently loses the one thing it is there to teach.
    const inputs = [...host.querySelectorAll<HTMLInputElement>('.jiten-source-row input')];
    expect(inputs.some((input) => input.placeholder.includes('{titleJp}'))).toBe(true);
  });
});
