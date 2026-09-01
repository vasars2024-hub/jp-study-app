/**
 * Gates 32, 33, 34 and 35 — cleanup, against real files in a real temp tree.
 *
 * The fixture is not invented. It is the shape `buildFilesIndex` actually
 * produces on this profile: a video sitting in `downloads/` that `media.json`
 * does not claim is stamped `orphan: true` by the downloads enumerator, so
 * "clean up orphan files" is, without a guard, an instruction to delete the
 * user's downloaded video. Every assertion below about that file is made
 * against the bytes on disk after the run, not against a report.
 *
 * `trashItem` is a spy that RECORDS AND MOVES rather than one that silently
 * succeeds: a spy that resolves without doing anything cannot distinguish "the
 * file survived because cleanup refused" from "the file survived because the
 * trash primitive was a no-op". Gate 33's control additionally makes the spy
 * THROW for the video path, so reaching it at all fails loudly.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFilesIndex, type FilesEnumeratorContext } from '../filesApp/enumerators';
import {
  collectCleanupInputs,
  planCleanupInMain,
  relocateBrokenLinkInMain,
  runCleanupInMain,
  sweepIncompleteArtifacts,
  type FilesCleanupMainDependencies,
} from '../filesApp/cleanupIpc';
import {
  FILES_CLEANUP_CLASS_IDS,
  cleanupReportBalances,
  logMatchesPlan,
  resolveCleanupExecution,
  type FilesCleanupLogEntry,
  type FilesCleanupSettings,
} from '../../shared/filesApp/cleanup';
import type { FilesItem } from '../../shared/filesApp/catalog';

let root = '';
/** Where the user keeps their own video, outside userData. */
let outside = '';
/** Stands in for the Recycle Bin so a "trashed" file can be found again. */
let bin = '';

const ALL_CLASSES = [...FILES_CLEANUP_CLASS_IDS];

function write(base: string, rel: string, contents: string): string {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf-8');
  return full;
}

function ctx(): FilesEnumeratorContext {
  return { userDataPath: root };
}

function items(): FilesItem[] {
  return buildFilesIndex(ctx()).items;
}

interface Harness {
  deps: FilesCleanupMainDependencies;
  trashed: string[];
  log: FilesCleanupLogEntry[];
  softDeleted: string[];
  /** How many times the index cache was dropped — only after a real change. */
  invalidations: () => number;
}

function harness(
  settings: FilesCleanupSettings,
  options: { refuseVideo?: string } = {},
): Harness {
  const trashed: string[] = [];
  const log: FilesCleanupLogEntry[] = [];
  const softDeleted: string[] = [];
  let clock = 10_000;
  let invalidated = 0;
  return {
    trashed,
    log,
    softDeleted,
    invalidations: () => invalidated,
    deps: {
      getItems: () => items(),
      userDataPath: () => root,
      trashItem: async (target) => {
        if (options.refuseVideo && path.resolve(target) === path.resolve(options.refuseVideo)) {
          throw new Error(`GATE 33 VIOLATION: cleanup reached ${target}`);
        }
        trashed.push(target);
        fs.renameSync(target, path.join(bin, path.basename(target)));
      },
      softDeleteRow: async (candidate) => {
        softDeleted.push(candidate.itemId);
        return { undoToken: `undo-${candidate.itemId}` };
      },
      readSettings: () => settings,
      invalidate: () => {
        invalidated += 1;
      },
      appendLog: (entries) => log.push(...entries),
      now: () => (clock += 1),
    },
  };
}

/** The measured shape: 3 files in `downloads/`, 1 of which media.json claims. */
function seed(): { video: string; fragment: string; empty: string; claimed: string } {
  const claimed = write(root, path.join('downloads', 'Claimed [aaaaaaaaaaa].mp4'), 'claimed bytes');
  const video = write(root, path.join('downloads', 'Series ep01 [x9QKu3OLjaU].mp4'), 'IRREPLACEABLE');
  const fragment = write(root, path.join('downloads', 'Series ep02.mp4.part'), 'half a download');
  const empty = write(root, path.join('downloads', 'ep03.ja.vtt'), '');
  write(
    root,
    'media.json',
    JSON.stringify({ items: [{ id: 'c1', title: 'Claimed', path: claimed, kind: 'video', addedAt: 1 }] }),
  );
  return { video, fragment, empty, claimed };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'filesapp-clean-'));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'user-video-'));
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-bin-'));
});

afterEach(() => {
  for (const dir of [root, outside, bin]) fs.rmSync(dir, { recursive: true, force: true });
});

