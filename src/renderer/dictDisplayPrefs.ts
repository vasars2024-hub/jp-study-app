/**
 * The dictionary's result layout in the renderer: one cached copy of what main
 * stores (`dict:displayPrefsGet`), shared by every DictionaryResults on the page
 * and the popup, plus the user's dictionary order for sorting sections.
 *
 * Main owns the file so the browser extension's `/v1/scan` reads the same
 * choice; nothing here touches localStorage. A window that cannot reach main
 * (tests, an older main) keeps the defaults.
 */
import { DEFAULT_DICT_DISPLAY_PREFS, normalizeDictDisplayPrefs, type DictDisplayPrefs } from '../shared/dictDisplay';

export const DICT_DISPLAY_EVENT = 'dict-display-prefs-changed';

let prefs: DictDisplayPrefs = DEFAULT_DICT_DISPLAY_PREFS;
let loaded: Promise<DictDisplayPrefs> | null = null;
let titles: string[] = [];
let titlesAt = 0;
const TITLES_TTL_MS = 30_000;

function emit(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DICT_DISPLAY_EVENT, { detail: prefs }));
}

/** The layout as last read; the defaults until main has answered. */
export function getDictDisplayPrefs(): DictDisplayPrefs {
  return prefs;
}

/** Ask main once (again with `force`); resolves to the current layout either way. */
export function loadDictDisplayPrefs(force = false): Promise<DictDisplayPrefs> {
  if (loaded && !force) return loaded;
  const api = typeof window !== 'undefined' ? window.api?.dictDisplayPrefsGet : undefined;
  if (typeof api !== 'function') return Promise.resolve(prefs);
  loaded = api()
    .then((raw) => {
      const next = normalizeDictDisplayPrefs(raw);
      const changed = next.mode !== prefs.mode || next.collapseSecondary !== prefs.collapseSecondary;
      prefs = next;
      if (changed) emit();
      return prefs;
    })
    .catch(() => prefs);
  return loaded;
}

/** Save a new layout through main and tell every mounted list. */
export async function saveDictDisplayPrefs(next: DictDisplayPrefs): Promise<DictDisplayPrefs> {
  prefs = normalizeDictDisplayPrefs(next);
  emit();
  const api = typeof window !== 'undefined' ? window.api?.dictDisplayPrefsSet : undefined;
  if (typeof api === 'function') {
    try {
      prefs = normalizeDictDisplayPrefs(await api(prefs));
      loaded = Promise.resolve(prefs);
    } catch {
      /* the in-memory choice stands for this window */
    }
  }
  return prefs;
}

export function onDictDisplayPrefsChanged(cb: (prefs: DictDisplayPrefs) => void): () => void {
  const handler = (): void => cb(prefs);
  window.addEventListener(DICT_DISPLAY_EVENT, handler);
  return () => window.removeEventListener(DICT_DISPLAY_EVENT, handler);
}

/** Enabled dictionary titles in the user's order, cached briefly; empty until read. */
export function cachedDictionaryOrder(): string[] {
  return titles;
}

export function loadDictionaryOrder(now = Date.now()): Promise<string[]> {
  if (titles.length && now - titlesAt < TITLES_TTL_MS) return Promise.resolve(titles);
  const api = typeof window !== 'undefined' ? window.api?.dictListSources : undefined;
  if (typeof api !== 'function') return Promise.resolve(titles);
  return api()
    .then((sources) => {
      titles = (sources ?? []).filter((source) => source.enabled).map((source) => source.title);
      titlesAt = now;
      return titles;
    })
    .catch(() => titles);
}

/** Tests only. */
export function resetDictDisplayPrefsState(): void {
  prefs = DEFAULT_DICT_DISPLAY_PREFS;
  loaded = null;
  titles = [];
  titlesAt = 0;
}
