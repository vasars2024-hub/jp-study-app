// @vitest-environment jsdom
/**
 * Reader and dictionary popup, round 2 (J8, K8, K7, J6, J5):
 *
 * - J8: definitions default to the UI language plus English, a stored choice wins, an
 *   entry without a declared language is always kept, and a filter that would hide
 *   everything shows everything instead.
 * - J8: a lookup no longer merges JMdict English and Russian into one entry titled
 *   "JMdict (Japanese–English)"; each gloss language is its own entry with its own title.
 * - J8: opened above a word (the player's subtitles), the popup clears the whole line.
 * - K8: the popup is a dialog that takes focus on open, its level buttons say which is
 *   pressed, and Escape closes the popup and nothing behind it.
 * - K7: a closed reader hands focus back to the Library item it was opened from.
 * - J6: fallback OCR reads direction off the scanned area's shape.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../components/DictionaryResults', () => ({ default: () => <div className="dict-results-stub" /> }));
vi.mock('../tokenizer', () => ({ lemmaOf: async (s: string) => s }));
vi.mock('../studyEnvironment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../studyEnvironment')>()),
  getStudyLang: () => 'ja',
}));

import DictionaryPopup from '../components/DictionaryPopup';
import {
  defaultGlossLangs,
  filterEntriesByGlossLangs,
  loadGlossLangs,
  saveGlossLangs,
} from '../dictionaryGlossLangs';
import { findReaderReturnTarget, returnFocusAfterReader } from '../readerFocusReturn';
import { orientationForBox, orientationForSize, resolveOcrOrientation } from '../mangaOcrOrientation';
import { lookupResultToDictResult, lookupResultToPerLanguageDictResult } from '../../main/dictionary/lexiconAdapter';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: new Proxy({}, { get: (_t, p) => (typeof p === 'string' && p.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)) }),
  });
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

describe('definition languages (J8)', () => {
  it('default to the UI language plus English, and a stored choice wins', () => {
    expect(defaultGlossLangs('en')).toEqual(['en']);
    expect(defaultGlossLangs('ru')).toEqual(['ru', 'en']);
    expect(loadGlossLangs('ja')).toEqual(['ja', 'en']);
    saveGlossLangs(['ru']);
    expect(loadGlossLangs('en')).toEqual(['ru']);
  });

  it('keeps undeclared entries, and never filters down to nothing', () => {
    const entries = [{ sourceLangs: ['en'] }, { sourceLangs: ['ru'] }, { sourceLangs: undefined }];
    expect(filterEntriesByGlossLangs(entries, ['en'])).toEqual({ visible: [entries[0], entries[2]], hiddenCount: 1 });
    const onlyRu = [{ sourceLangs: ['ru'] }];
    expect(filterEntriesByGlossLangs(onlyRu, ['en']).visible).toEqual(onlyRu);
  });

  it('a merged JMdict entry is split per language, each under its own dictionary title', () => {
    const merged = {
      query: '猫',
      entries: [
        {
          text: '猫',
          reading: 'ねこ',
          score: 1,
          via: 'exact',
          dictTitle: 'JMdict (Japanese–English)',
          sources: [{ dictTitle: 'JMdict (Japanese–English)' }, { dictTitle: 'JMdict (Japanese–Russian)' }],
          senses: [
            { pos: ['n'], tags: [], glosses: [{ lang: 'en', text: 'cat' }] },
            { pos: ['n'], tags: [], glosses: [{ lang: 'ru', text: 'кошка' }] },
          ],
        },
      ],
    } as unknown as Parameters<typeof lookupResultToDictResult>[0];
    // What the popup used to get: one entry, English title, Russian gloss inside it.
    expect(lookupResultToDictResult(merged).entries).toHaveLength(1);
    const split = lookupResultToPerLanguageDictResult(merged).entries;
    expect(split.map((e) => [e.source, e.sourceLangs])).toEqual([
      ['JMdict (Japanese–English)', ['en']],
      ['JMdict (Japanese–Russian)', ['ru']],
    ]);
    expect(split[0]?.senses.flatMap((s) => s.definitions)).toEqual(['cat']);
  });
});

describe('the dictionary popup (K8, J8)', () => {
  async function open(props: Partial<Parameters<typeof DictionaryPopup>[0]> = {}): Promise<{ popup: HTMLElement; onClose: () => void }> {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<DictionaryPopup query="猫" x={100} y={200} onClose={onClose} {...props} />);
    });
    return { popup: host.querySelector('.dict-popup') as HTMLElement, onClose };
  }

  it('is a named dialog that takes focus, with pressed-state level buttons', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { popup } = await open();
    expect(popup.getAttribute('role')).toBe('dialog');
    expect(popup.getAttribute('aria-label')).toContain('猫');
    expect(document.activeElement).toBe(popup);
    const levels = popup.querySelectorAll('.wk-grade-btn');
    expect(levels.length).toBeGreaterThan(0);
    for (const button of levels) expect(button.hasAttribute('aria-pressed')).toBe(true);
    root?.unmount();
    root = null;
    expect(document.activeElement).toBe(opener);
  });

  it('Escape closes the popup and does not reach the window behind it', async () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      const { popup, onClose } = await open();
      popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });

  it('opened above a subtitle line, it clears the whole line', async () => {
    const vh = window.innerHeight;
    // A word near the bottom: its line runs from vh-60 to vh-24.
    const { popup } = await open({ y: vh - 24, anchorTop: vh - 60 });
    const bottom = parseFloat(popup.style.bottom);
    expect(popup.style.top).toBe('');
    // The popup's bottom edge sits above the line's top edge.
    expect(vh - bottom).toBeLessThanOrEqual(vh - 60);
  });

  it('offers Mine when the host can collect the word', async () => {
    const onMine = vi.fn();
    const { popup } = await open({ onMine });
    const mine = popup.querySelector<HTMLButtonElement>('.dict-mine');
    mine?.click();
    expect(onMine).toHaveBeenCalledTimes(1);
  });
});

describe('closing a reader returns focus (K7)', () => {
  it('to the Library tile of the book that was open', async () => {
    const tile = document.createElement('button');
    tile.setAttribute('data-library-tile', 'book-1');
    document.body.append(tile);
    expect(findReaderReturnTarget(document, { id: 'book-1', title: 'Book' })).toBe(tile);
    (document.activeElement as HTMLElement | null)?.blur?.();
    returnFocusAfterReader({ id: 'book-1', title: 'Book' }, null);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(tile);
  });
});

describe('fallback manga OCR direction (J6)', () => {
  it('reads direction off the shape, vertical when in doubt', () => {
    expect(orientationForSize(400, 100)).toBe('jpn');
    expect(orientationForSize(100, 400)).toBe('jpn_vert');
    expect(orientationForSize(100, 105)).toBe('jpn_vert');
    expect(orientationForBox([10, 10, 310, 60])).toBe('jpn');
    expect(resolveOcrOrientation('auto', { w: 800, h: 1200 })).toBe('jpn_vert');
    expect(resolveOcrOrientation('jpn', { w: 800, h: 1200 })).toBe('jpn');
  });
});
