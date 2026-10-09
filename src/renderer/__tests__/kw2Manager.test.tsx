// @vitest-environment jsdom
/** kw2 — the known-words manager: filter, select, set / reset in bulk, import, export, coverage. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
    lang: 'en',
  }),
}));

import KnownWordsManager from '../components/knownWords/KnownWordsManager';
import { getLevel, isManualLevel, resetKnownWordsCacheForTests, setLevel } from '../knownWords';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  localStorage.clear();
  resetKnownWordsCacheForTests();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  localStorage.clear();
  resetKnownWordsCacheForTests();
});

async function mount(api: Record<string, unknown> = {}): Promise<void> {
  (window as unknown as { api: Record<string, unknown> }).api = api;
  root = createRoot(host);
  await act(async () => root?.render(<KnownWordsManager />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const words = () => [...host.querySelectorAll('.kw2-row .kw2-word')].map((el) => el.textContent);
const buttonNamed = (text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!;

async function change(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

describe('KnownWordsManager', () => {
  it('filters by source, selects all matching, and sets them by hand in one go', async () => {
    setLevel('猫', 3, false);
    setLevel('犬', 1, false);
    setLevel('鳥', 2, true);
    await mount();
    expect(words()).toEqual(['猫', '鳥', '犬']);
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="kw2.filter.source"]')!, 'auto');
    expect(words()).toEqual(['猫', '犬']);
    await act(async () => host.querySelector<HTMLInputElement>('.kw2-select-all input')!.click());
    expect(host.querySelector('.kw2-bulk .muted')?.textContent).toBe('kw2.bulk.selected:2');
    await act(async () => buttonNamed('kw2.bulk.setTo:lexicon.knowledge.familiar').click());
    expect(getLevel('猫')).toBe(2);
    expect(getLevel('犬')).toBe(2);
    expect(isManualLevel('犬')).toBe(true);
    // They are hand-set now, so the "automatic" filter no longer shows them.
    expect(words()).toEqual([]);
  });

  it('resets selected words to automatic grading', async () => {
    setLevel('猫', 3, true);
    await mount();
    await act(async () => host.querySelector<HTMLInputElement>('.kw2-row input')!.click());
    await act(async () => buttonNamed('kw2.bulk.resetAuto').click());
    expect(isManualLevel('猫')).toBe(false);
    expect(getLevel('猫')).toBe(3);
    expect(host.querySelector('.kw2-message')?.textContent).toBe('kw2.bulk.resetDone:1');
  });

  it('imports a pasted list at the chosen level and searches it', async () => {
    await mount();
    await change(host.querySelector<HTMLTextAreaElement>('.kw2-io textarea')!, '水\n火\n水');
    await change(host.querySelector<HTMLSelectElement>('select[aria-label="kw2.import.level"]')!, '1');
    await act(async () => buttonNamed('kw2.import.run').click());
    expect(host.querySelector('.kw2-message')?.textContent).toBe('kw2.import.done:2,0,0');
    expect(getLevel('水')).toBe(1);
    await change(host.querySelector<HTMLInputElement>('input[type="search"]')!, '火');
    expect(words()).toEqual(['火']);
  });

  it('charts coverage of the top frequency bands when a corpus ranks the words', async () => {
    setLevel('の', 3, false);
    setLevel('猫', 2, false);
    const dictFrequencyRanks = vi.fn(async () => ({ の: 1, 猫: 2_500 }));
    await mount({ dictFrequencyRanks });
    expect(dictFrequencyRanks).toHaveBeenCalledWith(['の', '猫'], { sourceLangs: ['ja'] });
    const bars = [...host.querySelectorAll('.kw2-coverage-bar')];
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      'kw2.coverage.aria:1,000,0,1',
      'kw2.coverage.aria:5,000,0,2',
      'kw2.coverage.aria:10,000,0,2',
      'kw2.coverage.aria:20,000,0,2',
    ]);
  });

  it('says coverage cannot be measured without a frequency list', async () => {
    setLevel('猫', 3, false);
    await mount({ dictFrequencyRanks: vi.fn(async () => ({})) });
    expect(host.querySelector('.kw2-coverage')?.textContent).toContain('kw2.coverage.none');
    expect(host.querySelector('.kw2-coverage-bar')).toBeNull();
  });

  it('exports the filtered words as a file', async () => {
    setLevel('猫', 3, false);
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await mount();
    await act(async () => buttonNamed('kw2.export.csv:1').click());
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(host.querySelector('.kw2-message')?.textContent).toBe('kw2.export.done:1');
    click.mockRestore();
  });
});
