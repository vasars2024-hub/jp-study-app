/**
 * What `MediaWorkspaceHost` must hand `SeanimeStudyLibraryPanel` for the analyse row action
 * to be reachable AND observable — Phase 6, closing `analyse-action-unwired-in-production`.
 *
 * ## Why this test exists at all
 *
 * The carried record says the analyse action ships "offered but unsupplied" and that the fix
 * is **one prop**. The button half of that is true and trivial: the row renders its analyse
 * control only when `onAnalyse` is supplied, so with no props the user cannot press anything.
 *
 * The half the record misses is that pressing it has to *change something*, and readiness
 * does not live in the panel. `joinSeanimeStudyLibrary` derives every row's state from the
 * orchestrator document and the readiness fingerprints, both of which the panel takes as
 * props and neither of which it owns. Supply only `onAnalyse` and the analyse path really
 * does run — and every row stays pinned at `unanalyzed` forever, because the document the
 * badge is derived from is still the empty placeholder the panel falls back to.
 *
 * So this pins the join, not the button: the button is a `&&` in JSX and the
 * `renderer/__tests__/seanimeStudyLibraryPanel.test.ts` suite already covers it. What was
 * never covered is the claim the wiring rests on — **that all three props are load-bearing**
 * — and that claim is pure, so it belongs here rather than in a DOM harness.
 *
 * Lives in `src/media/__tests__/` because `vitest.config.ts` collects `src/media/**` as of
 * 2026-08-02. Before that this file could not have run, which is the same reason
 * `directstreamOpenRecovery.ts` and `videoCoreResumeWrite.ts` spent six slices in
 * `src/shared/`.
 */
import { describe, expect, it } from 'vitest';
import {
  joinSeanimeStudyLibrary,
  type SeanimeLibraryFile,
  type StudyReadinessFingerprints,
} from '../../shared/seanimeStudyLibrary';
import {
  STUDY_ANALYZER_VERSION,
  type StudyOrchestratorDocument,
  type StudyReadinessSnapshot,
} from '../../shared/mediaStudyOrchestrator';
import type { MediaItem } from '../../shared/types';

const MEDIA_ID = 'media-frieren-01';
const SUBTITLE_ID = 'sub-ja-1';
const PATH = 'C:/media/Sousou no Frieren - 01.mkv';

/** The one file, as the sidecar reports it. */
const FILE: SeanimeLibraryFile = {
  path: PATH,
  mediaId: 154587,
  episode: 1,
  title: 'Sousou no Frieren',
};

/** The same file, as Study OS holds it, with a Japanese subtitle attached. */
const ITEM = {
  id: MEDIA_ID,
  title: 'Sousou no Frieren 01',
  path: PATH,
  fileName: 'Sousou no Frieren - 01.mkv',
  addedAt: 1_754_000_000_000,
  subtitles: [
    { id: SUBTITLE_ID, lang: 'ja', source: 'embedded', format: 'ass', path: 'subs/ja.ass' },
  ],
} as unknown as MediaItem;

/**
 * What the host resolves from `currentStudyReadinessFingerprints()`. The values are opaque
 * hashes to every consumer; only equality matters, so these are legible stand-ins.
 */
const FINGERPRINTS: StudyReadinessFingerprints = {
  knowledgeFingerprint: 'known-v1',
  levelListsFingerprint: 'levels-v1',
  frequencyListsFingerprint: 'freq-v1',
};

/** What the panel falls back to when the host supplies nothing — the shipped placeholders. */
const NO_DOCUMENT = {
  version: 2,
  readiness: {},
  opportunities: {},
  workspaces: {},
  jobs: {},
  actions: [],
} as unknown as StudyOrchestratorDocument;

const NO_FINGERPRINTS: StudyReadinessFingerprints = {
  knowledgeFingerprint: '',
  levelListsFingerprint: '',
  frequencyListsFingerprint: '',
};

/**
 * The document as it looks after `study:prepare` has run and broadcast `study:changed` —
 * i.e. exactly what the host's subscription pushes back into the panel.
 */
function documentAfterPrepare(
  overrides: Partial<StudyReadinessSnapshot> = {},
): StudyOrchestratorDocument {
  const snapshot: StudyReadinessSnapshot = {
    id: 'readiness-1',
    mediaId: MEDIA_ID,
    analyzerVersion: STUDY_ANALYZER_VERSION,
    generatedAt: 1_754_100_000_000,
    sourceFingerprint: 'source-v1',
    knowledgeFingerprint: FINGERPRINTS.knowledgeFingerprint,
    levelListsFingerprint: FINGERPRINTS.levelListsFingerprint,
    frequencyListsFingerprint: FINGERPRINTS.frequencyListsFingerprint,
    subtitleRecordId: SUBTITLE_ID,
    subtitleReady: true,
    contentLevel: 'N3',
    confidence: 0.8,
    knownCoverage: 0.82,
    uniqueKnownCoverage: 0.7,
    totalWordOccurrences: 4200,
    knownWordOccurrences: 3444,
    unknownUniqueWords: 310,
    recurringUnknownWords: 74,
    category: 'ready-now',
    truncated: false,
    ...overrides,
  };
  return { ...NO_DOCUMENT, readiness: { [snapshot.id]: snapshot } };
}

