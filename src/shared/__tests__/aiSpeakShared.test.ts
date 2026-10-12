// @vitest-environment node
/**
 * The pure halves of the speaking and writing helpers (docs/AI_AUDIT.md N18-N20):
 * request normalizers, the content checks that decide what of a model reply is
 * usable, the approval-gated edit application, the journal's deterministic
 * grade, the quick checks, the stored conversation and the scripted drills.
 */
import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_HISTORY_CAP,
  buildConversationPrompt,
  finalizeConversationReply,
  nextDrillLine,
  normalizeConversationRequest,
  normalizeStoredConversation,
  unknownWordRate,
} from '../aiConversation';
import {
  buildShadowingFeedbackPrompt,
  finalizeShadowingFeedback,
  isShadowingFeedbackResult,
  normalizeShadowingFeedbackRequest,
} from '../aiShadowing';
import {
  applyWritingEdits,
  checkJournalEntry,
  countJournalSentences,
  finalizeJournalGrade,
  finalizeWritingCorrection,
  isWritingCorrectionResult,
  lintStudyWriting,
  normalizeJournalGradeRequest,
  normalizeWritingCorrectionRequest,
  spliceText,
} from '../aiWritingCorrection';
import { diffStudyText } from '../studyTextDiff';

describe('diffStudyText', () => {
  it('shows a particle change as one removal and one addition, removal first', () => {
    expect(diffStudyText('私は学生です', '私が学生です')).toEqual([
      { kind: 'same', text: '私' },
      { kind: 'removed', text: 'は' },
      { kind: 'added', text: 'が' },
      { kind: 'same', text: '学生です' },
    ]);
  });

  it('identical and empty texts', () => {
    expect(diffStudyText('同じ', '同じ')).toEqual([{ kind: 'same', text: '同じ' }]);
    expect(diffStudyText('', '')).toEqual([]);
    expect(diffStudyText('', '新')).toEqual([{ kind: 'added', text: '新' }]);
  });
});

describe('shadowing feedback request and reply', () => {
  it('normalizes: only ja/zh, a line required, unknown hints dropped, score clamped', () => {
    expect(normalizeShadowingFeedbackRequest({ lang: 'ru', expected: 'x' })).toBeNull();
    expect(normalizeShadowingFeedbackRequest({ lang: 'ja', expected: '' })).toBeNull();
    const request = normalizeShadowingFeedbackRequest({
      lang: 'ja', expected: 'ありがとうございます', heard: 'ありがとございます', score: 140,
      hints: ['long-vowel', 'nonsense', 'long-vowel'], pace: 'slow', answerLang: 'ja',
    });
    expect(request).toMatchObject({ score: 100, hints: ['long-vowel'], pace: 'slow', answerLang: 'ja' });
    expect(buildShadowingFeedbackPrompt(request!)).toContain('long vowels');
    const zh = normalizeShadowingFeedbackRequest({ lang: 'zh', expected: '我买', heard: '我卖' });
    expect(buildShadowingFeedbackPrompt(zh!)).toContain('tones');
  });

  it('finalize: plain text, unknown focus becomes other, at most 3 issues; no summary is no answer', () => {
    const result = finalizeShadowingFeedback({
      summary: '<b>Mostly</b> good.',
      issues: [
        { focus: 'long-vowel', explanation: 'う was short.', tip: 'Clap twice.' },
        { focus: 'bogus', explanation: 'Something else.', tip: '' },
        { focus: 'pitch', explanation: '', tip: 'x' },
        { focus: 'rhythm', explanation: 'a', tip: '' },
        { focus: 'tone', explanation: 'b', tip: '' },
      ],
    });
    expect(result?.summary).toBe('Mostly good.');
    expect(result?.issues.map((issue) => issue.focus)).toEqual(['long-vowel', 'other', 'rhythm']);
    expect(isShadowingFeedbackResult(result)).toBe(true);
    expect(finalizeShadowingFeedback({ summary: '  ', issues: [] })).toBeNull();
  });
});

