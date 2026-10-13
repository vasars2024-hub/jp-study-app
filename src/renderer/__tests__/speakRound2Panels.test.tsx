// @vitest-environment jsdom
/**
 * Speaking and writing, round 2, as rendered — against a fake bridge, fake
 * speech capture and SYNTHESISED fixture audio (never the microphone, never a
 * provider):
 *
 * - shadowing: the pitch accent measured from the take against the pitch
 *   dictionary (match, mismatch and what "Explain with AI" is told), and the
 *   reasons it is not measured (no audio, a take too far from the line);
 * - the conversation partner: Retry after a failed or cancelled reply and after
 *   a reload (docs/SCORECARD.md bug 44), a fresh opening after Clear, memory of
 *   earlier sessions' words, a correction saved as a card with its reason, and
 *   the hands-free voice loop;
 * - writing help: the correction history, an edit saved as a card, and the
 *   journal streak.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const readiness = vi.hoisted(() => ({ loaded: true, enabled: true }));
vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ ...readiness, ready: true, cloudReady: true, localReady: false }),
  openAiSettings: vi.fn(),
}));

const speech = vi.hoisted(() => ({
  whisperReadiness: vi.fn(),
  transcribeRecording: vi.fn(),
  startMicRecording: vi.fn(),
}));
vi.mock('../speechCapture', () => speech);
vi.mock('../whisperModelCache', () => ({ prefetchWhisperModel: vi.fn() }));
vi.mock('../whisperSettings', () => ({ loadWhisperDevice: () => 'auto' }));

const mining = vi.hoisted(() => ({ mineToStudy: vi.fn(async () => ({ created: true })) }));
vi.mock('../studyMining', () => mining);

const levels = vi.hoisted(() => new Map<string, number>());
vi.mock('../knownWords', async (importOriginal) => ({
  ...await importOriginal<typeof import('../knownWords')>(),
  getLevel: (word: string) => levels.get(word) ?? 0,
  listKnownEntries: () => [...levels.entries()].map(([word, level]) => ({ word, level })),
}));
vi.mock('../tokenizer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../tokenizer')>(),
  getTokenizer: () => Promise.resolve({}),
}));
vi.mock('../studyTokens', async (importOriginal) => ({
  ...await importOriginal<typeof import('../studyTokens')>(),
  studyTokens: (text: string) => text.split(/\s+/).filter(Boolean).map((word) => ({
    surface: word, lemma: word, content: !/^[。、？]$/.test(word), proper: false, pos: '', posDetail: '',
  })),
}));

const deck = vi.hoisted(() => ({ cards: [] as Array<Record<string, unknown>> }));
vi.mock('../flashcardDeck', async (importOriginal) => ({
  ...await importOriginal<typeof import('../flashcardDeck')>(),
  loadDeck: () => deck.cards,
  dueDeckCards: (cards: unknown[]) => cards,
}));

/** 箸が / 箸 as kuromoji would give them (reading, part of speech). */
const lines = vi.hoisted(() => new Map<string, Array<{ surface: string; reading?: string; pos?: string; lemma?: string }>>());
vi.mock('../components/speak/speakText', async (importOriginal) => ({
  ...await importOriginal<typeof import('../components/speak/speakText')>(),
  shadowTokensFor: async (text: string) => lines.get(text) ?? [...text].map((surface) => ({ surface })),
}));

import ShadowingFeedback from '../components/speak/ShadowingFeedback';
import WritingCorrection from '../components/speak/WritingCorrection';
import ConversationPartner from '../components/speak/ConversationPartner';
import { resetPitchCache } from '../pitchLookupCache';
import { conversationStorageKey } from '../conversationStore';
import { writingHistoryKey } from '../writingHistoryStore';
import { studyDayKey, shiftStudyDayKey } from '../../shared/studyDay';

