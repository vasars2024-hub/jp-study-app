// @vitest-environment jsdom
/**
 * a11y axe — axe-core (plus the house ARIA audit) over the Flashcards deck list
 * under the Aero material set (`data-materials="aero"` on <html>, which is what
 * `useAeroMaterials` reads): menu bar, toolbar, folder rail with a user folder,
 * the deck table with an expanded group, the dictionary tab, and the deck
 * options menu. `a11yAxeFlashcards.test.tsx` covers the default skin.
 */
import { createElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, click, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

const CARDS = [
  { id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 1, bookTitle: 'Book', folder: 'Verbs' },
  { id: 'b', word: '飲む', reading: 'のむ', meaning: 'to drink', addedAt: 2, bookTitle: 'Book', folder: 'Verbs' },
  { id: 'c', word: '走る', reading: 'はしる', meaning: 'to run', addedAt: 3, bookTitle: 'Other book' },
  // Saved dictionary words live in the deck as `source: 'dictionary'` cards.
  ...[['猫', 'ねこ', 'cat'], ['犬', 'いぬ', 'dog']].map(([word, reading, meaning], i) => ({
    id: `d${i}`, word, reading, meaning, addedAt: 10 + i,
    source: 'dictionary', bookId: 'dictionary', bookTitle: 'Dictionary', folder: 'Dictionary',
  })),
];

beforeAll(() => {
  installJsdomShims();
  stubBridge({ listLibrary: [], jitenGetStore: { plan: [] }, flashcardListVoices: { voices: [] } });
  document.documentElement.setAttribute('data-materials', 'aero');
});

afterAll(() => {
  document.documentElement.removeAttribute('data-materials');
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: ['Verbs'], cards: CARDS }));
});

afterEach(async () => {
  await cleanup();
});

async function mountAero(): Promise<HTMLDivElement> {
  const { default: FlashcardsView } = await import('../views/FlashcardsView');
  const { host } = await mount(createElement(FlashcardsView), 60);
  expect(host.querySelector('.aero-flash'), 'aero layout painted').not.toBeNull();
  return host;
}

describe('Flashcards (Aero skin) — axe-core', () => {
  it('the deck list with a user folder and an expanded deck', async () => {
    const host = await mountAero();
    expect(host.textContent).toContain('食べる');
    expect(host.textContent).toContain('Verbs');
    expect(host.querySelector('.aero-flash-folder-item > button.aero-flash-folder-x')?.getAttribute('aria-label'),
      'folder delete is its own named button').toMatch(/Verbs/);
    expect(host.querySelector('.aero-flash-group-main[aria-expanded="true"]'), 'expanded deck').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the dictionary tab', async () => {
    const host = await mountAero();
    const sources = host.querySelectorAll<HTMLButtonElement>('.aero-flash-source');
    expect(sources.length).toBe(2);
    await click(sources[1]);
    await settle(20);
    expect(sources[1].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.aero-flash-dict-list')?.textContent, 'saved words listed').toContain('猫');
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the deck options menu', async () => {
    const host = await mountAero();
    const options = host.querySelectorAll<HTMLButtonElement>('.aero-flash-group-row .aero-flash-row-actions button');
    expect(options.length, 'deck row actions').toBeGreaterThan(1);
    await click(options[1]);
    await settle(20);
    expect(document.querySelector('.deck-action-menu[role="dialog"]'), 'deck menu painted').not.toBeNull();
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('creating a folder', async () => {
    const host = await mountAero();
    await click(host.querySelector('.aero-flash-folder-add'));
    expect(host.querySelector('.aero-flash-folder-edit input'), 'folder name field').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
  });
});