describe('gate 33 — cleanup never touches irreplaceable material', () => {
  it('the downloaded video is orphan by construction, which is what makes this a real risk', () => {
    const { video } = seed();
    const row = items().find((item) => item.location.store === 'file' && item.location.path === video);
    expect(row?.flags.orphan).toBe(true);
    expect(row?.kind).toBe('video');
  });

  it('survives every class and every policy, with the trash spy set to throw for it', async () => {
    const { video } = seed();
    for (const policy of ['mark', 'prompt', 'relocate'] as const) {
      const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: policy }, { refuseVideo: video });
      const report = planCleanupInMain(h.deps);
      // Confirm literally everything the app knows about, not just candidates.
      const everything = collectCleanupInputs(h.deps).map((item) => item.id);
      const result = await runCleanupInMain(
        { confirmedItemIds: everything, reportBuiltAt: report.builtAt },
        h.deps,
      );
      expect(result.log.every((entry) => entry.destination !== 'failed')).toBe(true);
      expect(fs.existsSync(video)).toBe(true);
      expect(fs.readFileSync(video, 'utf-8')).toBe('IRREPLACEABLE');
      expect(h.trashed.map((p) => path.resolve(p))).not.toContain(path.resolve(video));
    }
  });

  it('a scheduled run reaches it no more than a manual one — same function, same result', async () => {
    const { video } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'prompt' }, { refuseVideo: video });
    const report = planCleanupInMain(h.deps);
    const everything = collectCleanupInputs(h.deps).map((item) => item.id);
    const result = await runCleanupInMain(
      { confirmedItemIds: everything, reportBuiltAt: report.builtAt },
      h.deps,
      'scheduled',
    );
    expect(result.trigger).toBe('scheduled');
    expect(fs.existsSync(video)).toBe(true);
    expect(h.trashed.map((p) => path.resolve(p))).not.toContain(path.resolve(video));
  });

  it('the claimed video is protected too, and it is never even an orphan', async () => {
    const { claimed, video } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'prompt' }, { refuseVideo: video });
    const everything = collectCleanupInputs(h.deps).map((item) => item.id);
    await runCleanupInMain(
      { confirmedItemIds: everything, reportBuiltAt: planCleanupInMain(h.deps).builtAt },
      h.deps,
    );
    expect(fs.readFileSync(claimed, 'utf-8')).toBe('claimed bytes');
  });
});

describe('gate 32 — cleanup dry-runs before it acts', () => {
  it('the report names the fragment and the empty file, with their real sizes', () => {
    const { fragment, empty } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' });
    const report = planCleanupInMain(h.deps);

    expect(cleanupReportBalances(report)).toBe(true);
    const byClass = new Map(report.classes.map((row) => [row.classId, row]));
    expect(byClass.get('partial-downloads')).toMatchObject({ count: 1, reclaimableBytes: fs.statSync(fragment).size });
    expect(byClass.get('empty-files')).toMatchObject({ count: 1, reclaimableBytes: 0 });
    expect(fs.statSync(empty).size).toBe(0);

    const names = report.candidates.map((candidate) => candidate.name).sort();
    expect(names).toEqual(['Series ep02.mp4.part', 'ep03.ja.vtt']);
  });

  it('removes exactly what the report named, item for item', async () => {
    const { fragment, empty, video } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' }, { refuseVideo: video });
    const report = planCleanupInMain(h.deps);
    const confirmed = report.candidates.map((candidate) => candidate.itemId);

    const plan = resolveCleanupExecution(planCleanupInMain(h.deps), {
      confirmedItemIds: confirmed,
      reportBuiltAt: report.builtAt,
    });
    const result = await runCleanupInMain(
      { confirmedItemIds: confirmed, reportBuiltAt: report.builtAt },
      h.deps,
    );

    expect(logMatchesPlan(plan, result)).toBe(true);
    expect(result.log.map((entry) => entry.name).sort()).toEqual(['Series ep02.mp4.part', 'ep03.ja.vtt']);
    expect(fs.existsSync(fragment)).toBe(false);
    expect(fs.existsSync(empty)).toBe(false);
    // And nothing beyond the report moved.
    expect(h.trashed).toHaveLength(2);
    // The 15-second index cache is dropped, and only because something changed.
    expect(h.invalidations()).toBe(1);
    expect(result.removedBytes).toBe(fs.statSync(path.join(bin, 'Series ep02.mp4.part')).size);
  });

  it('a dry run alone removes nothing', () => {
    const { fragment, empty } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' });
    planCleanupInMain(h.deps);
    planCleanupInMain(h.deps);
    expect(fs.existsSync(fragment)).toBe(true);
    expect(fs.existsSync(empty)).toBe(true);
    expect(h.trashed).toHaveLength(0);
  });

  it('an unconfirmed candidate is named as skipped, not quietly removed', async () => {
    const { fragment, empty } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' });
    const report = planCleanupInMain(h.deps);
    const one = report.candidates.find((candidate) => candidate.name === 'ep03.ja.vtt');
    const result = await runCleanupInMain(
      { confirmedItemIds: [one?.itemId ?? ''], reportBuiltAt: report.builtAt },
      h.deps,
    );
    expect(fs.existsSync(empty)).toBe(false);
    expect(fs.existsSync(fragment)).toBe(true);
    expect(result.skipped.map((skip) => skip.reasonKey)).toContain('filesApp.cleanup.skip.notConfirmed');
  });

  it('the fragment sweep is the reason the .part file is visible at all', () => {
    const { fragment } = seed();
    // The catalogue deliberately does not index it: it is not browsable material.
    expect(items().some((item) => item.name === 'Series ep02.mp4.part')).toBe(false);
    expect(sweepIncompleteArtifacts(root).map((row) => row.name)).toEqual(['Series ep02.mp4.part']);
    expect(sweepIncompleteArtifacts(root)[0].sizeBytes).toBe(fs.statSync(fragment).size);
  });
});

