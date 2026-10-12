/**
 * The pure halves of the optional AI study helpers: request normalizing, the
 * prompts, the content checks applied to a model's reply, and — the part that
 * works with no model at all — every deterministic fallback.
 */
import { describe, expect, it } from 'vitest';
import { clipText, normalizeAiStudyRequestId, plainModelText } from '../aiStudyCommon';
import {
  acceptedAnswerSide,
  buildWhyWrongPrompt,
  finalizeWhyWrongResult,
  normalizeWhyWrongRequest,
  pickWhyWrongNeighbours,
  whyWrongFallback,
  type WhyWrongDeckCard,
} from '../aiWhyWrong';
import {
  assessExampleSentence,
  buildExampleSentencesPrompt,
  containsTargetWord,
  finalizeExampleSentencesResult,
  mergeCardExamples,
  normalizeExampleSentencesRequest,
} from '../aiExampleSentences';
import {
  buildLeechRescuePrompt,
  finalizeLeechRescueSuggestion,
  leechRescueFallback,
  leechRescuePatch,
  normalizeLeechRescueRequest,
} from '../aiLeechRescue';
import {
  buildContextExplainPrompt,
  contextExplainFallback,
  contextSenseLines,
  finalizeContextExplainResult,
  normalizeContextExplainRequest,
} from '../aiContextExplain';
import { buildWriteQuestion, gradeWrittenAnswer } from '../flashcardWrite';

const DECK: WhyWrongDeckCard[] = [
  { id: '1', word: '暑い', reading: 'あつい', meaning: 'hot (weather)' },
  { id: '2', word: '熱い', reading: 'あつい', meaning: 'hot (to the touch)' },
  { id: '3', word: '暑さ', reading: 'あつさ', meaning: 'heat' },
  { id: '4', word: '寒い', reading: 'さむい', meaning: 'cold (weather)' },
  { id: '5', word: '犬', reading: 'いぬ', meaning: 'dog' },
];

describe('common helpers', () => {
  it('only accepts safe request ids', () => {
    expect(normalizeAiStudyRequestId('ais-abc_1')).toBe('ais-abc_1');
    expect(normalizeAiStudyRequestId('a b')).toBeUndefined();
    expect(normalizeAiStudyRequestId(42)).toBeUndefined();
  });

  it('clips by code point and collapses whitespace', () => {
    expect(clipText('  a \n b ', 10)).toBe('a b');
    expect(clipText('𠮷𠮷𠮷', 2)).toBe('𠮷𠮷');
    expect(clipText(null, 5)).toBe('');
  });

  it('strips markup and control characters from model text', () => {
    expect(plainModelText('<b>bold</b> **x** <script>alert(1)</script>ok\u0007', 100)).toBe('bold x alert(1)ok');
    expect(plainModelText('a'.repeat(20), 10)).toHaveLength(10);
  });
});

