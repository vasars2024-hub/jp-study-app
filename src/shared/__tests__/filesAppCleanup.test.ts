/**
 * Files app — cleanup classification, the dry run and the guard.
 *
 * Gates 32 and 33. The fixture is deliberately built the way the real index
 * builds: the downloads enumerator stamps `orphan: true` on every file under
 * `downloads/` that `media.json` does not claim, so the user's own downloaded
 * video is an orphan *by construction*. That row is the negative control this
 * whole file exists for — if it ever appears in `candidates`, cleanup can
 * reach five gigabytes of irreplaceable material and gate 33 has failed.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLEANUP_SETTINGS,
  FILES_CLEANUP_CLASS_IDS,
  classifyForCleanup,
  cleanupReportBalances,
  isRelocatable,
  logMatchesPlan,
  normalizeCleanupSettings,
  planFilesCleanup,
  protectionFor,
  resolveCleanupExecution,
  type FilesCleanupInput,
  type FilesCleanupRunResult,
  type FilesCleanupSettings,
} from '../filesApp/cleanup';

const ALL_CLASSES = [...FILES_CLEANUP_CLASS_IDS];

function fileRow(over: Partial<FilesCleanupInput> & { id: string; name: string }): FilesCleanupInput {
  return {
    kind: 'other',
    sizeBytes: 1_024,
    source: 'downloads',
    location: { store: 'file', path: `C:/u/downloads/${over.name}` },
    ...over,
  };
}

/** The measured shape of this profile's `downloads/`: unclaimed, therefore orphan. */
const DOWNLOADED_VIDEO = fileRow({
  id: 'download:Series ep01 [x9QKu3OLjaU].mp4',
  name: 'Series ep01 [x9QKu3OLjaU].mp4',
  kind: 'video',
  sizeBytes: 734_003_200,
  flags: { orphan: true },
});

/**
 * An incomplete artifact, with the kind the main-side sweep gives it: `other`.
 * `extOf('Series ep02.mp4.part')` is `.part`, which is in no media extension
 * set — a fragment is not a video, and calling it one would make the whole
 * partial-downloads class unreachable behind the media guard.
 */
const PART_FILE = fileRow({
  id: 'download:Series ep02.mp4.part',
  name: 'Series ep02.mp4.part',
  kind: 'other',
  sizeBytes: 12_000,
  flags: { orphan: true },
});

const EMPTY_SUBTITLE = fileRow({
  id: 'download:ep03.ja.vtt',
  name: 'ep03.ja.vtt',
  kind: 'subtitle',
  sizeBytes: 0,
  flags: { orphan: true },
});

const ORPHAN_SCRAPE = fileRow({
  id: 'scraper-result:j7',
  name: 'j7',
  kind: 'job',
  sizeBytes: 4_096,
  source: 'scraper-jobs',
  location: { store: 'file', path: 'C:/u/workspaces/scraper/results/j7.json' },
  flags: { orphan: true },
});

/**
 * The exact shape `mediaEnumerator` produces for a moved original: `fileItem`
 * gives it `location.store === 'file'` and adds `brokenLink` when the stat
 * fails, on top of the enumerator's own `referenced: true`. Writing this as a
 * `json` row would have tested a shape the app never emits.
 */
const BROKEN_MEDIA_ROW: FilesCleanupInput = {
  id: 'media:v1',
  name: 'A video whose file was moved',
  kind: 'video',
  sizeBytes: null,
  source: 'media',
  location: { store: 'file', path: 'C:/users/me/videos/Episode 01.mkv' },
  flags: { brokenLink: true, referenced: true },
};

/** A broken link whose owning store has no relocate adapter — scraper output. */
const BROKEN_JOB_ROW: FilesCleanupInput = {
  id: 'scraper-job:j1',
  name: 'A job whose result file is gone',
  kind: 'job',
  sizeBytes: null,
  source: 'scraper-jobs',
  location: { store: 'json', file: 'scraper/index.json', pointer: '/jobs/j1' },
  flags: { brokenLink: true },
};

const DERIVED_ROW: FilesCleanupInput = {
  id: 'stats:streak',
  name: 'Current streak',
  kind: 'stat',
  sizeBytes: null,
  source: 'stats',
  location: { store: 'derived', describes: 'review history' },
  flags: { orphan: true },
};

