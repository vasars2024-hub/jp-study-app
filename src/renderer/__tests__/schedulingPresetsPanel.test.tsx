// @vitest-environment jsdom
/**
 * Presets, the FSRS version and the parameters from an Anki import, driven
 * through the scheduling panel over the real deck and settings store.
 *
 * What it pins: a preset's settings are its own (the Default preset does not
 * move when another is edited); a folder assigned to a preset is reviewed with
 * it (steps, leech rule); the FSRS version is a setting the next review obeys;
 * and imported Anki parameters do nothing until the user adopts them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));

import SchedulingPreferencesPanel from '../components/flashcards/SchedulingPreferences';
import { DEFAULT_FSRS6_WEIGHTS } from '../../shared/fsrs';
import {
  isLeechCard,
  loadDeck,
  replaceImportedDeck,
  reviewDeckCard,
  searchDeckCards,
  upsertImportedDeck,
} from '../flashcardDeck';
import { loadSchedulingConfig, saveSchedulingConfig, schedulingConfigForCard } from '../flashcardScheduling';

const NOW = Date.UTC(2026, 7, 29, 9);

let host: HTMLDivElement;
let root: Root;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(SchedulingPreferencesPanel)); });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!found) throw new Error(`no button ${label} in [${Array.from(host.querySelectorAll('button')).map((b) => b.textContent).join(' | ')}]`);
  return found;
}

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const presetSelect = () => host.querySelector('select[aria-describedby="srs5-preset-help"]') as HTMLSelectElement;
const versionSelect = () => host.querySelector('select[aria-describedby="srs5-fsrs-version-help"]') as HTMLSelectElement | null;
const folderSelect = (folder: string) => host.querySelector(`select[aria-label="srs5.preset.folderAria(folder=${folder})"]`) as HTMLSelectElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  replaceImportedDeck('seed-book', 'Seed', [
    { word: '食べる', reading: 'たべる', meaning: 'to eat', folder: 'verbs', source: 'import' },
    { word: '飲む', reading: 'のむ', meaning: 'to drink', folder: 'verbs', source: 'import' },
    { word: '猫', reading: 'ねこ', meaning: 'cat', folder: 'nouns', source: 'import' },
  ]);
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('FSRS version', () => {
  it('is FSRS-5 until chosen, and FSRS-6 reaches the next review', () => {
    mount();
    expect(versionSelect()).toBeNull(); // SM-2: no FSRS controls
    act(() => { (host.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click(); });
    expect(versionSelect()?.value).toBe('5');
    expect(host.textContent).toContain('srs2.optimizer.defaults');
    choose(versionSelect() as HTMLSelectElement, '6');
    expect(loadSchedulingConfig().fsrsVersion).toBe(6);
    expect(host.textContent).toContain('srs5.optimizer.defaults6');
    const card = loadDeck()[2];
    reviewDeckCard(card.id, 'good', NOW);
    // FSRS-6's first Good: its own initial stability (w2 = 2.3065), not FSRS-5's 3.173.
    expect(loadDeck().find((c) => c.id === card.id)?.srs?.stability).toBeCloseTo(DEFAULT_FSRS6_WEIGHTS[2], 6);
  });

  it('says an FSRS-5 fit carries over when FSRS-6 is turned on', () => {
    saveSchedulingConfig({ algorithm: 'fsrs', fsrsWeights: [0.4, 1.2, 3.2, 15.7, 7.19, 0.53, 1.46, 0.0046, 1.55, 0.12, 1.02, 1.94, 0.11, 0.3, 2.27, 0.23, 2.99, 0.52, 0.66] });
    mount();
    choose(versionSelect() as HTMLSelectElement, '6');
    expect(host.textContent).toContain('srs5.fsrs.carried');
  });
});

describe('presets', () => {
  it('a new preset gets its own settings; a folder assigned to it is reviewed with them', () => {
    mount();
    act(() => { button('srs5.preset.add').click(); });
    const config = loadSchedulingConfig();
    expect(config.presets).toHaveLength(1);
    const id = config.presets[0].id;
    expect(presetSelect().value).toBe(id);
    expect(config.presets[0].name).toBe('srs5.preset.newName(n=1)');

    // Edit the preset: steps and leech rule. The Default preset stays as it was.
    const [learning] = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="text"]')).filter((i) => i.getAttribute('aria-describedby') === 'srs2-steps-help');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(learning, '1m 10m');
      learning.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { learning.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const leech = host.querySelector('input[type="number"][min="2"]') as HTMLInputElement;
    act(() => {
      setter?.call(leech, '2');
      leech.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(loadSchedulingConfig().presets[0]).toMatchObject({ learningStepsMinutes: [1, 10], leechThreshold: 2 });
    expect(loadSchedulingConfig()).toMatchObject({ learningStepsMinutes: [], leechThreshold: 8 });

    choose(folderSelect('verbs'), id);
    expect(loadSchedulingConfig().folderPresets).toEqual({ verbs: id });
    expect(host.textContent).toContain('srs5.preset.usedBy(count=1,names=verbs)');

    const verb = loadDeck().find((c) => c.folder === 'verbs');
    const noun = loadDeck().find((c) => c.folder === 'nouns');
    reviewDeckCard(verb?.id ?? '', 'good', NOW);
    reviewDeckCard(noun?.id ?? '', 'good', NOW);
    expect(loadDeck().find((c) => c.id === verb?.id)?.srs).toMatchObject({ phase: 'learning', intervalDays: 0 });
    expect(loadDeck().find((c) => c.id === noun?.id)?.srs?.intervalDays).toBeGreaterThanOrEqual(1);
    expect(schedulingConfigForCard({ folder: 'verbs' }).leechThreshold).toBe(2);
  });

  it('the leech rule is the card\'s preset\'s', () => {
    saveSchedulingConfig({});
    mount();
    act(() => { button('srs5.preset.add').click(); });
    const id = loadSchedulingConfig().presets[0].id;
    const leech = host.querySelector('input[type="number"][min="2"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(leech, '2');
      leech.dispatchEvent(new Event('input', { bubbles: true }));
    });
    choose(folderSelect('verbs'), id);
    const lapsed = { srs: { version: 2 as const, algorithm: 'sm2' as const, dueAt: 0, intervalDays: 1, ease: 2.5, repetitions: 3, lapses: 3, lastReviewedAt: 0, lastRating: 'again' as const } };
    expect(isLeechCard({ ...lapsed, folder: 'verbs' })).toBe(true);
    expect(isLeechCard({ ...lapsed, folder: 'nouns' })).toBe(false);
    const deck = loadDeck().map((card) => ({ ...card, srs: lapsed.srs }));
    expect(searchDeckCards(deck, 'is:leech').map((card) => card.folder)).toEqual(['verbs', 'verbs']);
  });

  it('delete takes two presses, and its folders go back to the Default preset', () => {
    mount();
    act(() => { button('srs5.preset.add').click(); });
    const id = loadSchedulingConfig().presets[0].id;
    choose(folderSelect('nouns'), id);
    act(() => { button('srs5.preset.delete').click(); });
    expect(loadSchedulingConfig().presets).toHaveLength(1);
    expect(host.textContent).toContain('srs5.preset.deleteWarning');
    act(() => { button(`srs5.preset.deleteConfirm(name=${loadSchedulingConfig().presets[0].name})`).click(); });
    expect(loadSchedulingConfig()).toMatchObject({ presets: [], folderPresets: {} });
    expect(presetSelect().value).toBe('default');
  });
});

describe('parameters from an Anki import', () => {
  const imported = {
    weights: [...DEFAULT_FSRS6_WEIGHTS],
    desiredRetention: 0.87,
    maximumIntervalDays: 3650,
    presetName: 'Japanese',
    deckName: 'Core 2k',
    fileName: 'core.apkg',
    importedAt: NOW,
  };

  it('shows what was imported, and changes nothing until it is used', () => {
    saveSchedulingConfig({ algorithm: 'fsrs', ankiFsrsImport: imported });
    mount();
    expect(host.textContent).toContain('srs5.anki.version(version=6,count=21)');
    expect(host.textContent).toContain('srs5.anki.deck(name=Core 2k)');
    expect(host.textContent).toContain('srs5.anki.preset(name=Japanese)');
    expect(host.textContent).toContain('srs5.anki.retention(percent=87)');
    expect(host.textContent).toContain('srs5.anki.maximum(count=3650)');
    expect(host.textContent).toContain('0.212 · 1.2931');
    expect(loadSchedulingConfig()).toMatchObject({ fsrsVersion: 5, desiredRetention: 0.9 });
    expect(loadSchedulingConfig().fsrsWeights).toBeUndefined();

    act(() => { button('srs5.anki.useHere(name=srs5.preset.default)').click(); });
    expect(loadSchedulingConfig()).toMatchObject({
      fsrsVersion: 6, fsrsWeights: [...DEFAULT_FSRS6_WEIGHTS], desiredRetention: 0.87, maximumIntervalDays: 3650,
    });
    expect(host.textContent).toContain('srs5.fsrs.version');
    expect(host.textContent).toContain('srs2.optimizer.personal');
  });

  it('can become a preset of its own, and can be dismissed', () => {
    saveSchedulingConfig({ algorithm: 'fsrs', ankiFsrsImport: imported });
    mount();
    act(() => { button('srs5.anki.asPreset').click(); });
    const [preset] = loadSchedulingConfig().presets;
    expect(preset).toMatchObject({ name: 'srs5.anki.presetName(name=Japanese)', fsrsVersion: 6, desiredRetention: 0.87 });
    expect(presetSelect().value).toBe(preset.id);
    // The Default preset did not take them.
    expect(loadSchedulingConfig().fsrsWeights).toBeUndefined();
    act(() => { button('srs5.anki.dismiss').click(); });
    expect(loadSchedulingConfig().ankiFsrsImport).toBeUndefined();
    expect(host.textContent).not.toContain('srs5.anki.title');
  });
});

describe('import upsert says where each entry landed', () => {
  it('matched entries keep their card id, new ones get the new card\'s', () => {
    const first = upsertImportedDeck('anki-core', [
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import', bookId: 'anki-core', bookTitle: 'Core' },
    ]);
    expect(first.entryIds).toEqual([first.added[0].id]);
    const second = upsertImportedDeck('anki-core', [
      { word: '犬', reading: 'いぬ', meaning: 'dog', source: 'import', bookId: 'anki-core', bookTitle: 'Core' },
      { word: '猫', reading: 'ねこ', meaning: 'a cat', source: 'import', bookId: 'anki-core', bookTitle: 'Core' },
    ]);
    expect(second.entryIds).toEqual([second.added[0].id, first.added[0].id]);
  });
});
