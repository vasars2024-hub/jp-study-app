/**
 * Per-book word profiles for the Library's scores, computed once per file.
 *
 * A profile (`shared/studyWordProfile.ts`) is the distinct content words of a
 * ~2k-character sample and their counts. It is built in a Web Worker
 * (`studyWordsAsync.ts`) from the book's text sample, then cached here keyed by
 * the book's file identity (size + mtime from the main process) or, for an
 * Inbox article, by its content hash. A book is therefore sampled and tokenized
 * once, ever; re-opening the Library costs one `stat` per book and a few
 * hundred map lookups to score.
 *
 * The cache lives in IndexedDB under one key and is merged on write
 * (`kvUpdate`), so two windows scoring different books keep each other's work.
 */
import type { LibraryItem } from '../shared/types';
import type { StudyLang } from '../shared/studyLang';
import { detectInboxLang, type InboxLang } from '../shared/inboxMeta';
import { pageHasChinese, pageHasJapanese } from '../shared/pageLevelDetect';
import {
  BOOK_SAMPLE_CHARS,
  isStudyWordProfile,
  profileScoredTokens,
  type StudyWordProfile,
} from '../shared/studyWordProfile';
import { scoreComprehensibility, type ComprehensibilityScore } from '../shared/comprehensibility';
import { kvGet, kvUpdate } from './storage/db';
import { getLevel } from './knownWords';
import { knownKeyFor } from './studyTokens';
import { studyWordProfile } from './studyWordsAsync';

/** IndexedDB key of the profile cache. */
export const BOOK_PROFILES_IDB_KEY = 'book-word-profiles-v1';
/** Keep at most this many profiles (oldest out); a profile is a few KB. */
const MAX_PROFILES = 3_000;
const FLUSH_DELAY_MS = 1_500;

export interface BookProfileEntry {
  /** The file (or article) identity the profile was computed from. */
  fileKey: string;
  /** Script-level language of the sample (the Library's `lang` chip). */
  detected: InboxLang;
  /** `ja` when the sample has kana, `zh` for Han without kana — the exam scheme's language. */
  script: 'ja' | 'zh' | null;
  profile: StudyWordProfile;
  at: number;
}

type ProfileStore = Record<string, BookProfileEntry>;

let memory: Map<string, BookProfileEntry> | null = null;
let loading: Promise<Map<string, BookProfileEntry>> | null = null;
const dirty = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const inflight = new Map<string, Promise<BookProfileEntry | null>>();
/** File identities fetched for the current pass, by book id. */
const fileKeys = new Map<string, string | null>();

function cacheKey(itemId: string, lang: StudyLang): string {
  return `${itemId}|${lang}`;
}

function isEntry(value: unknown): value is BookProfileEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<BookProfileEntry>;
  return typeof v.fileKey === 'string' && isStudyWordProfile(v.profile);
}

async function loadMemory(): Promise<Map<string, BookProfileEntry>> {
  if (memory) return memory;
  if (!loading) {
    loading = (async () => {
      const map = new Map<string, BookProfileEntry>();
      try {
        const stored = await kvGet<ProfileStore>(BOOK_PROFILES_IDB_KEY);
        if (stored && typeof stored === 'object') {
          for (const [key, value] of Object.entries(stored)) if (isEntry(value)) map.set(key, value);
        }
      } catch {
        /* no cache: profiles are rebuilt, nothing is lost */
      }
      memory = map;
      return map;
    })();
  }
  return loading;
}

function trim(store: ProfileStore): ProfileStore {
  const keys = Object.keys(store);
  if (keys.length <= MAX_PROFILES) return store;
  const keep = keys.sort((a, b) => (store[b].at ?? 0) - (store[a].at ?? 0)).slice(0, MAX_PROFILES);
  const out: ProfileStore = {};
  for (const key of keep) out[key] = store[key];
  return out;
}

