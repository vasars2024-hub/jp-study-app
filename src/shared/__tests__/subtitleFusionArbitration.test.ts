/**
 * Stage F5 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md` — the arbitration layer.
 *
 * F5 is the only stage that may overwrite Whisper's words, so what is under test
 * is mostly what it *refuses* to do. Three claims:
 *
 *  1. **It only touches disputes.** A window both sides agreed on, and a window
 *     Whisper produced nothing for, are never sent and never changed.
 *  2. **It cannot invent dialogue.** A verdict that resembles neither candidate is
 *     discarded; a "reference" verdict must be the reference we supplied verbatim.
 *     This is the mechanical form of the plan's "never introduce content present
 *     in neither candidate".
 *  3. **No verdicts is the offline path.** `applyFusionArbitration(d, [])` is the
 *     identity function on F4's decisions, so losing the cloud costs a basis
 *     label and nothing else.
 */
import { describe, expect, it } from 'vitest';
import {
  applyFusionArbitration,
  batchArbitrationCandidates,
  buildFusionArbitrationPrompt,
  decideFusedWindows,
  parseFusionArbitration,
  selectArbitrationCandidates,
  FUSION_ARBITRATION_BATCH,
  FUSION_ARBITRATION_MAX_WINDOWS,
  type ArbitrationCandidate,
  type FusedWindowDecision,
} from '../subtitleFusionCore';

const decision = (
  windowIndex: number,
  text: string,
  basis: FusedWindowDecision['basis'],
  score = 0.1,
): FusedWindowDecision => ({ windowIndex, text, basis, score, confidence: 0.35 });

const candidate = (
  windowIndex: number,
  whisper: string,
  reference: string,
  english = 'some english line',
): ArbitrationCandidate => ({ windowIndex, english, whisper, reference });

describe('selectArbitrationCandidates', () => {
  it('sends the disputed windows and nothing else', () => {
    const decisions: FusedWindowDecision[] = [
      decision(0, '猫が好きです', 'whisper'),
      decision(1, '傘を持ってきた', 'whisper-unverified'),
      decision(2, '雨が降りそうです', 'reference'),
      decision(3, '', 'empty'),
    ];
    const english = ['i like cats', 'i brought an umbrella', 'it looks like rain', ''];
    const references = ['ねこがすきです', '傘を持参した', '雨が降りそうです', ''];

    const picked = selectArbitrationCandidates(decisions, english, references);
    expect(picked.map((entry) => entry.windowIndex)).toEqual([1]);
    expect(picked[0]).toMatchObject({
      english: 'i brought an umbrella',
      whisper: '傘を持ってきた',
      reference: '傘を持参した',
    });
  });

  it('skips a dispute with no English text, because meaning is the whole input', () => {
    const decisions = [decision(0, '何か', 'whisper-unverified')];
    expect(selectArbitrationCandidates(decisions, [''], ['なにか'])).toEqual([]);
    expect(selectArbitrationCandidates(decisions, ['   '], ['なにか'])).toEqual([]);
  });

  it('caps the spend at the worst disagreements, then restores window order', () => {
    const decisions = [
      decision(0, 'あ', 'whisper-unverified', 0.30),
      decision(1, 'い', 'whisper-unverified', 0.05),
      decision(2, 'う', 'whisper-unverified', 0.20),
    ];
    const english = ['a', 'b', 'c'];
    const references = ['ア', 'イ', 'ウ'];

    const picked = selectArbitrationCandidates(decisions, english, references, 2);
    // The two lowest scores are windows 1 and 2 — returned in window order.
    expect(picked.map((entry) => entry.windowIndex)).toEqual([1, 2]);
    expect(selectArbitrationCandidates(decisions, english, references, 0)).toEqual([]);
  });

  it('has a default cap that bounds a long episode to a handful of requests', () => {
    const decisions = Array.from({ length: 400 }, (_, i) =>
      decision(i, `台詞${i}`, 'whisper-unverified', i / 1000));
    const english = decisions.map((_, i) => `line ${i}`);
    const references = decisions.map((_, i) => `参照${i}`);

    const picked = selectArbitrationCandidates(decisions, english, references);
    expect(picked).toHaveLength(FUSION_ARBITRATION_MAX_WINDOWS);
    expect(batchArbitrationCandidates(picked)).toHaveLength(
      Math.ceil(FUSION_ARBITRATION_MAX_WINDOWS / FUSION_ARBITRATION_BATCH),
    );
  });
});

describe('batchArbitrationCandidates', () => {
  it('splits into request-sized groups and keeps every candidate exactly once', () => {
    const candidates = Array.from({ length: 35 }, (_, i) => candidate(i, `わ${i}`, `参${i}`));
    const batches = batchArbitrationCandidates(candidates, 16);
    expect(batches.map((batch) => batch.length)).toEqual([16, 16, 3]);
    expect(batches.flat().map((entry) => entry.windowIndex))
      .toEqual(candidates.map((entry) => entry.windowIndex));
  });

  it('never produces a zero-length step from a bad size', () => {
    const candidates = [candidate(0, 'あ', 'い'), candidate(1, 'う', 'え')];
    expect(batchArbitrationCandidates(candidates, 0)).toHaveLength(2);
    expect(batchArbitrationCandidates(candidates, -5)).toHaveLength(2);
  });
});

