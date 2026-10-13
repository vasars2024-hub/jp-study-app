// @vitest-environment node
/**
 * Speaking and writing, round 2 — the pure halves: the conversation partner's
 * Retry target and memory across sessions, the recall words in the request and
 * the prompt, a writing edit as a card's sentence, the writing history with its
 * mistake kinds, the journal streak (4 am study days), and the measured pitch and
 * pauses in the shadowing request.
 */
import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_MEMORY_CAP,
  CONVERSATION_RECALL_MAX,
  buildConversationPrompt,
  conversationKeyParts,
  emptyConversationMemory,
  finalizeConversationReply,
  normalizeConversationMemory,
  normalizeConversationRequest,
  normalizeStoredConversation,
  recallConversationWords,
  recalledWordsUsed,
  rememberConversationWords,
  unansweredTurn,
  type StoredConversationTurn,
} from '../aiConversation';
import { buildShadowingFeedbackPrompt, normalizeShadowingFeedbackRequest, shadowingFeedbackKeyParts } from '../aiShadowing';
import { editSentence, type WritingCorrectionResult } from '../aiWritingCorrection';
import {
  WRITING_HISTORY_CAP,
  emptyWritingHistory,
  journalStreak,
  mistakeKindCounts,
  normalizeWritingHistory,
  recordJournalDay,
  recordWritingCorrection,
} from '../writingHistory';

const base = {
  studyLang: 'ja', answerLang: 'en', scenario: 'free', formality: 'polite', level: 'N4',
  knownWords: [], history: [], message: '', correct: false, shareStudyData: 'unset',
};

describe('conversation: the turn a Retry answers', () => {
  const user = (text: string, at: number): StoredConversationTurn => ({ role: 'user', text, at });
  const partner = (text: string, at: number): StoredConversationTurn => ({ role: 'partner', text, at });

  it('the learner\'s last message when nothing answered it, with everything before it as history', () => {
    const turns = [partner('こんにちは', 1), user('水をください', 2)];
    expect(unansweredTurn(turns)).toEqual({ turn: turns[1], history: [turns[0]] });
  });

  it('nothing when the partner spoke last or the conversation is empty', () => {
    expect(unansweredTurn([partner('a', 1), user('b', 2), partner('c', 3)])).toBeNull();
    expect(unansweredTurn([])).toBeNull();
  });
});

describe('conversation: recall words in the request', () => {
  it('are normalized, capped, part of the cache key and named in the prompt', () => {
    const many = Array.from({ length: 20 }, (_, i) => `語${i}`);
    const request = normalizeConversationRequest({ ...base, recallWords: many });
    expect(request?.recallWords).toHaveLength(CONVERSATION_RECALL_MAX);
    const without = normalizeConversationRequest(base);
    expect(without?.recallWords).toEqual([]);
    expect(conversationKeyParts(request!)).not.toEqual(conversationKeyParts(without!));
    expect(buildConversationPrompt(request!)).toContain('earlier conversations');
    expect(buildConversationPrompt(request!)).toContain('語0, 語1');
    expect(buildConversationPrompt(without!)).not.toContain('earlier conversations');
  });

  it('the reply says whether they were sent', () => {
    const request = normalizeConversationRequest({ ...base, recallWords: ['改札'] })!;
    expect(finalizeConversationReply({ reply: 'いらっしゃいませ。', translation: 'Welcome.' }, request)?.recallSent).toBe(true);
    const none = normalizeConversationRequest(base)!;
    expect(finalizeConversationReply({ reply: 'いらっしゃいませ。', translation: 'Welcome.' }, none)?.recallSent).toBe(false);
  });

  it('a stored conversation keeps its recall list; a bad one is dropped', () => {
    const stored = normalizeStoredConversation({ turns: [], recall: ['改札', 3, '乗り換え'] }, 'ja');
    expect(stored.recall).toEqual(['改札', '乗り換え']);
    expect(normalizeStoredConversation({ turns: [], recall: 'x' }, 'ja').recall).toBeUndefined();
  });
});

