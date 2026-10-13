// @vitest-environment jsdom
/**
 * Snip to cards, the main window's half: read → split → skip what is known,
 * carded or grammar → mine the rest (Gum + Anki) → record exactly what was made,
 * so Undo and the per-word toggle remove those and nothing else. The OCR, the
 * tokenizer, the deck and the mining path are faked at their module seams.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnipEntry, SnipJob } from '../../shared/snipToCards';
import { SNIP_SETTINGS_DEFAULTS } from '../../shared/snipToCards';

const h = vi.hoisted(() => ({
  ocrText: '窓辺の猫は静かに眠っていた。',
  ocrConfidence: 0.92,
  deck: [] as Array<{ id: string; word: string; studyLang?: string; folder?: string; reading?: string; meaning?: string; sentence?: string; exampleSentences?: Array<{ text: string; origin: string }> }>,
  focused: false,
  lookups: [] as string[],
  known: new Set<string>(),
  mined: [] as Array<Record<string, unknown>>,
  removed: [] as string[][],
  deletedNotes: [] as number[][],
  entries: new Map<string, SnipEntry>(),
  toasts: [] as unknown[],
  ankiDeleteOk: true,
  nextNote: 900,
}));

vi.mock('../lensOfflineOcr', () => ({
  readLensFallbackImage: async () => ({
    text: h.ocrText,
    lines: [{ text: h.ocrText, confidence: h.ocrConfidence, box: [0, 0, 1, 1] }],
  }),
}));
vi.mock('../tokenizer', () => ({
  getTokenizer: async () => ({}),
  tokenizerReady: () => true,
  tokenizeSync: () => [
    { surface: '窓辺', lemma: '窓辺', reading: 'マドベ', pos: '名詞', posDetail: '一般', content: true, proper: false },
    { surface: 'の', lemma: 'の', reading: 'ノ', pos: '助詞', posDetail: '連体化', content: false, proper: false },
    { surface: '猫', lemma: '猫', reading: 'ネコ', pos: '名詞', posDetail: '一般', content: true, proper: false },
    { surface: 'は', lemma: 'は', reading: 'ハ', pos: '助詞', posDetail: '係助詞', content: false, proper: false },
    { surface: '静か', lemma: '静か', reading: 'シズカ', pos: '名詞', posDetail: '形容動詞語幹', content: true, proper: false },
    { surface: 'に', lemma: 'に', reading: 'ニ', pos: '助詞', posDetail: '副詞化', content: false, proper: false },
    { surface: '眠っ', lemma: '眠る', reading: 'ネムッ', pos: '動詞', posDetail: '自立', content: true, proper: false },
    { surface: 'て', lemma: 'て', reading: 'テ', pos: '助詞', posDetail: '接続助詞', content: false, proper: false },
    { surface: 'い', lemma: 'いる', reading: 'イ', pos: '動詞', posDetail: '非自立', content: false, proper: false },
    { surface: 'た', lemma: 'た', reading: 'タ', pos: '助動詞', posDetail: '*', content: false, proper: false },
    { surface: '。', lemma: '。', reading: '。', pos: '記号', posDetail: '句点', content: false, proper: false },
  ],
}));
vi.mock('../flashcardDeck', () => ({
  loadDeck: () => h.deck,
  updateDeckCard: (id: string, patch: Record<string, unknown>) => {
    h.deck = h.deck.map((c) => (c.id === id ? { ...c, ...patch } : c));
    return h.deck;
  },
  setDeckCardFolder: (id: string, folder: string | null) => {
    h.deck = h.deck.map((c) => (c.id === id ? { ...c, folder: folder ?? undefined } : c));
    return h.deck;
  },
  removeDeckCards: (ids: string[]) => {
    h.removed.push([...ids]);
    h.deck = h.deck.filter((c) => !ids.includes(c.id));
    return h.deck;
  },
}));
vi.mock('../knownWords', () => ({
  getLevel: (w: string) => (h.known.has(w) ? 3 : 0),
  isManualLevel: () => false,
}));
vi.mock('../studyMining', () => ({
  mineToStudy: async (input: Record<string, unknown>) => {
    h.mined.push(input);
    const id = `card-${h.mined.length}`;
    h.deck.push({ id, word: String(input.word), folder: input.folder as string, reading: input.reading as string });
    const noteId = input.anki ? h.nextNote++ : undefined;
    return {
      card: { id },
      created: true,
      anki: noteId ? 'added' : 'local',
      ...(noteId ? { ankiResult: { ok: true, noteId } } : {}),
    };
  },
}));
vi.mock('../localGrammarAnalysis', () => ({
  localSentenceAnalysis: () => ({
    sentence: '',
    translations: {},
    annotations: [{ text: 'ていた', headword: '〜ている', grammarId: 'n5-teiru', meaning: 'ongoing state', level: 'N5', start: 0, end: 1 }],
    nuance: [],
    pitfalls: [],
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => 'The cat by the window was sleeping quietly.' }));
vi.mock('../notificationStore', () => ({ isDnd: () => false, notify: () => undefined }));
vi.mock('../i18n', () => ({ t: (k: string) => k, getUiLang: () => 'en' }));

function installApi(): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    snipHistoryUpdate: async (id: string, patch: Partial<SnipEntry>) => {
      const next = { ...(h.entries.get(id) as SnipEntry), ...patch } as SnipEntry;
      h.entries.set(id, next);
      return next;
    },
    snipHistoryGet: async (id: string) => h.entries.get(id) ?? null,
    snipGetStatus: async () => ({ ...SNIP_SETTINGS_DEFAULTS, watching: true, historyCount: 1, historyBytes: 1 }),
    lookupTerm: async (q: string) => (h.lookups.push(q), q === '未来' ? {
      query: q,
      entries: [{ word: '未来', reading: 'みらい', via: 'exact', senses: [{ partsOfSpeech: [], definitions: ['future'], tags: [] }] }],
    } : q === '窓' ? {
      // Only a prefix near-miss: never this word's meaning.
      query: q,
      entries: [{ word: '窓辺', reading: 'まどべ', via: 'prefix', senses: [{ partsOfSpeech: [], definitions: ['windowside'], tags: [] }] }],
    } : {
      query: q,
      entries: [{ word: q === '眠っていた' ? '眠る' : q, reading: q === '眠っていた' ? 'ねむる' : 'よみ', isCommon: true, jlpt: ['N4'], senses: [{ partsOfSpeech: [], definitions: [`meaning of ${q}`], tags: [] }], frequency: 1200 }],
      ...(q === '眠っていた' ? { deinflection: { source: q, term: '眠る', reasons: ['-te', 'progressive or perfect', 'past'] } } : {}),
    }),
    snipSetSettings: async () => ({ ...SNIP_SETTINGS_DEFAULTS, watching: true, historyCount: 1, historyBytes: 1 }),
    flashcardStoreMinedMedia: async () => ({ ok: true, path: 'media/snip.jpg' }),
    ankiDeleteNotes: async (ids: number[]) => {
      h.deletedNotes.push([...ids]);
      return { ok: h.ankiDeleteOk };
    },
    snipToastShow: async (p: unknown) => {
      h.toasts.push(p);
      return true;
    },
  };
}

function job(over: Partial<SnipJob> = {}): SnipJob {
  const entry: SnipEntry = {
    id: 'snip-1',
    createdAt: 1,
    lang: 'ja',
    status: 'processing',
    width: 600,
    height: 120,
    bytes: 10,
    hash: 'h',
    text: '',
    words: [],
    grammar: [],
    cardIds: [],
    ankiNoteIds: [],
  };
  h.entries.set(entry.id, entry);
  return {
    entry,
    settings: { ...SNIP_SETTINGS_DEFAULTS },
    basicOcr: { dataUrl: 'data:image/png;base64,AA==', width: 600, height: 120 },
    cardImage: { base64: 'SlBFRw==', filename: 'gum-snip-snip-1.jpg' },
    ...over,
  };
}

async function load() {
  vi.resetModules();
  return import('../snipToCards');
}

beforeEach(() => {
  h.ocrText = '窓辺の猫は静かに眠っていた。';
  h.ocrConfidence = 0.92;
  h.deck = [];
  h.known = new Set();
  h.mined = [];
  h.removed = [];
  h.deletedNotes = [];
  h.entries.clear();
  h.toasts = [];
  h.ankiDeleteOk = true;
  h.nextNote = 900;
  h.focused = false;
  h.lookups = [];
  installApi();
  // Gum in the background: the snip was taken over another app.
  vi.spyOn(document, 'hasFocus').mockImplementation(() => h.focused);
});

describe('a snip becomes cards', () => {
  it('adds only the unknown, uncarded content words, each with the sentence, picture and Anki note', async () => {
    h.known.add('猫');
    h.deck.push({ id: 'old', word: '静か' });
    const { processSnip } = await load();
    const entry = await processSnip(job());
    expect(h.mined.map((m) => m.word)).toEqual(['窓辺', '眠る']);
    expect(h.mined[1]).toMatchObject({
      reading: 'ねむる',
      meaning: 'meaning of 眠っていた',
      sentence: '窓辺の猫は静かに眠っていた。',
      folder: 'Snips',
      source: 'companion',
      imagePath: 'media/snip.jpg',
      studyLang: 'ja',
      anki: { term: '眠る', surface: '眠っていた', imageBase64: 'SlBFRw==', route: { language: 'ja' } },
    });
    expect(entry).toMatchObject({ status: 'done', cardIds: ['card-1', 'card-2'], ankiNoteIds: [900, 901] });
    const byWord = Object.fromEntries(entry!.words.map((w) => [w.surface, w.status]));
    // 静か is already a card: this snip's sentence becomes another example on it.
    expect(byWord).toMatchObject({ 窓辺: 'added', の: 'function', 猫: 'known', 静か: 'merged', 眠っていた: 'added', '。': 'punct' });
    expect(entry!.words.find((w) => w.surface === '静か')).toMatchObject({ cardId: 'old', example: '窓辺の猫は静かに眠っていた。' });
    expect(h.deck.find((c) => c.id === 'old')?.exampleSentences).toEqual([{ text: '窓辺の猫は静かに眠っていた。', origin: 'corpus' }]);
    const verb = entry!.words.find((w) => w.surface === '眠っていた')!;
    expect(verb).toMatchObject({ lemma: '眠る', deinflection: ['-te', 'progressive or perfect', 'past'], level: 'N4', freq: 1200 });
    expect(entry!.grammar).toEqual([{ title: '〜ている', id: 'n5-teiru', meaning: 'ongoing state', level: 'N5' }]);
    // In the background (no focus), the toast window says what was added.
    expect(h.toasts[0]).toMatchObject({ id: 'snip-1', kind: 'added', words: ['窓辺', '眠る'], count: 2, merged: 1, engine: 'basic', confidence: 92 });
  });

  it('respects the per-snip limit: the rest is listed, not added', async () => {
    const { processSnip } = await load();
    const entry = await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, maxWords: 1 } }));
    expect(h.mined).toHaveLength(1);
    expect(entry!.overLimit).toBe(3);
  });

  it('Anki off: cards in Gum only; auto-add off: nothing mined, all listed', async () => {
    let { processSnip } = await load();
    await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, sendToAnki: 'off' } }));
    expect(h.mined.every((m) => m.anki === undefined)).toBe(true);
    h.mined = [];
    h.deck = [];
    ({ processSnip } = await load());
    const entry = await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, autoAdd: false } }));
    expect(h.mined).toHaveLength(0);
    expect(entry!.words.filter((w) => w.status === 'candidate').map((w) => w.lemma)).toEqual(['窓辺', '猫', '静か', '眠る']);
    // Review mode: the toast says how many wait, not "no new words".
    expect(entry!.review).toBe('manual');
    expect(h.toasts.at(-1)).toMatchObject({ kind: 'review', count: 4, review: 'manual' });
  });

  it('never makes cards from an unsure or garbled read; the history keeps the error', async () => {
    h.ocrConfidence = 0.2;
    const { processSnip } = await load();
    const entry = await processSnip(job());
    expect(h.mined).toHaveLength(0);
    expect(entry).toMatchObject({ status: 'error', error: 'low-confidence' });
    expect(h.toasts[0]).toMatchObject({ kind: 'error', error: 'low-confidence' });
  });

  it('a snip main could not read (no model) is only announced', async () => {
    const { processSnip } = await load();
    const base = job();
    const failed = { ...base.entry, status: 'error' as const, error: 'models-missing' as const, lang: 'zh' as const };
    h.entries.set(failed.id, failed);
    await processSnip({ ...base, entry: failed, basicOcr: undefined });
    expect(h.mined).toHaveLength(0);
    expect(h.toasts[0]).toMatchObject({ kind: 'error', error: 'models-missing', lang: 'zh' });
  });
});

describe('Undo and the per-word toggle are exact', () => {
  it('Undo removes exactly the cards and notes this snip made', async () => {
    h.deck.push({ id: 'mine-elsewhere', word: '犬' });
    const { processSnip, runAction } = await load();
    await processSnip(job());
    await runAction({ id: 'snip-1', action: 'undo' });
    expect(h.removed).toEqual([['card-1', 'card-2', 'card-3', 'card-4']]);
    expect(h.deletedNotes).toEqual([[900, 901, 902, 903]]);
    expect(h.deck.map((c) => c.id)).toEqual(['mine-elsewhere']);
    const entry = h.entries.get('snip-1')!;
    expect(entry).toMatchObject({ undone: true, cardIds: [], ankiNoteIds: [] });
    expect(entry.words.filter((w) => w.status === 'removed')).toHaveLength(4);
    // A second Undo does nothing.
    await runAction({ id: 'snip-1', action: 'undo' });
    expect(h.removed).toHaveLength(1);
  });

  it('Anki closed during Undo: the notes stay recorded, so a later Undo can still remove them', async () => {
    h.ankiDeleteOk = false;
    const { processSnip, runAction } = await load();
    await processSnip(job());
    await runAction({ id: 'snip-1', action: 'undo' });
    expect(h.entries.get('snip-1')!.ankiNoteIds).toEqual([900, 901, 902, 903]);
  });

  it('remove one word, then add it back', async () => {
    const { processSnip, runAction } = await load();
    const entry = await processSnip(job());
    const index = entry!.words.findIndex((w) => w.lemma === '猫');
    await runAction({ id: 'snip-1', action: 'removeWord', index });
    let next = h.entries.get('snip-1')!;
    expect(next.words[index].status).toBe('removed');
    expect(h.removed).toEqual([['card-2']]);
    expect(h.deletedNotes).toEqual([[901]]);
    expect(next.cardIds).toEqual(['card-1', 'card-3', 'card-4']);
    await runAction({ id: 'snip-1', action: 'addWord', index });
    next = h.entries.get('snip-1')!;
    expect(next.words[index].status).toBe('added');
    expect(next.cardIds).toContain(next.words[index].cardId);
  });
});

describe('known and in-deck agree with the reader', () => {
  it('a word graded under its kana spelling is known, not carded again', async () => {
    h.known.add('ねこ');
    const { processSnip } = await load();
    const entry = await processSnip(job());
    expect(entry!.words.find((w) => w.surface === '猫')?.status).toBe('known');
    expect(h.mined.map((m) => m.word)).not.toContain('猫');
  });

  it('a prefix near-miss from the dictionary is never taken as the word', async () => {
    const { __snipToCardsRendererTestables } = await load();
    const word = await __snipToCardsRendererTestables.enrichWord({ surface: '窓', lemma: '窓', status: 'candidate' }, 'ja');
    expect(word.meaning).toBeUndefined();
  });
});

describe('OCR confidence: unsure reads wait for review', () => {
  it('62 %: nothing is added, the words are listed, and the toast asks for a review', async () => {
    h.ocrConfidence = 0.62;
    const { processSnip } = await load();
    const entry = await processSnip(job());
    expect(h.mined).toHaveLength(0);
    expect(entry).toMatchObject({ status: 'done', review: 'uncertain', engine: 'basic', cardIds: [] });
    expect(h.toasts[0]).toMatchObject({ kind: 'review', review: 'uncertain', count: 4, confidence: 62 });
  });
});

describe('review mode', () => {
  it('Add selected adds exactly the chosen words, and an in-deck one gets the sentence instead', async () => {
    h.deck.push({ id: 'old', word: '静か' });
    const { processSnip, runAction } = await load();
    const entry = await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, autoAdd: false } }));
    const at = (lemma: string) => entry!.words.findIndex((w) => w.lemma === lemma);
    expect(entry!.words[at('静か')]).toMatchObject({ status: 'inDeck', cardId: 'old' });
    await runAction({ id: 'snip-1', action: 'addWords', indices: [at('眠る'), at('静か')] });
    const next = h.entries.get('snip-1')!;
    expect(h.mined.map((m) => m.word)).toEqual(['眠る']);
    expect(next.words[at('眠る')].status).toBe('added');
    expect(next.words[at('静か')]).toMatchObject({ status: 'merged', example: '窓辺の猫は静かに眠っていた。' });
    expect(next.words[at('窓辺')].status).toBe('candidate');
    expect(next.cardIds).toEqual(['card-1']);
  });

  it('a corrected reading is what the card gets', async () => {
    const { processSnip, runAction } = await load();
    const entry = await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, autoAdd: false } }));
    const index = entry!.words.findIndex((w) => w.lemma === '窓辺');
    await runAction({ id: 'snip-1', action: 'editWord', index, reading: 'マドヘ' });
    const edited = h.entries.get('snip-1')!.words[index];
    expect(edited).toMatchObject({ reading: 'まどへ', surfaceReading: 'まどへ', edited: true });
    await runAction({ id: 'snip-1', action: 'addWords', indices: [index] });
    expect(h.mined[0]).toMatchObject({ word: '窓辺', reading: 'まどへ' });
  });

  it('a misread word is corrected: looked up again by its new form, and the text follows', async () => {
    const { processSnip, runAction } = await load();
    const entry = await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, autoAdd: false } }));
    const index = entry!.words.findIndex((w) => w.lemma === '窓辺');
    h.lookups = [];
    await runAction({ id: 'snip-1', action: 'editWord', index, lemma: '未来' });
    const next = h.entries.get('snip-1')!;
    expect(h.lookups).toEqual(['未来']);
    expect(next.words[index]).toMatchObject({ surface: '未来', lemma: '未来', reading: 'みらい', meaning: 'future', status: 'candidate', edited: true });
    expect(next.text).toBe('未来の猫は静かに眠っていた。');
    expect(next.ocrText).toBe('窓辺の猫は静かに眠っていた。');
  });

  it('correcting a word that is already a card corrects the card', async () => {
    const { processSnip, runAction } = await load();
    const entry = await processSnip(job());
    const index = entry!.words.findIndex((w) => w.lemma === '窓辺');
    await runAction({ id: 'snip-1', action: 'editWord', index, reading: 'まどへ' });
    expect(h.deck.find((c) => c.id === 'card-1')).toMatchObject({ word: '窓辺', reading: 'まどへ' });
  });
});

describe('fixing the OCR text', () => {
  it('refused while the snip owns cards; after Undo, the corrected text is analysed for review', async () => {
    const { processSnip, runAction } = await load();
    await processSnip(job());
    await runAction({ id: 'snip-1', action: 'reanalyze', text: '未来の猫。' });
    expect(h.entries.get('snip-1')!.text).toBe('窓辺の猫は静かに眠っていた。');
    await runAction({ id: 'snip-1', action: 'undo' });
    await runAction({ id: 'snip-1', action: 'reanalyze', text: '窓辺の猫は静かに眠っていた。' });
    const next = h.entries.get('snip-1')!;
    expect(next).toMatchObject({ status: 'done', review: 'manual', cardIds: [], ankiNoteIds: [] });
    expect(next.undone).toBeFalsy();
    expect(next.words.filter((w) => w.status === 'candidate').map((w) => w.lemma)).toEqual(['窓辺', '猫', '静か', '眠る']);
  });

  it('a low-confidence read keeps its text, and can be analysed after a fix', async () => {
    h.ocrConfidence = 0.2;
    const { processSnip, runAction } = await load();
    await processSnip(job());
    expect(h.entries.get('snip-1')).toMatchObject({ status: 'error', error: 'low-confidence', text: '窓辺の猫は静かに眠っていた。' });
    await runAction({ id: 'snip-1', action: 'reanalyze', text: '窓辺の猫は静かに眠っていた。' });
    expect(h.entries.get('snip-1')).toMatchObject({ status: 'done', review: 'manual' });
    expect(h.mined).toHaveLength(0);
  });
});

describe('merging into existing cards is undone exactly', () => {
  it('Undo removes the added cards and only the example it added', async () => {
    h.deck.push({ id: 'old', word: '静か', exampleSentences: [{ text: '静かな夜。', origin: 'ai' }] });
    const { processSnip, runAction } = await load();
    await processSnip(job());
    expect(h.deck.find((c) => c.id === 'old')?.exampleSentences).toHaveLength(2);
    await runAction({ id: 'snip-1', action: 'undo' });
    expect(h.deck.find((c) => c.id === 'old')?.exampleSentences).toEqual([{ text: '静かな夜。', origin: 'ai' }]);
    expect(h.entries.get('snip-1')!.words.find((w) => w.surface === '静か')).toMatchObject({ status: 'inDeck' });
  });

  it('the card\'s own sentence is never repeated as an example', async () => {
    h.deck.push({ id: 'old', word: '静か', sentence: '窓辺の猫は静かに眠っていた。' });
    const { processSnip } = await load();
    const entry = await processSnip(job());
    expect(entry!.words.find((w) => w.surface === '静か')?.status).toBe('inDeck');
    expect(h.deck.find((c) => c.id === 'old')?.exampleSentences).toBeUndefined();
  });

  it('merging off: in-deck words are left alone', async () => {
    h.deck.push({ id: 'old', word: '静か' });
    const { processSnip } = await load();
    await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, mergeExisting: false } }));
    expect(h.deck.find((c) => c.id === 'old')?.exampleSentences).toBeUndefined();
  });
});

describe('per-snip deck', () => {
  it("moves the snip's cards, and later adds go there too", async () => {
    const { processSnip, runAction } = await load();
    const entry = await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, maxWords: 1 } }));
    await runAction({ id: 'snip-1', action: 'setDeck', deck: 'Manga::Vol 1' });
    expect(h.deck.find((c) => c.id === 'card-1')?.folder).toBe('Manga::Vol 1');
    const later = entry!.words.findIndex((w) => w.status === 'overLimit');
    await runAction({ id: 'snip-1', action: 'addWord', index: later });
    expect(h.mined.at(-1)).toMatchObject({ folder: 'Manga::Vol 1' });
  });
});

describe('the first-run notice', () => {
  it('the first snip that makes cards uses the background toast even with Gum focused (main adds the notice)', async () => {
    h.focused = true;
    const { processSnip } = await load();
    await processSnip(job());
    expect(h.toasts[0]).toMatchObject({ kind: 'added', count: 4 });
  });

  it('once answered, a focused Gum gets the in-app toast with Undo', async () => {
    h.focused = true;
    const seen: Array<{ message: string; action?: { label: string } }> = [];
    const onToast = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('os:toast', onToast);
    const { processSnip } = await load();
    await processSnip(job({ settings: { ...SNIP_SETTINGS_DEFAULTS, notice: 'answered' } }));
    window.removeEventListener('os:toast', onToast);
    expect(h.toasts).toHaveLength(0);
    expect(seen[0]).toMatchObject({ message: 'snip.toast.added', action: { label: 'snip.toast.undo' } });
  });
});