const LIBRARY: readonly FilesCleanupInput[] = [
  DOWNLOADED_VIDEO,
  PART_FILE,
  EMPTY_SUBTITLE,
  ORPHAN_SCRAPE,
  BROKEN_MEDIA_ROW,
  BROKEN_JOB_ROW,
  DERIVED_ROW,
];

function settings(over: Partial<FilesCleanupSettings> = {}): FilesCleanupSettings {
  return { enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark', ...over };
}

describe('cleanup classification (gate 32)', () => {
  it('puts each row in exactly one class, by precedence', () => {
    // The .part file matches partial-downloads AND orphan-files. It must be
    // counted once, or the class counts stop summing to the candidate count.
    expect(classifyForCleanup(PART_FILE, ALL_CLASSES)).toBe('partial-downloads');
    expect(classifyForCleanup(EMPTY_SUBTITLE, ALL_CLASSES)).toBe('empty-files');
    expect(classifyForCleanup(ORPHAN_SCRAPE, ALL_CLASSES)).toBe('orphan-files');
    expect(classifyForCleanup(BROKEN_MEDIA_ROW, ALL_CLASSES)).toBe('broken-links');
  });

  it('claims nothing for a class that is switched off', () => {
    expect(classifyForCleanup(PART_FILE, ['empty-files'])).toBeNull();
    expect(classifyForCleanup(ORPHAN_SCRAPE, [])).toBeNull();
    // With partial-downloads off it falls through to the next class it matches,
    // rather than disappearing from the report entirely.
    expect(classifyForCleanup(PART_FILE, ['orphan-files'])).toBe('orphan-files');
  });

  it('never classifies a non-file row into a disk class', () => {
    const jsonOrphan: FilesCleanupInput = { ...DERIVED_ROW, location: { store: 'json', file: 'a.json', pointer: '/x' } };
    expect(classifyForCleanup(jsonOrphan, ['orphan-files'])).toBeNull();
  });

  it('reports counts and reclaimable size that balance', () => {
    const report = planFilesCleanup(LIBRARY, settings(), 1_000);
    expect(cleanupReportBalances(report)).toBe(true);
    const partial = report.classes.find((row) => row.classId === 'partial-downloads');
    expect(partial).toMatchObject({ count: 1, reclaimableBytes: 12_000, unknownSizeCount: 0 });
    const empty = report.classes.find((row) => row.classId === 'empty-files');
    expect(empty).toMatchObject({ count: 1, reclaimableBytes: 0, unknownSizeCount: 0 });
  });

  it('counts an unknown size as unknown, not as zero bytes', () => {
    const sizeless = fileRow({ id: 'download:x.srt', name: 'x.srt', kind: 'subtitle', sizeBytes: null, flags: { orphan: true } });
    const report = planFilesCleanup([sizeless], settings(), 1_000);
    const orphans = report.classes.find((row) => row.classId === 'orphan-files');
    expect(orphans).toMatchObject({ count: 1, reclaimableBytes: 0, unknownSizeCount: 1 });
  });
});

describe('the guard (gate 33)', () => {
  it('protects the downloaded video from every class', () => {
    for (const classId of ALL_CLASSES) {
      if (classId === 'broken-links') continue;
      expect(protectionFor(DOWNLOADED_VIDEO, classId, 'mark')).toBe(
        'filesApp.cleanup.protect.irreplaceableMedia',
      );
    }
  });

  it('leaves the video out of candidates with every class enabled and every policy', () => {
    for (const policy of ['mark', 'prompt', 'relocate'] as const) {
      const report = planFilesCleanup(LIBRARY, settings({ brokenLinkPolicy: policy }), 1_000);
      const ids = report.candidates.map((candidate) => candidate.itemId);
      expect(ids).not.toContain(DOWNLOADED_VIDEO.id);
      expect(report.protectedItems.map((row) => row.itemId)).toContain(DOWNLOADED_VIDEO.id);
    }
  });

  it('protects a .part row that CLAIMS to be a video — kind decides, not the class', () => {
    // The conservative direction: if any producer insists a row is media,
    // cleanup declines it even in the class most likely to want it.
    const claimsVideo = { ...PART_FILE, kind: 'video' };
    const report = planFilesCleanup([claimsVideo], settings(), 1_000);
    expect(report.candidates).toHaveLength(0);
    expect(report.protectedItems[0]).toMatchObject({
      itemId: PART_FILE.id,
      classId: 'partial-downloads',
      reasonKey: 'filesApp.cleanup.protect.irreplaceableMedia',
    });
  });

  it('refuses a derived row because there is nothing durable to remove', () => {
    expect(protectionFor(DERIVED_ROW, 'orphan-files', 'mark')).toBe(
      'filesApp.cleanup.protect.nothingToRemove',
    );
  });

  it('does clean genuinely replaceable junk, so the guard is not just "protect everything"', () => {
    const report = planFilesCleanup(LIBRARY, settings(), 1_000);
    const ids = report.candidates.map((candidate) => candidate.itemId);
    expect(ids).toContain(EMPTY_SUBTITLE.id);
    expect(ids).toContain(ORPHAN_SCRAPE.id);
  });

  it('is the same guard the delete path uses — media risk is not re-derived here', () => {
    // Downgrading the kind is the only way to make it removable, which is what
    // "risk comes from the authoritative kind, not a caller field" means.
    const disguised = { ...DOWNLOADED_VIDEO, kind: 'other' };
    expect(protectionFor(disguised, 'orphan-files', 'mark')).toBeNull();
    expect(protectionFor(DOWNLOADED_VIDEO, 'orphan-files', 'mark')).not.toBeNull();
  });

  it('a scheduled run has no separate planner to reach the video through', () => {
    // Gate 33's "including a scheduled run": the scheduled trigger differs only
    // in the label on the result, so there is no second code path to audit.
    const scheduled = planFilesCleanup(LIBRARY, settings({ brokenLinkPolicy: 'prompt' }), 9_999);
    const manual = planFilesCleanup(LIBRARY, settings({ brokenLinkPolicy: 'prompt' }), 1_000);
    expect(scheduled.candidates.map((c) => c.itemId)).toEqual(manual.candidates.map((c) => c.itemId));
    expect(scheduled.candidates.map((c) => c.itemId)).not.toContain(DOWNLOADED_VIDEO.id);
  });
});

describe('broken-link policy (gate 34)', () => {
  it('mark: the record is reported and never removed', () => {
    const report = planFilesCleanup([BROKEN_MEDIA_ROW], settings({ brokenLinkPolicy: 'mark' }), 1_000);
    expect(report.candidates).toHaveLength(0);
    expect(report.protectedItems[0]).toMatchObject({
      itemId: 'media:v1',
      name: 'A video whose file was moved',
      classId: 'broken-links',
      reasonKey: 'filesApp.cleanup.protect.brokenLinkMarked',
      relocatable: false,
    });
  });

  it('prompt: the record becomes removable but demands its own confirmation', () => {
    const report = planFilesCleanup([BROKEN_MEDIA_ROW], settings({ brokenLinkPolicy: 'prompt' }), 1_000);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      itemId: 'media:v1',
      requiresConfirmation: true,
      // The bytes are gone; removing the record is an undoable index action.
      mode: 'soft',
    });
  });

  it('relocate: the record stays, and only a repointable store is offered it', () => {
    const report = planFilesCleanup(
      [BROKEN_MEDIA_ROW, BROKEN_JOB_ROW],
      settings({ brokenLinkPolicy: 'relocate' }),
      1_000,
    );
    expect(report.candidates).toHaveLength(0);
    const byId = new Map(report.protectedItems.map((row) => [row.itemId, row]));
    expect(byId.get('media:v1')?.relocatable).toBe(true);
    expect(byId.get('scraper-job:j1')?.relocatable).toBe(false);
    expect(isRelocatable(BROKEN_JOB_ROW)).toBe(false);
  });

  it('finds exactly the broken record and no neighbour', () => {
    const healthy: FilesCleanupInput = { ...BROKEN_MEDIA_ROW, id: 'media:v2', name: 'Still here', flags: { referenced: true } };
    const report = planFilesCleanup([BROKEN_MEDIA_ROW, healthy], settings({ brokenLinkPolicy: 'prompt' }), 1_000);
    expect(report.candidates.map((c) => c.itemId)).toEqual(['media:v1']);
  });
});