describe('conversation: memory across sessions', () => {
  it('remembers words, counts them again, and recalls the still-unknown ones from EARLIER sessions, newest first', () => {
    let memory = emptyConversationMemory();
    memory = rememberConversationWords(memory, ['改札', '切符'], 100);
    memory = rememberConversationWords(memory, ['乗り換え', '改札'], 200);
    memory = rememberConversationWords(memory, ['今日の語'], 1_000);
    expect(memory.words.find((w) => w.word === '改札')).toMatchObject({ seen: 2, at: 200 });
    const levels: Record<string, number> = { 切符: 3 };
    // Started at 500: the word met at 1000 belongs to this session, 切符 is known now.
    expect(recallConversationWords(memory, (w) => levels[w] ?? 0, 500)).toEqual(['改札', '乗り換え']);
    expect(recallConversationWords(memory, () => 0, 500, 1)).toEqual(['改札']);
  });

  it('is capped (least recently met dropped) and survives a round trip; junk is dropped', () => {
    let memory = emptyConversationMemory();
    for (let i = 0; i < CONVERSATION_MEMORY_CAP + 10; i += 1) memory = rememberConversationWords(memory, [`w${i}`], i);
    expect(memory.words).toHaveLength(CONVERSATION_MEMORY_CAP);
    expect(memory.words.some((w) => w.word === 'w0')).toBe(false);
    const back = normalizeConversationMemory(JSON.parse(JSON.stringify({ ...memory, through: 42 })));
    expect(back.words).toHaveLength(CONVERSATION_MEMORY_CAP);
    expect(back.through).toBe(42);
    expect(normalizeConversationMemory({ words: [{ word: '' }, null, { word: 'a', at: 'x' }, { word: 'a' }] }).words)
      .toEqual([{ word: 'a', at: 0, seen: 1 }]);
    expect(normalizeConversationMemory('nope')).toEqual(emptyConversationMemory());
  });

  it('a reply\'s use of a recalled word is found by dictionary form or as written', () => {
    const tokens = [{ lemma: '乗り換える', content: true }, { lemma: '', content: false }];
    expect(recalledWordsUsed(tokens, '次で乗り換えます', ['乗り換える', '改札'])).toEqual(['乗り換える']);
    expect(recalledWordsUsed([], '改札はあちらです', ['改札'])).toEqual(['改札']);
    expect(recalledWordsUsed(tokens, 'x', [])).toEqual([]);
  });
});

describe('writing: an edit as a card', () => {
  it('the sentence the edit sits in, before and after', () => {
    const text = '昨日は雨でした。私はは家にいました。夜は寝ました。';
    const start = text.indexOf('私はは');
    expect(editSentence(text, { start, original: '私はは', corrected: '私は' })).toEqual({
      before: '私はは家にいました。',
      after: '私は家にいました。',
    });
  });

  it('works at the edges and with Latin full stops and line breaks', () => {
    expect(editSentence('ふるでした', { start: 0, original: 'ふるでした', corrected: '降りました' })).toEqual({ before: 'ふるでした', after: '降りました' });
    const ru = 'Я иду в школа. Потом домой.';
    expect(editSentence(ru, { start: ru.indexOf('школа'), original: 'школа', corrected: 'школу' }).after).toBe('Я иду в школу.');
    const lines = '一行目\n二行目にエラ\n三行目';
    expect(editSentence(lines, { start: lines.indexOf('エラ'), original: 'エラ', corrected: 'エラー' })).toEqual({ before: '二行目にエラ', after: '二行目にエラー' });
  });
});