describe('gate 34 — orphan detection is real', () => {
  /** A media row pointing at the user's own file, outside userData. */
  function seedReferenced(): { videoPath: string; otherPath: string } {
    const videoPath = write(outside, 'Episode 01.mkv', 'the user own bytes');
    const otherPath = write(outside, 'Episode 02.mkv', 'another user file');
    write(
      root,
      'media.json',
      JSON.stringify({
        items: [
          { id: 'v1', title: 'Episode 01', path: videoPath, kind: 'video', addedAt: 500 },
          { id: 'v2', title: 'Episode 02', path: otherPath, kind: 'video', addedAt: 600 },
        ],
      }),
    );
    return { videoPath, otherPath };
  }

  it('finds exactly the record whose file was deleted behind the app back, and names it', () => {
    const { videoPath } = seedReferenced();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'prompt' });
    expect(planCleanupInMain(h.deps).candidates).toHaveLength(0);

    fs.rmSync(videoPath);

    const report = planCleanupInMain(h.deps);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      itemId: 'media:v1',
      name: 'Episode 01',
      classId: 'broken-links',
      requiresConfirmation: true,
      mode: 'soft',
    });
  });

  it('mark: the record is reported and nothing is removed', async () => {
    const { videoPath } = seedReferenced();
    fs.rmSync(videoPath);
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' });
    const report = planCleanupInMain(h.deps);

    expect(report.candidates).toHaveLength(0);
    expect(report.protectedItems).toContainEqual(
      expect.objectContaining({ itemId: 'media:v1', reasonKey: 'filesApp.cleanup.protect.brokenLinkMarked' }),
    );
    const result = await runCleanupInMain(
      { confirmedItemIds: ['media:v1'], reportBuiltAt: report.builtAt },
      h.deps,
    );
    expect(result.log).toHaveLength(0);
    expect(h.softDeleted).toHaveLength(0);
    // The record survives, still flagged, so it can be relocated later.
    expect(items().find((item) => item.id === 'media:v1')?.flags.brokenLink).toBe(true);
  });

  it('prompt: confirming it soft-deletes the record and hands back an undo token', async () => {
    const { videoPath } = seedReferenced();
    fs.rmSync(videoPath);
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'prompt' });
    const report = planCleanupInMain(h.deps);
    const result = await runCleanupInMain(
      { confirmedItemIds: ['media:v1'], reportBuiltAt: report.builtAt },
      h.deps,
    );

    expect(h.softDeleted).toEqual(['media:v1']);
    expect(result.log[0]).toMatchObject({ destination: 'index-undo', undoToken: 'undo-media:v1' });
    // A record removal never trashes anything: there is nothing on disk to trash.
    expect(h.trashed).toHaveLength(0);
  });

  it('relocate: the record is repointed at the file the user found again', async () => {
    const { videoPath } = seedReferenced();
    const moved = path.join(outside, 'moved', 'Episode 01.mkv');
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.renameSync(videoPath, moved);

    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'relocate' });
    const before = planCleanupInMain(h.deps);
    expect(before.protectedItems).toContainEqual(
      expect.objectContaining({ itemId: 'media:v1', relocatable: true }),
    );

    const relocated = await relocateBrokenLinkInMain({ itemId: 'media:v1', path: moved }, h.deps);
    expect(relocated).toEqual({ ok: true, itemId: 'media:v1', path: moved });

    // "Does what it says": the row is healthy on the next real index build, and
    // the store on disk carries the new path.
    const row = items().find((item) => item.id === 'media:v1');
    expect(row?.flags.brokenLink).toBeUndefined();
    expect(row?.location).toEqual({ store: 'file', path: moved });
    expect(planCleanupInMain(h.deps).protectedItems).toHaveLength(0);
  });

  it('relocate refuses a target that does not exist, rather than moving the break', async () => {
    const { videoPath } = seedReferenced();
    fs.rmSync(videoPath);
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'relocate' });
    const result = await relocateBrokenLinkInMain(
      { itemId: 'media:v1', path: path.join(outside, 'nowhere.mkv') },
      h.deps,
    );
    expect(result).toEqual({
      ok: false,
      itemId: 'media:v1',
      reasonKey: 'filesApp.cleanup.relocate.missingTarget',
    });
    expect(items().find((item) => item.id === 'media:v1')?.flags.brokenLink).toBe(true);
  });

  it('relocate refuses a healthy row, so a working record cannot be silently repointed', async () => {
    const { otherPath } = seedReferenced();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'relocate' });
    const result = await relocateBrokenLinkInMain({ itemId: 'media:v2', path: otherPath }, h.deps);
    expect(result).toEqual({
      ok: false,
      itemId: 'media:v2',
      reasonKey: 'filesApp.cleanup.relocate.notBroken',
    });
  });

  it('relocate refuses a store with no adapter, naming that rather than failing vaguely', async () => {
    write(
      root,
      path.join('scraper', 'history.json'),
      JSON.stringify({ jobs: [{ id: 'j1', query: 'a job', finishedAt: 1 }] }),
    );
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'relocate' });
    const broken = items().find((item) => item.id === 'scraper-job:j1');
    // The scraper job's result file was never written, so its link is broken.
    expect(broken?.flags.brokenLink).toBe(true);

    const target = write(outside, 'anything.json', '{}');
    const result = await relocateBrokenLinkInMain({ itemId: 'scraper-job:j1', path: target }, h.deps);
    expect(result).toEqual({
      ok: false,
      itemId: 'scraper-job:j1',
      reasonKey: 'filesApp.cleanup.relocate.unsupported',
    });
  });
});