describe('buildFusionArbitrationPrompt', () => {
  it('carries all three inputs per line, keyed by the window index', () => {
    const prompt = buildFusionArbitrationPrompt([candidate(7, '橋を渡る', '端を渡る', 'cross the bridge')]);
    expect(prompt).toContain('"id":7');
    expect(prompt).toContain('cross the bridge');
    expect(prompt).toContain('橋を渡る');
    expect(prompt).toContain('端を渡る');
    // The policy the whole feature rests on has to be in the instruction itself.
    expect(prompt).toContain('`whisper` is the default answer');
  });
});

describe('parseFusionArbitration', () => {
  const batch = [candidate(3, '雨が降っています', '雨が降っている', 'it is raining')];

  it('accepts a repair that keeps the transcript recognisable', () => {
    const raw = JSON.stringify({
      lines: [{ id: 3, text: '飴が降っています', basis: 'whisper-corrected' }],
    });
    expect(parseFusionArbitration(raw, batch)).toEqual([
      { windowIndex: 3, text: '飴が降っています', basis: 'whisper-corrected', confidence: 0.75 },
    ]);
  });

  it('rejects a rewrite that resembles neither candidate — the invention guard', () => {
    const raw = JSON.stringify({
      lines: [{ id: 3, text: '明日は友達と映画を見に行く約束をしました', basis: 'whisper-corrected' }],
    });
    expect(parseFusionArbitration(raw, batch)).toEqual([]);
  });

  it('trusts the strings over the label when nothing actually changed', () => {
    const raw = JSON.stringify({
      lines: [{ id: 3, text: '雨が降っています', basis: 'whisper-corrected' }],
    });
    const [verdict] = parseFusionArbitration(raw, batch);
    expect(verdict).toMatchObject({ basis: 'whisper-as-is', confidence: 0.7 });
  });

  it('lets a reference verdict through only when it is the reference we supplied', () => {
    const good = JSON.stringify({ lines: [{ id: 3, text: '雨が降っている', basis: 'reference' }] });
    expect(parseFusionArbitration(good, batch)).toEqual([
      { windowIndex: 3, text: '雨が降っている', basis: 'reference', confidence: 0.4 },
    ]);

    const paraphrased = JSON.stringify({
      lines: [{ id: 3, text: '雨が降っていますね', basis: 'reference' }],
    });
    expect(parseFusionArbitration(paraphrased, batch)).toEqual([]);
  });

  it('ignores an id it was never shown, and a repeated id after the first', () => {
    const raw = JSON.stringify({
      lines: [
        { id: 99, text: '知らない窓', basis: 'whisper-as-is' },
        { id: 3, text: '雨が降っています', basis: 'whisper-as-is' },
        { id: 3, text: '全然違う文章がここに入ります', basis: 'whisper-corrected' },
      ],
    });
    const verdicts = parseFusionArbitration(raw, batch);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ windowIndex: 3, text: '雨が降っています' });
  });

  it('is total: prose, a missing array, junk rows and empty text all yield fewer verdicts', () => {
    expect(parseFusionArbitration('I could not do that.', batch)).toEqual([]);
    expect(parseFusionArbitration('{"result":[]}', batch)).toEqual([]);
    expect(parseFusionArbitration('null', batch)).toEqual([]);
    expect(parseFusionArbitration(
      JSON.stringify({ lines: [null, 5, { id: '3', text: 'x', basis: 'whisper-as-is' }] }),
      batch,
    )).toEqual([]);
    expect(parseFusionArbitration(
      JSON.stringify({ lines: [{ id: 3, text: '   ', basis: 'whisper-as-is' }] }),
      batch,
    )).toEqual([]);
    expect(parseFusionArbitration(
      JSON.stringify({ lines: [{ id: 3, text: '雨が降っています', basis: 'invented' }] }),
      batch,
    )).toEqual([]);
  });
});

describe('applyFusionArbitration', () => {
  const scored = decideFusedWindows(
    ['猫が好きです', '橋を渡ります'],
    ['ねこがすきです', '全く関係のない参照文です'],
  );

  it('is the identity on F4 output when no verdict arrives — the offline path', () => {
    expect(applyFusionArbitration(scored, [])).toEqual(scored);
  });

  it('changes only the window a verdict names', () => {
    const applied = applyFusionArbitration(scored, [
      { windowIndex: 1, text: '端を渡ります', basis: 'whisper-corrected', confidence: 0.75 },
    ]);
    expect(applied[0]).toEqual(scored[0]);
    expect(applied[1]).toMatchObject({
      text: '端を渡ります',
      basis: 'whisper-corrected',
      confidence: 0.75,
      // The F4 score is kept: it records how far apart the two candidates were,
      // which stays true after a repair and is what a later calibration reads.
      score: scored[1].score,
    });
  });

  it('does not mutate the decisions it was given', () => {
    const before = JSON.parse(JSON.stringify(scored));
    applyFusionArbitration(scored, [
      { windowIndex: 0, text: '猫が好きです', basis: 'whisper-as-is', confidence: 0.7 },
    ]);
    expect(scored).toEqual(before);
  });
});