const stateOf = (
  document: StudyOrchestratorDocument,
  fingerprints: StudyReadinessFingerprints,
): string => {
  const [entry] = joinSeanimeStudyLibrary([FILE], [ITEM], document, fingerprints);
  expect(entry).toBeDefined();
  return entry.state;
};

describe('the readiness panel props MediaWorkspaceHost supplies', () => {
  it('offers the analyse action on a row that has both arguments prepareStudyMediaById needs', () => {
    const [entry] = joinSeanimeStudyLibrary([FILE], [ITEM], NO_DOCUMENT, NO_FINGERPRINTS);
    expect(entry.state).toBe('unanalyzed');
    // The host's `analyse` callback reads exactly these two. A row that renders the button
    // without them would throw the unreachable guard instead of analysing.
    expect(entry.studyMediaId).toBe(MEDIA_ID);
    expect(entry.subtitleRecordId).toBe(SUBTITLE_ID);
  });

  it('transitions the row to ready once the prepared document arrives', () => {
    expect(stateOf(NO_DOCUMENT, FINGERPRINTS)).toBe('unanalyzed');
    expect(stateOf(documentAfterPrepare(), FINGERPRINTS)).toBe('ready');
  });

  /**
   * THE REGRESSION THIS FILE IS FOR. This is the "one prop" wiring: `onAnalyse` supplied,
   * `orchestrator` not. The analyse call still succeeds and the document is still written in
   * the main process — the row simply cannot see it, so the badge never moves and the user
   * gets a button that reports success and changes nothing.
   */
  it('leaves the row pinned at unanalyzed when only onAnalyse is supplied', () => {
    // ONE prepared file, ONE moment in time, read two ways. The only difference between
    // these two lines is whether the host passes the document it already has.
    const prepared = documentAfterPrepare();
    expect(stateOf(prepared, FINGERPRINTS)).toBe('ready');
    expect(stateOf(NO_DOCUMENT, NO_FINGERPRINTS)).toBe('unanalyzed');
  });

  /**
   * The same point stated as the property the host relies on: every `study:changed` document
   * the subscription pushes is read fresh, so the badge is a function of the last broadcast
   * rather than of anything the panel remembers. A host that supplied the document once and
   * never again would pass the test above and still show a stale badge forever.
   */
  it('re-derives the row from whichever document it is given', () => {
    const states = [NO_DOCUMENT, documentAfterPrepare(), NO_DOCUMENT].map(
      (document) => stateOf(document, FINGERPRINTS),
    );
    expect(states).toEqual(['unanalyzed', 'ready', 'unanalyzed']);
  });

  /**
   * And the third prop. With the document but without the host's real fingerprints, a
   * freshly analysed file reads as `stale` — the panel would immediately offer to re-analyse
   * what it had just analysed, which is a worse lie than showing no score at all.
   */
  it('reports a freshly prepared file as stale when the fingerprints are not supplied', () => {
    expect(stateOf(documentAfterPrepare(), NO_FINGERPRINTS)).toBe('stale');
  });

  it('goes stale when the known-word set moves under a prepared file', () => {
    expect(stateOf(documentAfterPrepare(), {
      ...FINGERPRINTS,
      knowledgeFingerprint: 'known-v2',
    })).toBe('stale');
  });

  it('goes stale when the analyzer version moves under a prepared file', () => {
    expect(stateOf(
      documentAfterPrepare({ analyzerVersion: STUDY_ANALYZER_VERSION - 1 }),
      FINGERPRINTS,
    )).toBe('stale');
  });

  /**
   * `prepareStudyMediaById` queues a transcription instead of analysing when no Japanese
   * subtitle is attached, and the row that produces that outcome is `missing-subtitles`,
   * which renders no analyse button at all. Pinned so the two stay consistent: a state that
   * cannot reach the action must not be one the action reports on.
   */
  it('does not offer analyse for a file with no Japanese subtitle', () => {
    const withoutJa = { ...ITEM, subtitles: [] } as unknown as MediaItem;
    const [entry] = joinSeanimeStudyLibrary([FILE], [withoutJa], NO_DOCUMENT, NO_FINGERPRINTS);
    expect(entry.state).toBe('missing-subtitles');
    expect(entry.subtitleRecordId).toBeUndefined();
  });
});
