/**
 * Stage F6 of `docs/ACTIVE/EN_JA_SUBTITLE_FUSION_PLAN.md` — the provenance sidecar.
 *
 * Two claims carry the file. First, the sidecar is indexed by **cue** position in
 * the written SRT, not by ASR window: a merged window yields one cue and a dropped
 * one yields none, so any independent skip rule would silently shift every badge
 * after the first drop onto the wrong line. Second, reading is **total** — a
 * sidecar is optional data about an optional track, so a missing, truncated,
 * hand-edited or newer-version file has to degrade to "no badges", never to an
 * exception that costs the track.
 *
 * The third claim is a unit, not a shape: `SubtitleRecord.confidence` is a 0–100
 * match score, and F4 wrote the 0–1 mean into it, so a fused track sitting at 0.52
 * rendered as "1% match" in the media library.
 */
import { describe, expect, it } from 'vitest';
import {
  decideFusedWindows,
  planAsrWindows,
  windowCuesToSubtitleCues,
  windowDecisionsToFusedCues,
  type AsrWindow,
  type FusedWindowDecision,
  type FusionCue,
} from '../subtitleFusionCore';
import {
  FUSION_META_VERSION,
  buildFusionTrackMeta,
  fusionArbitrationStatus,
  fusionConfidencePercent,
  fusionCueCounts,
  fusionMetaPathFor,
  parseFusionTrackMeta,
  serializeFusionTrackMeta,
  type FusionArbitrationStatus,
} from '../subtitleFusionMeta';

const cue = (start: number, end: number, text: string): FusionCue => ({ start, end, text });

const track = {
  createdAt: 1_700_000_000_000,
  sourceSubtitleId: 'en-1',
  sourceLang: 'en',
  lang: 'ja',
  offsetSec: 0.42,
  offsetConfident: true,
};

describe('fusionMetaPathFor', () => {
  it('swaps the track extension rather than appending to it', () => {
    expect(fusionMetaPathFor('subtitles/abc/fused-ja.srt')).toBe('subtitles/abc/fused-ja.meta.json');
  });

  it('leaves a dotted directory alone when the file itself has no extension', () => {
    expect(fusionMetaPathFor('C:\\media\\show.s01\\fused')).toBe('C:\\media\\show.s01\\fused.meta.json');
  });
});

