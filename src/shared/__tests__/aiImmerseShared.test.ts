/**
 * The pure halves of the watching-and-reading AI helpers: transcript chunking
 * under a size cap, merging the per-chunk answers, the deterministic fallbacks
 * (vocabulary quiz, i+1 ranking), the local re-validation of AI line picks
 * against the learner's known words, the request normalizers, and the Study
 * command parser that always runs before any AI.
 */
import { describe, expect, it } from 'vitest';
import {
  MEDIA_BRIEF_CHUNK_CHARS,
  chunkMediaBriefCues,
  finalizeLinePickResult,
  mediaBriefCueText,
  mediaBriefFallbackQuiz,
  mediaBriefQuestionsPerChunk,
  mergeMediaBriefChunks,
  normalizeLinePickRequest,
  normalizeMediaBriefRequest,
  rankLinePickCandidates,
  validateLinePicks,
} from '../aiMediaBrief';
import {
  finalizeContextTranslateResult,
  finalizeLineExplainResult,
  finalizeReaderSimplifyResult,
  normalizeContextTranslateRequest,
  normalizeLineExplainRequest,
  normalizeReaderSimplifyRequest,
} from '../aiImmerseLine';
import { immerseLevelLine, immerseTextInStudyLang } from '../aiImmerseCommon';
import { buildStudyCommandPrompt, finalizeStudyCommandReply, isStudyCommandIntent } from '../aiStudyCommand';
import {
  describeStudyCommandIntent,
  normalizeStudyCommandIntent,
  parseStudyCommand,
  studyCommandOperation,
} from '../studyFilterRecipe';

const cue = (start: number, text: string) => ({ start, end: start + 2, text });

describe('transcript chunking', () => {
  it('keeps ids as positions in the full list, skips blanks and rolling repeats', () => {
    const { chunks, usedCues, truncated } = chunkMediaBriefCues([
      cue(0, 'こんにちは'),
      cue(2, ''),
      cue(4, '{\\an8}こんにちは'),
      cue(6, 'お元気ですか<br>'),
    ]);
    expect(truncated).toBe(false);
    expect(usedCues).toBe(2);
    expect(chunks[0].cues.map((c) => c.id)).toEqual([0, 3]);
    expect(mediaBriefCueText('{\\i1}あ\\Nい<b>う</b>')).toBe('あ いう');
  });

  it('cuts at the size cap and stops (and says so) after the last allowed chunk', () => {
    const long = Array.from({ length: 400 }, (_, i) => cue(i * 3, `${'語'.repeat(90)}${i}`));
    const result = chunkMediaBriefCues(long, { chunkChars: 1_000, maxChunks: 3 });
    expect(result.chunks).toHaveLength(3);
    expect(result.truncated).toBe(true);
    expect(result.chunks.every((chunk) => chunk.chars <= 1_000)).toBe(true);
    const lastCue = result.chunks[2].cues[result.chunks[2].cues.length - 1];
    expect(result.coveredUntilSec).toBe(lastCue.end);
    expect(result.usedCues).toBe(result.chunks.reduce((n, c) => n + c.cues.length, 0));
  });

  it('spreads 3-8 questions over the parts', () => {
    expect(mediaBriefQuestionsPerChunk(1)).toBe(6);
    expect(mediaBriefQuestionsPerChunk(3)).toBe(2);
    expect(mediaBriefQuestionsPerChunk(6)).toBe(1);
    expect(mediaBriefQuestionsPerChunk(1, 20)).toBe(8);
  });

  it('refuses a request chunk over the cap instead of sending it', () => {
    const cues = Array.from({ length: 60 }, (_, id) => ({ id, text: 'あ'.repeat(200) }));
    expect(normalizeMediaBriefRequest({ cues })).toBeNull();
    expect(normalizeMediaBriefRequest({ cues: cues.filter((_, i) => i < 10) })).not.toBeNull();
    expect(MEDIA_BRIEF_CHUNK_CHARS).toBeGreaterThan(1_000);
  });
});

describe('merging the brief', () => {
  it('takes questions round-robin from the parts, attaches cue times, and sorts by time', () => {
    const merged = mergeMediaBriefChunks(
      [
        { summary: 'part one', questions: [{ question: 'q1', answer: 'a', cueId: 5 }, { question: 'q2', answer: 'a', cueId: 1 }] },
        { summary: 'part two', questions: [{ question: 'q3', answer: 'a', cueId: 40 }, { question: 'q4', answer: 'a', cueId: 99 }] },
      ],
      (id) => (id === 99 ? null : id * 10),
      3,
    );
    expect(merged.summaries).toEqual(['part one', 'part two']);
    // q4 names a cue with no time and is skipped rather than shown at a wrong place.
    expect(merged.questions.map((q) => [q.question, q.start])).toEqual([['q2', 10], ['q1', 50], ['q3', 400]]);
  });
});