const api = {
  aiSpeakShadowing: vi.fn(),
  aiSpeakConversation: vi.fn(),
  aiSpeakCorrect: vi.fn(),
  aiSpeakJournal: vi.fn(),
  aiStudyCancel: vi.fn(async () => true),
  dictPitch: vi.fn(),
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'fetch', {
    value: vi.fn(async () => ({ blob: async () => new Blob(['x']) })),
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(api)) fn.mockReset();
  api.aiStudyCancel.mockResolvedValue(true);
  for (const fn of Object.values(speech)) fn.mockReset();
  mining.mineToStudy.mockClear();
  levels.clear();
  lines.clear();
  deck.cards = [];
  resetPitchCache();
  readiness.loaded = true;
  readiness.enabled = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function render(node: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

function button(name: RegExp): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => name.test(b.textContent ?? '') || name.test(b.getAttribute('aria-label') ?? ''));
  if (!found) throw new Error(`no button ${name}: ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return found as HTMLButtonElement;
}

const hasButton = (name: RegExp): boolean => [...host.querySelectorAll('button')].some((b) => name.test(b.textContent ?? ''));

async function click(name: RegExp): Promise<void> {
  await act(async () => {
    button(name).click();
  });
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function settle(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) await flush();
}

function typeInto(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---- fixture audio ----------------------------------------------------------------------

const RATE = 16_000;
/** Harmonic "vowels" at the given pitches, 160 ms each, with silence around them. */
function take(pitches: number[]): Float32Array {
  const out: number[] = new Array(Math.round(0.3 * RATE)).fill(0);
  let phase = 0;
  for (const hz of pitches) {
    const n = Math.round(0.16 * RATE);
    const ramp = Math.round(0.01 * RATE);
    for (let i = 0; i < n; i += 1) {
      phase += (2 * Math.PI * hz) / RATE;
      let value = 0;
      for (let k = 1; k <= 5; k += 1) value += Math.sin(phase * k) / k;
      out.push(0.25 * value * Math.min(1, i / ramp, (n - i) / ramp));
    }
  }
  for (let i = 0; i < 0.3 * RATE; i += 1) out.push(0);
  return Float32Array.from(out);
}

// ---- shadowing ----------------------------------------------------------------------------

describe('shadowing: pitch and rhythm from the take', () => {
  const props = { audioUrl: 'blob:take', expected: '箸が', cueSec: 0.8, studyLang: 'ja' as const, onReplayOriginal: vi.fn() };
  const tokens = [
    { surface: '箸', reading: 'ハシ', pos: '名詞', lemma: '箸' },
    { surface: 'が', reading: 'ガ', pos: '助詞', lemma: 'が' },
  ];

  beforeEach(() => {
    lines.set('箸が', tokens);
    speech.whisperReadiness.mockResolvedValue({ ready: true, tier: 'kotoba-whisper', sizeBytes: 1 });
  });

  it('H-L-L heard for 箸 (atamadaka) matches the dictionary; rhythm is reported', async () => {
    api.dictPitch.mockResolvedValue({ available: true, entries: [{ reading: 'はし', positions: [1] }] });
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: '箸が', durationSec: 1.1, spokenSec: 0.5, pcm: take([220, 165, 165]), sampleRate: RATE });
    await render(<ShadowingFeedback {...props} />);
    await settle();
    expect(api.dictPitch).toHaveBeenCalledWith('箸', 'はし');
    const word = host.querySelector('[data-accent-verdict]');
    expect(word?.getAttribute('data-accent-verdict')).toBe('match');
    expect(host.textContent).toContain('Pitch accent as in the dictionary: 1 of 1.');
    expect(host.textContent).toContain('As in the dictionary: drop after the first mora (atamadaka).');
    expect(host.textContent).toMatch(/Speed while speaking: [\d.]+ morae a second\. The line: [\d.]+\./);
    expect(host.querySelector('.speak-pitch-svg polyline')).not.toBeNull();
  });

  it('the same take for 橋 (odaka) is a mismatch, and "Explain with AI" is told so in text', async () => {
    api.dictPitch.mockResolvedValue({ available: true, entries: [{ reading: 'はし', positions: [2] }] });
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: '箸が', durationSec: 1.1, spokenSec: 0.5, pcm: take([220, 165, 165]), sampleRate: RATE });
    api.aiSpeakShadowing.mockResolvedValue({ ok: true, result: { summary: 'Pitch.', issues: [] } });
    await render(<ShadowingFeedback {...props} />);
    await settle();
    expect(host.querySelector('[data-accent-verdict]')?.getAttribute('data-accent-verdict')).toBe('mismatch');
    expect(host.textContent).toContain('Dictionary: drop on the particle after it (odaka). You: drop after the first mora (atamadaka).');
    await click(/Explain with AI/);
    await flush();
    const request = api.aiSpeakShadowing.mock.calls[0][0];
    expect(request.accent).toEqual(['箸: 2 → 1']);
    expect(JSON.stringify(request)).not.toMatch(/blob:|pcm/);
  });

  it('no pitch dictionary: only the rhythm, and it says why', async () => {
    api.dictPitch.mockResolvedValue({ available: false, entries: [] });
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: '箸が', durationSec: 1.1, spokenSec: 0.5, pcm: take([220, 165, 165]), sampleRate: RATE });
    await render(<ShadowingFeedback {...props} />);
    await settle();
    expect(host.querySelector('[data-accent-verdict]')).toBeNull();
    expect(host.textContent).toContain('No pitch-accent dictionary is installed');
    expect(host.textContent).toContain('Speed while speaking');
  });

  it('a take far from the line, or without audio, is not measured — and says so', async () => {
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: 'ねこ', durationSec: 1, spokenSec: 0.4, pcm: take([200, 200]), sampleRate: RATE });
    await render(<ShadowingFeedback {...props} />);
    await settle();
    expect(host.querySelector('[data-shadow-prosody="skipped"]')).not.toBeNull();
    expect(host.textContent).toContain('once your take is close to the line');
    expect(api.dictPitch).not.toHaveBeenCalled();
    act(() => root?.unmount());
    root = null;

    speech.transcribeRecording.mockResolvedValue({ ok: true, text: '箸が', durationSec: 1, spokenSec: 0.4 });
    await render(<ShadowingFeedback {...props} />);
    await settle();
    expect(host.textContent).toContain('could not be read for pitch and rhythm');
  });
});

// ---- conversation -----------------------------------------------------------------------

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  ok: true, engine: 'local', result: { reply: text, translation: 'T', correction: null, knownSampleSent: false, ...extra },
});

async function say(text: string): Promise<void> {
  const box = host.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    typeInto(box, text);
  });
  await click(/^Send$/);
  await flush();
}

describe('conversation partner: Retry (bug 44)', () => {
  it('a failed reply leaves the message with a Retry that answers it without sending it twice', async () => {
    api.aiSpeakConversation
      .mockResolvedValueOnce(reply('いらっしゃいませ'))
      .mockResolvedValueOnce({ ok: false, code: 'timeout' })
      .mockResolvedValueOnce(reply('はい どうぞ'));
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    await say('水 を ください');
    expect(host.textContent).toContain('Your last message has no reply yet.');
    await click(/Retry the reply/);
    await flush();
    const retried = api.aiSpeakConversation.mock.calls[2][0];
    expect(retried).toMatchObject({ message: '水 を ください', history: [{ role: 'partner', text: 'いらっしゃいませ' }] });
    expect(retried.refresh).toBeUndefined();
    expect(host.querySelectorAll('.speak-turn.is-user')).toHaveLength(1);
    expect(host.querySelectorAll('.speak-turn.is-partner')).toHaveLength(2);
    expect(hasButton(/Retry the reply/)).toBe(false);
  });

  it('a cancelled reply can be retried too', async () => {
    api.aiSpeakConversation.mockResolvedValueOnce(reply('いらっしゃいませ')).mockReturnValueOnce(new Promise(() => undefined));
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    await say('こんにちは');
    expect(hasButton(/Retry the reply/)).toBe(false);
    await click(/^Cancel$/);
    expect(hasButton(/Retry the reply/)).toBe(true);
  });

  it('a message left unanswered when the window closed is offered a Retry on reopening', async () => {
    localStorage.setItem(conversationStorageKey('ja'), JSON.stringify({
      version: 1, scenario: 'free', formality: 'polite', level: 'N4',
      turns: [{ role: 'partner', text: 'やあ', at: 1 }, { role: 'user', text: 'げんき', at: 2 }],
    }));
    api.aiSpeakConversation.mockResolvedValue(reply('よかった'));
    await render(<ConversationPartner />);
    expect(host.textContent).toContain('Your last message has no reply yet.');
    await click(/Retry the reply/);
    await flush();
    expect(api.aiSpeakConversation.mock.calls[0][0]).toMatchObject({ message: 'げんき', history: [{ role: 'partner', text: 'やあ' }] });
    expect(host.textContent).toContain('よかった');
  });
});

describe('conversation partner: fresh openings and memory across sessions', () => {
  it('Start asks afresh; after Clear the next conversation brings back earlier unknown words, and says when a reply used one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
    levels.set('いらっしゃいませ', 3);
    api.aiSpeakConversation
      .mockResolvedValueOnce(reply('いらっしゃいませ 改札 は あちら'))
      .mockResolvedValueOnce(reply('改札 で 待ち ます か'));
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await settle();
    expect(api.aiSpeakConversation.mock.calls[0][0]).toMatchObject({ message: '', refresh: true, recallWords: [] });

    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    await click(/Clear conversation/);
    await click(/Press again to clear/);
    await click(/Start the conversation/);
    await settle();
    const second = api.aiSpeakConversation.mock.calls[1][0];
    expect(second.refresh).toBe(true);
    expect(second.recallWords).toEqual(expect.arrayContaining(['改札', 'あちら']));
    expect(second.recallWords).not.toContain('いらっしゃいませ');
    expect(host.querySelector('[data-conversation-recall]')?.textContent).toContain('改札');
    expect(host.querySelector('[data-recall-used]')?.textContent).toContain('改札');
  });

  it('a correction is saved as a card with its reason and the learner\'s own text', async () => {
    api.aiSpeakConversation
      .mockResolvedValueOnce(reply('いらっしゃいませ'))
      .mockResolvedValueOnce(reply('はい', { correction: { corrected: '水をください', explanation: 'ください takes を.' } }));
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    await say('水がください');
    await click(/Mine the corrected sentence/);
    await flush();
    expect(mining.mineToStudy).toHaveBeenCalledWith(expect.objectContaining({
      word: '水をください',
      sentence: '水をください',
      meaning: 'ください takes を. (You wrote: 水がください)',
      studyKind: 'sentence',
    }));
  });

  it('"Send what I say" sends a transcript straight away (the voice loop)', async () => {
    localStorage.setItem('jp-study.conversation.prefs.v1', JSON.stringify({ voiceSend: true }));
    api.aiSpeakConversation.mockResolvedValueOnce(reply('いらっしゃいませ')).mockResolvedValueOnce(reply('はい'));
    speech.whisperReadiness.mockResolvedValue({ ready: true, tier: 'kotoba-whisper', sizeBytes: 1 });
    speech.startMicRecording.mockResolvedValue({ stop: async () => new Blob(['fixture']), cancel: vi.fn() });
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: '水 を ください', durationSec: 1, spokenSec: 0.8 });
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    await click(/Speak instead/);
    await flush();
    await click(/Stop and transcribe/);
    await settle();
    expect(api.aiSpeakConversation).toHaveBeenCalledTimes(2);
    expect(api.aiSpeakConversation.mock.calls[1][0]).toMatchObject({ message: '水 を ください' });
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('without "Send what I say" the transcript waits in the box', async () => {
    api.aiSpeakConversation.mockResolvedValueOnce(reply('いらっしゃいませ'));
    speech.whisperReadiness.mockResolvedValue({ ready: true, tier: 'kotoba-whisper', sizeBytes: 1 });
    speech.startMicRecording.mockResolvedValue({ stop: async () => new Blob(['fixture']), cancel: vi.fn() });
    speech.transcribeRecording.mockResolvedValue({ ok: true, text: 'こんにちは', durationSec: 1, spokenSec: 0.8 });
    await render(<ConversationPartner />);
    await click(/Start the conversation/);
    await flush();
    await click(/Speak instead/);
    await flush();
    await click(/Stop and transcribe/);
    await settle();
    expect(api.aiSpeakConversation).toHaveBeenCalledTimes(1);
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('こんにちは');
  });
});

// ---- writing --------------------------------------------------------------------------------

describe('writing help: history, cards, journal streak', () => {
  const note = '昨日は雨でした。私はは家にいました。';

  it('a correction is kept in the history with its kinds, and an edit can be saved as a card', async () => {
    api.aiSpeakCorrect.mockResolvedValue({ ok: true, result: {
      text: note, overall: 'One slip.',
      edits: [{ id: 'e1', start: 8, original: '私はは', corrected: '私は', explanation: 'Doubled は.', kind: 'particle' }],
    } });
    await render(<WritingCorrection text={note} studyLang="ja" onApply={vi.fn()} />);
    await click(/Writing help/);
    await click(/Correct my Japanese/);
    await flush();
    await click(/Save as a card/);
    await flush();
    expect(mining.mineToStudy).toHaveBeenCalledWith(expect.objectContaining({
      word: '私は家にいました。',
      meaning: 'Doubled は. (You wrote: 私はは家にいました。)',
      studyKind: 'sentence',
      studyLang: 'ja',
    }));
    await click(/^History$/);
    expect(host.querySelector('[data-writing-history]')?.getAttribute('data-writing-history')).toBe('1');
    expect(host.textContent).toContain('1 change');
    expect(host.textContent).toMatch(/Your most frequent corrections: .+ ×1\./);
    expect(JSON.parse(localStorage.getItem(writingHistoryKey('ja')) ?? '{}').entries).toHaveLength(1);
  });

  it('a complete journal entry marks the day and extends yesterday\'s streak', async () => {
    deck.cards = [
      { id: '1', word: '公園', reading: 'こうえん', meaning: 'park', studyLang: 'ja', addedAt: 1 },
      { id: '2', word: '静か', reading: 'しずか', meaning: 'quiet', studyLang: 'ja', addedAt: 2 },
    ];
    const today = studyDayKey(Date.now());
    localStorage.setItem(writingHistoryKey('ja'), JSON.stringify({ version: 1, entries: [], journalDays: [shiftStudyDayKey(today, -1)] }));
    const draft = '公園に行きました。';
    await render(<WritingCorrection text={draft} studyLang="ja" onApply={vi.fn()} />);
    await click(/Writing help/);
    await click(/Journal/);
    expect(host.querySelector('[data-journal-streak]')?.textContent)
      .toBe('Journal streak: 1 day (best: 1). Complete today\'s entry to keep it.');
    const done = '公園に行きました。静かでした。楽しかったです。';
    await act(async () => {
      root?.render(<WritingCorrection text={done} studyLang="ja" onApply={vi.fn()} />);
    });
    await flush();
    expect(JSON.parse(localStorage.getItem(writingHistoryKey('ja')) ?? '{}').journalDays).toEqual([shiftStudyDayKey(today, -1), today]);
    expect(host.querySelector('[data-journal-streak]')?.textContent).toBe('Journal streak: 2 days (best: 2). Today\'s entry is done.');
  });
});