describe('windowDecisionsToFusedCues', () => {
  const cues = [cue(0, 1, 'one'), cue(1, 2, 'two'), cue(2, 3, 'three')];
  const windows: AsrWindow[] = [
    { startSec: 0, endSec: 1, cueIndices: [0] },
    { startSec: 1, endSec: 2, cueIndices: [1] },
    { startSec: 2, endSec: 3, cueIndices: [2] },
  ];
  const decisions: FusedWindowDecision[] = [
    { windowIndex: 0, text: '一', basis: 'whisper', score: 0.8, confidence: 0.88 },
    { windowIndex: 1, text: '', basis: 'empty', score: 0, confidence: 0 },
    { windowIndex: 2, text: '三', basis: 'whisper-unverified', score: 0.1, confidence: 0.35 },
  ];

  it('drops the same windows the SRT writer drops, and stays aligned to it', () => {
    const rows = windowDecisionsToFusedCues(windows, cues, decisions);
    const written = windowCuesToSubtitleCues(windows, cues, decisions.map((d) => d.text));
    expect(rows.map((row) => row.text)).toEqual(written.map((row) => row.text));
    expect(rows.map((row) => row.start)).toEqual(written.map((row) => row.start));
    // The dropped middle window shifts cue 2 to index 1; the window index is kept
    // so the two numbering schemes never get confused for each other.
    expect(rows[1]).toMatchObject({ windowIndex: 2, basis: 'whisper-unverified' });
  });

  it('spans a merged window across its first and last cue', () => {
    const merged: AsrWindow[] = [{ startSec: 0, endSec: 3, cueIndices: [0, 1, 2] }];
    const rows = windowDecisionsToFusedCues(merged, cues, [
      { windowIndex: 0, text: '一二三', basis: 'whisper', score: 0.5, confidence: 0.7 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ start: 0, end: 3 });
  });
});

describe('buildFusionTrackMeta', () => {
  const cues = [cue(0, 1.5, 'hello'), cue(1.5, 3, 'there'), cue(3, 4.5, 'friend')];
  // One window per cue, stated explicitly. `planAsrWindows` merges this contiguous
  // trio into a *single* window — the F1 merge behaviour — and a one-window fixture
  // makes the index-alignment assertions below vacuously true.
  const windows: AsrWindow[] = cues.map((entry, index) => ({
    startSec: entry.start,
    endSec: entry.end,
    cueIndices: [index],
  }));

  it('has a fixture that actually exercises a drop', () => {
    expect(windows).toHaveLength(3);
    expect(planAsrWindows(cues, { durationSec: 5 })).toHaveLength(1);
  });

  it('indexes the sidecar by cue position, not by window position', () => {
    // Window 0 produces nothing, so cue index and window index diverge from the top.
    const decisions = decideFusedWindows(['', 'テキスト1', 'テキスト2'], ['', '', '']);
    const meta = buildFusionTrackMeta(windows, cues, decisions, track);
    const written = windowCuesToSubtitleCues(windows, cues, decisions.map((d) => d.text));
    expect(written).toHaveLength(2);
    expect(meta.cues).toHaveLength(written.length);
    expect(meta.cues.map((entry) => entry.index)).toEqual([0, 1]);
    expect(meta.cues.map((entry) => entry.startSec)).toEqual(written.map((entry) => entry.start));
    // The load-bearing bit: sidecar cue 0 describes SRT cue 0, which came from
    // *window 1* and starts at 1.5 s. A sidecar indexed by window would put a row
    // for window 0 first, at 0 s — a badge pointing at a line the file never wrote.
    expect(meta.cues[0].startSec).toBe(1.5);
  });

  // Refereed offline: a reference was produced and agreed, so every cue is
  // plain `whisper` and the sidecar has nothing a v1 reader cannot read.
  const refereed = (): FusedWindowDecision[] =>
    decideFusedWindows(windows.map(() => 'テキスト'), windows.map(() => 'テキスト'));

  it('carries the sync gate result so a track fused unshifted says so', () => {
    const declined = buildFusionTrackMeta(windows, cues, refereed(), {
      ...track,
      offsetSec: 0,
      offsetConfident: false,
    });
    expect(declined).toMatchObject({ offsetSec: 0, offsetConfident: false, version: 1 });
  });

  it('declares version 2 only for a track a v1 reader would misread', () => {
    // Offline but refereed: nothing here a v1 reader gets wrong, so it stays v1
    // and older builds keep showing its badges.
    expect(buildFusionTrackMeta(windows, cues, refereed(), track).version).toBe(1);

    const arbitrated: FusedWindowDecision[] = refereed().map((decision, index) => (index === 1
      ? { ...decision, basis: 'whisper-corrected' as const, confidence: 0.75 }
      : decision));
    expect(buildFusionTrackMeta(windows, cues, arbitrated, track).version)
      .toBe(FUSION_META_VERSION);
    expect(FUSION_META_VERSION).toBe(2);
  });

  it('declares version 2 for an unrefereed track, so no v1 build can call it checked', () => {
    // The translator-less run. A v1 reader has no `whisper-unrefereed`, and the
    // alternative — writing these as plain `whisper` to stay v1 — is exactly the
    // "all lines cross-checked" lie. Refusing the file beats reading it wrong.
    const unrefereed = decideFusedWindows(windows.map(() => 'テキスト'), windows.map(() => ''));
    expect(unrefereed.every((d) => d.basis === 'whisper-unrefereed')).toBe(true);
    expect(buildFusionTrackMeta(windows, cues, unrefereed, track).version)
      .toBe(FUSION_META_VERSION);
  });

  it('averages confidence over emitted cues only, matching the record', () => {
    const decisions: FusedWindowDecision[] = [
      { windowIndex: 0, text: 'あ', basis: 'whisper', score: 0.9, confidence: 0.9 },
      { windowIndex: 1, text: '', basis: 'empty', score: 0, confidence: 0 },
      { windowIndex: 2, text: 'い', basis: 'reference', score: 0, confidence: 0.25 },
    ];
    const meta = buildFusionTrackMeta(windows, cues, decisions, track);
    // (0.9 + 0.25) / 2, and explicitly not (0.9 + 0 + 0.25) / 3.
    expect(meta.meanConfidence).toBeCloseTo(0.575, 3);
  });

  it('survives a round trip through the serialized form', () => {
    const decisions = decideFusedWindows(windows.map(() => 'テキスト'), windows.map(() => 'テキスト'));
    const meta = buildFusionTrackMeta(windows, cues, decisions, track);
    expect(parseFusionTrackMeta(serializeFusionTrackMeta(meta))).toEqual(meta);
  });
});

describe('parseFusionTrackMeta', () => {
  it('returns null rather than throwing for everything that is not a sidecar', () => {
    for (const raw of ['', '   ', 'not json', 'null', '[]', '"a string"', '{}', '{"version":1}']) {
      expect(parseFusionTrackMeta(raw)).toBeNull();
    }
  });

  it('declines a version this build cannot read instead of guessing at its fields', () => {
    const future = JSON.stringify({ version: FUSION_META_VERSION + 1, cues: [] });
    expect(parseFusionTrackMeta(future)).toBeNull();
    expect(parseFusionTrackMeta(JSON.stringify({ version: 0, cues: [] }))).toBeNull();
  });

  it('drops one corrupt cue rather than failing the whole file', () => {
    const raw = JSON.stringify({
      version: 1,
      cues: [
        { index: 0, startSec: 0, endSec: 1, basis: 'whisper', score: 0.5, confidence: 0.7 },
        { index: 1, basis: 'not-a-basis' },
        null,
        { index: 2, startSec: 2, endSec: 3, basis: 'reference', score: 0, confidence: 0.25 },
      ],
    });
    const meta = parseFusionTrackMeta(raw);
    expect(meta?.cues.map((entry) => entry.basis)).toEqual(['whisper', 'reference']);
    // Missing scalars default rather than poisoning the row with NaN.
    expect(meta?.meanConfidence).toBe(0);
    expect(meta?.offsetConfident).toBe(false);
  });
});

describe('the arbitration summary', () => {
  const cues = [cue(0, 1.5, 'hello'), cue(1.5, 3, 'there')];
  const windows: AsrWindow[] = cues.map((entry, index) => ({
    startSec: entry.start,
    endSec: entry.end,
    cueIndices: [index],
  }));
  // References that agree, so every basis is plain `whisper` — a v1-readable
  // sidecar, which is what the additivity assertion below needs to be about the
  // new field rather than about an unrefereed cue.
  const decisions = decideFusedWindows(['テキスト1', 'テキスト2'], ['テキスト1', 'テキスト2']);

  it('separates an arbiter that failed every batch from one that was never configured', () => {
    // The whole reason this field exists: both of these produce zero arbitration
    // bases, so the cue list cannot tell them apart. Two real runs on one install
    // hit exactly this — 22 verdicts applied on one episode and 0 on the next.
    const failed = buildFusionTrackMeta(windows, cues, decisions, {
      ...track,
      arbitration: { attempted: 16, applied: 0, failedBatches: 2, skipped: null },
    });
    const noKey = buildFusionTrackMeta(windows, cues, decisions, {
      ...track,
      arbitration: { attempted: 0, applied: 0, failedBatches: 0, skipped: 'no-key' },
    });
    expect(failed.cues.map((entry) => entry.basis))
      .toEqual(noKey.cues.map((entry) => entry.basis));
    expect(failed.arbitration).toEqual({
      attempted: 16, applied: 0, failedBatches: 2, skipped: null,
    });
    expect(noKey.arbitration?.skipped).toBe('no-key');
  });

  it('is additive: carrying it does not push a v1-readable sidecar to v2', () => {
    const meta = buildFusionTrackMeta(windows, cues, decisions, {
      ...track,
      arbitration: { attempted: 2, applied: 2, failedBatches: 0, skipped: null },
    });
    // Nothing here is an arbitration *basis*, so an older reader still reads
    // every cue correctly and the version must not move.
    expect(meta.version).toBe(1);
    expect(FUSION_META_VERSION).toBeGreaterThan(1);
  });

  it('omits the key entirely when the caller had nothing to report', () => {
    const meta = buildFusionTrackMeta(windows, cues, decisions, track);
    expect(meta.arbitration).toBeUndefined();
    expect(serializeFusionTrackMeta(meta)).not.toContain('arbitration');
  });

  it('round-trips through the reader', () => {
    const meta = buildFusionTrackMeta(windows, cues, decisions, {
      ...track,
      arbitration: { attempted: 9, applied: 7, failedBatches: 1, skipped: null },
    });
    const back = parseFusionTrackMeta(serializeFusionTrackMeta(meta));
    expect(back?.arbitration).toEqual(meta.arbitration);
  });

  it('drops a malformed summary rather than the cues it sits beside', () => {
    const withCues = (arbitration: unknown): string => JSON.stringify({
      version: 1,
      arbitration,
      cues: [{ index: 0, startSec: 0, endSec: 1, basis: 'whisper', score: 0.5, confidence: 0.7 }],
    });
    for (const bad of ['nonsense', 42, [], { skipped: 'no-such-reason' }]) {
      const parsed = parseFusionTrackMeta(withCues(bad));
      expect(parsed?.cues).toHaveLength(1);
      expect(parsed?.arbitration).toBeUndefined();
    }
    // A summary missing its counters is still a summary; the numbers default.
    const sparse = parseFusionTrackMeta(withCues({ skipped: 'cancelled' }));
    expect(sparse?.arbitration)
      .toEqual({ attempted: 0, applied: 0, failedBatches: 0, skipped: 'cancelled' });
  });

  it('carries the failure breakdown, which is what makes a failed batch chaseable', () => {
    const meta = buildFusionTrackMeta(windows, cues, decisions, {
      ...track,
      arbitration: {
        attempted: 38,
        applied: 22,
        failedBatches: 1,
        skipped: null,
        failures: { timeout: 1 },
        dropped: 3,
      },
    });
    const back = parseFusionTrackMeta(serializeFusionTrackMeta(meta));
    expect(back?.arbitration?.failures).toEqual({ timeout: 1 });
    expect(back?.arbitration?.dropped).toBe(3);
  });

  it('omits both fields on a clean run rather than writing empty ones', () => {
    const meta = buildFusionTrackMeta(windows, cues, decisions, {
      ...track,
      arbitration: { attempted: 4, applied: 4, failedBatches: 0, skipped: null },
    });
    const serialized = serializeFusionTrackMeta(meta);
    expect(serialized).not.toContain('failures');
    expect(serialized).not.toContain('dropped');
    expect(parseFusionTrackMeta(serialized)?.arbitration?.failures).toBeUndefined();
  });

  it('bounds a hostile breakdown instead of handing it to a caller', () => {
    const withCues = (arbitration: unknown): string => JSON.stringify({
      version: 1,
      arbitration,
      cues: [{ index: 0, startSec: 0, endSec: 1, basis: 'whisper', score: 0.5, confidence: 0.7 }],
    });
    const hostile = parseFusionTrackMeta(withCues({
      skipped: null,
      failures: {
        timeout: 2,
        // Reasons are open-ended (a provider's own error codes), so the reader
        // validates shape, not vocabulary — but not at unbounded size.
        [`x`.repeat(200)]: 1,
        'not-a-number': 'many',
        negative: -4,
        zero: 0,
        ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`code${i}`, 1])),
      },
      dropped: -7,
    }));
    const failures = hostile?.arbitration?.failures ?? {};
    expect(Object.keys(failures).length).toBeLessThanOrEqual(16);
    expect(failures.timeout).toBe(2);
    expect(failures['not-a-number']).toBeUndefined();
    expect(failures.negative).toBeUndefined();
    expect(failures.zero).toBeUndefined();
    expect(Object.keys(failures).every((key) => key.length <= 40)).toBe(true);
    // A negative count is not a count; it reads as absent, not as a number the
    // UI would render with a minus sign.
    expect(hostile?.arbitration?.dropped).toBeUndefined();
  });

  it('reads an all-invalid breakdown as absent, not as an empty object', () => {
    const parsed = parseFusionTrackMeta(JSON.stringify({
      version: 1,
      arbitration: { skipped: null, failures: { bad: 'x' } },
      cues: [{ index: 0, startSec: 0, endSec: 1, basis: 'whisper', score: 0.5, confidence: 0.7 }],
    }));
    expect(parsed?.arbitration).toBeDefined();
    expect(parsed?.arbitration?.failures).toBeUndefined();
  });
});

