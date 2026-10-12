// Immersion browser, product pass 7.5: the study layer on top of browsing.
//
// Pure and framework-free. The renderer owns persistence (the IndexedDB kv
// store) and the DOM; everything here is data in, data out, so the rules can be
// pinned in node tests:
//
// - per-site, per-day study stats (time, lookups, words mined, new words met),
// - a reading list (save an article for later, with an offline snapshot),
// - history search with `site:` filters and ranking,
// - i+1 sentence detection over tokenized text,
// - "new words met" de-duplicated per day.

import { immersionDayKey, immersionHostOf, type ImmersionSite } from './immersion';

// --- per-site, per-day stats -----------------------------------------------

export interface Imm5SiteDay {
  seconds: number;
  lookups: number;
  mined: number;
  newWords: number;
}

/** dayKey (YYYY-MM-DD) -> host -> totals. */
export type Imm5SiteDayLog = Record<string, Record<string, Imm5SiteDay>>;

export type Imm5SiteDayDelta = Partial<Imm5SiteDay>;

/** How long per-day rows are kept. A quarter covers every range the UI offers. */
export const IMM5_SITE_DAY_KEEP_DAYS = 92;
/** Hosts kept per day; the long tail of one-off pages is folded away. */
export const IMM5_SITE_DAY_MAX_HOSTS = 60;

export function imm5EmptySiteDay(): Imm5SiteDay {
  return { seconds: 0, lookups: 0, mined: 0, newWords: 0 };
}

