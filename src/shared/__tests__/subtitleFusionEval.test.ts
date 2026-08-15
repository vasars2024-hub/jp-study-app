/**
 * Stage F7's arithmetic — `src/shared/subtitleFusionEval.ts`.
 *
 * The harness that uses this needs real media and a Whisper runtime, so it lives
 * in `tools/fusion-eval.cjs`. What can and must be tested here is that the numbers
 * it prints mean what the plan says they mean, because those numbers are the only
 * evidence behind the feature's accuracy claim.
 *
 * The gate is deliberately hostile to its own feature: one episode is a failure, and
 * an arbitrated tie is a failure. A gate that a broken pipeline can pass is
 * decoration. The offline mode is the one exception and it is not a weakening — the
 * offline path cannot beat Whisper on CER by construction, so the rules it *is*
 * graded on are the ones it can actually fail, and the claim a pass licenses shrinks
 * to match.
 */
import { describe, expect, it } from 'vitest';
import {
  buildBaselineTracks,
  planAsrWindows,
  type AsrWindow,
  type FusionCue,
} from '../subtitleFusionCore';
import {
  alignByOverlap,
  characterErrorRate,
  editDistance,
  evaluateEpisode,
  evaluateTrack,
  fusionClaimSentence,
  fusionShipGate,
  overlapSeconds,
  FUSION_GATE_MIN_EPISODES,
  type EvalCue,
  type EpisodeVerdict,
} from '../subtitleFusionEval';

const cue = (start: number, end: number, text: string): EvalCue => ({ start, end, text });

describe('editDistance', () => {
  it('counts substitutions, insertions and deletions', () => {
    expect(editDistance('', '')).toBe(0);
    expect(editDistance('あいう', 'あいう')).toBe(0);
    expect(editDistance('あいう', 'あいえ')).toBe(1);
    expect(editDistance('あいう', 'あいうえ')).toBe(1);
    expect(editDistance('あいう', 'あう')).toBe(1);
    expect(editDistance('', 'あいう')).toBe(3);
  });

  it('counts a surrogate pair as the one character a reader sees', () => {
    // 𠮷 is two UTF-16 units. A naive implementation reports 2 edits here.
    expect(editDistance('𠮷', '吉')).toBe(1);
    expect(editDistance('𠮷野家', '吉野家')).toBe(1);
  });
});

describe('characterErrorRate', () => {
  it('normalizes exactly as F4 does, so punctuation is not an error', () => {
    // Same sentence, different comma policy and katakana/hiragana choice.
    expect(characterErrorRate('ジュース、飲む。', 'じゅーす飲む').cer).toBe(0);
  });

  it('is edits over reference characters', () => {
    const scored = characterErrorRate('あいうえお', 'あいうえ');
    expect(scored).toEqual({ cer: 0.2, edits: 1, referenceChars: 5 });
  });

  it('refuses to score an empty reference as perfect', () => {
    // A candidate compared against nothing has not earned a 0% error rate.
    expect(characterErrorRate('', 'なにか').cer).toBe(1);
    expect(characterErrorRate('', '').cer).toBe(0);
    expect(characterErrorRate('。、！', 'なにか').cer).toBe(1);
  });
});

describe('alignByOverlap', () => {
  it('joins every overlapping candidate cue, and touching is not overlapping', () => {
    const reference = [cue(0, 2, '一'), cue(2, 4, '二')];
    const candidate = [cue(0, 1, 'い'), cue(1, 1.9, 'ろ'), cue(2, 4, 'は')];
    const pairs = alignByOverlap(reference, candidate);
    expect(pairs.map((pair) => pair.candidateText)).toEqual(['いろ', 'は']);
    expect(overlapSeconds(cue(0, 2, ''), cue(2, 4, ''))).toBe(0);
  });

  it('lets one candidate cue serve two reference cues rather than forcing a match', () => {
    const pairs = alignByOverlap([cue(0, 2, '一'), cue(2, 4, '二')], [cue(0, 4, 'ながい')]);
    expect(pairs.map((pair) => pair.candidateText)).toEqual(['ながい', 'ながい']);
  });

  it('leaves a reference cue nothing covers empty, which scores as a deletion', () => {
    const pairs = alignByOverlap([cue(0, 2, '一'), cue(10, 12, '二')], [cue(0, 2, 'いち')]);
    expect(pairs[1].candidateText).toBe('');
    expect(pairs[1].overlapSec).toBe(0);
  });
});