describe('confirmation binding (gate 32, item for item)', () => {
  const policy = settings({ brokenLinkPolicy: 'prompt' });

  it('runs exactly the confirmed intersection', () => {
    const fresh = planFilesCleanup(LIBRARY, policy, 2_000);
    const plan = resolveCleanupExecution(fresh, {
      confirmedItemIds: [EMPTY_SUBTITLE.id, ORPHAN_SCRAPE.id],
      reportBuiltAt: 1_000,
    });
    expect(plan.toRemove.map((c) => c.itemId).sort()).toEqual([EMPTY_SUBTITLE.id, ORPHAN_SCRAPE.id].sort());
    expect(plan.skipped.map((s) => s.itemId)).toContain('media:v1');
    expect(plan.skipped.find((s) => s.itemId === 'media:v1')?.reasonKey).toBe(
      'filesApp.cleanup.skip.notConfirmed',
    );
  });

  it('refuses a stale confirmation for a row that became protected', () => {
    // The user confirmed the broken media row under `prompt`; the policy moved
    // to `mark` before the run. It must be named, not removed.
    const fresh = planFilesCleanup(LIBRARY, settings({ brokenLinkPolicy: 'mark' }), 3_000);
    const plan = resolveCleanupExecution(fresh, { confirmedItemIds: ['media:v1'], reportBuiltAt: 1_000 });
    expect(plan.toRemove).toHaveLength(0);
    expect(plan.skipped.find((s) => s.itemId === 'media:v1')?.reasonKey).toBe(
      'filesApp.cleanup.skip.protectedNow',
    );
  });

  it('refuses a confirmation for a row that vanished between the two plans', () => {
    const fresh = planFilesCleanup([EMPTY_SUBTITLE], policy, 3_000);
    const plan = resolveCleanupExecution(fresh, {
      confirmedItemIds: [ORPHAN_SCRAPE.id],
      reportBuiltAt: 1_000,
    });
    expect(plan.toRemove).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ itemId: ORPHAN_SCRAPE.id, reasonKey: 'filesApp.cleanup.skip.gone' });
    // And the row that IS live but was not confirmed is named separately, so
    // the two situations never share one reason.
    expect(plan.skipped).toContainEqual({
      itemId: EMPTY_SUBTITLE.id,
      reasonKey: 'filesApp.cleanup.skip.notConfirmed',
    });
  });

  it('never removes an unconfirmed candidate, even one needing no confirmation', () => {
    const fresh = planFilesCleanup(LIBRARY, policy, 3_000);
    const plan = resolveCleanupExecution(fresh, { confirmedItemIds: [], reportBuiltAt: 1_000 });
    expect(plan.toRemove).toHaveLength(0);
    expect(plan.skipped).toHaveLength(fresh.candidates.length);
  });
});

