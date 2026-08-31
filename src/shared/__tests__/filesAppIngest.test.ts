/**
 * Gate 27's model, and gate 36's.
 *
 * Gate 27: "Ambiguity goes to review, not into the library. A file the router
 * settles only by guessing lands in the review queue; a high-confidence match
 * may auto-import."
 *
 * Gate 36: "With subtitles set to auto-import and video set to review, a folder
 * containing both routes each one differently in a single scan."
 *
 * The real-file demonstration both gates ask for lives in
 * `main/__tests__/filesAppIngest.test.ts`, which runs the production
 * `planForPath` over fixtures on disk. This file pins the decision table, so a
 * change of policy fails here with a name rather than in a fixture walk.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INGEST_SETTINGS,
  INGEST_AUTO_CATEGORY,
  INGEST_AUTO_EVERYTHING,
  INGEST_AUTO_HIGH_CONFIDENCE,
  INGEST_REFUSED_NO_DESTINATION,
  INGEST_REVIEW_ALWAYS,
  INGEST_REVIEW_AMBIGUOUS,
  INGEST_REVIEW_CATEGORY,
  INGEST_REVIEW_GUESSED,
  INGEST_SETTINGS_ERROR_STABILITY_RANGE,
  dispositionFor,
  ingestPlanBalances,
  isHighConfidence,
  normalizeIngestSettings,
  planIngest,
  setIngestCategoryPolicy,
  setIngestConfidence,
  setIngestStabilityMs,
  type IngestSettings,
} from '../filesApp/ingest';
import { MAX_STABILITY_MS, DEFAULT_STABILITY_MS } from '../filesApp/stability';
import type { FilesScanEntry } from '../filesApp/scan';
import type { DropConfidence, DropTargetId } from '../fileRouting';

function entry(
  over: Partial<FilesScanEntry> & {
    target: DropTargetId;
    confidence: DropConfidence;
  },
): FilesScanEntry {
  return {
    path: over.path ?? `C:/fixtures/${over.target}.bin`,
    name: over.name ?? `${over.target}.bin`,
    sizeBytes: over.sizeBytes ?? 1024,
    target: over.target,
    confidence: over.confidence,
    reasonKey: over.reasonKey ?? 'fileDrop.reason.subtitle',
    candidateCount: over.candidateCount ?? 1,
    settlement: over.settlement ?? 'placed',
  };
}

describe('gate 27 — the disposition table', () => {
  it('auto-imports one exact candidate', () => {
    const d = dispositionFor(entry({ target: 'subtitle', confidence: 'exact' }));
    expect(d.disposition).toBe('auto');
    expect(d.reasonKey).toBe(INGEST_AUTO_HIGH_CONFIDENCE);
    expect(d.warned).toBe(false);
  });

  /*
   * The finding this gate turns on. `likely` with one candidate is `placed` by
   * gate 23's arithmetic, so reusing the settlement as the auto-import test
   * would import every guess. `.csv` -> deck-csv is exactly that shape.
   */
  it('sends a GUESS to review even though the scan called it placed', () => {
    const guessed = entry({
      target: 'deck-csv',
      confidence: 'likely',
      settlement: 'placed',
    });
    expect(guessed.settlement).toBe('placed');
    const d = dispositionFor(guessed);
    expect(d.disposition).toBe('review');
    expect(d.reasonKey).toBe(INGEST_REVIEW_GUESSED);
  });

  it('sends an ambiguous file to review with the ambiguity named', () => {
    const d = dispositionFor(
      entry({
        target: 'library-manga',
        confidence: 'ambiguous',
        candidateCount: 2,
        settlement: 'ambiguous',
      }),
    );
    expect(d.disposition).toBe('review');
    expect(d.reasonKey).toBe(INGEST_REVIEW_AMBIGUOUS);
  });

  it('reviews an exact candidate that is one of several', () => {
    // `exact` first but two candidates means the router also thinks something
    // else is possible. That is a choice, not an answer.
    const d = dispositionFor(
      entry({ target: 'library-book', confidence: 'exact', candidateCount: 2 }),
    );
    expect(d.disposition).toBe('review');
    expect(d.reasonKey).toBe(INGEST_REVIEW_AMBIGUOUS);
  });

  it('refuses a file with no destination rather than queueing it', () => {
    const d = dispositionFor(
      entry({ target: 'unknown', confidence: 'ambiguous', settlement: 'unplaced' }),
    );
    expect(d.disposition).toBe('refused');
    expect(d.reasonKey).toBe(INGEST_REFUSED_NO_DESTINATION);
  });

  it('isHighConfidence needs both halves', () => {
    expect(isHighConfidence({ target: 'subtitle', confidence: 'exact', candidateCount: 1 })).toBe(true);
    expect(isHighConfidence({ target: 'subtitle', confidence: 'exact', candidateCount: 2 })).toBe(false);
    expect(isHighConfidence({ target: 'subtitle', confidence: 'likely', candidateCount: 1 })).toBe(false);
    expect(isHighConfidence({ target: 'unknown', confidence: 'exact', candidateCount: 1 })).toBe(false);
  });
});