describe('evaluateTrack', () => {
  const reference = [cue(0, 2, '猫が好きです'), cue(3, 5, '犬も好きです')];

  it('reports a perfect track as zero on both measures', () => {
    const scored = evaluateTrack(reference, [cue(0, 2, '猫が好きです'), cue(3, 5, '犬も好きです')]);
    expect(scored.documentCer).toBe(0);
    expect(scored.alignedCer).toBe(0);
    expect(scored.missedCues).toBe(0);
    expect(scored.referenceCues).toBe(2);
    expect(scored.candidateCues).toBe(2);
  });

  it('separates saying the wrong thing from saying it at the wrong moment', () => {
    // Word-perfect, but every line lands three seconds late. This is the case the
    // two measures exist to tell apart: the transcript is right, the timing is not.
    const late = [cue(3, 5, '猫が好きです'), cue(6, 8, '犬も好きです')];
    const scored = evaluateTrack(reference, late);
    expect(scored.documentCer).toBe(0);
    // Reference cue 0 is covered by nothing, and cue 1 is covered by the previous
    // line — 6 deletions plus 2 substitutions over 12 reference characters.
    expect(scored.alignedCer).toBeCloseTo(8 / 12, 6);
    expect(scored.missedCues).toBe(1);
  });

  it('counts a reference cue the candidate never covers', () => {
    const scored = evaluateTrack(reference, [cue(0, 2, '猫が好きです')]);
    expect(scored.missedCues).toBe(1);
    expect(scored.alignedCer).toBeGreaterThan(0);
  });

  it('orders by time before concatenating, so cue order in the file is irrelevant', () => {
    const shuffled = [cue(3, 5, '犬も好きです'), cue(0, 2, '猫が好きです')];
    expect(evaluateTrack(reference, shuffled).documentCer).toBe(0);
  });
});

describe('evaluateEpisode', () => {
  const reference = [cue(0, 2, '橋を渡ります'), cue(3, 5, '雨が降っています')];

  it('passes only when the fused track beats both baselines', () => {
    const verdict = evaluateEpisode('ep1', reference, {
      fused: [cue(0, 2, '橋を渡ります'), cue(3, 5, '雨が降っています')],
      whisperOnly: [cue(0, 2, '端を渡ります'), cue(3, 5, '飴が降っています')],
      mtOnly: [cue(0, 2, '橋を渡る'), cue(3, 5, '雨が降っている')],
    }, 'arbitrated');
    expect(verdict.passed).toBe(true);
    expect(verdict.lostTo).toEqual([]);
    expect(verdict.fused.documentCer).toBe(0);
    expect(verdict.identicalToWhisper).toBe(false);
  });

  it('fails an arbitrated tie, because a tie means arbitration bought nothing', () => {
    const same = [cue(0, 2, '端を渡ります'), cue(3, 5, '飴が降っています')];
    const verdict = evaluateEpisode('ep1', reference, {
      fused: same,
      whisperOnly: same,
      mtOnly: [cue(0, 2, 'まったく違う文'), cue(3, 5, 'これも違う文章')],
    }, 'arbitrated');
    expect(verdict.passed).toBe(false);
    expect(verdict.lostTo).toEqual(['whisperOnly']);
  });

  it('names both baselines when the fused track is worse than each', () => {
    const verdict = evaluateEpisode('ep1', reference, {
      fused: [cue(0, 2, '全然関係のない文章'), cue(3, 5, 'これも無関係な話')],
      whisperOnly: [cue(0, 2, '橋を渡ります'), cue(3, 5, '雨が降っています')],
      mtOnly: [cue(0, 2, '橋を渡る'), cue(3, 5, '雨が降っている')],
    }, 'arbitrated');
    expect(verdict.lostTo).toEqual(['whisperOnly', 'mtOnly']);
  });

  it('defaults to offline — the weaker claim — when no mode is given', () => {
    const same = [cue(0, 2, '端を渡ります'), cue(3, 5, '飴が降っています')];
    const verdict = evaluateEpisode('ep1', reference, {
      fused: same,
      whisperOnly: same,
      mtOnly: [cue(0, 2, 'まったく違う文'), cue(3, 5, 'これも違う文章')],
    });
    expect(verdict.mode).toBe('offline');
    // The identical case the offline path produces on an episode with no empty
    // ASR window. It passes, and `identicalToWhisper` is how the report says why.
    expect(verdict.passed).toBe(true);
    expect(verdict.identicalToWhisper).toBe(true);
  });

  it('still fails offline when fusion made the track worse than Whisper', () => {
    const verdict = evaluateEpisode('ep1', reference, {
      // As if a bad reference had been substituted into an empty window.
      fused: [cue(0, 2, '端を渡ります'), cue(3, 5, '全然関係のない話です')],
      whisperOnly: [cue(0, 2, '端を渡ります'), cue(3, 5, '飴が降っています')],
      mtOnly: [cue(0, 2, 'まったく違う文'), cue(3, 5, 'これも違う文章')],
    });
    expect(verdict.lostTo).toEqual(['whisperOnly']);
    expect(verdict.identicalToWhisper).toBe(false);
  });

  it('still fails offline when fusion lost a line Whisper had covered', () => {
    // Equal CER on the concatenated document, but the fused track dropped the
    // second cue's timing and no longer covers that reference line at all.
    const verdict = evaluateEpisode('ep1', reference, {
      fused: [cue(0, 2, '橋を渡ります雨が降っています')],
      whisperOnly: [cue(0, 2, '橋を渡ります'), cue(3, 5, '雨が降っています')],
      mtOnly: [cue(0, 2, 'まったく違う文'), cue(3, 5, 'これも違う文章')],
    });
    expect(verdict.fused.documentCer).toBe(verdict.whisperOnly.documentCer);
    expect(verdict.lostTo).toEqual(['coverage']);
    expect(verdict.passed).toBe(false);
  });

  it('never excuses offline from beating translation alone', () => {
    const same = [cue(0, 2, '端を渡ります'), cue(3, 5, '飴が降っています')];
    const verdict = evaluateEpisode('ep1', reference, {
      fused: same,
      whisperOnly: same,
      mtOnly: [cue(0, 2, '橋を渡ります'), cue(3, 5, '雨が降っています')],
    });
    expect(verdict.lostTo).toEqual(['mtOnly']);
  });
});