describe('fusionCueCounts', () => {
  it('counts every non-agreeing basis as uncertain, which is what a badge shows', () => {
    const meta = parseFusionTrackMeta(JSON.stringify({
      version: 1,
      cues: [
        { index: 0, basis: 'whisper' },
        { index: 1, basis: 'whisper' },
        { index: 2, basis: 'whisper-unverified' },
        { index: 3, basis: 'reference' },
      ],
    }));
    expect(meta && fusionCueCounts(meta)).toEqual({
      total: 4,
      verified: 2,
      corrected: 0,
      unverified: 1,
      unrefereed: 0,
      reference: 1,
      uncertain: 2,
    });
  });

  it('reads F5 bases: an arbiter-kept line is verified, a repaired one is its own count', () => {
    const meta = parseFusionTrackMeta(JSON.stringify({
      version: 2,
      cues: [
        { index: 0, basis: 'whisper' },
        { index: 1, basis: 'whisper-as-is' },
        { index: 2, basis: 'whisper-corrected' },
        { index: 3, basis: 'whisper-unverified' },
      ],
    }));
    expect(meta?.cues).toHaveLength(4);
    expect(meta && fusionCueCounts(meta)).toEqual({
      total: 4,
      verified: 2,
      corrected: 1,
      unverified: 1,
      unrefereed: 0,
      reference: 0,
      // A repaired line is trusted, so it is deliberately not "uncertain" —
      // it gets its own line in the UI instead of inflating the warning.
      uncertain: 1,
    });
  });

  it('never calls an unrefereed line verified — the whisper-only track cannot claim a check', () => {
    const meta = parseFusionTrackMeta(JSON.stringify({
      version: 2,
      cues: [0, 1, 2].map((index) => ({ index, basis: 'whisper-unrefereed' })),
    }));
    expect(meta && fusionCueCounts(meta)).toEqual({
      total: 3,
      // The regression this test exists for: these read `whisper` before the
      // split, so `verified` was 3/3 and the UI said "3 lines, all
      // cross-checked" about a track nothing had cross-checked.
      verified: 0,
      corrected: 0,
      unverified: 0,
      unrefereed: 3,
      reference: 0,
      // Folded into `uncertain` on purpose: a caller that only reads this field
      // still gets an honest answer without knowing the basis vocabulary.
      uncertain: 3,
    });
  });
});