describe('N1 why was I wrong', () => {
  it('normalizes: a review never carries a typed answer, unknown verdicts become wrong', () => {
    const review = normalizeWhyWrongRequest({ card: { word: '暑い', meaning: 'hot' }, direction: 'review', typed: 'x' });
    expect(review).toMatchObject({ typed: '', verdict: 'again', direction: 'review', answerLang: 'en', studyLang: 'ja' });
    const typed = normalizeWhyWrongRequest({ card: { word: '暑い', meaning: 'hot' }, direction: 'target-to-meaning', typed: 'warm', verdict: 'again' });
    expect(typed).toMatchObject({ verdict: 'wrong', expected: 'hot' });
    expect(normalizeWhyWrongRequest({ card: {} })).toBeNull();
  });

  it('prompts in the UI language about the study language, plain text only', () => {
    const request = normalizeWhyWrongRequest({
      card: { word: '暑い', reading: 'あつい', meaning: 'hot' },
      direction: 'target-to-meaning',
      typed: 'warm',
      studyLang: 'zh',
      answerLang: 'ru',
    });
    const prompt = buildWhyWrongPrompt(request!);
    expect(prompt).toContain('Mandarin Chinese');
    expect(prompt).toContain('Write every field in Russian');
    expect(prompt).toContain('no HTML');
    expect(prompt).toContain('"warm"');
  });

  it('acceptable needs a typed answer AND a reason', () => {
    const request = normalizeWhyWrongRequest({ card: { word: '暑い', meaning: 'hot' }, direction: 'target-to-meaning', typed: 'warm' })!;
    expect(finalizeWhyWrongResult({ confusion: 'synonym', explanation: 'ok', acceptable: true, acceptableReason: '' }, request)?.acceptable).toBe(false);
    expect(finalizeWhyWrongResult({ confusion: 'synonym', explanation: 'ok', acceptable: true, acceptableReason: 'same' }, request)?.acceptable).toBe(true);
    expect(finalizeWhyWrongResult({ confusion: 'nonsense', explanation: 'ok' }, request)?.confusion).toBe('other');
    expect(finalizeWhyWrongResult({ confusion: 'typo', explanation: '   ' }, request)).toBeNull();
  });

  it('picks homophones first, then shared kanji, never the card itself', () => {
    const picked = pickWhyWrongNeighbours(DECK[0], DECK).map((card) => card.word);
    expect(picked[0]).toBe('熱い');
    expect(picked).toContain('暑さ');
    expect(picked).not.toContain('暑い');
    expect(picked).not.toContain('犬');
  });

  it('fallback: the typed answer is another card\'s answer', () => {
    const notes = whyWrongFallback({ card: DECK[0], typed: 'cold', expected: 'hot (weather)', direction: 'target-to-meaning', deck: DECK });
    expect(notes[0]).toMatchObject({ kind: 'other-card', vars: { word: '寒い' } });
  });

  it('fallback: a near miss is a typo; a review lists the confusable cards', () => {
    const typo = whyWrongFallback({ card: DECK[3], typed: 'colld', expected: 'cold (weather)', direction: 'target-to-meaning', deck: DECK });
    expect(typo.map((note) => note.kind)).toContain('typo');
    const review = whyWrongFallback({ card: DECK[0], typed: '', expected: '', direction: 'review', deck: DECK });
    expect(review.map((note) => note.kind)).toEqual(expect.arrayContaining(['homophone', 'shared-kanji']));
  });

  it('fallback: a typed word sharing kanji with the answer', () => {
    const notes = whyWrongFallback({ card: DECK[0], typed: '暑さ', expected: '暑い', direction: 'meaning-to-target', deck: [DECK[0]] });
    expect(notes.map((note) => note.kind)).toContain('typed-shares-kanji');
  });

  it('fallback is never empty', () => {
    expect(whyWrongFallback({ card: DECK[4], typed: '', expected: '', direction: 'review', deck: [DECK[4]] }))
      .toEqual([{ kind: 'no-clue', vars: { word: '犬' } }]);
  });

  it('accepted answers go to the side the question asked for', () => {
    expect(acceptedAnswerSide('target-to-meaning')).toBe('meaning');
    expect(acceptedAnswerSide('meaning-to-target')).toBe('target');
    expect(acceptedAnswerSide('review')).toBeNull();
  });
});

describe('accepted answers in the Write grader', () => {
  it('an answer the learner accepted grades correct from then on, in its own direction only', () => {
    const card = { id: 'c', word: '暑い', reading: 'あつい', meaning: 'hot (weather)', acceptedAnswers: { meaning: ['warm'], target: ['あつ'] } };
    expect(gradeWrittenAnswer('warm', buildWriteQuestion(card, 'jp-to-meaning')!).verdict).toBe('correct');
    expect(gradeWrittenAnswer('あつ', buildWriteQuestion(card, 'meaning-to-jp')!).verdict).toBe('correct');
    // Not crossed over: an accepted meaning is not a Japanese answer.
    expect(gradeWrittenAnswer('warm', buildWriteQuestion(card, 'meaning-to-jp')!).verdict).toBe('wrong');
    // And without the acceptance, the same answer is still wrong.
    const plain = { id: 'c', word: '暑い', reading: 'あつい', meaning: 'hot (weather)' };
    expect(gradeWrittenAnswer('warm', buildWriteQuestion(plain, 'jp-to-meaning')!).verdict).toBe('wrong');
  });

  it('the canonical answer stays the card\'s own', () => {
    const card = { id: 'c', word: '暑い', meaning: 'hot', acceptedAnswers: { meaning: ['warm'] } };
    expect(buildWriteQuestion(card, 'jp-to-meaning')?.answer).toBe('hot');
  });
});