describe('buildBaselineTracks', () => {
  const cues: FusionCue[] = [
    { start: 0, end: 2, text: 'i like cats' },
    { start: 3, end: 5, text: 'i cross the bridge' },
    { start: 6, end: 8, text: 'it is raining' },
  ];
  const windows: AsrWindow[] = cues.map((entry, index) => ({
    startSec: entry.start,
    endSec: entry.end,
    cueIndices: [index],
  }));

  it('puts both baselines on the fused track’s own cue grid', () => {
    const { whisperOnly, mtOnly } = buildBaselineTracks(
      windows,
      cues,
      ['猫が数奇です', '端を渡ります', '飴が降っています'],
      ['猫が好きです', '橋を渡ります', '雨が降っています'],
    );
    // Same starts and ends on both, or the gate would be measuring timing.
    expect(whisperOnly.map((row) => [row.start, row.end]))
      .toEqual(mtOnly.map((row) => [row.start, row.end]));
    expect(whisperOnly.map((row) => row.start)).toEqual([0, 3, 6]);
    expect(whisperOnly.map((row) => row.text)).toEqual(['猫が数奇です', '端を渡ります', '飴が降っています']);
    expect(mtOnly.map((row) => row.text)).toEqual(['猫が好きです', '橋を渡ります', '雨が降っています']);
  });

  it('lets a baseline simply not claim a line it has no text for', () => {
    const { whisperOnly, mtOnly } = buildBaselineTracks(
      windows,
      cues,
      ['猫が数奇です', '', '  '],
      ['', '橋を渡ります', '雨が降っています'],
    );
    expect(whisperOnly.map((row) => row.start)).toEqual([0]);
    expect(mtOnly.map((row) => row.start)).toEqual([3, 6]);
    // Which `evaluateTrack` then charges as missed reference cues, not as silence.
    expect(evaluateTrack(
      cues.map((cue) => ({ ...cue, text: '正解' })),
      whisperOnly,
    ).missedCues).toBe(2);
  });

  it('is built from real planner windows, not only hand-made ones', () => {
    const planned = planAsrWindows(cues, { durationSec: 10 });
    const { whisperOnly } = buildBaselineTracks(
      planned,
      cues,
      planned.map((_window, i) => `台詞${i}`),
      planned.map(() => ''),
    );
    expect(whisperOnly).toHaveLength(planned.length);
    expect(whisperOnly[0].start).toBe(0);
  });
});