describe('deterministic fallbacks', () => {
  const lines = [
    { start: 1, text: '窓を開けてください。', lemma: '窓' },
    { start: 5, text: '約束を守りました。', lemma: '約束' },
    { start: 9, text: '食べたかった。', lemma: '食べる' }, // conjugated: no verbatim blank
    { start: 12, text: 'また窓が割れた。', lemma: '窓' },
  ];

  it('the vocabulary quiz blanks the unknown word, once per word, and skips conjugated forms', () => {
    const quiz = mediaBriefFallbackQuiz(lines);
    expect(quiz.map((q) => q.cloze)).toEqual(['＿＿を開けてください。', '＿＿を守りました。']);
    expect(quiz[0]).toMatchObject({ answer: '窓', start: 1 });
  });

  it('the i+1 ranking puts the most frequent new word first', () => {
    const counts: Record<string, number> = { 窓: 5, 約束: 1, 食べる: 2 };
    const ranked = rankLinePickCandidates(lines, (lemma) => counts[lemma] ?? 1);
    expect(ranked[0].target).toBe('窓');
    expect(ranked.map((c) => c.id)).toContain(1);
    expect(rankLinePickCandidates(lines, () => 1, 2)).toHaveLength(2);
  });
});

describe('line picks are validated locally against known words', () => {
  const candidates = [
    { id: 0, start: 1, text: '窓 開ける', target: '窓', targetCount: 2 },
    { id: 1, start: 5, text: '約束 守る 大切', target: '約束', targetCount: 1 },
  ];
  const tokenize = (text: string) => text.split(' ').map((lemma) => ({ lemma, content: true }));

  it('drops a pick whose line is no longer exactly i+1', () => {
    const known = new Set(['開ける', '守る']);
    const levelOf = (lemma: string) => (known.has(lemma) ? 3 : 0);
    const valid = validateLinePicks(
      [{ id: 1, reason: 'r1' }, { id: 0, reason: 'r0' }, { id: 7, reason: 'unknown id' }],
      candidates,
      tokenize,
      levelOf,
    );
    // Line 1 now has two unknowns (約束, 大切): dropped. Line 0 is still i+1.
    expect(valid.map((v) => [v.id, v.reason])).toEqual([[0, 'r0']]);
  });

  it('main keeps only offered ids, once', () => {
    const request = normalizeLinePickRequest({ candidates: [{ id: 0, text: 'a', target: 'a' }, { id: 1, text: 'b', target: 'b' }], pickCount: 5 })!;
    expect(request.pickCount).toBe(2);
    expect(finalizeLinePickResult({ picks: [{ id: 1, reason: '<i>ok</i>' }, { id: 1, reason: 'x' }, { id: 4, reason: 'y' }] }, request))
      .toEqual({ picks: [{ id: 1, reason: 'ok' }] });
    expect(finalizeLinePickResult({ picks: [{ id: 4, reason: 'y' }] }, request)).toBeNull();
  });
});

describe('line helpers', () => {
  it('explain normalizes the surface and refuses an empty line', () => {
    expect(normalizeLineExplainRequest({ text: '  ' })).toBeNull();
    expect(normalizeLineExplainRequest({ text: 'はい', surface: 'evil' })?.surface).toBe('reader');
    expect(normalizeLineExplainRequest({ text: 'はい', surface: 'vn' })?.surface).toBe('vn');
  });

  it('explain keeps at most four grammar notes and drops the target meaning without a target', () => {
    const request = normalizeLineExplainRequest({ text: '行きます。', studyLang: 'ja' })!;
    const result = finalizeLineExplainResult({
      translation: 'I will go.',
      explanation: 'Polite.',
      grammar: Array.from({ length: 6 }, (_, i) => ({ pattern: `p${i}`, note: 'n' })),
      targetMeaning: 'should vanish',
    }, request);
    expect(result?.grammar).toHaveLength(4);
    expect(result?.targetMeaning).toBe('');
  });

  it('simplify refuses text that is not in the study language, and an over-long rewrite', () => {
    expect(normalizeReaderSimplifyRequest({ text: 'English only', studyLang: 'ja' })).toBeNull();
    const request = normalizeReaderSimplifyRequest({ text: '難しい文。', studyLang: 'ja' })!;
    expect(finalizeReaderSimplifyResult({ simplified: 'やさしい'.repeat(40), notes: [] }, request)).toBeNull();
    expect(finalizeReaderSimplifyResult({ simplified: 'やさしい文。', notes: ['a', '', 'b'] }, request))
      .toEqual({ simplified: 'やさしい文。', notes: ['a', 'b'] });
  });

  it('translate accepts any language code shape only, and refuses an echo', () => {
    expect(normalizeContextTranslateRequest({ text: 'はい', targetLang: 'de' })?.targetLang).toBe('de');
    expect(normalizeContextTranslateRequest({ text: 'はい', targetLang: '../x' })?.targetLang).toBe('en');
    const request = normalizeContextTranslateRequest({ text: 'はい', targetLang: 'en' })!;
    expect(finalizeContextTranslateResult({ translation: 'はい' }, request)).toBeNull();
    expect(finalizeContextTranslateResult({ translation: 'Yes.' }, request)).toEqual({ translation: 'Yes.' });
  });

  it('script and level helpers', () => {
    expect(immerseTextInStudyLang('Привет', 'ru')).toBe(true);
    expect(immerseTextInStudyLang('hello', 'zh')).toBe(false);
    expect(immerseLevelLine(null, 'zh')).toContain('HSK');
    expect(immerseLevelLine(86, 'ja')).toContain('86%');
  });
});

