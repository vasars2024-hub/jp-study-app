import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FILES_ENUMERATORS,
  buildFilesIndex,
  dictionaryEnumerator,
  type FilesEnumeratorContext,
} from '../filesApp/enumerators';
import { deleteModeFor, revealTargetFor } from '../../shared/filesApp/catalog';

let root = '';

function write(rel: string, contents: string): string {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf-8');
  return full;
}

function ctx(over: Partial<FilesEnumeratorContext> = {}): FilesEnumeratorContext {
  return { userDataPath: root, ...over };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'filesapp-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('files app index — gate 1, a count per category that matches what is there', () => {
  it('enumerates real items across all five groups and counts them exactly', () => {
    write(
      'library.json',
      JSON.stringify([
        { id: 'b1', title: 'Kokoro', kind: 'book', createdAt: 1000, epubFile: 'kokoro.epub' },
        { id: 'm1', title: 'Yotsuba 1', kind: 'manga', createdAt: 2000 },
      ]),
    );
    write('library/b1/kokoro.epub', 'epub bytes');
    fs.mkdirSync(path.join(root, 'library', 'm1'), { recursive: true });

    const videoPath = write('outside/ep1.mkv', 'video bytes');
    const audioPath = write('outside/song.mp3', 'audio bytes');
    write(
      'media.json',
      JSON.stringify({
        items: [
          { id: 'v1', title: 'Episode 1', path: videoPath, kind: 'video', addedAt: 500 },
          { id: 'a1', title: 'Song', path: audioPath, kind: 'audio', addedAt: 600 },
        ],
        relationships: [],
      }),
    );

    write('yt-transcripts/abc123.json', '[]');
    write('yt-transcripts/def456.json', '[]');
    write('yt-subs/video.a.ja.vtt', 'WEBVTT');
    write('yt-subs/movie.ja.srt', '1');

    write('exports/deck-1/cards.csv', 'a,b');
    write('exports/deck-1/deck.apkg', 'zip');

    write('models/whisper/tiny.bin', 'model');
    write('wallpapers/bg.jpg', 'img');
    write('profiles.json', JSON.stringify({ profiles: { p1: { id: 'p1', label: 'Default' } } }));
    write(
      'agent/workspace-v1.json',
      JSON.stringify({ conversations: { w1: { id: 'w1', title: 'Study', createdAt: 20 } } }),
    );

    const snapshot = buildFilesIndex(ctx());
    const by = new Map(snapshot.counts.map((c) => [c.categoryId, c.total]));

    expect(by.get('sources/books')).toBe(1);
    expect(by.get('sources/manga')).toBe(1);
    expect(by.get('sources/video')).toBe(1);
    expect(by.get('sources/audio')).toBe(1);
    expect(by.get('sources/text')).toBe(4); // 2 transcripts + 2 cached subtitles
    expect(by.get('sources')).toBe(8);

    expect(by.get('outputs/exports')).toBe(1);
    expect(by.get('outputs/packages')).toBe(1);
    expect(by.get('outputs')).toBe(2);

    expect(by.get('reference/models')).toBe(1);
    expect(by.get('reference/artwork')).toBe(1);
    expect(by.get('reference')).toBe(2);

    expect(by.get('system/profiles')).toBe(1);
    expect(by.get('workspaces/studies')).toBe(1);

    // All five groups populated, and the item list agrees with the counts.
    // 2 library + 2 media + 2 transcripts + 2 cached subs + 1 csv + 1 apkg
    // + 1 model + 1 wallpaper + 1 profile + 1 workspace.
    expect(snapshot.items.length).toBe(14);
    const summed = snapshot.counts
      .filter((c) => !c.categoryId.includes('/'))
      .reduce((sum, c) => sum + c.total, 0);
    expect(summed).toBe(snapshot.items.length);
  });

  it('an empty profile produces zero items and zero errors, not a crash', () => {
    const snapshot = buildFilesIndex(ctx());
    expect(snapshot.items).toEqual([]);
    expect(snapshot.enumerators.every((r) => r.error === undefined)).toBe(true);
    expect(snapshot.enumerators.map((r) => r.source)).toEqual(
      FILES_ENUMERATORS.map((e) => e.source),
    );
  });

  it('reports the failing enumerator by name instead of blanking the index', () => {
    write('media.json', JSON.stringify({ items: [{ id: 'v1', title: 'kept', path: 'x.mkv' }] }));
    const exploding = {
      source: 'explodes',
      run(): never {
        throw new Error('store unreadable');
      },
    };
    const media = FILES_ENUMERATORS.filter((e) => e.source === 'media');
    expect(media).toHaveLength(1);
    const snapshot = buildFilesIndex(ctx(), [exploding, ...media]);

    const failed = snapshot.enumerators.find((r) => r.source === 'explodes');
    expect(failed?.error).toBe('store unreadable');
    expect(failed?.itemCount).toBe(0);
    // The healthy enumerator still contributed — one bad store is not a blackout.
    expect(snapshot.items.map((i) => i.name)).toEqual(['kept']);
  });

  it('a malformed store reads as empty rather than throwing', () => {
    write('library.json', 'not json at all');
    write('media.json', JSON.stringify({ items: 'not an array' }));
    const snapshot = buildFilesIndex(ctx());
    expect(snapshot.items).toEqual([]);
    expect(snapshot.enumerators.every((r) => r.error === undefined)).toBe(true);
  });

  it('drops a duplicate id so the list and the count cannot disagree', () => {
    const one = {
      source: 'one',
      run: () => [
        {
          id: 'dup',
          name: 'first',
          kind: 'note' as const,
          categoryId: 'outputs/notes' as const,
          provenance: 'app-generated' as const,
          sizeBytes: null,
          createdAt: null,
          modifiedAt: null,
          lastUsedAt: null,
          location: { store: 'derived' as const, describes: 'x' },
          flags: {},
          source: 'one',
        },
      ],
    };
    const two = { ...one, source: 'two', run: () => one.run().map((i) => ({ ...i, name: 'second' })) };
    const snapshot = buildFilesIndex(ctx(), [one, two]);
    expect(snapshot.items.length).toBe(1);
    expect(snapshot.items[0].name).toBe('first');
    expect(snapshot.enumerators.find((r) => r.source === 'two')?.itemCount).toBe(0);
  });
});