describe('gate 35 — cleanup is logged', () => {
  it('the log names every removed item, its class and its destination', async () => {
    const { fragment, empty, video } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' }, { refuseVideo: video });
    const report = planCleanupInMain(h.deps);
    const result = await runCleanupInMain(
      {
        confirmedItemIds: report.candidates.map((candidate) => candidate.itemId),
        reportBuiltAt: report.builtAt,
      },
      h.deps,
    );

    expect(h.log).toEqual(result.log);
    const byName = new Map(result.log.map((entry) => [entry.name, entry]));
    expect(byName.get('Series ep02.mp4.part')).toMatchObject({
      classId: 'partial-downloads',
      destination: 'recycle-bin',
      path: fragment,
    });
    expect(byName.get('ep03.ja.vtt')).toMatchObject({
      classId: 'empty-files',
      destination: 'recycle-bin',
      path: empty,
    });
    // Every logged destination is where the file actually is now.
    for (const entry of result.log) {
      expect(fs.existsSync(path.join(bin, path.basename(entry.path ?? '')))).toBe(true);
    }
  });

  it('a trash failure is logged as failed and not counted as reclaimed', async () => {
    const { video } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' }, { refuseVideo: video });
    const failing = vi.fn(async () => {
      throw new Error('OS refused');
    });
    const report = planCleanupInMain(h.deps);
    const result = await runCleanupInMain(
      {
        confirmedItemIds: report.candidates.map((candidate) => candidate.itemId),
        reportBuiltAt: report.builtAt,
      },
      { ...h.deps, trashItem: failing },
    );

    expect(failing).toHaveBeenCalledTimes(2);
    expect(result.removedBytes).toBe(0);
    expect(result.log.every((entry) => entry.destination === 'failed')).toBe(true);
    expect(result.log.every((entry) => entry.reasonKey === 'filesApp.cleanup.failed.trash')).toBe(true);
  });

  it('a malformed request removes nothing and logs nothing', async () => {
    const { fragment } = seed();
    const h = harness({ enabledClasses: ALL_CLASSES, brokenLinkPolicy: 'mark' });
    for (const bad of [null, 'x', { confirmedItemIds: 'all' }, { confirmedItemIds: [1] }, { confirmedItemIds: [] }]) {
      await runCleanupInMain(bad, h.deps);
    }
    expect(fs.existsSync(fragment)).toBe(true);
    expect(h.log).toHaveLength(0);
  });
});
