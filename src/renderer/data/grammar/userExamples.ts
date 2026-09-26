/**
 * Example sentences the learner adds to grammar points: imported from a CSV /
 * TSV / JSON list (template and preview in the shared import dialog), or kept
 * from a Tatoeba search on the point's card. A point that showed "No examples
 * yet" can be filled by the learner instead of staying empty.
 *
 * Stored on this machine, keyed by grammar point id, and shown on the card
 * after the shipped examples.
 */
import { useEffect, useState } from 'react';
import { pick, readImportTable } from '../../../shared/contentImport';
import { writeLocalStorageJson } from '../../localStorageWrite';
import type { GrammarExample, GrammarPoint } from './types';

export const USER_EXAMPLES_KEY = 'jp-grammar-user-examples-v1';
export const USER_EXAMPLES_EVENT = 'grammar-user-examples-changed';

export interface UserGrammarExample extends GrammarExample {
  addedAt: number;
}

export interface ExampleImportRow {
  jp: string;
  reading?: string;
  en: string;
  /** Another point's pattern; the row goes to that point instead of the open one. */
  pattern?: string;
  /** Tatoeba sentence id, when the sentence came from Tatoeba (keeps the CC BY credit). */
  tatoebaId?: string;
  /** Kept from a Tatoeba search on the card (the search returns no ids). */
  fromTatoeba?: boolean;
}

type Store = Record<string, UserGrammarExample[]>;

function readStore(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_EXAMPLES_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [id, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const clean = list.filter(
        (ex): ex is UserGrammarExample => !!ex && typeof ex === 'object' && typeof (ex as UserGrammarExample).jp === 'string',
      );
      if (clean.length) out[id] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: Store): boolean {
  const ok = writeLocalStorageJson(USER_EXAMPLES_KEY, store);
  try {
    window.dispatchEvent(new CustomEvent(USER_EXAMPLES_EVENT));
  } catch {
    /* non-browser context */
  }
  return ok;
}

export function userExamplesFor(pointId: string): UserGrammarExample[] {
  return readStore()[pointId] ?? [];
}

/** Adds sentences to a point, skipping ones it already has; returns how many were new. */
export function addUserExamples(
  pointId: string,
  rows: readonly ExampleImportRow[],
  existing: readonly GrammarExample[] = [],
  now = Date.now(),
): number {
  const store = readStore();
  const list = store[pointId] ?? [];
  const seen = new Set([...existing, ...list].map((ex) => ex.jp.trim()));
  let added = 0;
  for (const row of rows) {
    const jp = row.jp.trim();
    if (!jp || seen.has(jp)) continue;
    seen.add(jp);
    added += 1;
    list.push({
      jp,
      en: row.en.trim(),
      ...(row.reading?.trim() ? { reading: row.reading.trim() } : {}),
      ...(row.tatoebaId || row.fromTatoeba ? { source: 'tatoeba' as const } : {}),
      ...(row.tatoebaId ? { sourceId: row.tatoebaId } : {}),
      addedAt: now,
    });
  }
  if (added) writeStore({ ...store, [pointId]: list });
  return added;
}

export function removeUserExample(pointId: string, jp: string): void {
  const store = readStore();
  const list = (store[pointId] ?? []).filter((ex) => ex.jp !== jp);
  if (list.length) store[pointId] = list;
  else delete store[pointId];
  writeStore(store);
}

export function useUserExamples(pointId: string): UserGrammarExample[] {
  const [list, setList] = useState(() => userExamplesFor(pointId));
  useEffect(() => {
    setList(userExamplesFor(pointId));
    const update = () => setList(userExamplesFor(pointId));
    const onStorage = (e: StorageEvent) => {
      if (e.key === USER_EXAMPLES_KEY) update();
    };
    window.addEventListener(USER_EXAMPLES_EVENT, update);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(USER_EXAMPLES_EVENT, update);
      window.removeEventListener('storage', onStorage);
    };
  }, [pointId]);
  return list;
}

const COLUMNS = ['sentence', 'example', 'text', 'jp', 'translation', 'en', 'meaning', 'reading', 'pinyin', 'pattern', 'grammar', 'tatoeba_id'];

/** Parse a sentence list; rows without a sentence are skipped. Headerless = sentence, translation, reading. */
export function parseExampleImport(text: string, fileName: string): { rows: ExampleImportRow[]; skipped: number } {
  const table = readImportTable(text, fileName, COLUMNS, ['sentence', 'translation', 'reading']);
  const rows: ExampleImportRow[] = [];
  let skipped = 0;
  for (const row of table.rows) {
    const jp = pick(row, 'sentence', 'example', 'text', 'jp', 'source');
    if (!jp) {
      skipped += 1;
      continue;
    }
    const pattern = pick(row, 'pattern', 'grammar', 'point');
    const reading = pick(row, 'reading', 'pinyin', 'furigana');
    const tatoebaId = pick(row, 'tatoeba_id', 'tatoeba', 'source_id');
    rows.push({
      jp,
      en: pick(row, 'translation', 'en', 'meaning', 'english', 'target'),
      ...(reading ? { reading } : {}),
      ...(pattern ? { pattern } : {}),
      ...(/^\d+$/.test(tatoebaId) ? { tatoebaId } : {}),
    });
  }
  return { rows, skipped };
}

function patternKey(text: string): string {
  return text.replace(/[\s〜～~・…()（）]/g, '').toLowerCase();
}

/**
 * Group rows by the point they belong to: a row naming a pattern goes to the
 * point with that title in the same language; every other row to `current`.
 * Rows naming a pattern nobody has are returned as unmatched.
 */
export function assignExampleRows(
  rows: readonly ExampleImportRow[],
  current: GrammarPoint,
  corpus: readonly GrammarPoint[],
): { byPoint: Map<string, ExampleImportRow[]>; unmatched: number } {
  const lang = current.lang ?? 'ja';
  const index = new Map<string, string>();
  for (const p of corpus) {
    if ((p.lang ?? 'ja') !== lang) continue;
    const key = patternKey(p.title);
    if (key && !index.has(key)) index.set(key, p.id);
  }
  const byPoint = new Map<string, ExampleImportRow[]>();
  let unmatched = 0;
  for (const row of rows) {
    const target = row.pattern && patternKey(row.pattern) !== patternKey(current.title)
      ? index.get(patternKey(row.pattern))
      : current.id;
    if (!target) {
      unmatched += 1;
      continue;
    }
    byPoint.set(target, [...(byPoint.get(target) ?? []), row]);
  }
  return { byPoint, unmatched };
}

export const EXAMPLE_TEMPLATE_CSV = [
  'sentence,translation,reading,pattern',
  '# pattern is optional: leave it empty to add the row to the point you have open.',
  'ここに座ってもいいですか。,May I sit here?,ここにすわってもいいですか。,',
  '我是坐火车来的。,I came by train.,Wǒ shì zuò huǒchē lái de.,',
  'Мне нужно работать.,I need to work.,Мне ну\u0301жно рабо\u0301тать.,',
].join('\n');

export const EXAMPLE_TEMPLATE_JSON = JSON.stringify(
  {
    examples: [
      { sentence: 'ここに座ってもいいですか。', translation: 'May I sit here?', reading: 'ここにすわってもいいですか。' },
      { sentence: 'Мне нужно работать.', translation: 'I need to work.' },
    ],
  },
  null,
  2,
);
