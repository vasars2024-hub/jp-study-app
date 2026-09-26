/**
 * A subtitle file beside a library video that the library has not attached has
 * a row in the Files app (audit 4), so "Make a sentence deck" can be reached
 * from it — before, `Show - 01.ja.srt` next to `Show - 01.mkv` was simply not
 * listed until discovery attached it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFilesIndex } from '../filesApp/enumerators';

let root = '';

function write(rel: string, contents: string): string {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf-8');
  return full;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'filesapp-sidecar-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('subtitles beside a library video', () => {
  it('an unattached sidecar is a subtitle row with human-subtitle provenance', () => {
    const video = write('anime/Show - 01.mkv', 'v');
    const ja = write('anime/Show - 01.ja.srt', '1');
    const auto = write('anime/Show - 01.a.en.vtt', 'WEBVTT');
    write('anime/Other - 05.ja.srt', '1');
    write('anime/notes.txt', 'x');
    write('media.json', JSON.stringify({ items: [{ id: 'v1', title: 'Show 01', path: video, kind: 'video' }] }));

    const subs = buildFilesIndex({ userDataPath: root }).items.filter((item) => item.kind === 'subtitle');
    const byPath = new Map(subs.map((item) => [item.location.store === 'file' ? item.location.path : '', item]));
    expect([...byPath.keys()].sort()).toEqual([auto, ja].sort());
    expect(byPath.get(ja)).toMatchObject({ name: 'Show - 01.ja.srt', provenance: 'human-subs', source: 'sidecars' });
    expect(byPath.get(ja)?.flags.referenced).toBe(true);
    // yt-dlp's `a.<lang>` marker is a machine caption.
    expect(byPath.get(auto)?.provenance).toBe('auto-captions');
  });

  it('a sidecar the library already attached keeps its record row, once', () => {
    const video = write('anime/Show - 01.mkv', 'v');
    const ja = write('anime/Show - 01.ja.srt', '1');
    write('media.json', JSON.stringify({
      items: [{
        id: 'v1', title: 'Show 01', path: video, kind: 'video',
        subtitles: [{ id: 's1', lang: 'ja', source: 'sidecar', format: 'srt', path: ja, external: true, addedAt: 1 }],
      }],
    }));
    const subs = buildFilesIndex({ userDataPath: root }).items.filter((item) => item.kind === 'subtitle');
    expect(subs).toHaveLength(1);
    expect(subs[0].source).toBe('subtitles');
  });

  it('a video folder that cannot be read contributes nothing rather than failing the index', () => {
    write('media.json', JSON.stringify({ items: [{ id: 'v1', title: 'Gone', path: path.join(root, 'missing', 'Gone.mkv'), kind: 'video' }] }));
    const index = buildFilesIndex({ userDataPath: root });
    expect(index.items.filter((item) => item.kind === 'subtitle')).toEqual([]);
    expect(index.enumerators.find((report) => report.source === 'sidecars')?.error).toBeUndefined();
  });
});