/**
 * These four are the shapes the REAL stores use, checked against
 * `%APPDATA%/jp-study-app` on 2026-08-30. Every one of them was originally
 * guessed wrong, and none of the guesses failed loudly — each returned `[]` and
 * gave its category a permanent, plausible zero. Fixtures written by the same
 * hand as the reader cannot catch that, so the shapes are pinned here.
 */
describe('files app index — the real store shapes, not the guessed ones', () => {
  it('reads media.json as { items }, not as a bare array', () => {
    write(
      'media.json',
      JSON.stringify({
        items: [{ id: 'v1', title: 'Ep 1', path: write('o/e.mkv', 'x'), kind: 'video' }],
        relationships: [],
      }),
    );
    const items = buildFilesIndex(ctx()).items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Ep 1');
  });

  it('reads profiles.profiles as a record keyed by id, titled by `label`', () => {
    write(
      'profiles.json',
      JSON.stringify({
        schemaVersion: 3,
        profiles: {
          p1: { id: 'p1', label: 'Japanese' },
          p2: { id: 'p2', label: 'Mandarin' },
        },
      }),
    );
    const items = buildFilesIndex(ctx()).items;
    expect(items.map((i) => i.name).sort()).toEqual(['Japanese', 'Mandarin']);
    // Not the id: 28 real profiles would otherwise render titled with their uuids.
    expect(items.every((i) => i.name !== i.id)).toBe(true);
  });

  it('reads workspaces from agent/workspace-v1.json conversations', () => {
    write(
      'agent/workspace-v1.json',
      JSON.stringify({
        version: 1,
        conversations: { c1: { id: 'c1', title: 'Grammar drill', createdAt: 5, updatedAt: 9 } },
      }),
    );
    const items = buildFilesIndex(ctx()).items;
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('workspace');
    expect(items[0].categoryId).toBe('workspaces/studies');
    expect(items[0].location).toEqual({
      store: 'json',
      file: 'agent/workspace-v1.json',
      pointer: '/conversations/c1',
    });
    expect(items[0].modifiedAt).toBe(9);
  });

  it('still reads library.json as the bare array it actually is', () => {
    write('library.json', JSON.stringify([{ id: 'b1', title: 'Kokoro', kind: 'book' }]));
    expect(buildFilesIndex(ctx()).items.map((i) => i.name)).toEqual(['Kokoro']);
  });

  it('an array-shaped media store is still accepted rather than crashing', () => {
    // Defensive, not aspirational: a store written by an older build must read
    // as empty, not throw and take the whole index down with it.
    write('media.json', JSON.stringify([{ id: 'v1', path: 'x.mkv' }]));
    const snapshot = buildFilesIndex(ctx());
    expect(snapshot.enumerators.find((r) => r.source === 'media')?.error).toBeUndefined();
  });
});

