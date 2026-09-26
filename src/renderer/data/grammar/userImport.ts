// Grammar points the learner brings: a CSV, TSV or JSON list of patterns in
// any study language, turned into the corpus's own record shape. Pure, so the
// Grammar app's importer and the tests share one reading of a file.

import type { GrammarExample, GrammarLevel, GrammarPoint } from './types';
import { normalizeStudyLang, studyLangFromTag, studyLangOfText, type StudyLang } from '../../../shared/studyLang';

const JLPT = ['N5', 'N4', 'N3', 'N2', 'N1'];
const HSK = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9'];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** The lowest level of a language's scale, for a row that names none. */
const FIRST_LEVEL: Readonly<Record<StudyLang, GrammarLevel>> = { ja: 'N5', zh: 'HSK1', ru: 'A1' };

export interface GrammarImportResult {
  points: GrammarPoint[];
  /** Rows with no pattern, or no meaning and no example, which cannot be studied. */
  skipped: number;
}

const COLUMN: Readonly<Record<string, keyof RowFields>> = {
  pattern: 'title', title: 'title', grammar: 'title', point: 'title',
  meaning: 'meaning', gloss: 'meaning', english: 'meaning', definition: 'meaning',
  structure: 'structure', form: 'structure', formation: 'structure',
  explanation: 'explanation', notes: 'explanation', note: 'explanation', usage: 'explanation',
  level: 'level', jlpt: 'level', hsk: 'level', cefr: 'level',
  lang: 'lang', language: 'lang',
};

interface RowFields {
  title: string;
  meaning: string;
  structure: string;
  explanation: string;
  level: string;
  lang: string;
}

/** A level string on one of the three scales, or null. `hsk 3`, `n3`, `b1` all read. */
export function normalizeGrammarLevel(value: string): GrammarLevel | null {
  const v = value.trim().toUpperCase().replace(/\s+/g, '');
  if (JLPT.includes(v)) return v as GrammarLevel;
  if (/^[1-5]$/.test(v)) return null;
  const hsk = /^HSK(\d(?:-\d)?)$/.exec(v);
  if (hsk) {
    const band = hsk[1];
    if (['7', '8', '9', '7-9'].includes(band)) return 'HSK7-9';
    return HSK.includes(`HSK${band}`) ? (`HSK${band}` as GrammarLevel) : null;
  }
  return CEFR.includes(v) ? (v as GrammarLevel) : null;
}

function splitRow(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t').map((cell) => cell.trim());
  // CSV with quoted cells ("a, b" stays one cell; "" is a quote).
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cell.trim()); cell = ''; } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

function hashId(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function toPoint(fields: Partial<RowFields>, examples: GrammarExample[], fallbackLang: StudyLang): GrammarPoint | null {
  const title = (fields.title ?? '').trim();
  const meaning = (fields.meaning ?? '').trim();
  if (!title || (!meaning && !examples.length)) return null;
  const lang = studyLangFromTag(fields.lang) ?? studyLangOfText(`${title} ${examples[0]?.jp ?? ''}`, fallbackLang);
  const level = normalizeGrammarLevel(fields.level ?? '');
  return {
    id: `user-${lang}-${hashId(`${title}\u0000${meaning}`)}`,
    lang,
    level: level ?? FIRST_LEVEL[lang],
    title,
    meaning,
    structure: (fields.structure ?? '').trim(),
    explanation: (fields.explanation ?? '').trim(),
    examples,
    register: 'neutral',
    provenance: {
      source: 'user-import',
      ...(fields.level ? { sourceLevel: fields.level } : {}),
      // A row with no usable level was filed at the scale's first band; say so.
      ...(level ? {} : { mappingConfidence: 0 }),
    },
  };
}

function parseTable(text: string, fallbackLang: StudyLang): GrammarImportResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'));
  if (!lines.length) return { points: [], skipped: 0 };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const header = splitRow(lines[0], sep).map((cell) => cell.toLowerCase().replace(/[\s_-]+/g, ''));
  const known = header.some((cell) => COLUMN[cell] !== undefined);
  // Without a header: pattern, meaning, example, translation, level.
  const columns = known ? header : ['pattern', 'meaning', 'example', 'translation', 'level'];
  const body = known ? lines.slice(1) : lines;
  const points: GrammarPoint[] = [];
  let skipped = 0;
  for (const line of body) {
    const cells = splitRow(line, sep);
    const fields: Partial<RowFields> = {};
    const examples: GrammarExample[] = [];
    let pendingExample = '';
    columns.forEach((column, index) => {
      const value = cells[index] ?? '';
      if (!value) return;
      if (/^(example|sentence)\d*$/.test(column)) {
        if (pendingExample) examples.push({ jp: pendingExample, en: '' });
        pendingExample = value;
        return;
      }
      if (/^(translation|exampletranslation|en)\d*$/.test(column)) {
        if (pendingExample) {
          examples.push({ jp: pendingExample, en: value });
          pendingExample = '';
        }
        return;
      }
      const key = COLUMN[column];
      if (key) fields[key] = value;
    });
    if (pendingExample) examples.push({ jp: pendingExample, en: '' });
    const point = toPoint(fields, examples, fallbackLang);
    if (point) points.push(point);
    else skipped += 1;
  }
  return { points, skipped };
}