describe('N2 i+1 example sentences', () => {
  it('normalizes: caps the count and the known-word sample, drops the target from it', () => {
    const request = normalizeExampleSentencesRequest({
      word: '食べる',
      count: 9,
      knownWords: ['食べる', ...Array.from({ length: 300 }, (_, i) => `語${i}`)],
    })!;
    expect(request.count).toBe(3);
    expect(request.knownWords).toHaveLength(199);
    expect(request.knownWords).not.toContain('食べる');
  });

  it('prompts with the known words and the target', () => {
    const prompt = buildExampleSentencesPrompt(normalizeExampleSentencesRequest({ word: '食べる', meaning: 'to eat', knownWords: ['パン'] })!);
    expect(prompt).toContain('食べる');
    expect(prompt).toContain('パン');
  });

  it('recognizes the target in inflected and kana forms', () => {
    expect(containsTargetWord('パンを食べた。', '食べる', 'たべる', 'ja')).toBe(true);
    expect(containsTargetWord('毎日勉強した。', '勉強する', 'べんきょうする', 'ja')).toBe(true);
    expect(containsTargetWord('パンをたべた。', '食べる', 'たべる', 'ja')).toBe(true);
    expect(containsTargetWord('水を飲んだ。', '食べる', 'たべる', 'ja')).toBe(false);
    expect(containsTargetWord('我喜欢吃苹果。', '吃', 'chī', 'zh')).toBe(true);
    expect(containsTargetWord('Я читаю книги.', 'книга', '', 'ru')).toBe(true);
  });

  it('drops sentences without the target and duplicates; nothing left is invalid', () => {
    const request = normalizeExampleSentencesRequest({ word: '食べる', reading: 'たべる', count: 3 })!;
    const result = finalizeExampleSentencesResult({ sentences: [
      { text: 'パンを食べる。', translation: 'eat bread' },
      { text: 'パンを食べる。', translation: 'dup' },
      { text: '走る。', translation: 'run' },
    ] }, request);
    expect(result?.sentences).toHaveLength(1);
    expect(finalizeExampleSentencesResult({ sentences: [{ text: '走る。' }] }, request)).toBeNull();
  });

  it('i+1: more than one unknown word is discarded; the target counts when unknown', () => {
    // Target unknown, everything else known: i+1, kept.
    expect(assessExampleSentence({ unknown: 0, words: 4 }, false)).toMatchObject({ keep: true, unknown: 1, coveragePercent: 80 });
    // Target unknown plus one other unknown: i+2, discarded.
    expect(assessExampleSentence({ unknown: 1, words: 4 }, false)).toMatchObject({ keep: false, unknown: 2 });
    // Target already known: one other unknown is still i+1.
    expect(assessExampleSentence({ unknown: 1, words: 4 }, true)).toMatchObject({ keep: true, unknown: 1 });
    // Could not tokenize: not checked, flagged so it is never pre-ticked.
    expect(assessExampleSentence(null, false)).toMatchObject({ unchecked: true, coveragePercent: null });
  });

  it('merging kept examples skips duplicates and caps the list', () => {
    const merged = mergeCardExamples(
      [{ text: 'a', origin: 'ai' }],
      [{ text: 'a', origin: 'ai' }, { text: 'b', translation: 'B', origin: 'corpus' }, { text: 'c', origin: 'ai' }],
      2,
    );
    expect(merged).toEqual([{ text: 'a', origin: 'ai' }, { text: 'b', translation: 'B', origin: 'corpus' }]);
  });
});