describe('files app index — what each row records', () => {
  it('a file-backed row carries real size and mtime from disk', () => {
    const videoPath = write('outside/ep1.mkv', 'video bytes here');
    write('media.json', JSON.stringify({ items: [{ id: 'v1', title: 'Ep 1', path: videoPath, kind: 'video' }] }));

    const item = buildFilesIndex(ctx()).items[0];
    expect(item.sizeBytes).toBe(fs.statSync(videoPath).size);
    expect(item.modifiedAt).toBeGreaterThan(0);
    expect(revealTargetFor(item.location)).toBe(videoPath);
    expect(deleteModeFor(item.location)).toBe('trash');
  });

  it('a record pointing at a missing file is flagged broken, not dropped (gate 34)', () => {
    write('media.json', JSON.stringify({ items: [{ id: 'v1', title: 'Gone', path: path.join(root, 'nope.mkv') }] }));
    const item = buildFilesIndex(ctx()).items[0];
    expect(item.flags.brokenLink).toBe(true);
    expect(item.sizeBytes).toBeNull();
    expect(item.name).toBe('Gone');
  });

  it('separates auto-captions from human subtitles by the yt-dlp track marker', () => {
    write('yt-subs/clip.a.ja.vtt', 'WEBVTT');
    write('yt-subs/clip.ja.srt', '1');
    const items = buildFilesIndex(ctx()).items;
    const auto = items.find((i) => i.name === 'clip.a.ja.vtt');
    const human = items.find((i) => i.name === 'clip.ja.srt');
    expect(auto?.provenance).toBe('auto-captions');
    expect(human?.provenance).toBe('human-subs');
  });

  /**
   * The gate 1 retraction, as three tests. Each one fails against the reader
   * that shipped on 2026-08-30: it walked `yt-subs` flat, never opened
   * `subs-cache`, and never read `media.json`'s own subtitle records — where 19
   * of the live profile's 19 subtitles actually live.
   */
  it('recurses BOTH YouTube caches, not one of them flat', () => {
    write('yt-subs/playlist-a/clip.a.ja.vtt', 'WEBVTT');
    write('subs-cache/UEqj3RRUlDA/track.ja.srt', '1');

    const names = buildFilesIndex(ctx())
      .items.filter((i) => i.kind === 'subtitle')
      .map((i) => i.name)
      .sort();
    expect(names).toEqual(['clip.a.ja.vtt', 'track.ja.srt']);
  });

  it('reads subtitles from media.json records, including sidecars outside subtitles/', () => {
    const sidecar = write('outside/show.ja.srt', '1');
    write('subtitles/v1/whisper.ja.srt', '1');
    write(
      'media.json',
      JSON.stringify({
        items: [
          {
            id: 'v1',
            title: 'Episode 1',
            path: write('outside/ep1.mkv', 'v'),
            kind: 'video',
            subtitles: [
              {
                id: 's-gen',
                lang: 'ja',
                source: 'generated',
                format: 'srt',
                path: 'subtitles/v1/whisper.ja.srt',
                machineGenerated: true,
                addedAt: 7,
              },
              { id: 's-side', lang: 'ja', source: 'sidecar', format: 'srt', path: sidecar },
            ],
          },
        ],
      }),
    );

    const subs = buildFilesIndex(ctx()).items.filter((i) => i.kind === 'subtitle');
    expect(subs).toHaveLength(2);
    // Provenance comes from the record, never the folder: both files sit in a
    // different place and only `source`/`machineGenerated` knows which is which.
    expect(subs.map((s) => s.provenance).sort()).toEqual(['human-subs', 'whisper-transcript']);
    expect(subs.find((s) => s.provenance === 'whisper-transcript')?.flags.transcribed).toBe(true);
    expect(subs.some((s) => s.location.store === 'file' && s.location.path === sidecar)).toBe(true);
  });

  it('reports a subtitle file no record claims as an orphan instead of dropping it', () => {
    write('subtitles/v1/published.ja.srt', '1');
    write('subtitles/v1/fused-ja.whisper-only.srt', '1');
    write('subtitles/v1/fused-ja.meta.json', '{}');
    write(
      'media.json',
      JSON.stringify({
        items: [
          {
            id: 'v1',
            title: 'Episode 1',
            path: write('outside/ep1.mkv', 'v'),
            kind: 'video',
            subtitles: [
              { id: 'p', lang: 'ja', source: 'provider', format: 'srt', path: 'subtitles/v1/published.ja.srt' },
            ],
          },
        ],
      }),
    );

    const subs = buildFilesIndex(ctx()).items.filter((i) => i.kind === 'subtitle');
    // The published track once, the unclaimed track once, the sidecar metadata
    // never — it is not subtitle text and would inflate the count. A record-backed
    // row is named from the record ("<owner> — <lang>"), an orphan from its file,
    // because an orphan has no owner to name it after.
    expect(subs.map((s) => s.name).sort()).toEqual(['Episode 1 — ja', 'fused-ja.whisper-only.srt']);
    const orphan = subs.find((s) => s.name === 'fused-ja.whisper-only.srt');
    expect(orphan?.flags.orphan).toBe(true);
    // An orphan's provenance is genuinely unknown; guessing it would stamp a
    // fabricated trust mark on whatever gets mined from it.
    expect(orphan?.provenance).toBe('unknown');
    expect(subs.find((s) => s.name === 'Episode 1 — ja')?.flags.orphan).toBeUndefined();
  });

  it('names a transcript by its video title, not by the youtube id (gate 2)', () => {
    write('yt-transcripts/B73sEyA0wbs.json', '[]');
    write('yt-transcripts/gone-from-playlists.json', '[]');
    write(
      'yt-playlists.json',
      JSON.stringify({
        videos: [{ youtubeId: 'B73sEyA0wbs', title: '日本語の歴史' }],
      }),
    );

    const rows = buildFilesIndex(ctx()).items.filter((i) => i.kind === 'transcript');
    const named = rows.find((r) => r.id === 'transcript:B73sEyA0wbs');
    // "findable" is the gate's word, and `B73sEyA0wbs` is not a thing anybody
    // searches for.
    expect(named?.name).toBe('日本語の歴史');
    expect(named?.flags.orphan).toBeUndefined();

    // A transcript whose video left every playlist keeps the raw id and says
    // so, rather than being dropped or given an invented name.
    const orphan = rows.find((r) => r.id === 'transcript:gone-from-playlists');
    expect(orphan?.name).toBe('gone-from-playlists');
    expect(orphan?.flags.orphan).toBe(true);
    expect(orphan?.flags.transcribed).toBe(true);
  });

  it('a transcript is its own row, so a transcribed video is findable without its video (gate 2)', () => {
    write('yt-transcripts/dQw4w9WgXcQ.json', '[]');
    const items = buildFilesIndex(ctx()).items;
    // No media.json at all: nothing to navigate to, and the transcript is still here.
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('transcript');
    expect(items[0].provenance).toBe('whisper-transcript');
    expect(items[0].flags.transcribed).toBe(true);
  });

  it('media rows do not claim a text provenance they cannot know', () => {
    write('media.json', JSON.stringify({ items: [{ id: 'v1', title: 'Ep', path: write('o/e.mkv', 'x') }] }));
    expect(buildFilesIndex(ctx()).items[0].provenance).toBe('unknown');
  });
});