function nonNegative(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Add a delta to one host's row for one day. Returns a new log; the input is untouched. */
export function imm5ApplySiteDay(
  log: Imm5SiteDayLog,
  day: string,
  host: string,
  delta: Imm5SiteDayDelta,
): Imm5SiteDayLog {
  const cleanHost = host.trim().toLowerCase();
  if (!cleanHost || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return log;
  const dayRows = { ...(log[day] ?? {}) };
  const base = dayRows[cleanHost] ?? imm5EmptySiteDay();
  dayRows[cleanHost] = {
    seconds: base.seconds + nonNegative(delta.seconds),
    lookups: base.lookups + nonNegative(delta.lookups),
    mined: base.mined + nonNegative(delta.mined),
    newWords: base.newWords + nonNegative(delta.newWords),
  };
  return { ...log, [day]: dayRows };
}

function dayKeyDaysAgo(now: number, daysAgo: number): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return immersionDayKey(d);
}

/** The last `days` day keys ending today, oldest first. */
export function imm5RecentDayKeys(now: number, days: number): string[] {
  const out: string[] = [];
  for (let i = Math.max(1, Math.floor(days)) - 1; i >= 0; i--) out.push(dayKeyDaysAgo(now, i));
  return out;
}

/** Drop days older than the keep window and hosts beyond the per-day cap (least time first). */
export function imm5PruneSiteDays(log: Imm5SiteDayLog, now: number, keepDays = IMM5_SITE_DAY_KEEP_DAYS): Imm5SiteDayLog {
  const oldest = dayKeyDaysAgo(now, keepDays - 1);
  const out: Imm5SiteDayLog = {};
  for (const [day, rows] of Object.entries(log)) {
    if (day < oldest) continue;
    const entries = Object.entries(rows);
    if (entries.length <= IMM5_SITE_DAY_MAX_HOSTS) {
      out[day] = rows;
      continue;
    }
    entries.sort((a, b) => b[1].seconds - a[1].seconds || b[1].lookups - a[1].lookups);
    out[day] = Object.fromEntries(entries.slice(0, IMM5_SITE_DAY_MAX_HOSTS));
  }
  return out;
}

/** Whatever came back from storage, reduced to a valid log. */
export function imm5SanitizeSiteDayLog(raw: unknown): Imm5SiteDayLog {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Imm5SiteDayLog = {};
  for (const [day, rows] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !rows || typeof rows !== 'object') continue;
    const clean: Record<string, Imm5SiteDay> = {};
    for (const [host, row] of Object.entries(rows as Record<string, unknown>)) {
      if (!host || !row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      clean[host] = {
        seconds: nonNegative(r.seconds),
        lookups: nonNegative(r.lookups),
        mined: nonNegative(r.mined),
        newWords: nonNegative(r.newWords),
      };
    }
    out[day] = clean;
  }
  return out;
}

export interface Imm5SiteRow extends Imm5SiteDay {
  host: string;
  /** Days in the range the site was opened at all. */
  activeDays: number;
}

/** Per-site totals over the last `days` days, most time first. */
export function imm5SiteRows(log: Imm5SiteDayLog, now: number, days: number): Imm5SiteRow[] {
  const byHost = new Map<string, Imm5SiteRow>();
  for (const day of imm5RecentDayKeys(now, days)) {
    for (const [host, row] of Object.entries(log[day] ?? {})) {
      const acc = byHost.get(host) ?? { host, ...imm5EmptySiteDay(), activeDays: 0 };
      acc.seconds += row.seconds;
      acc.lookups += row.lookups;
      acc.mined += row.mined;
      acc.newWords += row.newWords;
      acc.activeDays += 1;
      byHost.set(host, acc);
    }
  }
  return [...byHost.values()]
    .filter((r) => r.seconds > 0 || r.lookups > 0 || r.mined > 0 || r.newWords > 0)
    .sort((a, b) => b.seconds - a.seconds || b.lookups - a.lookups || a.host.localeCompare(b.host));
}

export interface Imm5DayRow extends Imm5SiteDay {
  day: string;
}

/** Per-day totals (one host, or every host when `host` is omitted), oldest first, gaps as zeros. */
export function imm5DayRows(log: Imm5SiteDayLog, now: number, days: number, host?: string): Imm5DayRow[] {
  return imm5RecentDayKeys(now, days).map((day) => {
    const acc: Imm5DayRow = { day, ...imm5EmptySiteDay() };
    for (const [h, row] of Object.entries(log[day] ?? {})) {
      if (host && h !== host) continue;
      acc.seconds += row.seconds;
      acc.lookups += row.lookups;
      acc.mined += row.mined;
      acc.newWords += row.newWords;
    }
    return acc;
  });
}

// --- new words met -----------------------------------------------------------

/** Words already counted as "met" today, so re-reading a page does not count them twice. */
export interface Imm5MetWords {
  day: string;
  words: string[];
}

export const IMM5_MET_WORDS_CAP = 6000;

/**
 * Distinct words at level 0 (never studied, never marked) that were not already
 * met today. `levelOf` is the app's known-word lookup.
 */
export function imm5NewWordsMet(
  lemmas: Iterable<string>,
  levelOf: (lemma: string) => number,
  met: Imm5MetWords | null,
  today: string,
): { fresh: string[]; met: Imm5MetWords } {
  const already = new Set(met && met.day === today ? met.words : []);
  const fresh: string[] = [];
  for (const raw of lemmas) {
    const lemma = raw.trim();
    if (!lemma || already.has(lemma)) continue;
    already.add(lemma);
    if (levelOf(lemma) === 0) fresh.push(lemma);
  }
  const words = [...already];
  return { fresh, met: { day: today, words: words.slice(Math.max(0, words.length - IMM5_MET_WORDS_CAP)) } };
}

// --- reading list ------------------------------------------------------------

export interface Imm5ReadingItem {
  id: string;
  url: string;
  title: string;
  host: string;
  savedAt: number;
  /** When it was marked read; absent while it is still "for later". */
  readAt?: number;
  excerpt: string;
  /** Characters of article text in the offline snapshot; 0 when none was kept. */
  snapshotChars: number;
  /**
   * Checksum of the stored snapshot (`imm5SnapshotHash`), so a copy that was cut
   * short or overwritten is reported as damaged instead of shown half-empty.
   * Absent on items saved before it existed.
   */
  snapshotHash?: string;
}

export const IMM5_READING_LIST_MAX = 300;
/** A snapshot bigger than this is truncated: a reading list is not an archive. */
export const IMM5_SNAPSHOT_MAX_CHARS = 200_000;
export const IMM5_EXCERPT_CHARS = 160;

function fnv1a(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function imm5ReadingItemId(url: string): string {
  return `rl-${fnv1a(url).toString(36)}`;
}

/** Checksum of an offline snapshot: its length and an FNV-1a hash, so truncation alone already fails it. */
export function imm5SnapshotHash(html: string): string {
  return `${html.length.toString(36)}.${fnv1a(html).toString(36)}`;
}

/**
 * Cut a snapshot to `max` characters without leaving half a tag at the end
 * (`<a hre`), which a parser would read as text. Unclosed elements are fine:
 * the reader's parser closes them.
 */
export function imm5TruncateSnapshot(html: string, max = IMM5_SNAPSHOT_MAX_CHARS): string {
  if (html.length <= max) return html;
  let cut = html.slice(0, max);
  const lastOpen = cut.lastIndexOf('<');
  if (lastOpen > cut.lastIndexOf('>')) cut = cut.slice(0, lastOpen);
  // Nor half an entity (`&am`).
  const amp = cut.lastIndexOf('&');
  if (amp >= 0 && amp > cut.length - 10 && !cut.slice(amp).includes(';')) cut = cut.slice(0, amp);
  return cut;
}

export type Imm5SnapshotStatus = 'ok' | 'missing' | 'damaged';

/** Whether the stored copy is the one that was saved. Items from before checksums pass on presence alone. */
export function imm5VerifySnapshot(item: Pick<Imm5ReadingItem, 'snapshotHash'>, html: string | null | undefined): Imm5SnapshotStatus {
  if (typeof html !== 'string' || !html) return 'missing';
  if (item.snapshotHash && item.snapshotHash !== imm5SnapshotHash(html)) return 'damaged';
  return 'ok';
}

/** Plain text from article HTML, without a DOM: tags out, entities for the common few. */
export function imm5HtmlText(html: string): string {
  return html
    .replace(/<(script|style|rt|rp)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Imm5SaveInput {
  url: string;
  title: string;
  /** Article HTML for the offline copy, when the page was readable. */
  snapshotHtml?: string;
}

/**
 * Save (or re-save) an article. Re-saving moves it to the top and clears "read",
 * because saving again means "I want to come back to this".
 */
export function imm5AddReadingItem(
  list: readonly Imm5ReadingItem[],
  input: Imm5SaveInput,
  now: number,
): { list: Imm5ReadingItem[]; item: Imm5ReadingItem; snapshotHtml: string | null } {
  const id = imm5ReadingItemId(input.url);
  const snapshotHtml = input.snapshotHtml ? imm5TruncateSnapshot(input.snapshotHtml) : null;
  const text = snapshotHtml ? imm5HtmlText(snapshotHtml) : '';
  const previous = list.find((item) => item.id === id);
  const hash = text && snapshotHtml ? imm5SnapshotHash(snapshotHtml) : previous?.snapshotHash;
  const item: Imm5ReadingItem = {
    id,
    url: input.url,
    title: input.title.trim() || immersionHostOf(input.url) || input.url,
    host: immersionHostOf(input.url),
    savedAt: now,
    excerpt: text ? text.slice(0, IMM5_EXCERPT_CHARS) : (previous?.excerpt ?? ''),
    snapshotChars: text ? text.length : (previous?.snapshotChars ?? 0),
    ...(hash ? { snapshotHash: hash } : {}),
  };
  const rest = list.filter((entry) => entry.id !== id);
  return { list: [item, ...rest].slice(0, IMM5_READING_LIST_MAX), item, snapshotHtml };
}

export function imm5RemoveReadingItem(list: readonly Imm5ReadingItem[], id: string): Imm5ReadingItem[] {
  return list.filter((item) => item.id !== id);
}

export function imm5MarkReadingItem(
  list: readonly Imm5ReadingItem[],
  id: string,
  read: boolean,
  now: number,
): Imm5ReadingItem[] {
  return list.map((item) => {
    if (item.id !== id) return item;
    if (read) return { ...item, readAt: now };
    const unread = { ...item };
    delete unread.readAt;
    return unread;
  });
}

/** Unread first (newest saved first), then read (most recently read first). */
export function imm5SortedReadingList(list: readonly Imm5ReadingItem[]): Imm5ReadingItem[] {
  return [...list].sort((a, b) => {
    const ar = a.readAt != null;
    const br = b.readAt != null;
    if (ar !== br) return ar ? 1 : -1;
    if (ar && br) return (b.readAt ?? 0) - (a.readAt ?? 0);
    return b.savedAt - a.savedAt;
  });
}

export function imm5SanitizeReadingList(raw: unknown): Imm5ReadingItem[] {
  if (!Array.isArray(raw)) return [];
  const out: Imm5ReadingItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.url !== 'string' || !/^https?:\/\//i.test(r.url)) continue;
    const id = imm5ReadingItemId(r.url);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      url: r.url,
      title: typeof r.title === 'string' && r.title.trim() ? r.title : r.url,
      host: immersionHostOf(r.url),
      savedAt: nonNegative(r.savedAt),
      ...(typeof r.readAt === 'number' && r.readAt > 0 ? { readAt: r.readAt } : {}),
      excerpt: typeof r.excerpt === 'string' ? r.excerpt.slice(0, IMM5_EXCERPT_CHARS) : '',
      snapshotChars: nonNegative(r.snapshotChars),
      ...(typeof r.snapshotHash === 'string' && /^[0-9a-z]{1,8}\.[0-9a-z]{1,8}$/.test(r.snapshotHash)
        ? { snapshotHash: r.snapshotHash }
        : {}),
    });
    if (out.length >= IMM5_READING_LIST_MAX) break;
  }
  return out;
}

/** An item whose offline copy turned out missing: it stops offering one. */
export function imm5ForgetSnapshot(list: readonly Imm5ReadingItem[], id: string): Imm5ReadingItem[] {
  return list.map((item) => {
    if (item.id !== id) return item;
    const next: Imm5ReadingItem = { ...item, snapshotChars: 0 };
    delete next.snapshotHash;
    return next;
  });
}

// --- reading list export / import -------------------------------------------------

export const IMM5_EXPORT_KIND = 'gum-reading-list';

export interface Imm5ReadingExport {
  kind: typeof IMM5_EXPORT_KIND;
  version: 1;
  exportedAt: number;
  items: Imm5ReadingItem[];
  /** Offline copies by item id. */
  snapshots: Record<string, string>;
}

/** The whole list, with its offline copies, as one JSON file. */
export function imm5ExportReadingList(
  list: readonly Imm5ReadingItem[],
  snapshots: Readonly<Record<string, string>>,
  now: number,
): string {
  const kept: Record<string, string> = {};
  for (const item of list) {
    const html = snapshots[item.id];
    if (typeof html === 'string' && html && imm5VerifySnapshot(item, html) === 'ok') kept[item.id] = html;
  }
  const doc: Imm5ReadingExport = { kind: IMM5_EXPORT_KIND, version: 1, exportedAt: now, items: [...list], snapshots: kept };
  return JSON.stringify(doc, null, 1);
}

export interface Imm5ReadingImport {
  items: Imm5ReadingItem[];
  snapshots: Record<string, string>;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function urlItem(url: string, title: string, savedAt: number): Record<string, unknown> {
  return { url, title: title.trim() || url, savedAt };
}

/**
 * Read a reading list file. Accepts Gum's own export (items + offline copies),
 * a JSON array of `{ url, title }`, a bookmarks / Pocket-style HTML export
 * (`<a href>`), or plain text with one URL per line (an Instapaper-style CSV's
 * first URL per row works too). Only http(s) URLs survive; snapshots are kept
 * only when they match their item's checksum. Null when nothing usable is in it.
 */
export function imm5ParseReadingListImport(text: string, now: number): Imm5ReadingImport | null {
  const raw = text.replace(/^\uFEFF/, '').trim();
  if (!raw) return null;
  let candidates: unknown[] = [];
  let snapshots: Record<string, unknown> = {};
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) candidates = parsed;
      else if (parsed && typeof parsed === 'object') {
        const doc = parsed as Record<string, unknown>;
        if (Array.isArray(doc.items)) candidates = doc.items;
        if (doc.snapshots && typeof doc.snapshots === 'object' && !Array.isArray(doc.snapshots)) {
          snapshots = doc.snapshots as Record<string, unknown>;
        }
      }
    } catch {
      return null;
    }
  } else if (/<a\s[^>]*href=/i.test(raw)) {
    const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const added = /time_added\s*=\s*["'](\d{9,13})["']/i.exec(m[0]);
      const at = added ? Number(added[1]) * (added[1].length <= 10 ? 1000 : 1) : now;
      candidates.push(urlItem(decodeEntities(m[1]), decodeEntities(m[2].replace(/<[^>]+>/g, '')), at));
    }
  } else {
    for (const line of raw.split(/\r?\n/)) {
      const m = /https?:\/\/[^\s",<>]+/i.exec(line);
      if (!m) continue;
      const rest = line.replace(m[0], '').replace(/^[\s,"]+|[\s,"]+$/g, '').split(/",\s*"|,/)[0] ?? '';
      candidates.push(urlItem(m[0], rest.replace(/^"|"$/g, ''), now));
    }
  }
  const items = imm5SanitizeReadingList(candidates.map((entry) => (
    entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).savedAt !== 'number'
      ? { ...(entry as Record<string, unknown>), savedAt: now }
      : entry
  )));
  if (!items.length) return null;
  const keptSnapshots: Record<string, string> = {};
  for (const item of items) {
    const html = snapshots[item.id];
    if (typeof html !== 'string' || !html) continue;
    if (html.length > IMM5_SNAPSHOT_MAX_CHARS) continue;
    if (imm5VerifySnapshot(item, html) === 'ok') keptSnapshots[item.id] = html;
  }
  // An item that claims a copy the file does not carry claims nothing.
  const cleaned = items.map((item) => (keptSnapshots[item.id] ? item : (() => {
    const next: Imm5ReadingItem = { ...item, snapshotChars: 0 };
    delete next.snapshotHash;
    return next;
  })()));
  return { items: cleaned, snapshots: keptSnapshots };
}

