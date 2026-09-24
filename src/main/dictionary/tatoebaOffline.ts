// Offline Tatoeba example index: grows from API cache + optional CSV import.
// Japanese sentences are indexed by contained terms; English comes from import
// or is filled later by Qwen3 in the renderer.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { readJson, writeJsonAtomicSync } from '../atomicJson';

export interface StoredExample {
  jp: string;
  en: string;
}

interface OfflineIndex {
  version: 1;
  sentences: StoredExample[];
  /** Lookup term -> sentence indices (Japanese tokens / query keys). */
  terms: Record<string, number[]>;
  updatedAt: number;
}

const MAX_SENTENCES = 250_000;

let index: OfflineIndex | null = null;
let loadPromise: Promise<void> | null = null;

function indexPath(): string {
  return path.join(app.getPath('userData'), 'tatoeba', 'index.json');
}

function emptyIndex(): OfflineIndex {
  return { version: 1, sentences: [], terms: {}, updatedAt: Date.now() };
}

function tokenizeForIndex(jp: string): string[] {
  const keys = new Set<string>();
  const re = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(jp))) {
    const t = m[0];
    if (t.length >= 1) keys.add(t);
  }
  return [...keys];
}

function indexSentence(idx: number, jp: string, terms: Record<string, number[]>): void {
  for (const key of tokenizeForIndex(jp)) {
    const list = terms[key] ?? [];
    if (list.length < 64 && list[list.length - 1] !== idx) list.push(idx);
    terms[key] = list;
  }
}

function dedupeKey(jp: string, en: string): string {
  return `${jp}\0${en}`;
}

async function ensureLoaded(): Promise<OfflineIndex> {
  if (index) return index;
  if (!loadPromise) {
    loadPromise = (async () => {
      index = await readJson<OfflineIndex>(indexPath(), emptyIndex, {
        validate: (v) => {
          const parsed = v as OfflineIndex | null;
          return parsed?.version === 1 && Array.isArray(parsed.sentences);
        },
      });
    })();
  }
  await loadPromise;
  return index!;
}

function persist(): void {
  if (!index) return;
  index.updatedAt = Date.now();
  writeJsonAtomicSync(indexPath(), index, { space: 0 });
}

function addSentence(jp: string, en: string, seen: Set<string>): boolean {
  if (!index) return false;
  const j = jp.trim();
  if (!j || index.sentences.length >= MAX_SENTENCES) return false;
  const e = en.trim();
  const key = dedupeKey(j, e);
  if (seen.has(key)) return false;
  seen.add(key);
  const idx = index.sentences.length;
  index.sentences.push({ jp: j, en: e });
  indexSentence(idx, j, index.terms);
  return true;
}

/** Merge API / import results into the persistent offline index. */
export async function cacheExamples(examples: StoredExample[]): Promise<void> {
  await ensureLoaded();
  const seen = new Set(index!.sentences.map((s) => dedupeKey(s.jp, s.en)));
  let added = 0;
  for (const ex of examples) {
    if (addSentence(ex.jp, ex.en, seen)) added++;
  }
  if (added > 0) persist();
}

export async function offlineStatus(): Promise<{ installed: boolean; sentenceCount: number; updatedAt: number }> {
  const idx = await ensureLoaded();
  return {
    installed: idx.sentences.length > 0,
    sentenceCount: idx.sentences.length,
    updatedAt: idx.updatedAt,
  };
}