describe('writing history', () => {
  const result = (text: string, kinds: Array<'particle' | 'conjugation' | 'word'>): WritingCorrectionResult => ({
    text,
    overall: 'ok',
    edits: kinds.map((kind, i) => ({ id: `e${i}`, start: 0, original: text.slice(0, 1), corrected: 'x', explanation: 'why', kind })),
  });

  it('newest first; a re-check of the same text replaces it; capped', () => {
    let history = emptyWritingHistory();
    history = recordWritingCorrection(history, result('一つ目', ['particle']), 1);
    history = recordWritingCorrection(history, result('二つ目', ['conjugation']), 2);
    history = recordWritingCorrection(history, result('一つ目', ['particle', 'particle']), 3);
    expect(history.entries.map((e) => [e.text, e.edits.length])).toEqual([['一つ目', 2], ['二つ目', 1]]);
    for (let i = 0; i < WRITING_HISTORY_CAP + 5; i += 1) history = recordWritingCorrection(history, result(`t${i}`, []), 10 + i);
    expect(history.entries).toHaveLength(WRITING_HISTORY_CAP);
  });

  it('the kinds of mistake, most frequent first', () => {
    let history = emptyWritingHistory();
    history = recordWritingCorrection(history, result('a', ['particle', 'conjugation']), 1);
    history = recordWritingCorrection(history, result('b', ['particle', 'word', 'particle']), 2);
    expect(mistakeKindCounts(history)).toEqual([
      { kind: 'particle', count: 3 },
      { kind: 'word', count: 1 },
      { kind: 'conjugation', count: 1 },
    ]);
  });

  it('a stored history is re-read safely', () => {
    const back = normalizeWritingHistory({
      entries: [{ at: 5, text: 'x', edits: [{ original: 'a', corrected: 'b', kind: 'bogus' }, { original: '' }], overall: 1 }, { text: '' }],
      journalDays: ['2026-10-01', 'nope', '2026-10-01', '2026-09-30'],
    });
    expect(back.entries).toEqual([{ at: 5, text: 'x', edits: [{ original: 'a', corrected: 'b', explanation: '', kind: 'other' }], overall: '' }]);
    expect(back.journalDays).toEqual(['2026-09-30', '2026-10-01']);
  });
});

describe('journal streak', () => {
  it('counts consecutive days to today, or to yesterday while today is still open', () => {
    let history = emptyWritingHistory();
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']) history = recordJournalDay(history, day);
    expect(journalStreak(history.journalDays, '2026-10-06')).toEqual({ current: 2, best: 3, today: true, total: 5 });
    expect(journalStreak(history.journalDays, '2026-10-07')).toMatchObject({ current: 2, today: false });
    expect(journalStreak(history.journalDays, '2026-10-08')).toMatchObject({ current: 0, best: 3 });
  });

  it('recording a day is idempotent and ignores junk; month and year ends are consecutive', () => {
    let history = recordJournalDay(emptyWritingHistory(), '2026-12-31');
    expect(recordJournalDay(history, '2026-12-31')).toBe(history);
    expect(recordJournalDay(history, 'today')).toBe(history);
    history = recordJournalDay(history, '2027-01-01');
    expect(journalStreak(history.journalDays, '2027-01-01').current).toBe(2);
    expect(journalStreak([], '2027-01-01')).toEqual({ current: 0, best: 0, today: false, total: 0 });
  });
});

describe('shadowing request: measured pitch and pauses', () => {
  const shadow = { lang: 'ja', expected: '箸が好き', heard: '箸が好き', score: 100, missed: [], extra: [], hints: [], pace: 'ok', answerLang: 'en' };

  it('are kept (Japanese accent only), clipped, in the cache key and the prompt', () => {
    const request = normalizeShadowingFeedbackRequest({ ...shadow, accent: ['箸: 1 → 2'], pauses: ['inside 図書館 0.4s'] })!;
    expect(request.accent).toEqual(['箸: 1 → 2']);
    expect(request.pauses).toEqual(['inside 図書館 0.4s']);
    const plain = normalizeShadowingFeedbackRequest(shadow)!;
    expect(plain.accent).toBeUndefined();
    expect(shadowingFeedbackKeyParts(request)).not.toEqual(shadowingFeedbackKeyParts(plain));
    expect(buildShadowingFeedbackPrompt(request)).toContain('did not match the dictionary');
    expect(buildShadowingFeedbackPrompt(plain)).not.toContain('did not match the dictionary');
    const zh = normalizeShadowingFeedbackRequest({ ...shadow, lang: 'zh', expected: '你好', accent: ['x'] })!;
    expect(zh.accent).toBeUndefined();
  });
});
