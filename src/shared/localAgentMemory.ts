export type AgentMemoryCategory = 'user-preference' | 'learning' | 'application';

export interface AgentMemoryEntry {
  id: string;
  category: AgentMemoryCategory;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentMemoryStore {
  version: 1;
  entries: AgentMemoryEntry[];
}

export const EMPTY_AGENT_MEMORY: AgentMemoryStore = { version: 1, entries: [] };

const MAX_ENTRIES = 2_000;
const MAX_ID_LENGTH = 120;
const MAX_KEY_LENGTH = 120;
const MAX_VALUE_LENGTH = 2_000;
const CATEGORIES = new Set<AgentMemoryCategory>([
  'user-preference',
  'learning',
  'application',
]);

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

export function normalizeAgentMemory(input: unknown): AgentMemoryStore {
  if (!input || typeof input !== 'object') return { ...EMPTY_AGENT_MEMORY, entries: [] };
  const rawEntries = Array.isArray((input as { entries?: unknown }).entries)
    ? (input as { entries: unknown[] }).entries
    : [];
  const ids = new Set<string>();
  const entries: AgentMemoryEntry[] = [];
  for (const raw of rawEntries.slice(0, MAX_ENTRIES)) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Partial<AgentMemoryEntry>;
    const id = cleanText(candidate.id, MAX_ID_LENGTH);
    const key = cleanText(candidate.key, MAX_KEY_LENGTH);
    const value = cleanText(candidate.value, MAX_VALUE_LENGTH);
    if (
      !id
      || ids.has(id)
      || !key
      || !value
      || !CATEGORIES.has(candidate.category as AgentMemoryCategory)
    ) {
      continue;
    }
    ids.add(id);
    const createdAt = finiteTimestamp(candidate.createdAt, 0);
    const updatedAt = Math.max(createdAt, finiteTimestamp(candidate.updatedAt, createdAt));
    entries.push({
      id,
      category: candidate.category as AgentMemoryCategory,
      key,
      value,
      createdAt,
      updatedAt,
    });
  }
  return { version: 1, entries };
}

export interface AgentMemoryUpsert {
  id: string;
  category: AgentMemoryCategory;
  key: string;
  value: string;
}

export function upsertAgentMemory(
  store: AgentMemoryStore,
  input: AgentMemoryUpsert,
  now = Date.now(),
): AgentMemoryStore {
  const id = cleanText(input.id, MAX_ID_LENGTH);
  const key = cleanText(input.key, MAX_KEY_LENGTH);
  const value = cleanText(input.value, MAX_VALUE_LENGTH);
  if (!id || !key || !value) throw new Error('Memory ID, key, and value are required.');
  if (!CATEGORIES.has(input.category)) throw new Error('Unknown memory category.');
  const normalized = normalizeAgentMemory(store);
  const index = normalized.entries.findIndex((entry) => entry.id === id);
  const previous = index >= 0 ? normalized.entries[index] : undefined;
  const entry: AgentMemoryEntry = {
    id,
    category: input.category,
    key,
    value,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  const entries = [...normalized.entries];
  if (index >= 0) entries[index] = entry;
  else entries.unshift(entry);
  return { version: 1, entries: entries.slice(0, MAX_ENTRIES) };
}

export function deleteAgentMemory(
  store: AgentMemoryStore,
  id: string,
): AgentMemoryStore {
  const normalized = normalizeAgentMemory(store);
  return {
    version: 1,
    entries: normalized.entries.filter((entry) => entry.id !== id),
  };
}

export function clearAgentMemory(
  store: AgentMemoryStore,
  category?: AgentMemoryCategory,
): AgentMemoryStore {
  if (!category) return { version: 1, entries: [] };
  return {
    version: 1,
    entries: normalizeAgentMemory(store).entries.filter((entry) => entry.category !== category),
  };
}

function queryTerms(query: string): string[] {
  return query
    .normalize('NFKC')
    .toLocaleLowerCase()
    .split(/[\s、。,.!?;:()[\]{}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, 20);
}

export interface AgentMemoryContextOptions {
  categories?: readonly AgentMemoryCategory[];
  maxCharacters?: number;
  maxEntries?: number;
}

export function selectAgentMemoryContext(
  store: AgentMemoryStore,
  query: string,
  options: AgentMemoryContextOptions = {},
): AgentMemoryEntry[] {
  const terms = queryTerms(query);
  const categories = options.categories ? new Set(options.categories) : undefined;
  const maxCharacters = Math.min(20_000, Math.max(0, options.maxCharacters ?? 4_000));
  const maxEntries = Math.min(100, Math.max(0, options.maxEntries ?? 24));
  const scored = normalizeAgentMemory(store).entries
    .filter((entry) => !categories || categories.has(entry.category))
    .map((entry) => {
      const haystack = `${entry.key} ${entry.value}`.normalize('NFKC').toLocaleLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt);

  const selected: AgentMemoryEntry[] = [];
  let used = 0;
  for (const { entry } of scored) {
    const size = entry.key.length + entry.value.length;
    if (selected.length >= maxEntries) break;
    if (used + size > maxCharacters) continue;
    selected.push(entry);
    used += size;
  }
  return selected;
}