describe('files app index — dictionaries are rows, not files', () => {
  const fakeDb = {
    prepare: () => ({
      all: () => [
        { id: 'jmdict', title: 'JMdict', kind: 'terms', enabled: 1, entry_count: 200000 },
        { id: 'off', title: 'Disabled One', kind: 'terms', enabled: 0, entry_count: 5 },
      ],
    }),
  };

  it('reads the dictionaries table and records a sqlite location', () => {
    const items = dictionaryEnumerator.run(ctx({ openDictionary: () => fakeDb }));
    expect(items.map((i) => i.name)).toEqual(['JMdict', 'Disabled One']);
    expect(items[0].location).toEqual({
      store: 'sqlite',
      database: 'dict.db',
      table: 'dictionaries',
      rowId: 'jmdict',
    });
    expect(items[0].flags.enabled).toBe(true);
    expect(items[1].flags.enabled).toBe(false);
  });

  it('has no reveal target and takes the soft delete path (gates 12 and 21)', () => {
    const item = dictionaryEnumerator.run(ctx({ openDictionary: () => fakeDb }))[0];
    expect(revealTargetFor(item.location)).toBeNull();
    expect(deleteModeFor(item.location)).toBe('soft');
  });

  it('does not borrow entry_count as a byte size', () => {
    const item = dictionaryEnumerator.run(ctx({ openDictionary: () => fakeDb }))[0];
    expect(item.sizeBytes).toBeNull();
  });

  it('an absent database contributes zero rather than failing the index', () => {
    expect(dictionaryEnumerator.run(ctx({ openDictionary: () => null }))).toEqual([]);
    expect(dictionaryEnumerator.run(ctx())).toEqual([]);
  });
});

describe('files app index — enumeration is read-only (gate 24 groundwork)', () => {
  it('leaves every byte and mtime of the walked tree unchanged', () => {
    const paths = [
      write('library.json', JSON.stringify([{ id: 'b1', title: 'B', kind: 'book', epubFile: 'b.epub' }])),
      write('library/b1/b.epub', 'epub'),
      write('yt-transcripts/x.json', '[]'),
      write('models/m.gguf', 'model'),
      write('wallpapers/w.png', 'img'),
    ];
    const before = paths.map((p) => ({
      bytes: fs.readFileSync(p),
      mtime: fs.statSync(p).mtimeMs,
    }));

    buildFilesIndex(ctx());
    buildFilesIndex(ctx());

    paths.forEach((p, i) => {
      expect(fs.readFileSync(p).equals(before[i].bytes)).toBe(true);
      expect(fs.statSync(p).mtimeMs).toBe(before[i].mtime);
    });
  });

  it('creates no files or directories of its own', () => {
    const before = fs.readdirSync(root).sort();
    buildFilesIndex(ctx());
    expect(fs.readdirSync(root).sort()).toEqual(before);
  });
});