describe('N3 leech rescue', () => {
  const request = normalizeLeechRescueRequest({
    card: { word: '暑い', reading: 'あつい', meaning: 'hot', lapses: 12 },
    similar: [{ word: '熱い', reading: 'あつい', meaning: 'hot (touch)' }],
    answerLang: 'ja',
  })!;

  it('prompts with the lapses and the similar cards, in the UI language', () => {
    const prompt = buildLeechRescuePrompt(request);
    expect(prompt).toContain('12 times');
    expect(prompt).toContain('熱い');
    expect(prompt).toContain('Japanese');
  });

  it('requires a mnemonic; a "clearer" meaning identical to the current one is dropped', () => {
    expect(finalizeLeechRescueSuggestion({ mnemonic: '', clearerMeaning: 'x', distinction: 'y' }, request)).toBeNull();
    expect(finalizeLeechRescueSuggestion({ mnemonic: 'm', clearerMeaning: 'HOT', distinction: 'd' }, request))
      .toEqual({ mnemonic: 'm', clearerMeaning: '', distinction: 'd' });
  });

  it('without similar cards there is no distinction to approve', () => {
    const lone = normalizeLeechRescueRequest({ card: { word: '犬', meaning: 'dog' } })!;
    expect(finalizeLeechRescueSuggestion({ mnemonic: 'm', distinction: 'invented' }, lone)?.distinction).toBe('');
  });

  it('writes only what was ticked, never an empty value', () => {
    const suggestion = { mnemonic: 'm', clearerMeaning: 'hot (weather)', distinction: '' };
    expect(leechRescuePatch(suggestion, { mnemonic: true, clearerMeaning: false, distinction: true })).toEqual({ mnemonic: 'm' });
    expect(leechRescuePatch(suggestion, { mnemonic: false, clearerMeaning: true, distinction: false })).toEqual({ meaning: 'hot (weather)' });
    expect(leechRescuePatch(suggestion, { mnemonic: false, clearerMeaning: false, distinction: false })).toEqual({});
  });

  it('fallback: a partial reveal of the reading and the similar cards', () => {
    expect(leechRescueFallback({ word: '暑い', reading: 'あつい' }, request.similar)).toEqual({ hint: 'あ…', similar: request.similar });
    expect(leechRescueFallback({ word: '木', reading: 'き' }, []).hint).toBeNull();
  });
});

describe('N5 explain in context', () => {
  const senses = contextSenseLines([
    { definitions: ['to hang', 'to suspend'] },
    { definitions: [] },
    { definitions: ['to put on (glasses)'] },
  ]);

  it('one line per sense with glosses', () => {
    expect(senses).toEqual(['to hang; to suspend', 'to put on (glasses)']);
  });

  it('needs a word, a sentence and senses', () => {
    expect(normalizeContextExplainRequest({ word: 'かける', sentence: '', senses })).toBeNull();
    expect(normalizeContextExplainRequest({ word: 'かける', sentence: '眼鏡をかける', senses: [] })).toBeNull();
    expect(normalizeContextExplainRequest({ word: 'かける', sentence: '眼鏡をかける', senses })?.lang).toBe('ja');
  });

  it('numbers the senses from 1 in the prompt and maps the reply back to 0-based', () => {
    const request = normalizeContextExplainRequest({ word: 'かける', sentence: '眼鏡をかける', senses, answerLang: 'zh' })!;
    const prompt = buildContextExplainPrompt(request);
    expect(prompt).toContain('2. to put on (glasses)');
    expect(prompt).toContain('Mandarin Chinese');
    expect(finalizeContextExplainResult({ sense: 2, explanation: 'glasses', confidence: 'high' }, request))
      .toEqual({ senseIndex: 1, explanation: 'glasses', confidence: 'high' });
    expect(finalizeContextExplainResult({ sense: 0, explanation: 'none fit', confidence: 'weird' }, request))
      .toEqual({ senseIndex: -1, explanation: 'none fit', confidence: 'low' });
    expect(finalizeContextExplainResult({ sense: 3, explanation: 'x' }, request)).toBeNull();
    expect(finalizeContextExplainResult({ sense: 1.5, explanation: 'x' }, request)).toBeNull();
  });

  it('fallback: the first (most common) sense', () => {
    expect(contextExplainFallback(senses)).toEqual({ senseIndex: 0 });
    expect(contextExplainFallback([])).toBeNull();
  });
});
