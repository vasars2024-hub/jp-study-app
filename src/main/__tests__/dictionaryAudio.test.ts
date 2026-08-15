// @vitest-environment node
//
// The claim under test: `audio` — the last v1 table that shipped with a schema
// and no writer — now has one, and the play path around it tells the three
// answers apart that the user experiences differently. A recording, a word the
// provider does not cover, and a provider that could not be reached are not the
// same event, and only one of them is worth caching forever.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { AUDIO_PROVIDER, getHeadwordAudio, providerAudioUrl } from '../dictionary/audio';
import { importWiktextract } from '../dictionary/importers/wiktextract';
import {
  PLACEHOLDER_AUDIO_BYTES,
  PLACEHOLDER_AUDIO_MD5,
  audioCacheKey,
  isPlaceholderAudio,
  normalizeAudioIdentity,
} from '../../shared/lexiconAudio';

let db: SqliteDb;
let dir = '';

/** A believable recording: real JPod101 clips are a couple of kilobytes. */
const CLIP = Buffer.from('ID3 fake mp3 payload for 犬', 'utf8');

function respond(buffer: Buffer, ok = true) {
  return vi.fn(async () => ({
    ok,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length),
  })) as unknown as typeof fetch;
}

const INU = {
  word: '犬',
  lang_code: 'ja',
  pos: 'noun',
  senses: [{ glosses: ['dog'] }],
};

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-audio-'));
  dir = path.join(tempRoot, 'dictionary');
  db = openDictionaryDb({ dir });
  importWiktextract(db, [JSON.stringify(INU)], { dictId: 'wikt', title: 'Wiktionary (JA)' });
});