describe('the confidence policy', () => {
  it('always-review sends even an exact match to review', () => {
    const settings: IngestSettings = { ...DEFAULT_INGEST_SETTINGS, confidence: 'always-review' };
    const d = dispositionFor(entry({ target: 'subtitle', confidence: 'exact' }), settings);
    expect(d.disposition).toBe('review');
    expect(d.reasonKey).toBe(INGEST_REVIEW_ALWAYS);
  });

  it('everything promotes a guess AND flags that it did', () => {
    const settings: IngestSettings = { ...DEFAULT_INGEST_SETTINGS, confidence: 'everything' };
    const d = dispositionFor(
      entry({ target: 'library-manga', confidence: 'ambiguous', candidateCount: 2 }),
      settings,
    );
    expect(d.disposition).toBe('auto');
    expect(d.reasonKey).toBe(INGEST_AUTO_EVERYTHING);
    expect(d.warned).toBe(true);
  });

  it('everything still refuses a file with no destination', () => {
    // The escape hatch widens what may be guessed at. It does not invent a home.
    const settings: IngestSettings = { ...DEFAULT_INGEST_SETTINGS, confidence: 'everything' };
    const d = dispositionFor(
      entry({ target: 'unknown', confidence: 'ambiguous', settlement: 'unplaced' }),
      settings,
    );
    expect(d.disposition).toBe('refused');
  });
});

describe('gate 36 — per-category overrides', () => {
  const settings: IngestSettings = {
    ...DEFAULT_INGEST_SETTINGS,
    byTarget: { subtitle: 'auto', media: 'review' },
  };

  it('routes a subtitle and a video differently under one settings object', () => {
    const sub = dispositionFor(entry({ target: 'subtitle', confidence: 'exact' }), settings);
    const vid = dispositionFor(entry({ target: 'media', confidence: 'exact' }), settings);
    expect(sub.disposition).toBe('auto');
    expect(sub.reasonKey).toBe(INGEST_AUTO_CATEGORY);
    expect(vid.disposition).toBe('review');
    expect(vid.reasonKey).toBe(INGEST_REVIEW_CATEGORY);
  });

  it('a category set to auto still cannot promote a guess', () => {
    // The decision that keeps gate 36 from repealing gate 27: `auto` narrows,
    // it never widens. Only the global `everything` policy widens, and it warns.
    const guessy: IngestSettings = { ...DEFAULT_INGEST_SETTINGS, byTarget: { 'deck-csv': 'auto' } };
    const d = dispositionFor(entry({ target: 'deck-csv', confidence: 'likely' }), guessy);
    expect(d.disposition).toBe('review');
    expect(d.reasonKey).toBe(INGEST_REVIEW_GUESSED);
  });

  it('a category set to review beats an exact match, and beats everything', () => {
    const both: IngestSettings = {
      ...DEFAULT_INGEST_SETTINGS,
      confidence: 'everything',
      byTarget: { media: 'review' },
    };
    expect(dispositionFor(entry({ target: 'media', confidence: 'exact' }), both).disposition).toBe(
      'review',
    );
  });
});

describe('planIngest', () => {
  const entries: FilesScanEntry[] = [
    entry({ target: 'subtitle', confidence: 'exact', path: 'a.srt' }),
    entry({ target: 'media', confidence: 'exact', path: 'b.mkv' }),
    entry({ target: 'deck-csv', confidence: 'likely', path: 'c.csv' }),
    entry({
      target: 'library-manga',
      confidence: 'ambiguous',
      candidateCount: 2,
      settlement: 'ambiguous',
      path: 'd.png',
    }),
    entry({ target: 'unknown', confidence: 'ambiguous', settlement: 'unplaced', path: 'e.xyz' }),
  ];

  it('puts every considered file in exactly one pile', () => {
    const plan = planIngest({ entries });
    expect(plan.autoCount).toBe(2);
    expect(plan.reviewCount).toBe(2);
    expect(plan.refusedCount).toBe(1);
    expect(ingestPlanBalances({ entries }, plan)).toBe(true);
    expect(plan.warnedCount).toBe(0);
  });

  it('attaches the choices only where there is genuinely a choice', () => {
    const candidates = new Map([
      [
        'd.png',
        [
          { target: 'wallpaper' as DropTargetId, confidence: 'ambiguous' as DropConfidence, reasonKey: 'x' },
          { target: 'library-manga' as DropTargetId, confidence: 'ambiguous' as DropConfidence, reasonKey: 'y' },
        ],
      ],
      [
        'c.csv',
        [{ target: 'deck-csv' as DropTargetId, confidence: 'likely' as DropConfidence, reasonKey: 'z' }],
      ],
    ]);
    const plan = planIngest({ entries }, DEFAULT_INGEST_SETTINGS, candidates);
    const byPath = new Map(plan.review.map((i) => [i.entry.path, i]));
    expect(byPath.get('d.png')?.choices?.map((c) => c.target)).toEqual([
      'wallpaper',
      'library-manga',
    ]);
    expect(byPath.get('c.csv')?.choices).toBeUndefined();
  });

  it('counts the warned rows when everything is promoted', () => {
    const plan = planIngest({ entries }, { ...DEFAULT_INGEST_SETTINGS, confidence: 'everything' });
    expect(plan.autoCount).toBe(4);
    expect(plan.refusedCount).toBe(1);
    // c.csv and d.png were guesses; a.srt and b.mkv were certain.
    expect(plan.warnedCount).toBe(2);
  });
});

