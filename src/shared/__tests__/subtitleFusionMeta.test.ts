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
  fusionConfidencePercent,
  fusionCueCounts,
  fusionMetaPathFor,
  parseFusionTrackMeta,
  serializeFusionTrackMeta,
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

  it('carries the sync gate result so a track fused unshifted says so', () => {
    const decisions = decideFusedWindows(windows.map(() => 'テキスト'), windows.map(() => ''));
    const declined = buildFusionTrackMeta(windows, cues, decisions, {
      ...track,
      offsetSec: 0,
      offsetConfident: false,
    });
    expect(declined).toMatchObject({ offsetSec: 0, offsetConfident: false, version: 1 });
  });

  it('declares version 2 only for a track F5 actually arbitrated', () => {
    const offline = decideFusedWindows(windows.map(() => 'テキスト'), windows.map(() => ''));
    // An offline-only sidecar contains nothing a v1 reader would misread, so it
    // stays v1 and older builds keep showing its badges.
    expect(buildFusionTrackMeta(windows, cues, offline, track).version).toBe(1);

    const arbitrated: FusedWindowDecision[] = offline.map((decision, index) => (index === 1
      ? { ...decision, basis: 'whisper-corrected' as const, confidence: 0.75 }
      : decision));
    expect(buildFusionTrackMeta(windows, cues, arbitrated, track).version)
      .toBe(FUSION_META_VERSION);
    expect(FUSION_META_VERSION).toBe(2);
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
      reference: 0,
      // A repaired line is trusted, so it is deliberately not "uncertain" —
      // it gets its own line in the UI instead of inflating the warning.
      uncertain: 1,
    });
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
