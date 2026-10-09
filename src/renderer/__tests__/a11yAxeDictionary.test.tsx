// @vitest-environment jsdom
/**
 * a11y3 — axe-core over the Dictionary: the results page for a word with
 * several entries and senses, the same results in the pop-up variant, the
 * floating DictionaryPopup, and the empty / no-match states.
 */
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, leanBridge, mount } from './helpers/axeHarness';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div className="anki-setup-stub" /> }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

const ENTRIES = [
  {
    word: '食べる', reading: 'たべる', isCommon: true, jlpt: ['N5'],
    senses: [
      { partsOfSpeech: ['v1', 'vt'], definitions: ['to eat'], tags: [] },
      { partsOfSpeech: ['v1'], definitions: ['to live on (e.g. a salary)', 'to subsist on'], tags: [] },
    ],
    source: 'JMdict',
  },
  {
    word: '喰べる', reading: 'たべる', isCommon: false, jlpt: [],
    senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: ['rK'] }],
    source: 'JMdict',
  },
] as unknown as DictResult['entries'];

function bridge(entries = ENTRIES): void {
  // Lean on purpose: optional panels probe `typeof window.api.x === 'function'`.
  leanBridge({
    onAnkiLinkChanged: null,
    onPlayerSync: null,
    playerWindowId: 1,
    lookupTerm: async (query: string) => ({ query, entries }) as DictResult,
    lookupChinese: { query: '', entries: [] },
    ankiStatus: { connected: false, decks: [], models: [] },
    ankiLinkState: { state: 'idle' },
    searchExamples: { query: '', examples: [] },
    dictConjugation: { query: '', forms: [] },
    analyzeConjugation: null,
    listLibrary: [],
  });
}

beforeAll(() => {
  installJsdomShims();
});

afterEach(async () => {
  await cleanup();
  localStorage.clear();
});

describe('Dictionary — axe-core', () => {
  it('results page for a word', async () => {
    bridge();
    const { default: DictionaryResults } = await import('../components/DictionaryResults');
    const { host } = await mount(createElement(DictionaryResults, { query: '食べる', variant: 'page', lang: 'ja' }), 60);
    expect(host.textContent).toContain('食べる');
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('results in the pop-up variant', async () => {
    bridge();
    const { default: DictionaryResults } = await import('../components/DictionaryResults');
    const { host } = await mount(createElement(DictionaryResults, { query: '食べる', variant: 'popup', lang: 'ja' }), 60);
    expect(host.textContent).toContain('食べる');
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('no match', async () => {
    bridge([] as unknown as DictResult['entries']);
    const { default: DictionaryResults } = await import('../components/DictionaryResults');
    const { host } = await mount(createElement(DictionaryResults, { query: 'zzzz', variant: 'page', lang: 'ja' }), 60);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the floating pop-up', async () => {
    bridge();
    const { default: DictionaryPopup } = await import('../components/DictionaryPopup');
    await mount(createElement(DictionaryPopup, { query: '食べる', x: 10, y: 10, lang: 'ja', onClose: () => undefined }), 60);
    expect(document.body.textContent).toContain('食べる');
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('the Dictionary page (search box and results)', async () => {
    bridge();
    const { default: DictionaryView } = await import('../views/DictionaryView');
    const { host } = await mount(createElement(DictionaryView), 120);
    expect(host.querySelector('input, [role="searchbox"], [role="combobox"]'), 'search field').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
  });
});
