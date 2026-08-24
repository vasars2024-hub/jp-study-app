// @vitest-environment node
//
// Attaching harvested cue text to a library item — MAL pipeline gate 31.
//
// The subs-only route (jimaku/nyaa on a catalogue entry, no video anywhere)
// could mine and export but had no way to reach the player, because every other
// path into a `SubtitleRecord` starts from a media item the user already owns.
// `attachSubtitleText` is that reverse route, and what it must not do is as
// load-bearing as what it must: it writes only text it was handed, it refuses a
// format the player cannot read, and a refusal writes nothing to disk.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MediaItem } from '../../shared/types';
import {
  ATTACHABLE_SUBTITLE_FORMATS,
  MAX_ATTACHED_SUBTITLE_BYTES,
  normalizeSubtitleAttachText,
} from '../../shared/subtitleDiscoveryIpc';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subattach-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const { attachSubtitleText, registerSubtitleDiscoveryIpc } = await import('../subtitleDiscovery');

const CUES = '1\n00:00:01,000 --> 00:00:03,000\nこんにちは、世界。\n';

let items: MediaItem[] = [];
let patches: { ids: readonly string[]; patch: Partial<MediaItem> }[] = [];

const mediaItem = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: 'm1',
  title: 'JoJo no Kimyou na Bouken - 01',
  path: 'C:/media/jojo-01.mkv',
  fileName: 'jojo-01.mkv',
  addedAt: 1,
  ...over,
} as MediaItem);