describe('fusionShipGate', () => {
  const pass = (episode: string): EpisodeVerdict => evaluateEpisode(episode, [cue(0, 2, '猫が好き')], {
    fused: [cue(0, 2, '猫が好き')],
    whisperOnly: [cue(0, 2, '猫が数奇')],
    mtOnly: [cue(0, 2, '私は猫が大好きです')],
  }, 'arbitrated');

  /** The shape the offline path actually produces: fused text === whisper text. */
  const offlinePass = (episode: string): EpisodeVerdict => evaluateEpisode(episode, [cue(0, 2, '猫が好き')], {
    fused: [cue(0, 2, '猫が数奇')],
    whisperOnly: [cue(0, 2, '猫が数奇')],
    mtOnly: [cue(0, 2, '私は猫が大好きです')],
  });

  it('needs more than one episode, and says so rather than reading as green', () => {
    const gate = fusionShipGate([pass('ep1')]);
    expect(gate.passed).toBe(false);
    expect(gate.reasons[0]).toContain(`the gate needs ${FUSION_GATE_MIN_EPISODES}`);
    // The single episode itself passed — the gate failed on evidence, not accuracy.
    expect(gate.episodes[0].passed).toBe(true);
    expect(gate.claim).toBe('none');
  });

  it('passes when every episode passes and there are enough of them', () => {
    const gate = fusionShipGate([pass('ep1'), pass('ep2')]);
    expect(gate).toMatchObject({ passed: true, reasons: [], claim: 'beats-both' });
    expect(gate.episodes).toHaveLength(2);
    expect(gate.notes).toEqual([]);
  });

  it('fails the whole gate for one bad episode, and names the numbers', () => {
    const bad = evaluateEpisode('ep2', [cue(0, 2, '猫が好き')], {
      fused: [cue(0, 2, '犬が嫌い')],
      whisperOnly: [cue(0, 2, '猫が好き')],
      mtOnly: [cue(0, 2, '猫が好き')],
    }, 'arbitrated');
    const gate = fusionShipGate([pass('ep1'), bad]);
    expect(gate.passed).toBe(false);
    expect(gate.reasons).toHaveLength(2);
    expect(gate.reasons.every((reason) => reason.startsWith('ep2:'))).toBe(true);
    expect(gate.reasons[0]).toMatch(/fused CER \d\.\d{4} does not beat whisperOnly \d\.\d{4}/);
  });

  it('caps a passing offline run at the weaker claim, and says the comparison was degenerate', () => {
    const gate = fusionShipGate([offlinePass('ep1'), offlinePass('ep2')]);
    expect(gate.passed).toBe(true);
    expect(gate.claim).toBe('no-regression');
    expect(gate.notes).toHaveLength(2);
    expect(gate.notes[0]).toContain('character-identical');
    expect(fusionClaimSentence(gate.claim)).not.toContain('beats both');
  });

  it('lets one offline episode cap an otherwise arbitrated run', () => {
    // The claim a run supports is only as strong as its weakest episode.
    const gate = fusionShipGate([pass('ep1'), offlinePass('ep2')]);
    expect(gate.passed).toBe(true);
    expect(gate.claim).toBe('no-regression');
  });

  it('words an offline regression as "is worse than", not as a missed win', () => {
    const regressed = evaluateEpisode('ep2', [cue(0, 2, '猫が好き')], {
      fused: [cue(0, 2, '犬が嫌い')],
      whisperOnly: [cue(0, 2, '猫が数奇')],
      mtOnly: [cue(0, 2, '私は猫が大好きです')],
    });
    const gate = fusionShipGate([offlinePass('ep1'), regressed]);
    expect(gate.passed).toBe(false);
    expect(gate.reasons[0]).toMatch(/ep2: fused CER \d\.\d{4} is worse than whisperOnly \d\.\d{4}/);
    expect(gate.claim).toBe('none');
  });
});