/**
 * Merge imported items into the list. An article already saved keeps its own
 * entry, but takes the import's offline copy when it has none, and the import's
 * "read" mark when it was read there. New articles are added; the cap holds,
 * unread first.
 */
export function imm5MergeReadingLists(
  existing: readonly Imm5ReadingItem[],
  incoming: readonly Imm5ReadingItem[],
  incomingSnapshots: Readonly<Record<string, string>> = {},
): { list: Imm5ReadingItem[]; added: number; updated: number; snapshotIds: string[] } {
  const byId = new Map(existing.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  const snapshotIds: string[] = [];
  for (const item of incoming) {
    const current = byId.get(item.id);
    const hasCopy = !!incomingSnapshots[item.id];
    if (!current) {
      byId.set(item.id, item);
      added += 1;
      if (hasCopy) snapshotIds.push(item.id);
      continue;
    }
    let next = current;
    if (current.snapshotChars === 0 && hasCopy) {
      next = { ...next, snapshotChars: item.snapshotChars, ...(item.snapshotHash ? { snapshotHash: item.snapshotHash } : {}) };
      if (!next.excerpt) next = { ...next, excerpt: item.excerpt };
      snapshotIds.push(item.id);
    }
    if (item.readAt && !current.readAt) next = { ...next, readAt: item.readAt };
    if (next !== current) {
      byId.set(item.id, next);
      updated += 1;
    }
  }
  const list = imm5SortedReadingList([...byId.values()]).slice(0, IMM5_READING_LIST_MAX);
  const kept = new Set(list.map((item) => item.id));
  return { list, added, updated, snapshotIds: snapshotIds.filter((id) => kept.has(id)) };
}

// --- per-page known-word coverage --------------------------------------------------

export interface Imm5PageCoverage {
  /** Content-word tokens on the page (proper nouns excluded). */
  tokens: number;
  known: number;
  /** Rounded share of `tokens` at or above the known level; null with no tokens. */
  knownPct: number | null;
  /** Distinct lemmas below the known level. */
  unknownUnique: number;
}

/** The page's known-word coverage, the number extensive readers pick texts by. */
export function imm5PageCoverage(
  words: Iterable<{ lemma: string; level: number; proper?: boolean }>,
  knownAt = 2,
): Imm5PageCoverage {
  let tokens = 0;
  let known = 0;
  const unknown = new Set<string>();
  for (const word of words) {
    if (word.proper || !word.lemma) continue;
    tokens += 1;
    if (word.level >= knownAt) known += 1;
    else unknown.add(word.lemma);
  }
  return {
    tokens,
    known,
    knownPct: tokens > 0 ? Math.round((known / tokens) * 100) : null,
    unknownUnique: unknown.size,
  };
}

// --- history search ------------------------------------------------------------

export interface Imm5ParsedQuery {
  terms: string[];
  hosts: string[];
}

function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/** `site:nhk.or.jp 天気` -> hosts ['nhk.or.jp'], terms ['天気']. Quotes keep a phrase together. */
export function imm5ParseHistoryQuery(query: string): Imm5ParsedQuery {
  const terms: string[] = [];
  const hosts: string[] = [];
  const re = /(site:|host:)?(?:"([^"]*)"|(\S+))/gi;
  let m: RegExpExecArray | null;
  const q = fold(query);
  while ((m = re.exec(q))) {
    const value = (m[2] ?? m[3] ?? '').trim();
    if (!value) continue;
    if (m[1]) hosts.push(value.replace(/^www\./, ''));
    else terms.push(value);
  }
  return { terms, hosts };
}

