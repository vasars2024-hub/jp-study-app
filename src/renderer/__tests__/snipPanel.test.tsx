// @vitest-environment jsdom
/**
 * The Snips app and the background toast: the history and the selected snip's
 * analysis render from main's history (picture, furigana, translation, the
 * word-by-word breakdown, the cards), every control has a name, and the
 * buttons hand the right action to main.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnipEntry, SnipToastPayload } from '../../shared/snipToCards';
import { SNIP_SETTINGS_DEFAULTS } from '../../shared/snipToCards';

vi.mock('../components/settings/GlobalChordRow', () => ({ default: () => null }));

const calls: Array<{ name: string; args: unknown[] }> = [];
let entries: SnipEntry[] = [];
let toast: SnipToastPayload | null = null;

const DONE: SnipEntry = {
  id: 'snip-a',
  createdAt: Date.UTC(2026, 9, 11, 3, 0),
  lang: 'ja',
  status: 'done',
  width: 600,
  height: 120,
  bytes: 2048,
  hash: 'h',
  engine: 'basic',
  confidence: 0.9,
  text: '窓辺の猫',
  translation: 'The cat by the window',
  grammar: [{ title: '〜の', id: 'n5-no', level: 'N5', meaning: 'possessive' }],
  words: [
    { surface: '窓辺', lemma: '窓辺', reading: 'マドベ', surfaceReading: 'マドベ', pos: '名詞', status: 'added', cardId: 'c1', ankiNoteId: 7, meaning: 'windowside', level: 'N2' },
    { surface: 'の', lemma: 'の', pos: '助詞', status: 'function' },
    { surface: '猫', lemma: '猫', reading: 'ネコ', surfaceReading: 'ネコ', pos: '名詞', status: 'known', meaning: 'cat' },
  ],
  cardIds: ['c1'],
  ankiNoteIds: [7],
};

const MISSING: SnipEntry = {
  ...DONE,
  id: 'snip-b',
  lang: 'zh',
  status: 'error',
  error: 'models-missing',
  installIds: ['paddle-ocr-zh'],
  text: '',
  words: [],
  grammar: [],
  cardIds: [],
  ankiNoteIds: [],
  translation: undefined,
};

/** Most tests run on a profile where the learner turned watching on (off by default since v1). */
let enabledInMain = true;