/** Every file the attach cache holds for one item, absolute. */
function cachedFiles(mediaId: string): string[] {
  const dir = path.join(tmpRoot, 'subtitles', mediaId.replace(/[^a-zA-Z0-9_-]/g, ''));
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

beforeEach(() => {
  items = [mediaItem()];
  patches = [];
  registerSubtitleDiscoveryIpc({
    listItems: () => items,
    patchItems: (ids, patch) => { patches.push({ ids, patch }); },
  });
  fs.rmSync(path.join(tmpRoot, 'subtitles'), { recursive: true, force: true });
});

describe('normalizeSubtitleAttachText', () => {
  it('settles every field a caller left out', () => {
    const result = normalizeSubtitleAttachText({ mediaId: ' m1 ', text: CUES, format: '.SRT' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The dot and the case come off the format, the id is trimmed, and the
    // language defaults rather than arriving empty at the record.
    expect(result.value).toMatchObject({ mediaId: 'm1', format: 'srt', lang: 'ja' });
    expect(result.value.label).toBe('Harvested SRT');
    expect(result.value.providerId).toBe('harvest');
  });

  it('accepts exactly the formats the player reads, and no others', () => {
    for (const format of ATTACHABLE_SUBTITLE_FORMATS) {
      expect(normalizeSubtitleAttachText({ mediaId: 'm1', text: CUES, format }).ok).toBe(true);
    }
    // `lrc` IS a SubtitleRecordFormat — it is the lyrics container the
    // transcription path writes — and it is still refused here, because no
    // subtitle index serves one and offering it would name a format no harvest
    // can produce.
    for (const format of ['lrc', 'zip', 'txt', 'sub', '']) {
      const result = normalizeSubtitleAttachText({ mediaId: 'm1', text: CUES, format });
      expect(result.ok, format || '(empty)').toBe(false);
    }
  });

  it('refuses the three empties with a sentence each, not a boolean', () => {
    const cases = [
      [{ text: CUES, format: 'srt' }, 'No library item'],
      [{ mediaId: 'm1', text: '   \n ', format: 'srt' }, 'holds no text'],
      [{ mediaId: 'm1', text: CUES, format: 'srt', extra: 1 }, null],
    ] as const;
    expect(normalizeSubtitleAttachText(cases[0][0]).ok).toBe(false);
    expect(normalizeSubtitleAttachText(cases[1][0]).ok).toBe(false);
    // An unknown extra field is ignored, not fatal — the renderer is allowed to
    // send more than main reads.
    expect(normalizeSubtitleAttachText(cases[2][0]).ok).toBe(true);
    expect(normalizeSubtitleAttachText(undefined).ok).toBe(false);
  });

  it('measures the cap in bytes, not characters', () => {
    // Japanese is 3 bytes per character in UTF-8, so a UTF-16 length check
    // would let a file ~3x the cap through. Just over a third of the cap in
    // characters is over the cap in bytes.
    const over = 'あ'.repeat(Math.floor(MAX_ATTACHED_SUBTITLE_BYTES / 3) + 10);
    expect(over.length).toBeLessThan(MAX_ATTACHED_SUBTITLE_BYTES);
    expect(normalizeSubtitleAttachText({ mediaId: 'm1', text: over, format: 'srt' }).ok).toBe(false);
  });
});

describe('attachSubtitleText', () => {
  it('writes the cues to disk and patches the item with a provider record', () => {
    const result = attachSubtitleText({
      mediaId: 'm1',
      text: CUES,
      format: 'ass',
      label: 'JOJO5_textjp-an8',
      providerId: 'nyaa',
      providerItemId: 'nyaa:12345',
    });
    expect(result.ok).toBe(true);
    expect(result.lang).toBe('ja');

    const written = cachedFiles('m1');
    expect(written).toHaveLength(1);
    // The bytes on disk are the bytes handed in — nothing re-serialised them.
    expect(fs.readFileSync(written[0], 'utf-8')).toBe(CUES);
    expect(path.extname(written[0])).toBe('.ass');

    expect(patches).toHaveLength(1);
    expect(patches[0].ids).toEqual(['m1']);
    const record = patches[0].patch.subtitles?.[0];
    expect(record).toMatchObject({
      lang: 'ja',
      source: 'provider',
      format: 'ass',
      providerId: 'nyaa',
      providerItemId: 'nyaa:12345',
      label: 'JOJO5_textjp-an8',
    });
    expect(record?.path).toContain('subtitles');
  });

  it('keeps the tracks an item already has', () => {
    items = [mediaItem({
      subtitles: [{
        id: 'existing', lang: 'en', source: 'embedded', format: 'srt', path: 'subtitles/m1/a.srt', addedAt: 1,
      }],
    })];
    expect(attachSubtitleText({ mediaId: 'm1', text: CUES, format: 'srt' }).ok).toBe(true);
    expect(patches[0].patch.subtitles).toHaveLength(2);
    expect(patches[0].patch.subtitles?.[0].id).toBe('existing');
  });

  it('refuses an item the library does not hold, and writes nothing', () => {
    const result = attachSubtitleText({ mediaId: 'ghost', text: CUES, format: 'srt' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('no longer in the library');
    expect(patches).toHaveLength(0);
    expect(cachedFiles('ghost')).toHaveLength(0);
  });

  // The negative control this gate needs: a refusal must not leave a file
  // behind. A rejected format that still wrote its bytes would look identical
  // from the UI to one that was never sent.
  it('writes nothing at all when the format is refused', () => {
    const result = attachSubtitleText({ mediaId: 'm1', text: CUES, format: 'zip' });
    expect(result.ok).toBe(false);
    expect(cachedFiles('m1')).toHaveLength(0);
    expect(patches).toHaveLength(0);
  });

  it('gives two attaches of the same episode distinct files', () => {
    expect(attachSubtitleText({ mediaId: 'm1', text: CUES, format: 'srt' }).ok).toBe(true);
    expect(attachSubtitleText({ mediaId: 'm1', text: CUES, format: 'srt' }).ok).toBe(true);
    // Two records, two files: overwriting the first would silently replace a
    // track the user may still be using.
    expect(cachedFiles('m1')).toHaveLength(2);
    expect(patches[1].patch.subtitles?.[0].id).not.toBe(patches[0].patch.subtitles?.[0].id);
  });
});