export interface Imm5HistoryHit<T> {
  item: T;
  score: number;
}

type Searchable = Pick<ImmersionSite, 'url' | 'title' | 'tags' | 'lastVisited'> & { visitCount?: number };

/**
 * Every term must appear in the title, URL or tags; every `site:` must match the
 * host (suffix match, so `site:nhk.or.jp` finds `www3.nhk.or.jp`). Title hits
 * outrank URL hits; ties go to the more recent, then the more visited.
 */
export function imm5SearchHistory<T extends Searchable>(items: readonly T[], query: string): T[] {
  const { terms, hosts } = imm5ParseHistoryQuery(query);
  if (terms.length === 0 && hosts.length === 0) return [...items];
  const hits: Imm5HistoryHit<T>[] = [];
  for (const item of items) {
    const host = immersionHostOf(item.url);
    if (hosts.length && !hosts.every((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))) continue;
    const title = fold(item.title || '');
    const url = fold(item.url);
    const tags = fold((item.tags ?? []).join(' '));
    let score = 0;
    let ok = true;
    for (const term of terms) {
      if (title.includes(term)) score += title.startsWith(term) ? 6 : 4;
      else if (tags.includes(term)) score += 3;
      else if (url.includes(term)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) hits.push({ item, score });
  }
  return hits
    .sort(
      (a, b) =>
        b.score - a.score
        || (b.item.lastVisited || 0) - (a.item.lastVisited || 0)
        || (b.item.visitCount ?? 0) - (a.item.visitCount ?? 0),
    )
    .map((hit) => hit.item);
}

/** Reading-list search also looks inside the excerpt. */
export function imm5SearchReadingList(list: readonly Imm5ReadingItem[], query: string): Imm5ReadingItem[] {
  const { terms, hosts } = imm5ParseHistoryQuery(query);
  if (terms.length === 0 && hosts.length === 0) return imm5SortedReadingList(list);
  return imm5SortedReadingList(list).filter((item) => {
    if (hosts.length && !hosts.every((h) => item.host === h || item.host.endsWith(`.${h}`) || item.host.includes(h))) {
      return false;
    }
    const hay = fold(`${item.title} ${item.url} ${item.excerpt}`);
    return terms.every((term) => hay.includes(term));
  });
}

// --- i+1 sentences -------------------------------------------------------------

export interface Imm5Span {
  start: number;
  end: number;
}

/** A tokenized word inside a block of text, at character offsets. */
export interface Imm5Word extends Imm5Span {
  /** Known-word level 0..3. */
  level: number;
  /** Proper nouns never count as the unknown. */
  proper?: boolean;
}

export interface Imm5IPlusOne extends Imm5Span {
  /** The single unknown word in the sentence. */
  word: Imm5Span;
}

const TERMINATOR = /[。！？!?…‥．]/;
const OPENERS = '「『（(“【〈《［';
const CLOSERS = '」』）)”’】〉》］"\'';
/**
 * What may follow a closing quote and still be the same sentence: the
 * quotative particles (`「行く。」と言った`, `「はい」って`), and the common
 * continuations of a quoted phrase.
 */
const QUOTE_CONTINUES = /^[\s]*(?:と|って|っ|て|など|とか|という|との|も|は|が|を|に)/;
/**
 * A quotation open longer than this is not a quotation the splitter trusts: an
 * unbalanced 「 (a typo, a quote that runs over several paragraphs) would
 * otherwise swallow every sentence after it.
 */
const MAX_QUOTE_CHARS = 160;

/**
 * Sentence ranges (start inclusive, end exclusive) with surrounding whitespace trimmed.
 *
 * Japanese-aware: a 。 inside 「…」 does not end the sentence the quote sits in,
 * and `「行こう。」と言った。` is one sentence, while `「おはよう。」「おはよう。」` is two.
 * A newline always ends a sentence (a `<br>` line in Aozora text is a line).
 */
export function imm5SentenceRanges(text: string): Imm5Span[] {
  const out: Imm5Span[] = [];
  let from = 0;
  const push = (start: number, end: number) => {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push({ start: s, end: e });
  };
  const openAt: number[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') {
      push(from, i);
      from = i + 1;
      openAt.length = 0;
      i += 1;
      continue;
    }
    if (OPENERS.includes(ch) && ch !== '"' && ch !== "'") {
      openAt.push(i);
      i += 1;
      continue;
    }
    // ASCII '.' ends a sentence only before whitespace or at the end (3.5 and URLs stay whole).
    const asciiStop = ch === '.' && (i + 1 >= text.length || /\s/.test(text[i + 1]));
    if (TERMINATOR.test(ch) || asciiStop) {
      const quoteOpen = openAt.length > 0 && i - openAt[openAt.length - 1] <= MAX_QUOTE_CHARS;
      let j = i + 1;
      while (j < text.length && TERMINATOR.test(text[j])) j++;
      // An ellipsis is a pause, not a stop, unless the text breaks after it:
      // `……そうだ。` and `えっと…それは` are one sentence each.
      const soft = /^[…‥]+$/.test(text.slice(i, j));
      const after = text[j] ?? '';
      const atSentenceStart = !text.slice(from, i).trim();
      if (soft && (atSentenceStart || (after && !/\s/.test(after) && !CLOSERS.includes(after) && !OPENERS.includes(after)))) {
        i = j;
        continue;
      }
      if (quoteOpen) {
        // Inside a quotation: the sentence ends at the closing quote, if at all.
        i = j;
        continue;
      }
      while (j < text.length && CLOSERS.includes(text[j])) j++;
      openAt.length = 0;
      push(from, j);
      from = j;
      i = j;
      continue;
    }
    if (CLOSERS.includes(ch) && ch !== '"' && ch !== "'") {
      const opened = openAt.pop();
      // A quotation that ended on a terminator closes its sentence, unless a
      // quotative particle carries it on (`「…。」と`).
      const prev = text[i - 1] ?? '';
      if (opened !== undefined && openAt.length === 0 && TERMINATOR.test(prev)) {
        let j = i + 1;
        while (j < text.length && CLOSERS.includes(text[j])) j++;
        if (!QUOTE_CONTINUES.test(text.slice(j, j + 4))) {
          push(from, j);
          from = j;
          i = j;
          continue;
        }
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  push(from, text.length);
  return out;
}

/**
 * Sentences with exactly one word below `knownAt` (and at least `minWords`
 * content words, so a one-word heading is not "i+1"). Words are assigned to the
 * sentence that contains their start offset.
 */
export function imm5IPlusOneSentences(
  text: string,
  words: readonly Imm5Word[],
  opts: { knownAt?: number; minWords?: number } = {},
): Imm5IPlusOne[] {
  const knownAt = opts.knownAt ?? 2;
  const minWords = opts.minWords ?? 3;
  const sentences = imm5SentenceRanges(text);
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const out: Imm5IPlusOne[] = [];
  let w = 0;
  for (const sentence of sentences) {
    while (w < sorted.length && sorted[w].start < sentence.start) w++;
    let count = 0;
    let unknown: Imm5Word | null = null;
    let unknownCount = 0;
    while (w < sorted.length && sorted[w].start < sentence.end) {
      const word = sorted[w];
      count += 1;
      if (!word.proper && word.level < knownAt) {
        unknownCount += 1;
        unknown = word;
      }
      w++;
    }
    if (unknownCount === 1 && unknown && count >= minWords) {
      out.push({ start: sentence.start, end: sentence.end, word: { start: unknown.start, end: unknown.end } });
    }
  }
  return out;
}