describe('fusionArbitrationStatus', () => {
  /** Throws rather than returning null so the assertions below read as one line. */
  const statusOf = (arbitration: unknown): FusionArbitrationStatus => {
    const meta = parseFusionTrackMeta(JSON.stringify({
      version: 2,
      arbitration,
      cues: [{ index: 0, basis: 'whisper-unverified' }],
    }));
    if (!meta) throw new Error('fixture did not parse');
    return fusionArbitrationStatus(meta);
  };

  it('separates "never asked" from "asked and lost every batch" — the two the bases cannot tell apart', () => {
    // Both of these leave the same single `whisper-unverified` cue behind, which
    // is the whole reason the sidecar records the summary at all.
    expect(statusOf({
      attempted: 0, applied: 0, failedBatches: 0, skipped: 'no-key',
    })).toEqual({ kind: 'off', reason: 'no-key' });
    expect(statusOf({
      attempted: 16, applied: 0, failedBatches: 1, skipped: null,
    })).toEqual({ kind: 'failed', failedBatches: 1 });
  });

  it('a sidecar written before the field says nothing rather than "arbitration did not run"', () => {
    const meta = parseFusionTrackMeta(JSON.stringify({
      version: 1,
      cues: [{ index: 0, basis: 'whisper-unverified' }],
    }));
    expect(meta && fusionArbitrationStatus(meta)).toEqual({ kind: 'unknown' });
  });

  it('reports a half-failed run as partial, and a clean one as ok', () => {
    expect(statusOf({
      attempted: 38, applied: 22, failedBatches: 1, skipped: null,
    })).toEqual({ kind: 'partial', applied: 22, attempted: 38, failedBatches: 1 });
    expect(statusOf({
      attempted: 16, applied: 16, failedBatches: 0, skipped: null,
    })).toEqual({ kind: 'ok', applied: 16, attempted: 16 });
  });

  it('a batch the split retry rescued reads as ok, not as a partial failure', () => {
    // `recovered` is already folded into `applied` and `failedBatches` only
    // counts batches nothing was won back from, so a fully rescued run owes the
    // user no warning — the retry did its job.
    expect(statusOf({
      attempted: 16, applied: 16, failedBatches: 0, skipped: null,
      failures: { 'output-truncated': 1 }, recovered: 16,
    })).toEqual({ kind: 'ok', applied: 16, attempted: 16 });
  });
});

describe('fusionConfidencePercent', () => {
  it('converts the 0-1 mean into the 0-100 score the record field documents', () => {
    // The defect this fixes: 0.52 written straight into `confidence` rendered as
    // "1% match" in the media library, because that surface rounds and appends %.
    expect(fusionConfidencePercent(0.52)).toBe(52);
    expect(fusionConfidencePercent(0)).toBe(0);
    expect(fusionConfidencePercent(0.955)).toBe(96);
  });

  it('clamps rather than emitting an impossible score', () => {
    expect(fusionConfidencePercent(1.4)).toBe(100);
    expect(fusionConfidencePercent(-1)).toBe(0);
  });
});