describe('the log (gate 35, shape)', () => {
  it('matches the plan item for item, and a failure is not counted as removed', () => {
    const fresh = planFilesCleanup(LIBRARY, settings(), 4_000);
    const plan = resolveCleanupExecution(fresh, {
      confirmedItemIds: [EMPTY_SUBTITLE.id, ORPHAN_SCRAPE.id],
      reportBuiltAt: 4_000,
    });
    const result: FilesCleanupRunResult = {
      ranAt: 4_100,
      trigger: 'manual',
      removedBytes: 4_096,
      skipped: plan.skipped,
      log: plan.toRemove.map((candidate) => ({
        at: 4_100,
        itemId: candidate.itemId,
        name: candidate.name,
        classId: candidate.classId,
        destination: 'recycle-bin',
        path: candidate.location.store === 'file' ? candidate.location.path : undefined,
        sizeBytes: candidate.sizeBytes,
      })),
    };
    expect(logMatchesPlan(plan, result)).toBe(true);

    const withFailure: FilesCleanupRunResult = {
      ...result,
      log: [...result.log.slice(1), { ...result.log[0], destination: 'failed', reasonKey: 'x' }],
    };
    expect(logMatchesPlan(plan, withFailure)).toBe(false);
  });
});

describe('settings', () => {
  it('defaults leave the 5 GB orphan class switched off', () => {
    expect(DEFAULT_CLEANUP_SETTINGS.enabledClasses).not.toContain('orphan-files');
    expect(DEFAULT_CLEANUP_SETTINGS.brokenLinkPolicy).toBe('mark');
  });

  it('normalizes junk to the default rather than trusting it', () => {
    expect(normalizeCleanupSettings(null)).toEqual(DEFAULT_CLEANUP_SETTINGS);
    expect(normalizeCleanupSettings({ enabledClasses: ['nope'], brokenLinkPolicy: 'wipe' })).toEqual({
      enabledClasses: [],
      brokenLinkPolicy: 'mark',
    });
    expect(
      normalizeCleanupSettings({ enabledClasses: ['orphan-files', 'orphan-files'], brokenLinkPolicy: 'relocate' }),
    ).toEqual({ enabledClasses: ['orphan-files'], brokenLinkPolicy: 'relocate' });
  });
});