describe('Study command parsing (deterministic first)', () => {
  it('keeps every phrase the box understood before', () => {
    expect(parseStudyCommand('Remove N5 and N4 words')).toEqual({ op: 'filter', args: { excludedJlptLevels: ['N4', 'N5'] } });
    expect(parseStudyCommand('Undo filter')).toEqual({ op: 'undo-filter' });
    expect(parseStudyCommand('Preview Anki')).toEqual({ op: 'preview-anki' });
    expect(parseStudyCommand('show me the cards')).toEqual({ op: 'preview-cards' });
  });

  it('reads any named JLPT levels, and returns null for anything else (the only case the AI may run)', () => {
    expect(parseStudyCommand('exclude n3')).toEqual({ op: 'filter', args: { excludedJlptLevels: ['N3'] } });
    expect(parseStudyCommand('only keep words I heard three times')).toBeNull();
    expect(parseStudyCommand('')).toBeNull();
  });

  it('an untrusted intent is re-derived: unknown ops, bad levels and no-op filters are refused', () => {
    expect(normalizeStudyCommandIntent({ op: 'export-anki' })).toBeNull();
    expect(normalizeStudyCommandIntent({ op: 'filter', args: { excludedJlptLevels: ['N9'] } })).toBeNull();
    expect(normalizeStudyCommandIntent({ op: 'filter', args: { maximumCards: 10_000 } })).toBeNull();
    expect(normalizeStudyCommandIntent({ op: 'filter', args: { maximumCards: 20, excludeKnown: false } }))
      .toEqual({ op: 'filter', args: { maximumCards: 20, excludeKnown: false } });
  });

  it('the AI reply maps through the same normalizer, and "none" is null', () => {
    const base = {
      excludedJlptLevels: [],
      minimumOccurrences: 0,
      maximumCards: 0,
      excludeKnown: 'unchanged',
      excludeInternalDuplicates: 'unchanged',
      excludeAnkiDuplicates: 'unchanged',
      excludeProperNouns: 'unchanged',
    };
    expect(finalizeStudyCommandReply({ ...base, op: 'none' })).toBeNull();
    expect(finalizeStudyCommandReply({ ...base, op: 'filter' })).toBeNull();
    const intent = finalizeStudyCommandReply({ ...base, op: 'filter', excludeProperNouns: 'off', maximumCards: 15 });
    expect(intent).toEqual({ op: 'filter', args: { maximumCards: 15, excludeProperNouns: false } });
    expect(isStudyCommandIntent(intent)).toBe(true);
    expect(isStudyCommandIntent({ op: 'filter', args: { maximumCards: 15, bogus: 1 } })).toBe(false);
    expect(buildStudyCommandPrompt({ text: 'N3を外して' })).toContain('N3を外して');
  });

  it('an intent runs exactly one typed operation and describes itself through catalog keys', () => {
    expect(studyCommandOperation({ op: 'filter', args: { excludedJlptLevels: ['N5'] } }, 'w1'))
      .toEqual({ operation: 'study.filter-vocabulary', arguments: { workspaceId: 'w1', excludedJlptLevels: ['N5'] } });
    expect(studyCommandOperation({ op: 'undo-filter' }, 'w1').operation).toBe('study.undo-filter');
    expect(describeStudyCommandIntent({ op: 'filter', args: { excludedJlptLevels: ['N4', 'N5'], excludeKnown: true } }))
      .toEqual([
        { key: 'study.command.intent.levels', vars: { levels: 'N4, N5' } },
        { key: 'study.command.intent.excludeKnown' },
      ]);
  });
});
