// Bounded dictionary-lookup evidence shared by Recent Lookups, Notebook, and
// Study Mode's repeated-lookup pack. This remains the single lookup history
// store; repetition metadata is folded into each recent entry.

export interface LookupHistoryEntry {
  query: string;
  /** Canonical dictionary expression (de-inflected when available). */
  lemma: string;
  reading?: string;
  meaning?: string;
  jlptLevel?: string;
  context?: string;
  lang: 'ja' | 'zh';
  at: number;
  firstAt: number;
  count: number;
  /** Last bounded lookup times, oldest to newest. */
  lookupTimes: number[];
}

export interface LookupRecordInput {
  query: string;
  lemma?: string;
  reading?: string;
  meaning?: string;
  jlptLevel?: string;
  context?: string;
  lang?: 'ja' | 'zh';
}

const KEY = 'jp-lookup-history';
const MAX = 40;
const MAX_TIMES_PER_ENTRY = 8;
export const REPEATED_LOOKUP_WINDOW_MS = 30 * 86_400_000;
export const LOOKUP_HISTORY_EVENT = 'lookup-history-changed';

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeEntry(value: unknown): LookupHistoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<LookupHistoryEntry>;
  const query = cleanText(raw.query, 80);
  if (!query) return null;
  const lemma = cleanText(raw.lemma, 80) || query;
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0;
  const storedTimes = Array.isArray(raw.lookupTimes)
    ? raw.lookupTimes.filter((time): time is number =>
      typeof time === 'number' && Number.isFinite(time) && time >= 0)
    : [];
  const lookupTimes = (storedTimes.length ? storedTimes : [at])
    .sort((a, b) => a - b)
    .slice(-MAX_TIMES_PER_ENTRY);
  const firstAt = typeof raw.firstAt === 'number' && Number.isFinite(raw.firstAt)
    ? Math.min(raw.firstAt, lookupTimes[0] ?? raw.firstAt)
    : lookupTimes[0] ?? at;
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count)
    ? Math.max(lookupTimes.length, Math.floor(raw.count))
    : lookupTimes.length;
  return {
    query,
    lemma,
    ...(cleanText(raw.reading, 80) ? { reading: cleanText(raw.reading, 80) } : {}),
    ...(cleanText(raw.meaning, 500) ? { meaning: cleanText(raw.meaning, 500) } : {}),
    ...(cleanText(raw.jlptLevel, 16) ? { jlptLevel: cleanText(raw.jlptLevel, 16) } : {}),
    ...(cleanText(raw.context, 500) ? { context: cleanText(raw.context, 500) } : {}),
    lang: raw.lang === 'zh' ? 'zh' : 'ja',
    at: lookupTimes[lookupTimes.length - 1] ?? at,
    firstAt,
    count,
    lookupTimes,
  };
}

export function loadLookupHistory(): LookupHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.flatMap((entry) => {
        const normalized = normalizeEntry(entry);
        return normalized ? [normalized] : [];
      }).sort((a, b) => b.at - a.at).slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

function persist(list: LookupHistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(LOOKUP_HISTORY_EVENT));
  } catch {
    /* tests */
  }
}

/** Record one successful user lookup, folding repeated forms into one lemma. */
export function recordLookup(input: string | LookupRecordInput, now = Date.now()): void {
  const record = typeof input === 'string' ? { query: input } : input;
  const query = cleanText(record.query, 80);
  if (!query || !Number.isFinite(now)) return;
  const lemma = cleanText(record.lemma, 80) || query;
  const lang = record.lang === 'zh' ? 'zh' : 'ja';
  const prev = loadLookupHistory();
  const match = prev.find((entry) => entry.lang === lang && entry.lemma === lemma);
  const next: LookupHistoryEntry = {
    query,
    lemma,
    reading: cleanText(record.reading, 80) || match?.reading,
    meaning: cleanText(record.meaning, 500) || match?.meaning,
    jlptLevel: cleanText(record.jlptLevel, 16) || match?.jlptLevel,
    context: cleanText(record.context, 500) || match?.context,
    lang,
    at: now,
    firstAt: match?.firstAt ?? now,
    count: (match?.count ?? 0) + 1,
    lookupTimes: [...(match?.lookupTimes ?? []), now].slice(-MAX_TIMES_PER_ENTRY),
  };
  persist([next, ...prev.filter((entry) => !(entry.lang === lang && entry.lemma === lemma))]);
}

export function recentLookupCount(
  entry: LookupHistoryEntry,
  now = Date.now(),
  windowMs = REPEATED_LOOKUP_WINDOW_MS,
): number {
  const since = now - Math.max(0, windowMs);
  return entry.lookupTimes.filter((time) => time >= since && time <= now).length;
}

export function repeatedLookupEntries(
  entries: readonly LookupHistoryEntry[],
  options: {
    now?: number;
    windowMs?: number;
    minimumLookups?: number;
    exclude?: (entry: LookupHistoryEntry) => boolean;
  } = {},
): LookupHistoryEntry[] {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? REPEATED_LOOKUP_WINDOW_MS;
  const minimum = Math.max(2, Math.floor(options.minimumLookups ?? 2));
  return entries
    .filter((entry) =>
      entry.lang === 'ja'
      && /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff々]/.test(entry.lemma)
      && recentLookupCount(entry, now, windowMs) >= minimum
      && !options.exclude?.(entry))
    .sort((a, b) =>
      recentLookupCount(b, now, windowMs) - recentLookupCount(a, now, windowMs)
      || b.at - a.at
      || a.lemma.localeCompare(b.lemma, 'ja'));
}

export function clearLookupHistory(): void {
  persist([]);
}

export function onLookupHistoryChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(LOOKUP_HISTORY_EVENT, h);
  return () => window.removeEventListener(LOOKUP_HISTORY_EVENT, h);
}
