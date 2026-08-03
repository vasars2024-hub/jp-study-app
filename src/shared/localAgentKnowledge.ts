export type AgentKnowledgeKind =
  | 'grammar'
  | 'vocabulary'
  | 'kanji'
  | 'media'
  | 'note'
  | 'study-history'
  | 'plugin';

export interface AgentKnowledgeRecord {
  id: string;
  kind: AgentKnowledgeKind;
  title: string;
  content: string;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, string | number | boolean>>;
  updatedAt: number;
}

export interface AgentKnowledgeSearchOptions {
  kinds?: readonly AgentKnowledgeKind[];
  level?: string;
  limit?: number;
}

export interface AgentKnowledgeResult extends AgentKnowledgeRecord {
  score: number;
  matchedTerms: string[];
}

const KINDS = new Set<AgentKnowledgeKind>([
  'grammar',
  'vocabulary',
  'kanji',
  'media',
  'note',
  'study-history',
  'plugin',
]);
const MAX_RECORDS = 10_000;
const MAX_FIELD_LENGTH = 2_000;
const MAX_TAGS = 32;

function text(value: unknown, max = MAX_FIELD_LENGTH): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, max) : '';
}

function terms(value: string): string[] {
  const normalized = text(value, 500).toLocaleLowerCase();
  const words = normalized.split(/[\s、。,.!?;:()[\]{}「」『』]+/u).filter((term) => term.length > 1);
  // Japanese has no required spaces. Keep compact query strings intact while
  // also making each character available for short kanji/word lookups.
  if (words.length === 0 && normalized.length > 0) return [normalized];
  return [...new Set(words)].slice(0, 32);
}

function normalizeRecord(value: unknown): AgentKnowledgeRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AgentKnowledgeRecord>;
  const id = text(candidate.id, 160);
  const title = text(candidate.title);
  const content = text(candidate.content);
  const kind = KINDS.has(candidate.kind as AgentKnowledgeKind)
    ? candidate.kind as AgentKnowledgeKind
    : null;
  if (!id || !kind || !title || !content) return null;
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => text(tag, 120)).filter(Boolean).slice(0, MAX_TAGS)
    : undefined;
  const metadata: Record<string, string | number | boolean> = {};
  if (candidate.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata)) {
    for (const [key, raw] of Object.entries(candidate.metadata)) {
      if ((typeof raw === 'string' && text(key, 80)) || typeof raw === 'number' || typeof raw === 'boolean') {
        metadata[text(key, 80)] = typeof raw === 'string' ? text(raw, 300) : raw;
      }
    }
  }
  return {
    id,
    kind,
    title,
    content,
    ...(tags?.length ? { tags } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
    updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
      ? Math.max(0, Math.floor(candidate.updatedAt))
      : 0,
  };
}

export function normalizeAgentKnowledge(input: unknown): AgentKnowledgeRecord[] {
  const values = Array.isArray(input) ? input : [];
  const ids = new Set<string>();
  const records: AgentKnowledgeRecord[] = [];
  for (const value of values.slice(0, MAX_RECORDS)) {
    const record = normalizeRecord(value);
    if (!record || ids.has(record.id)) continue;
    ids.add(record.id);
    records.push(record);
  }
  return records;
}

const ALIASES: readonly (readonly string[])[] = [
  ['slice of life', '日常', 'iyashikei', 'everyday life'],
  ['simple', 'easy', 'beginner', 'やさしい', '簡単', '初級'],
  ['difficult', 'hard', 'advanced', '難しい', '上級'],
  ['vocabulary', 'word', 'words', '語彙', '単語'],
  ['grammar', '文法', '構文'],
  ['study', 'learning', '勉強', '学習'],
];

function aliasMatches(queryTerms: readonly string[], haystack: string): number {
  return ALIASES.reduce((score, group) => {
    const queryHas = group.some((alias) => queryTerms.some((term) => term.includes(alias) || alias.includes(term)));
    const recordHas = group.some((alias) => haystack.includes(alias));
    return score + (queryHas && recordHas ? 5 : 0);
  }, 0);
}

function scoreRecord(record: AgentKnowledgeRecord, query: string): { score: number; matchedTerms: string[] } {
  const queryTerms = terms(query);
  const title = record.title.toLocaleLowerCase();
  const content = record.content.toLocaleLowerCase();
  const tags = (record.tags ?? []).join(' ').toLocaleLowerCase();
  const haystack = `${title} ${content} ${tags}`;
  const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
  let score = 0;
  if (haystack.includes(query.toLocaleLowerCase().trim())) score += 20;
  for (const term of matchedTerms) {
    score += title.includes(term) ? 12 : tags.includes(term) ? 8 : 3;
  }
  score += aliasMatches(queryTerms, haystack);
  return { score, matchedTerms };
}

export function searchAgentKnowledge(
  records: readonly AgentKnowledgeRecord[],
  query: string,
  options: AgentKnowledgeSearchOptions = {},
): AgentKnowledgeResult[] {
  const normalizedQuery = text(query, 500);
  if (!normalizedQuery) return [];
  const allowedKinds = options.kinds ? new Set(options.kinds) : null;
  const level = options.level?.trim().toLocaleLowerCase();
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20)));
  return normalizeAgentKnowledge(records)
    .filter((record) => !allowedKinds || allowedKinds.has(record.kind))
    .filter((record) => !level || String(record.metadata?.level ?? '').toLocaleLowerCase() === level)
    .map((record) => ({ record, ...scoreRecord(record, normalizedQuery) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.record.updatedAt - left.record.updatedAt)
    .slice(0, limit)
    .map(({ record, score, matchedTerms }) => ({ ...record, score, matchedTerms }));
}
