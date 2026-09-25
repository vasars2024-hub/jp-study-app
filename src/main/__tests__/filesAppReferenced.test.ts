/**
 * Gate 30 — referenced items behave.
 *
 *   "Removing a referenced item from the library leaves the user's original
 *    file on disk; moving the original produces a reported broken link rather
 *    than a crash or a silent disappearance."
 *
 * Real files on real disk throughout: `buildFilesIndex` takes an injected
 * context precisely so it can be pointed at a temp tree, and the media rows
 * here point OUTSIDE that tree, which is what "referenced in place" means (the
 * plan's Copy-or-reference decision). A fixture whose bytes live inside
 * userData would prove nothing about the user's own file.
 *
 * The delete half runs the production `deleteFilesItemInMain` with
 * `shell.trashItem` replaced by a spy that RECORDS AND THROWS: the gate is
 * about the user's bytes never being touched, so the strongest assertion is
 * that the trash primitive was never reached at all, and a spy that silently
 * succeeds could hide a call behind a passing result.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFilesIndex, type FilesEnumeratorContext } from '../filesApp/enumerators';
import { deleteFilesItemInMain, lookupFilesDeletionTarget } from '../filesApp/deletionIpc';
import { planFilesDeletion } from '../../shared/filesApp/deletion';
import type { FilesItem } from '../../shared/filesApp/catalog';

let root = '';
/** The user's own directory, deliberately NOT under the app's userData. */
let outside = '';

function write(base: string, rel: string, contents: string): string {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf-8');
  return full;
}

function ctx(): FilesEnumeratorContext {
  return { userDataPath: root };
}

function itemsById(): Map<string, FilesItem> {
  return new Map(buildFilesIndex(ctx()).items.map((i) => [i.id, i]));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'filesapp-ref-'));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'user-media-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

/** One referenced video whose bytes are the user's, plus a bystander. */
function seedReferencedMedia(): { videoPath: string; otherPath: string } {
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

describe('gate 30 — referenced items behave', () => {
  it('marks a media row referenced, and Delete plans an OWNER removal for it', () => {
    seedReferencedMedia();
    const row = itemsById().get('media:v1');

    expect(row).toBeTruthy();
    expect(row?.flags.referenced).toBe(true);
    // File-backed for Open and Reveal...
    expect(row?.location.store).toBe('file');

    // ...but index-backed for Delete. This is the whole gate: a generic
    // `store === 'file'` branch here would trash the user's own bytes.
    const target = lookupFilesDeletionTarget([row as never], 'media:v1');
    expect(target?.referenced).toBe(true);
    // r2files: Delete is real now — the media library's own remove, never a file trash.
    // The next case pins that the user's bytes still never reach trashItem.
    expect(planFilesDeletion(target as never).mode).toBe('owner');
  });

  it('REMOVING it leaves the user original on disk, and never reaches trashItem', async () => {
    const { videoPath, otherPath } = seedReferencedMedia();
    const row = itemsById().get('media:v1');
    expect(fs.existsSync(videoPath)).toBe(true);

    const trashItem = vi.fn(async () => {
      throw new Error('trashItem must never be called for a referenced item');
    });
    const invalidate = vi.fn();
    const result = await deleteFilesItemInMain(
      { itemId: 'media:v1', confirmedItemId: 'media:v1' },
      {
        lookupItem: (id) => lookupFilesDeletionTarget([row as never], id),
        trashItem,
        onTrashed: invalidate,
      },
    );

    // Main refuses by name rather than falling through to a file operation.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasonKey).toBe('filesApp.delete.refuseNotTrashable');
    expect(trashItem).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();

    // The gate's own words: the user's original file is still on disk.
    expect(fs.existsSync(videoPath)).toBe(true);
    expect(fs.readFileSync(videoPath, 'utf-8')).toBe('the user own bytes');
    expect(fs.existsSync(otherPath)).toBe(true);
  });

  it('CONTROL: an UNreferenced file-backed row does reach trashItem', async () => {
    // Same shape, one flag different — so the refusal above is attributable to
    // `referenced` and not to something incidental about media rows.
    const loose = write(outside, 'loose-subtitle.srt', '1\n00:00:01,000 --> 00:00:02,000\nhi\n');
    const target = {
      id: 'subtitle:loose',
      name: 'loose-subtitle.srt',
      kind: 'subtitle',
      location: { store: 'file' as const, path: loose },
      sizeBytes: 40,
      referenced: false,
    };

    // Resolves rather than throwing: this control's point is that the call
    // HAPPENS, so the OS primitive is allowed to succeed here.
    const trashItem = vi.fn(async () => Promise.resolve());
    const invalidate = vi.fn();
    const result = await deleteFilesItemInMain(
      { itemId: 'subtitle:loose', confirmedItemId: 'subtitle:loose' },
      { lookupItem: () => target, trashItem, onTrashed: invalidate },
    );

    expect(result.ok).toBe(true);
    expect(trashItem).toHaveBeenCalledTimes(1);
    expect(trashItem).toHaveBeenCalledWith(loose);
    // And the index cache is dropped only on the branch that changed the disk.
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('MOVING the original reports a broken link — the row stays and says so', () => {
    const { videoPath, otherPath } = seedReferencedMedia();

    const before = itemsById().get('media:v1');
    expect(before?.flags.brokenLink).toBeUndefined();

    // Move it behind the app's back, exactly as the gate describes.
    const moved = path.join(outside, 'moved', 'Episode 01.mkv');
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.renameSync(videoPath, moved);
    expect(fs.existsSync(videoPath)).toBe(false);

    const after = itemsById();
    const row = after.get('media:v1');

    // Not a crash: the index built. Not a silent disappearance: the row is
    // still here, still named, and now carries the flag.
    expect(row).toBeTruthy();
    expect(row?.name).toBe('Episode 01');
    expect(row?.flags.brokenLink).toBe(true);

    // The untouched neighbour is the control: rebuilding did not flag
    // everything, only the row whose file actually moved.
    expect(after.get('media:v2')?.flags.brokenLink).toBeUndefined();
    expect(fs.existsSync(otherPath)).toBe(true);
  });

  it('a broken link CLEARS when the file comes back', () => {
    const { videoPath } = seedReferencedMedia();
    const moved = path.join(outside, 'Episode 01.moved.mkv');
    fs.renameSync(videoPath, moved);
    expect(itemsById().get('media:v1')?.flags.brokenLink).toBe(true);

    fs.renameSync(moved, videoPath);
    // Derived per build from the filesystem, never persisted — a stored flag
    // would leave the row broken forever after the user put the file back.
    expect(itemsById().get('media:v1')?.flags.brokenLink).toBeUndefined();
  });
});