describe('conversation partner', () => {
  const base = {
    studyLang: 'ja', answerLang: 'en', scenario: 'restaurant', formality: 'polite', level: 'N4',
    knownWords: ['水', '食べる'], history: [], message: '', correct: true, shareStudyData: 'unset',
  };

  it('an empty message only opens a conversation that has not started', () => {
    expect(normalizeConversationRequest(base)).toMatchObject({ message: '', correct: false });
    expect(normalizeConversationRequest({ ...base, history: [{ role: 'partner', text: 'いらっしゃいませ。' }] })).toBeNull();
  });

  it('normalizes scene, level per language and caps the context', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'partner' : 'user', text: `文${i}` }));
    const request = normalizeConversationRequest({ ...base, scenario: 'mars', level: 'HSK9', studyLang: 'zh', history, message: '你好' });
    expect(request).toMatchObject({ scenario: 'free', level: 'HSK2', studyLang: 'zh' });
    expect(request?.history).toHaveLength(12);
    expect(buildConversationPrompt(request!)).toContain('Mandarin Chinese');
  });

  it('the prompt names the level and the known words only when there are some', () => {
    const request = normalizeConversationRequest({ ...base, message: '水をください' })!;
    expect(buildConversationPrompt(request)).toContain('level N4');
    expect(buildConversationPrompt(request)).toContain('水, 食べる');
    expect(buildConversationPrompt({ ...request, knownWords: [] })).not.toContain('already knows');
  });

  it('finalize: a reply outside the study language is no reply', () => {
    const request = normalizeConversationRequest({ ...base, message: '水をください' })!;
    expect(finalizeConversationReply({ reply: 'Here you go.', translation: '', correction: null }, request)).toBeNull();
  });

  it('finalize: keeps a real correction, drops one that changes nothing or was not asked for', () => {
    const request = normalizeConversationRequest({ ...base, message: '水がください' })!;
    const ok = finalizeConversationReply({
      reply: 'はい、どうぞ。', translation: 'Here you go.',
      correction: { corrected: '水をください。', explanation: 'ください takes を.' },
    }, request);
    expect(ok).toMatchObject({ reply: 'はい、どうぞ。', correction: { corrected: '水をください。' }, knownSampleSent: true });
    const same = finalizeConversationReply({ reply: 'はい。', correction: { corrected: '水がください', explanation: 'x' } }, request);
    expect(same?.correction).toBeNull();
    const notAsked = finalizeConversationReply(
      { reply: 'はい。', correction: { corrected: '水をください。', explanation: 'x' } },
      { ...request, correct: false },
    );
    expect(notAsked?.correction).toBeNull();
    expect(finalizeConversationReply({ reply: 'はい。' }, { ...request, knownWords: [] })?.knownSampleSent).toBe(false);
  });

  it('the stored conversation is capped and cleaned', () => {
    const turns = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'partner' : 'user', text: `t${i}`, at: i }));
    const stored = normalizeStoredConversation({ scenario: 'shopping', formality: 'casual', level: 'N2', turns: [...turns, { role: 'x', text: 'bad' }] }, 'ja');
    expect(stored.turns).toHaveLength(CONVERSATION_HISTORY_CAP);
    expect(stored.turns[stored.turns.length - 1].text).toBe('t59');
    expect(stored).toMatchObject({ scenario: 'shopping', formality: 'casual', level: 'N2' });
    expect(normalizeStoredConversation('garbage', 'zh')).toMatchObject({ scenario: 'free', level: 'HSK2', turns: [] });
  });

  it('scripted drills: the next unused line, then null', () => {
    expect(nextDrillLine('restaurant', 'ja', [])).toBe('いらっしゃいませ。何名様ですか？');
    const asked = [{ role: 'partner', scripted: true }, { role: 'user' }, { role: 'partner', scripted: true }, { role: 'partner', scripted: true }];
    expect(nextDrillLine('restaurant', 'ja', asked)).toBeNull();
    expect(nextDrillLine('free', 'zh', [{ role: 'partner', scripted: false }])).toBe('你好！你今天做了什么？');
  });

  it('unknown-word rate: content words only, Familiar counts as known, the i+1 target', () => {
    const levels: Record<string, number> = { 水: 3, 飲む: 2, 珈琲: 0 };
    const tokens = [
      { lemma: '水', content: true }, { lemma: 'を', content: false }, { lemma: '飲む', content: true },
      { lemma: '珈琲', content: true }, { lemma: '田中', content: true, proper: true },
    ];
    const rate = unknownWordRate(tokens, (lemma) => levels[lemma] ?? 0);
    expect(rate).toMatchObject({ unknown: 1, total: 3, unknownWords: ['珈琲'], onTarget: false });
    expect(unknownWordRate([{ lemma: '水', content: true }], (lemma) => levels[lemma] ?? 0).onTarget).toBe(true);
  });
});