async function flush(): Promise<void> {
  flushTimer = null;
  if (!memory || !dirty.size) return;
  const writes: ProfileStore = {};
  for (const key of dirty) {
    const entry = memory.get(key);
    if (entry) writes[key] = entry;
  }
  dirty.clear();
  try {
    await kvUpdate(BOOK_PROFILES_IDB_KEY, (current) => {
      const base = current && typeof current === 'object' ? (current as ProfileStore) : {};
      return trim({ ...base, ...writes });
    });
  } catch {
    /* a cache: failing to store it costs a re-tokenize next time, nothing more */
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

/** Write pending profiles now (the Library calls this when it closes). */
export function flushBookProfiles(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  return flush();
}

/**
 * Fetch the file identities of `items` in one IPC round trip, for the
 * `bookProfileEntry` calls of this pass.
 */
export async function prefetchBookFileKeys(items: readonly LibraryItem[]): Promise<void> {
  const ids = items
    .filter((it) => it.kind === 'book' && !it.inboxMeta && !fileKeys.has(it.id))
    .map((it) => it.id);
  if (!ids.length) return;
  try {
    const keys = await window.api.bookFileKeys(ids);
    for (const id of ids) fileKeys.set(id, keys?.[id] ?? null);
  } catch {
    /* each book asks for its own key below */
  }
}

/** Forget fetched file identities (a book file may have been replaced). */
export function forgetBookFileKeys(): void {
  fileKeys.clear();
}

async function fileKeyFor(item: LibraryItem): Promise<string | null> {
  const inbox = item.inboxMeta;
  if (inbox) {
    const text = (inbox.textSample || item.title || '').trim();
    return text ? `inbox:${inbox.contentHash || text.length}` : null;
  }
  if (item.kind !== 'book') return null;
  if (item.epubFile?.toLowerCase().endsWith('.pdf')) return null;
  if (!fileKeys.has(item.id)) {
    try {
      const keys = await window.api.bookFileKeys([item.id]);
      fileKeys.set(item.id, keys?.[item.id] ?? null);
    } catch {
      fileKeys.set(item.id, null);
    }
  }
  return fileKeys.get(item.id) ?? null;
}

async function sampleText(item: LibraryItem): Promise<string> {
  if (item.inboxMeta) return (item.inboxMeta.textSample || item.title || '').trim().slice(0, BOOK_SAMPLE_CHARS);
  if (item.kind !== 'book') return '';
  try {
    return ((await window.api.sampleBookText(item.id, BOOK_SAMPLE_CHARS)) ?? '').trim();
  } catch {
    return '';
  }
}

function scriptOf(text: string): 'ja' | 'zh' | null {
  if (pageHasJapanese(text)) return 'ja';
  if (pageHasChinese(text)) return 'zh';
  return null;
}

/**
 * The cached profile of `item` read as `lang`, building it (sample + worker)
 * on a miss. Null for an item with nothing to sample. A book whose sample has
 * no words still gets an (empty) entry, so it is not sampled again.
 */
export async function bookProfileEntry(item: LibraryItem, lang: StudyLang): Promise<BookProfileEntry | null> {
  const fileKey = await fileKeyFor(item);
  if (!fileKey) return null;
  const key = cacheKey(item.id, lang);
  const map = await loadMemory();
  const hit = map.get(key);
  if (hit && hit.fileKey === fileKey) return hit;

  const flightKey = `${key}|${fileKey}`;
  const running = inflight.get(flightKey);
  if (running) return running;
  const build = (async (): Promise<BookProfileEntry | null> => {
    const text = await sampleText(item);
    const profile = text
      ? await studyWordProfile(text, lang)
      : { v: 1, lang, words: [] } satisfies StudyWordProfile;
    const entry: BookProfileEntry = {
      fileKey,
      detected: text ? detectInboxLang(text) : 'unknown',
      script: text ? scriptOf(text) : null,
      profile,
      at: Date.now(),
    };
    map.set(key, entry);
    dirty.add(key);
    scheduleFlush();
    return entry;
  })().finally(() => inflight.delete(flightKey));
  inflight.set(flightKey, build);
  return build;
}

/** The learner's comprehensibility of a profile, scored against their knowledge store now. */
export function scoreProfile(profile: StudyWordProfile): ComprehensibilityScore {
  const keyFor = profile.lang === 'ru' ? (word: string) => knownKeyFor(word, 'ru') : undefined;
  return scoreComprehensibility(profileScoredTokens(profile, keyFor), getLevel);
}

/** Test seam. */
export function resetBookProfilesForTests(): void {
  memory = null;
  loading = null;
  dirty.clear();
  inflight.clear();
  fileKeys.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
