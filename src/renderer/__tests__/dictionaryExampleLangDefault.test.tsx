// @vitest-environment jsdom
/**
 * The example panel's language default used to be the literal `['en', 'ru']`, for every profile.
 * English is free — Tatoeba ships it with the sentence — but Russian is not: it routes the panel
 * through the offline Qwen3 model, which was measured on 2026-08-24 at ~15 s and main
 * 420.7 -> 3,323 MB with +3,339 handles. An English-front profile paid all of that for a column
 * its owner never asked for.
 *
 * These cases pin the default to the profile: English alone when the profile's non-Japanese
 * language IS English, and the old pair for the Russian profile that default was written for.
 * A stored choice always wins, because this is a default and not a policy.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult, ExampleSentence } from '../../shared/types';
import { SEED_PROFILES } from '../../shared/seedProfiles';

vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }) }));

const translateCalls: Array<{ text: string; to: string }> = [];
vi.mock('../translator', () => ({
  translateTo: async (text: string, _from: string, to: string) => {
    translateCalls.push({ text, to });
    return `translated:${to}`;
  },
}));

/** Which seed profile `getActiveProfile()` hands back for a given case. */
const activeProfileId = { value: 'p1-ja-focus' as 'p1-ja-focus' | 'p3-ru-ja' };
vi.mock('../profileState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../profileState')>();
  const seeds = (await import('../../shared/seedProfiles')).SEED_PROFILES;
  return {
    ...actual,
    getActiveProfile: () => seeds[activeProfileId.value],
  };
});

import DictionaryResults from '../components/DictionaryResults';

const ENTRY = {
  word: '猫',
  reading: 'ねこ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['cat'] }],
};

let modelSubscriptions = 0;

function stubApi(examples: ExampleSentence[]): void {
  const result: DictResult = { query: '猫', entries: [ENTRY] } as DictResult;
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '猫', examples })),
    onTranslateModelProgress: vi.fn(() => {
      modelSubscriptions += 1;
      return () => undefined;
    }),
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  translateCalls.length = 0;
  modelSubscriptions = 0;
  localStorage.clear();
  activeProfileId.value = 'p1-ja-focus';
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function loadExamples(): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render((<DictionaryResults query="猫" variant="page" lang="ja" />) as ReactNode);
  });
  const load = host.querySelector<HTMLButtonElement>('.dict-ex-btn');
  expect(load).not.toBeNull();
  await act(async () => {
    load?.click();
  });
  // The translate effect runs after the examples land.
  await act(async () => {
    await Promise.resolve();
  });
}

/** The language toggles as the panel renders them, pressed state included. */
function pressedLangs(): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.dict-ex-langs button')]
    .filter((b) => b.classList.contains('active'))
    .map((b) => b.textContent ?? '');
}

describe('Dictionary example languages — the default follows the profile', () => {
  it('asks the local model for nothing on an English-front profile', async () => {
    activeProfileId.value = 'p1-ja-focus';
    expect(SEED_PROFILES['p1-ja-focus'].card.backLang).toBe('en');
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);

    await loadExamples();

    expect(translateCalls).toEqual([]);
    expect(modelSubscriptions).toBe(0);
    expect(pressedLangs()).toEqual(['English']);
  });

  it('keeps the Russian pair for the profile that default was written for', async () => {
    activeProfileId.value = 'p3-ru-ja';
    expect(SEED_PROFILES['p3-ru-ja'].card.frontLang).toBe('ru');
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);

    await loadExamples();

    expect(translateCalls.map((c) => c.to)).toEqual(['ru']);
    expect(modelSubscriptions).toBe(1);
    expect(pressedLangs()).toEqual(['English', 'Русский']);
  });

  it('lets a stored choice override the profile default', async () => {
    activeProfileId.value = 'p1-ja-focus';
    localStorage.setItem('jp-study-ex-langs', JSON.stringify(['en', 'zh']));
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);

    await loadExamples();

    expect(translateCalls.map((c) => c.to)).toEqual(['zh']);
    expect(pressedLangs()).toEqual(['English', '中文']);
  });
});