describe('writing correction', () => {
  const request = normalizeWritingCorrectionRequest({ text: '  私は学校に行きます。昨日は雨がふるでした。  ', studyLang: 'ja', answerLang: 'en' })!;

  it('trims, but keeps the text the edits are checked against', () => {
    expect(request.text).toBe('私は学校に行きます。昨日は雨がふるでした。');
    expect(normalizeWritingCorrectionRequest({ text: '   ' })).toBeNull();
  });

  it('places edits by their quote; drops quotes not in the text, no-ops and overlaps', () => {
    const result = finalizeWritingCorrection({
      edits: [
        { original: 'ふるでした', corrected: '降りました', explanation: 'Past of 降る.', kind: 'conjugation' },
        { original: '雪', corrected: '雨', explanation: 'Not in the text.', kind: 'word' },
        { original: '学校', corrected: '学校', explanation: 'No change.', kind: 'word' },
        { original: 'るでし', corrected: 'x', explanation: 'Overlaps.', kind: 'other' },
        { original: '私は', corrected: '私が', explanation: 'Topic vs subject.', kind: 'weird' },
      ],
      overall: 'Good start.',
    }, request)!;
    expect(result.edits.map((edit) => [edit.original, edit.kind])).toEqual([['私は', 'other'], ['ふるでした', 'conjugation']]);
    expect(isWritingCorrectionResult(result, request)).toBe(true);
    expect(finalizeWritingCorrection({ edits: [], overall: '' }, request)).toBeNull();
    expect(finalizeWritingCorrection({ edits: [], overall: 'Looks right.' }, request)).toMatchObject({ edits: [] });
  });

  it('applies only approved edits, and refuses a text that changed since', () => {
    const result = finalizeWritingCorrection({
      edits: [
        { original: '私は', corrected: '私が', explanation: 'a', kind: 'particle' },
        { original: 'ふるでした', corrected: '降りました', explanation: 'b', kind: 'conjugation' },
      ],
      overall: '',
    }, request)!;
    const second = result.edits[1].id;
    expect(applyWritingEdits(result.text, result, new Set([second]))).toEqual({
      ok: true, text: '私は学校に行きます。昨日は雨が降りました。', applied: 1,
    });
    expect(applyWritingEdits(result.text, result, new Set(result.edits.map((edit) => edit.id)))).toMatchObject({
      ok: true, text: '私が学校に行きます。昨日は雨が降りました。', applied: 2,
    });
    expect(applyWritingEdits(result.text, result, new Set())).toEqual({ ok: false, reason: 'nothing-approved' });
    expect(applyWritingEdits(`${result.text}!`, result, new Set([second]))).toEqual({ ok: false, reason: 'text-changed' });
    expect(spliceText('abcdef', 2, 4, 'XY')).toBe('abXYef');
  });

  it('quick checks without a model: doubled particle, ASCII punctuation, mixed endings', () => {
    expect(lintStudyWriting('これはは本です。', 'ja').map((lint) => lint.kind)).toContain('doubled');
    expect(lintStudyWriting('今日は暑い, でも楽しい。', 'ja').map((lint) => lint.kind)).toContain('ascii-punctuation');
    expect(lintStudyWriting('私は学生です。毎日走る。', 'ja').map((lint) => lint.kind)).toContain('mixed-politeness');
    expect(lintStudyWriting('我是学生', 'zh').map((lint) => lint.kind)).toContain('no-sentence-end');
    expect(lintStudyWriting('私は学生です。', 'ja')).toEqual([]);
  });
});

describe('journal prompt', () => {
  const words = [
    { word: '食べる', reading: 'たべる', meaning: 'to eat' },
    { word: '公園', reading: 'こうえん', meaning: 'park' },
    { word: '静か', reading: 'しずか', meaning: 'quiet' },
  ];

  it('the deterministic grade: conjugated forms count, sentences are counted', () => {
    const text = '朝ご飯を食べました。公園に行きました。とても楽しかったです。';
    const check = checkJournalEntry(text, words);
    expect(check.words).toEqual([
      { word: '食べる', used: true }, { word: '公園', used: true }, { word: '静か', used: false },
    ]);
    expect(check).toMatchObject({ usedCount: 2, sentences: 3, complete: false });
    expect(countJournalSentences('One. Two!\nThree')).toBe(3);
    expect(checkJournalEntry('книгу читал', [{ word: 'книга', reading: '', meaning: '' }]).words[0].used).toBe(true);
  });

  it('the model may not claim a word was used when it is not in the text', () => {
    const request = normalizeJournalGradeRequest({ words, text: '公園は静かでした。', studyLang: 'ja', answerLang: 'en' })!;
    const result = finalizeJournalGrade({
      words: [
        { word: '食べる', used: true, correct: true, note: 'Nice.' },
        { word: '公園', used: true, correct: true, note: 'Good.' },
      ],
      feedback: 'Short but correct.',
    }, request)!;
    expect(result.words.map((entry) => [entry.word, entry.used, entry.correct])).toEqual([
      ['食べる', false, false], ['公園', true, true], ['静か', true, false],
    ]);
    expect(finalizeJournalGrade({ words: [], feedback: '' }, request)).toBeNull();
    expect(normalizeJournalGradeRequest({ words: [], text: 'x' })).toBeNull();
  });
});