export async function searchOffline(query: string, limit: number): Promise<StoredExample[]> {
  const q = query.trim();
  if (!q) return [];
  const idx = await ensureLoaded();
  if (idx.sentences.length === 0) return [];

  const hitIds = new Set<number>();
  for (const key of tokenizeForIndex(q)) {
    for (const id of idx.terms[key] ?? []) hitIds.add(id);
  }
  if (hitIds.size === 0) {
    for (const key of idx.terms[q] ?? []) hitIds.add(key);
  }

  const out: StoredExample[] = [];
  const pushId = (id: number): void => {
    const s = idx.sentences[id];
    if (!s || !s.jp.includes(q)) return;
    if (out.some((x) => x.jp === s.jp && x.en === s.en)) return;
    out.push(s);
  };

  for (const id of hitIds) {
    pushId(id);
    if (out.length >= limit) return out;
  }

  if (out.length < limit) {
    for (let i = 0; i < idx.sentences.length && out.length < limit; i++) {
      if (idx.sentences[i].jp.includes(q)) pushId(i);
    }
  }

  out.sort((a, b) => {
    const ae = a.jp.indexOf(q);
    const be = b.jp.indexOf(q);
    if (ae !== be) return ae - be;
    return a.jp.length - b.jp.length;
  });
  return out.slice(0, limit);
}

/** Parse Tatoeba sentences.csv (id, lang, text) or TSV; keep Japanese rows. */
async function parseSentencesCsv(filePath: string, onProgress?: (n: number) => void): Promise<number> {
  await ensureLoaded();
  const seen = new Set(index!.sentences.map((s) => dedupeKey(s.jp, s.en)));
  let added = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.split('\t');
    const comma = line.split(',');
    let lang = '';
    let text = '';
    if (tab.length >= 3) {
      lang = tab[1]?.trim().toLowerCase() ?? '';
      text = tab.slice(2).join('\t').trim();
    } else if (comma.length >= 3) {
      lang = comma[1]?.trim().toLowerCase() ?? '';
      text = comma.slice(2).join(',').replace(/^"|"$/g, '').trim();
    }
    if (lang !== 'jpn' && lang !== 'ja' && lang !== 'japanese') continue;
    if (addSentence(text, '', seen)) {
      added++;
      if (added % 5000 === 0) onProgress?.(added);
    }
  }
  if (added > 0) persist();
  return added;
}

/** Merge English translations from Tatoeba links + eng sentences CSV. */
async function mergeEngTranslations(sentencesCsv: string, linksCsv: string): Promise<number> {
  await ensureLoaded();
  const jpnById = new Map<string, string>();
  const engById = new Map<string, string>();

  const readCsv = async (filePath: string, langCode: string, out: Map<string, string>): Promise<void> => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const id = parts[0]?.trim();
      const lang = parts[1]?.trim().toLowerCase();
      const text = parts.slice(2).join('\t').trim();
      if (id && lang === langCode) out.set(id, text);
    }
  };

  await readCsv(sentencesCsv, 'jpn', jpnById);
  await readCsv(sentencesCsv, 'eng', engById);

  const pairs = new Map<string, string>();
  const rl = readline.createInterface({
    input: fs.createReadStream(linksCsv, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line || line.startsWith('#')) continue;
    const [a, b] = line.split('\t');
    if (!a || !b) continue;
    const jpn = jpnById.get(a);
    const eng = engById.get(b);
    if (jpn && eng) pairs.set(jpn, eng);
    const jpn2 = jpnById.get(b);
    const eng2 = engById.get(a);
    if (jpn2 && eng2) pairs.set(jpn2, eng2);
  }

  let updated = 0;
  for (const s of index!.sentences) {
    if (!s.en) {
      const en = pairs.get(s.jp);
      if (en) {
        s.en = en;
        updated++;
      }
    }
  }
  if (updated > 0) persist();
  return updated;
}

export async function importOfflineExamples(
  sentencesPath: string,
  linksPath?: string,
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; added: number; error?: string }> {
  try {
    onProgress?.('Reading Japanese sentences…');
    const added = await parseSentencesCsv(sentencesPath, (n) =>
      onProgress?.(`Indexed ${n.toLocaleString()} sentences…`),
    );
    if (linksPath && fs.existsSync(linksPath)) {
      onProgress?.('Merging English translations…');
      await mergeEngTranslations(sentencesPath, linksPath);
    }
    return { ok: true, added };
  } catch (err) {
    return { ok: false, added: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