describe('normalizeIngestSettings', () => {
  it('falls back to the defaults on rubbish', () => {
    expect(normalizeIngestSettings(null)).toEqual(DEFAULT_INGEST_SETTINGS);
    expect(normalizeIngestSettings({ confidence: 'yes-please' }).confidence).toBe('high-confidence');
    expect(normalizeIngestSettings({ stabilityMs: 'soon' }).stabilityMs).toBe(DEFAULT_STABILITY_MS);
  });

  it('clamps the stability window at both ends and drops inherit rows', () => {
    expect(normalizeIngestSettings({ stabilityMs: -5000 }).stabilityMs).toBe(0);
    expect(normalizeIngestSettings({ stabilityMs: 9e9 }).stabilityMs).toBe(MAX_STABILITY_MS);
    expect(
      normalizeIngestSettings({ byTarget: { subtitle: 'auto', media: 'inherit', nope: 'auto' } })
        .byTarget,
    ).toEqual({ subtitle: 'auto', nope: 'auto' });
  });

  it('a stability window of 0 does not become an auto-import policy', () => {
    // Gate 31's lower bound, restated where somebody would look for it: the
    // clamp allows 0, and 0 still cannot bypass the completeness check because
    // that check is clause order in `stabilityVerdict`, not a minimum here.
    const s = normalizeIngestSettings({ stabilityMs: 0 });
    expect(s.stabilityMs).toBe(0);
    expect(s.confidence).toBe('high-confidence');
  });
});

describe('the settings writers — gate 31 and 36 as a "set to"', () => {
  it('a writer never mutates the document it was handed', () => {
    // The store loads, applies and saves; an operation that mutated in place
    // would leave the fallback and the stored copy agreeing on a value nobody
    // committed, which is how a refused change appears to have landed.
    const doc: IngestSettings = { confidence: 'high-confidence', byTarget: {}, stabilityMs: 3_000 };
    setIngestStabilityMs(doc, 9_000);
    setIngestConfidence(doc, 'always-review');
    setIngestCategoryPolicy(doc, 'subtitle', 'auto');
    expect(doc).toEqual({ confidence: 'high-confidence', byTarget: {}, stabilityMs: 3_000 });
  });

  it('the writer REFUSES what the parser clamps — the pair is deliberate', () => {
    const doc = DEFAULT_INGEST_SETTINGS;
    expect(setIngestStabilityMs(doc, 9e9).errorKey).toBe(INGEST_SETTINGS_ERROR_STABILITY_RANGE);
    expect(normalizeIngestSettings({ stabilityMs: 9e9 }).stabilityMs).toBe(MAX_STABILITY_MS);
    expect(setIngestStabilityMs(doc, -1).errorKey).toBe(INGEST_SETTINGS_ERROR_STABILITY_RANGE);
    expect(normalizeIngestSettings({ stabilityMs: -1 }).stabilityMs).toBe(0);
  });

  it('an unchanged value hands back the SAME document, so nothing churns', () => {
    const doc: IngestSettings = { confidence: 'high-confidence', byTarget: {}, stabilityMs: 3_000 };
    expect(setIngestStabilityMs(doc, 3_000).doc).toBe(doc);
    expect(setIngestConfidence(doc, 'high-confidence').doc).toBe(doc);
    expect(setIngestCategoryPolicy(doc, 'subtitle', 'inherit').doc).toBe(doc);
  });

  it('the two overrides gate 36 names round-trip through the writers', () => {
    const one = setIngestCategoryPolicy(DEFAULT_INGEST_SETTINGS, 'subtitle', 'auto').doc;
    const two = setIngestCategoryPolicy(one, 'media', 'review').doc;
    expect(two.byTarget).toEqual({ subtitle: 'auto', media: 'review' });
    // And the routing they produce is the gate's own sentence.
    expect(dispositionFor(entry({ target: 'subtitle', confidence: 'exact' }), two).disposition).toBe(
      'auto',
    );
    expect(dispositionFor(entry({ target: 'media', confidence: 'exact' }), two).disposition).toBe(
      'review',
    );
  });
});
