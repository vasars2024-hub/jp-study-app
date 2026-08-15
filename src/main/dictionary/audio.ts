// Native pronunciation, cached on disk and indexed in the `audio` table.
//
// The contract and the reasoning live in `shared/lexiconAudio.ts`. This file is
// the side that touches the network, the filesystem and the database, in that
// order of reluctance:
//
//   1. the on-disk cache, keyed by (lang, term, reading) — no network, no db
//   2. the provider, only on an explicit play, only when the cache missed
//   3. the `audio` row, written only when the word is a headword we can key it to
//
// Step 3 is the table's first writer. It is deliberately *not* the cache itself:
// the row is an index of what has been fetched for which headword, so a later
// surface can ask "which words do I already have audio for" without walking a
// directory, while the bytes stay in files where SQLite does not have to page
// them. A word that resolves to no headword still plays and still caches — it
// simply gets no row, because `audio.headword_id` is `NOT NULL REFERENCES
// headwords(id)` and inventing a headword to satisfy it would be worse than
// having no index entry.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  audioCacheKey,
  isPlaceholderAudio,
  normalizeAudioIdentity,
  type LexiconAudioIdentity,
  type LexiconAudioResult,
} from '../../shared/lexiconAudio';
import type { SqliteDb } from './db';
import { normalizeForLookup } from './dictService';

/** The one provider that exists today. Stored verbatim in `audio.provider`. */
export const AUDIO_PROVIDER = 'jpod101';

const AUDIO_MIME = 'audio/mpeg';

/** Long enough for a 3 KB clip on a bad connection, short enough to not hang a click. */
const AUDIO_FETCH_TIMEOUT_MS = 8000;

/**
 * Headword rows probed before a row is written. Far smaller than the etymology
 * and xref probes' 24: those render every match, while this only needs somewhere
 * to hang the index entry, and the highest-priority dictionary is that somewhere.
 */
const AUDIO_HEADWORD_ROWS = 4;

export function providerAudioUrl(identity: LexiconAudioIdentity): string {
  const kanji = encodeURIComponent(identity.term);
  const kana = encodeURIComponent(identity.reading || identity.term);
  return `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=${kanji}&kana=${kana}`;
}

/**
 * Fetch a clip, or say why there is none.
 *
 * `'none'` and `'offline'` are kept apart all the way to the surface because
 * they mean opposite things to the user: one is a fact about the word that will
 * not change, the other is a fact about this moment that a retry may fix.
 */
export async function fetchProviderAudio(
  identity: LexiconAudioIdentity,
): Promise<{ status: 'ready'; buffer: Buffer; md5: string } | { status: 'none' | 'offline' }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AUDIO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(providerAudioUrl(identity), { signal: ctrl.signal });
    if (!res.ok) return { status: 'offline' };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) return { status: 'none' };
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');
    if (isPlaceholderAudio(buffer.length, md5)) return { status: 'none' };
    return { status: 'ready', buffer, md5 };
  } catch {
    return { status: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

function cacheFileBase(dir: string, identity: LexiconAudioIdentity): string {
  const hash = crypto.createHash('sha1').update(audioCacheKey(identity)).digest('hex');
  return path.join(dir, identity.lang, hash);
}

/**
 * Attach a fetched clip to a headword, if this install has one.
 *
 * The insert is guarded by a delete on the same (headword_id, provider) pair
 * rather than an upsert: the table has no unique constraint to conflict on, and
 * adding one would be a migration for an index nothing reads yet.
 */
function recordAudioRow(
  db: SqliteDb,
  identity: LexiconAudioIdentity,
  url: string,
  localPath: string,
): number {
  const headwords = db.prepare(`
    select h.id
    from headwords h indexed by idx_hw_norm
    join dictionaries d on d.id = h.dict_id
    where h.norm = ? and h.lang = ? and d.enabled = 1
    order by d.priority desc, h.id asc
    limit ?
  `).all(normalizeForLookup(identity.term), identity.lang, AUDIO_HEADWORD_ROWS) as { id: number }[];
  if (!headwords.length) return 0;

  const remove = db.prepare('delete from audio where headword_id = ? and provider = ?');
  const insert = db.prepare(
    'insert into audio (headword_id, lang, accent, provider, url, local_path) values (?, ?, ?, ?, ?, ?)',
  );
  const write = db.transaction((rows: { id: number }[]) => {
    for (const row of rows) {
      remove.run(row.id, AUDIO_PROVIDER);
      insert.run(row.id, identity.lang, identity.reading, AUDIO_PROVIDER, url, localPath);
    }
  });
  write(headwords);
  return headwords.length;
}

export interface HeadwordAudioQuery {
  lang: string;
  term: string;
  reading?: string;
  /** `userData/dictionary` — the same directory the database lives in. */
  dir: string;
  /**
   * Answer from the cache only. The surface uses this on render to decide
   * whether a word is already playable offline, so that probe never becomes a
   * silent network request the user did not ask for.
   */
  cacheOnly?: boolean;
}

/**
 * The whole play path: cache, then provider, then the row.
 *
 * A negative answer is cached as an empty `.none` marker beside where the clip
 * would have gone. Without it every click on a word the provider does not cover
 * would re-ask the CDN, which is both a repeated disclosure and a repeated wait.
 */
export async function getHeadwordAudio(
  db: SqliteDb | null,
  query: HeadwordAudioQuery,
): Promise<LexiconAudioResult> {
  const identity = normalizeAudioIdentity(query);
  const label = query.term.trim();
  if (!identity) return { query: label, status: 'unsupported' };

  const base = cacheFileBase(query.dir, identity);
  const clipPath = `${base}.mp3`;
  const missPath = `${base}.none`;

  try {
    const cached = fs.readFileSync(clipPath);
    if (cached.length > 0) {
      return {
        query: label,
        status: 'ready',
        clip: {
          provider: AUDIO_PROVIDER,
          mimeType: AUDIO_MIME,
          dataBase64: cached.toString('base64'),
          cached: true,
        },
      };
    }
  } catch {
    /* not cached yet */
  }
  if (fs.existsSync(missPath)) return { query: label, status: 'none' };
  if (query.cacheOnly) return { query: label, status: 'offline' };

  const fetched = await fetchProviderAudio(identity);
  fs.mkdirSync(path.dirname(clipPath), { recursive: true });
  if (fetched.status !== 'ready') {
    // Only a definite "no recording" is remembered. An `offline` result is about
    // the connection, and caching it would turn one failed request into a
    // permanent verdict on the word.
    if (fetched.status === 'none') {
      try {
        fs.writeFileSync(missPath, '');
      } catch {
        /* the cache is an optimisation; failing to write it is not an error */
      }
    }
    return { query: label, status: fetched.status };
  }

  try {
    fs.writeFileSync(clipPath, fetched.buffer);
    if (db) recordAudioRow(db, identity, providerAudioUrl(identity), clipPath);
  } catch {
    // The clip is in hand either way. A cache or index failure costs the next
    // play a round trip; it must not cost this one its audio.
  }

  return {
    query: label,
    status: 'ready',
    clip: {
      provider: AUDIO_PROVIDER,
      mimeType: AUDIO_MIME,
      dataBase64: fetched.buffer.toString('base64'),
      cached: false,
    },
  };
}