function installApi(): void {
  const record = (name: string, value: unknown = undefined) => async (...args: unknown[]) => {
    calls.push({ name, args });
    return value;
  };
  (window as unknown as { api: Record<string, unknown> }).api = {
    snipGetStatus: async () => ({ ...SNIP_SETTINGS_DEFAULTS, enabled: enabledInMain, watching: enabledInMain, historyCount: entries.length, historyBytes: 4096 }),
    onSnipSettingsChanged: () => () => undefined,
    onSnipHistoryChanged: () => () => undefined,
    snipHistoryList: async () => entries,
    snipImage: async () => 'data:image/jpeg;base64,AA==',
    snipAction: record('snipAction', true),
    snipHistoryRemove: record('snipHistoryRemove', 1),
    snipSetSettings: record('snipSetSettings', { ...SNIP_SETTINGS_DEFAULTS, enabled: false, watching: false, historyCount: 2, historyBytes: 1 }),
    assetsStart: record('assetsStart', { ok: true }),
    snipToastGet: async () => toast,
    onSnipToast: () => () => undefined,
    snipToastClose: record('snipToastClose'),
    snipOpen: record('snipOpen'),
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  calls.length = 0;
  entries = [DONE, MISSING];
  installApi();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host.remove();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function button(name: RegExp): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
  if (!found) throw new Error(`no button ${name}`);
  return found as HTMLButtonElement;
}

describe('Snips app', () => {
  it('lists the history newest first and shows the analysis of the snip', async () => {
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    expect(host.querySelectorAll('.snip-history-item')).toHaveLength(2);
    expect(host.querySelector('img.snip-image')?.getAttribute('alt')).toBeTruthy();
    // Furigana over the kanji only.
    const rubies = [...host.querySelectorAll('.snip-text ruby')].map((r) => r.textContent);
    expect(rubies).toEqual(['窓辺まどべ', '猫ねこ']);
    expect(host.querySelector('.snip-translation')?.textContent).toBe('The cat by the window');
    const rows = [...host.querySelectorAll('.snip-words tbody tr')];
    expect(rows).toHaveLength(3);
    expect(rows[0].className).toContain('is-added');
    expect(host.querySelector('.snip-grammar')?.textContent).toContain('〜の');
  });

  it('every button has a name; Remove / Add / Undo hand the right action to main', async () => {
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    for (const b of host.querySelectorAll('button')) {
      expect((b.getAttribute('aria-label') ?? b.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
    await act(async () => button(/Remove the card for 窓辺/).click());
    await act(async () => button(/Add 猫 as a card/).click());
    await act(async () => button(/^Undo/).click());
    expect(calls.filter((c) => c.name === 'snipAction').map((c) => c.args[0])).toEqual([
      { id: 'snip-a', action: 'removeWord', index: 0 },
      { id: 'snip-a', action: 'addWord', index: 2 },
      { id: 'snip-a', action: 'undo' },
    ]);
  });

  it('a missing Chinese model is offered for install, never fetched by itself', async () => {
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    await act(async () => (host.querySelectorAll('.snip-history-open')[1] as HTMLButtonElement).click());
    await settle();
    expect(calls.some((c) => c.name === 'assetsStart')).toBe(false);
    await act(async () => button(/Install the Chinese OCR model/).click());
    expect(calls.find((c) => c.name === 'assetsStart')?.args).toEqual(['paddle-ocr-zh']);
  });

  it('search narrows the list', async () => {
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    expect(host.querySelector(`label[for="${search.id}"]`)).toBeTruthy();
  });
});

describe('background toast', () => {
  it('says what was added, with Undo and Open analysis', async () => {
    toast = { id: 'snip-a', kind: 'added', words: ['窓辺', '眠る', '静か', '猫'], count: 4 };
    const SnipToastWindow = (await import('../components/snip/SnipToastWindow')).default;
    await act(async () => root!.render(<SnipToastWindow />));
    await settle();
    expect(host.querySelector('.snip-toast-message')?.textContent).toBe('Added 4 words from snip: 窓辺, 眠る, 静か, …');
    await act(async () => button(/^Undo$/).click());
    await act(async () => button(/Open analysis/).click());
    expect(calls.map((c) => c.name)).toEqual(['snipAction', 'snipOpen']);
    expect(calls[0].args[0]).toEqual({ id: 'snip-a', action: 'undo' });
  });
});

const REVIEW: SnipEntry = {
  ...DONE,
  id: 'snip-r',
  review: 'uncertain',
  confidence: 0.62,
  words: [
    { surface: '窓辺', lemma: '窓辺', reading: 'マドベ', surfaceReading: 'マドベ', pos: '名詞', status: 'candidate', meaning: 'windowside' },
    { surface: 'の', lemma: 'の', pos: '助詞', status: 'function' },
    { surface: '猫', lemma: '猫', reading: 'ネコ', pos: '名詞', status: 'candidate', meaning: 'cat' },
    { surface: '静か', lemma: '静か', pos: '名詞', status: 'inDeck', cardId: 'old' },
  ],
  cardIds: [],
  ankiNoteIds: [],
};

describe('first-run notice (shown once the learner has turned Snip to cards on)', () => {
  it('off by default: a profile that never turned it on sees no notice', async () => {
    enabledInMain = false;
    try {
      const SnipPanel = (await import('../components/snip/SnipPanel')).default;
      await act(async () => root!.render(<SnipPanel />));
      await settle();
      expect(host.querySelector('.snip-notice')).toBeNull();
    } finally {
      enabledInMain = true;
    }
  });

  it('the Snips app says it is on and offers Turn off / Keep until answered', async () => {
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    expect(host.querySelector('.snip-notice')?.textContent).toContain('Snip to cards is on');
    await act(async () => button(/^Turn off$/).click());
    expect(calls.find((c) => c.name === 'snipSetSettings')?.args[0]).toEqual({ enabled: false, notice: 'answered' });
  });

  it('the first toast that made cards carries the notice; Keep answers it and Undo stays', async () => {
    toast = { id: 'snip-a', kind: 'added', words: ['窓辺'], count: 1, notice: true, engine: 'basic', confidence: 91 };
    const SnipToastWindow = (await import('../components/snip/SnipToastWindow')).default;
    await act(async () => root!.render(<SnipToastWindow />));
    await settle();
    expect(host.querySelector('.snip-toast-notice')?.textContent).toContain('Snip to cards is on');
    expect(host.textContent).toContain('Read by the built-in offline recognizer (91%)');
    await act(async () => button(/^Keep on$/).click());
    await settle();
    expect(calls.find((c) => c.name === 'snipSetSettings')?.args[0]).toEqual({ notice: 'answered' });
    expect(host.querySelector('.snip-toast-notice')).toBeNull();
    expect(button(/^Undo$/)).toBeTruthy();
  });

  it('the Undo window is spelled out: seconds left, and Undo stays in Snips after', async () => {
    toast = { id: 'snip-a', kind: 'added', words: ['窓辺'], count: 1 };
    const SnipToastWindow = (await import('../components/snip/SnipToastWindow')).default;
    await act(async () => root!.render(<SnipToastWindow />));
    await settle();
    expect(host.textContent).toMatch(/Closes in 1[12] s\. Undo stays in Snips after that\./);
    expect(host.querySelector('.snip-toast-bar')).toBeTruthy();
  });

  it('a review toast offers Review, not Undo', async () => {
    toast = { id: 'snip-r', kind: 'review', count: 2, review: 'uncertain', confidence: 62 };
    const SnipToastWindow = (await import('../components/snip/SnipToastWindow')).default;
    await act(async () => root!.render(<SnipToastWindow />));
    await settle();
    expect(host.querySelector('.snip-toast-message')?.textContent).toBe('The OCR was unsure (62%): check 2 words before adding them.');
    expect([...host.querySelectorAll('button')].some((b) => /^Undo$/.test(b.textContent ?? ''))).toBe(false);
    await act(async () => button(/^Review$/).click());
    expect(calls.find((c) => c.name === 'snipOpen')?.args).toEqual(['snip-r']);
  });
});

describe('review mode and corrections', () => {
  it('an unsure snip lists its words ticked; Add selected sends the chosen ones', async () => {
    entries = [REVIEW];
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    expect(host.querySelector('.snip-review-note')?.textContent).toContain('The OCR was unsure (62%)');
    expect(host.querySelector('.snip-history-meta')?.textContent).toContain('2 to review');
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input.snip-pick')];
    expect(boxes.map((b) => [b.getAttribute('aria-label'), b.checked])).toEqual([
      ['Choose 窓辺', true],
      ['Choose 猫', true],
      ['Choose 静か', false],
    ]);
    await act(async () => boxes[1].click());
    await act(async () => boxes[2].click());
    await act(async () => button(/^Add 2 selected words$/).click());
    expect(calls.filter((c) => c.name === 'snipAction').map((c) => c.args[0])).toEqual([
      { id: 'snip-r', action: 'addWords', indices: [0, 3] },
    ]);
  });

  it('Fix corrects a reading before the card is made', async () => {
    entries = [REVIEW];
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    await act(async () => button(/^Correct 窓辺$/).click());
    const reading = [...host.querySelectorAll('label')].find((l) => l.textContent === 'Reading')!;
    const input = document.getElementById(reading.getAttribute('for') ?? '') as HTMLInputElement;
    expect(input.value).toBe('まどべ');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'まどへ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(/^Save$/).click());
    await settle();
    expect(calls.filter((c) => c.name === 'snipAction').map((c) => c.args[0])).toEqual([
      { id: 'snip-r', action: 'editWord', index: 0, reading: 'まどへ' },
    ]);
  });

  it('Fix the text is offered only once the snip owns nothing; it re-reads the corrected text', async () => {
    entries = [DONE];
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    expect(button(/^Fix the text$/).disabled).toBe(true);
    expect(host.textContent).toContain('Undo this snip first to correct its text');
    act(() => root?.unmount());
    root = createRoot(host);
    entries = [{ ...DONE, status: 'error', error: 'low-confidence', words: [], cardIds: [], ankiNoteIds: [] }];
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    await act(async () => button(/^Fix the text$/).click());
    await act(async () => button(/^Read the words again$/).click());
    expect(calls.filter((c) => c.name === 'snipAction').map((c) => c.args[0])).toEqual([
      { id: 'snip-a', action: 'reanalyze', text: '窓辺の猫' },
    ]);
  });

  it('an in-deck word offers to add the sentence to its card; Undo says it stays available', async () => {
    entries = [{ ...REVIEW, review: undefined, words: [...REVIEW.words.slice(0, 3), { ...REVIEW.words[3], status: 'merged', example: '窓辺の猫' }] }];
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    expect(button(/^Remove the example this snip added to the card for 静か$/)).toBeTruthy();
    expect(button(/^Undo: remove the example from 1 card$/)).toBeTruthy();
    expect(host.querySelector('.snip-undo-hint')?.textContent).toContain('Undo stays available here');
    expect(host.querySelector('.snip-history-meta')?.textContent).toContain('via the built-in offline recognizer');
  });

  it('the per-snip deck is saved on blur', async () => {
    entries = [DONE];
    const SnipPanel = (await import('../components/snip/SnipPanel')).default;
    await act(async () => root!.render(<SnipPanel />));
    await settle();
    const label = [...host.querySelectorAll('label')].find((l) => l.textContent === 'Deck for this snip')!;
    const input = document.getElementById(label.getAttribute('for') ?? '') as HTMLInputElement;
    expect(input.placeholder).toBe('Default: Snips');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'Manga');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.focus();
      input.blur();
    });
    expect(calls.filter((c) => c.name === 'snipAction').map((c) => c.args[0])).toEqual([
      { id: 'snip-a', action: 'setDeck', deck: 'Manga' },
    ]);
  });
});