afterEach(() => {
  db?.close();
  vi.unstubAllGlobals();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('a play request is canonicalised before anything leaves the process', () => {
  it('declines a language no provider covers, rather than fetching a miss', () => {
    expect(normalizeAudioIdentity({ lang: 'zh', term: '狗' })).toBeNull();
    expect(normalizeAudioIdentity({ lang: 'ru', term: 'собака' })).toBeNull();
    expect(normalizeAudioIdentity({ lang: 'ja', term: '犬' })).not.toBeNull();
  });

  it('falls back to the word when there is no separate reading', () => {
    expect(normalizeAudioIdentity({ lang: 'ja', term: '犬' })?.reading).toBe('犬');
    expect(normalizeAudioIdentity({ lang: 'ja', term: '犬', reading: 'いぬ' })?.reading).toBe('いぬ');
  });

  it('rejects a pasted paragraph instead of putting it in an outbound URL', () => {
    expect(normalizeAudioIdentity({ lang: 'ja', term: 'あ'.repeat(33) })).toBeNull();
    expect(normalizeAudioIdentity({ lang: 'ja', term: '  ' })).toBeNull();
  });

  it('composes the cache key so two spellings of one word share an entry', () => {
    const composed = normalizeAudioIdentity({ lang: 'ja', term: 'ガ' })!;
    const decomposed = normalizeAudioIdentity({ lang: 'ja', term: 'ガ' })!;
    expect(audioCacheKey(composed)).toBe(audioCacheKey(decomposed));
  });

  it('recognises the provider placeholder by either size or digest', () => {
    expect(isPlaceholderAudio(PLACEHOLDER_AUDIO_BYTES, 'whatever')).toBe(true);
    expect(isPlaceholderAudio(1200, PLACEHOLDER_AUDIO_MD5)).toBe(true);
    expect(isPlaceholderAudio(1200, 'abc')).toBe(false);
  });

  it('sends the written form and the reading, both encoded', () => {
    const url = providerAudioUrl({ lang: 'ja', term: '犬', reading: 'いぬ' });
    expect(url).toContain(`kanji=${encodeURIComponent('犬')}`);
    expect(url).toContain(`kana=${encodeURIComponent('いぬ')}`);
  });
});

describe('the audio table finally has a writer', () => {
  it('caches the clip on disk and indexes it against the headword', async () => {
    const doFetch = respond(CLIP);
    vi.stubGlobal('fetch', doFetch);

    const first = await getHeadwordAudio(db, { lang: 'ja', term: '犬', reading: 'いぬ', dir });
    expect(first.status).toBe('ready');
    expect(first.clip?.cached).toBe(false);
    expect(first.clip?.provider).toBe(AUDIO_PROVIDER);
    expect(Buffer.from(first.clip!.dataBase64, 'base64').equals(CLIP)).toBe(true);

    const rows = db.prepare('select lang, accent, provider, url, local_path from audio').all() as Array<{
      lang: string; accent: string; provider: string; url: string; local_path: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].lang).toBe('ja');
    expect(rows[0].accent).toBe('いぬ');
    expect(rows[0].provider).toBe(AUDIO_PROVIDER);
    expect(rows[0].url).toContain('languagepod101');
    expect(fs.readFileSync(rows[0].local_path).equals(CLIP)).toBe(true);
  });

  it('replays from disk without touching the network, and says so', async () => {
    vi.stubGlobal('fetch', respond(CLIP));
    await getHeadwordAudio(db, { lang: 'ja', term: '犬', reading: 'いぬ', dir });

    const doFetch = vi.fn(async () => {
      throw new Error('the second play must not reach the network');
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', doFetch);

    const again = await getHeadwordAudio(db, { lang: 'ja', term: '犬', reading: 'いぬ', dir });
    expect(again.status).toBe('ready');
    expect(again.clip?.cached).toBe(true);
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('does not write a second row for a repeated play of the same word', async () => {
    vi.stubGlobal('fetch', respond(CLIP));
    await getHeadwordAudio(db, { lang: 'ja', term: '犬', reading: 'いぬ', dir });
    // Clear the disk cache so the fetch path runs again and re-records the row.
    fs.rmSync(path.join(dir, 'ja'), { recursive: true, force: true });
    await getHeadwordAudio(db, { lang: 'ja', term: '犬', reading: 'いぬ', dir });

    const count = db.prepare('select count(*) c from audio').get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('still plays a word this install has no headword for, and writes no row for it', async () => {
    vi.stubGlobal('fetch', respond(CLIP));
    const result = await getHeadwordAudio(db, { lang: 'ja', term: '猫', reading: 'ねこ', dir });
    expect(result.status).toBe('ready');
    const count = db.prepare('select count(*) c from audio').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('plays without a database at all, because the clip does not come from one', async () => {
    vi.stubGlobal('fetch', respond(CLIP));
    const result = await getHeadwordAudio(null, { lang: 'ja', term: '犬', reading: 'いぬ', dir });
    expect(result.status).toBe('ready');
  });
});

describe('a missing recording and a missing network are different answers', () => {
  it('remembers "no recording" so the same word is never re-asked', async () => {
    const doFetch = respond(Buffer.alloc(PLACEHOLDER_AUDIO_BYTES, 7));
    vi.stubGlobal('fetch', doFetch);

    expect((await getHeadwordAudio(db, { lang: 'ja', term: '犬', dir })).status).toBe('none');
    expect((await getHeadwordAudio(db, { lang: 'ja', term: '犬', dir })).status).toBe('none');
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(db.prepare('select count(*) c from audio').get()).toEqual({ c: 0 });
  });

  it('does not turn one failed request into a permanent verdict on the word', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch);
    expect((await getHeadwordAudio(db, { lang: 'ja', term: '犬', dir })).status).toBe('offline');

    vi.stubGlobal('fetch', respond(CLIP));
    expect((await getHeadwordAudio(db, { lang: 'ja', term: '犬', dir })).status).toBe('ready');
  });

  it('reads an HTTP error as offline rather than as a word with no recording', async () => {
    vi.stubGlobal('fetch', respond(CLIP, false));
    expect((await getHeadwordAudio(db, { lang: 'ja', term: '犬', dir })).status).toBe('offline');
  });

  it('answers unsupported for a language no provider covers, without a request', async () => {
    const doFetch = respond(CLIP);
    vi.stubGlobal('fetch', doFetch);
    expect((await getHeadwordAudio(db, { lang: 'zh', term: '狗', dir })).status).toBe('unsupported');
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('never reaches the network on a cache-only probe', async () => {
    const doFetch = respond(CLIP);
    vi.stubGlobal('fetch', doFetch);
    const cold = await getHeadwordAudio(db, { lang: 'ja', term: '犬', dir, cacheOnly: true });
    expect(cold.status).toBe('offline');
    expect(doFetch).not.toHaveBeenCalled();
  });
});
