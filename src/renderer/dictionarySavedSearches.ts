export const DICTIONARY_SAVED_SEARCHES_KEY = 'jp-os-dictionary-saved-searches-v1';
export const DICTIONARY_SAVED_SEARCHES_LIMIT = 24;

export interface DictionarySavedSearch {
  query: string;
  lang: 'ja' | 'zh';
}

let memory: DictionarySavedSearch[] = [];

function normalize(value: unknown): DictionarySavedSearch | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DictionarySavedSearch>;
  const query = typeof candidate.query === 'string' ? candidate.query.trim() : '';
  if (!query || (candidate.lang !== 'ja' && candidate.lang !== 'zh')) return null;
  return { query, lang: candidate.lang };
}

function readPersisted(): DictionarySavedSearch[] | null {
  try {
    const raw = localStorage.getItem(DICTIONARY_SAVED_SEARCHES_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const unique = new Map<string, DictionarySavedSearch>();
    for (const value of parsed) {
      const item = normalize(value);
      if (item) unique.set(`${item.lang}\0${item.query.toLocaleLowerCase()}`, item);
    }
    return [...unique.values()].slice(0, DICTIONARY_SAVED_SEARCHES_LIMIT);
  } catch {
    return null;
  }
}

function persist(): void {
  localStorage.setItem(DICTIONARY_SAVED_SEARCHES_KEY, JSON.stringify(memory));
}

export function loadDictionarySavedSearches(): DictionarySavedSearch[] {
  const persisted = readPersisted();
  if (persisted !== null) memory = persisted;
  return [...memory];
}

export function saveDictionarySearch(item: DictionarySavedSearch): DictionarySavedSearch[] {
  const normalized = normalize(item);
  if (!normalized) return loadDictionarySavedSearches();
  const current = loadDictionarySavedSearches().filter(
    (saved) => saved.lang !== normalized.lang || saved.query.toLocaleLowerCase() !== normalized.query.toLocaleLowerCase(),
  );
  memory = [normalized, ...current].slice(0, DICTIONARY_SAVED_SEARCHES_LIMIT);
  persist();
  return [...memory];
}

export function removeDictionarySavedSearch(item: DictionarySavedSearch): DictionarySavedSearch[] {
  memory = loadDictionarySavedSearches().filter(
    (saved) => saved.lang !== item.lang || saved.query.toLocaleLowerCase() !== item.query.trim().toLocaleLowerCase(),
  );
  persist();
  return [...memory];
}

export function clearDictionarySavedSearches(): void {
  memory = [];
  localStorage.removeItem(DICTIONARY_SAVED_SEARCHES_KEY);
}