function parseJson(value: unknown, fallbackLang: StudyLang): GrammarImportResult {
  const rows = Array.isArray(value) ? value
    : value && typeof value === 'object' && Array.isArray((value as { points?: unknown }).points)
      ? (value as { points: unknown[] }).points
      : [];
  const points: GrammarPoint[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') { skipped += 1; continue; }
    const r = row as Record<string, unknown>;
    const str = (...keys: string[]): string => {
      for (const key of keys) if (typeof r[key] === 'string' && (r[key] as string).trim()) return (r[key] as string).trim();
      return '';
    };
    const examples: GrammarExample[] = (Array.isArray(r.examples) ? r.examples : [])
      .map((ex): GrammarExample | null => {
        if (typeof ex === 'string') return { jp: ex, en: '' };
        if (!ex || typeof ex !== 'object') return null;
        const e = ex as Record<string, unknown>;
        const sentence = [e.jp, e.text, e.sentence, e.source].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
        if (!sentence) return null;
        const translation = [e.en, e.translation, e.target].find((v) => typeof v === 'string') as string | undefined;
        return { jp: sentence.trim(), en: (translation ?? '').trim() };
      })
      .filter((ex): ex is GrammarExample => ex !== null);
    const point = toPoint({
      title: str('title', 'pattern', 'grammar'),
      meaning: str('meaning', 'gloss', 'english', 'definition'),
      structure: str('structure', 'form'),
      explanation: str('explanation', 'notes', 'usage'),
      level: str('level', 'jlpt', 'hsk', 'cefr'),
      lang: str('lang', 'language'),
    }, examples, fallbackLang);
    if (point) points.push(point);
    else skipped += 1;
  }
  return { points, skipped };
}

/** Read a grammar list file. `fallbackLang` decides rows whose language nothing else settles. */
export function parseGrammarImport(text: string, fileName: string, fallbackLang: StudyLang = 'ja'): GrammarImportResult {
  const lang = normalizeStudyLang(fallbackLang);
  if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(text)) {
    try {
      return parseJson(JSON.parse(text) as unknown, lang);
    } catch {
      return { points: [], skipped: 0 };
    }
  }
  return parseTable(text, lang);
}

/** A small working list in each format, shown in the import dialog. */
export const GRAMMAR_TEMPLATE_CSV = [
  'pattern,meaning,structure,level,lang,example,translation',
  '〜てもいい,may; it is all right to,Vて + もいい,N5,ja,ここに座ってもいいですか。,May I sit here?',
  '是……的,stresses when/where/how something happened,是 + detail + V + 的,HSK2,zh,我是坐火车来的。,I came by train.',
  'нужно + inf.,it is necessary to,dative + нужно + infinitive,A2,ru,Мне нужно работать.,I need to work.',
].join('\n');

export const GRAMMAR_TEMPLATE_JSON = JSON.stringify(
  {
    points: [
      {
        pattern: '〜てもいい',
        meaning: 'may; it is all right to',
        structure: 'Vて + もいい',
        level: 'N5',
        lang: 'ja',
        examples: [{ sentence: 'ここに座ってもいいですか。', translation: 'May I sit here?' }],
      },
      {
        pattern: 'нужно + inf.',
        meaning: 'it is necessary to',
        level: 'A2',
        lang: 'ru',
        examples: [{ sentence: 'Мне нужно работать.', translation: 'I need to work.' }],
      },
    ],
  },
  null,
  2,
);
