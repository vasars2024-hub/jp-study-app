// Yomitan zip parsing, with no Electron in it.
//
// Split out of `yomitan.ts` so the dictionary utility process
// (`importWorker.ts`) can run it. Parsing a bundled JMdict on the main process
// blocked Electron's main loop for ~10 s on first boot and left ~900 MB of
// garbage in its heap; the major GC that eventually collected it stopped the
// main process for another 5-8 s (all IPC, the debug bridge and every window's
// main-process calls), measured 2026-10-13 with an inspector on the E2E app.
// In the utility process the work and its garbage die with the process.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { writeJsonAtomicSync } from '../atomicJson';
import type { DictSense, YomitanDictInfo } from '../../shared/types';
import { detectLangFromTitle } from './glossLang';
import { parseTagBankRows, splitSenseTags, splitTagField, type DictTagBank } from '../../shared/dictTagBank';
import { decodeBasicEntities, escapeHtmlText, sanitizeDictHtml } from '../../shared/dictHtmlSanitize';
import { extractStructuredSenses } from '../../shared/structuredSenses';
import { isJmdictPriorityCode, jmdictPriorityCodes } from '../../shared/jmdictPriority';
import { wordTypeOfRule, type WordType } from '../../shared/deinflect';

export interface StoredGlossaryEntry {
  word: string;
  reading: string;
  score: number;
  senses: DictSense[];
  glossaryHtml?: string;
  /** Title of the dictionary this entry came from (tagged at load time). */
  source?: string;
  /** Gloss languages of the source dictionary (tagged at load time). */
  langs?: string[];
  /** JMdict priority codes the row carried (`shared/jmdictPriority.ts`); absent when none. */
  prio?: string[];
}

export interface StoredPitchEntry {
  reading: string;
  /** Downstep mora positions (0 = heiban). */
  positions: number[];
}

/** One term/reading's IPA transcriptions from a Yomitan `ipa` term_meta row. */
export interface StoredIpaEntry {
  reading: string;
  transcriptions: string[];
}

/**
 * One character from a Yomitan kanji dictionary. These archives used to be
 * refused ("no usable term or metadata banks") or, bundled with terms, had
 * their kanji banks silently skipped; the unified database has a character
 * table (`char_sources`) the migration now writes them into.
 */
export interface StoredKanjiEntry {
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  strokes?: number;
  jlpt?: string;
  grade?: number;
  freq?: number;
}

export interface StoredDictIndex {
  version: 1;
  info: YomitanDictInfo;
  /** key = normalized term */
  terms?: Record<string, StoredGlossaryEntry[]>;
  /** key = term\x01reading */
  pitch?: Record<string, StoredPitchEntry>;
  /** key = term\x01reading — Yomitan `ipa` term_meta rows. */
  ipa?: Record<string, StoredIpaEntry>;
  /** key = term\x01reading → numeric rank (lower = more common) */
  freq?: Record<string, number>;
  /** key = the character — a Yomitan kanji dictionary's `kanji_bank_*.json`. */
  kanji?: Record<string, StoredKanjiEntry>;
  /**
   * The dictionary's own `tag_bank_*.json`, kept after the senses are resolved.
   * Nothing at lookup time reads it — `resolveSenseTags` bakes the readable
   * labels into the senses at import — but it is the provenance for what those
   * labels mean, and it is what a later re-resolution would need. Stores written
   * before tags were imported simply do not have it.
   */
  tags?: DictTagBank;
}

export function metaKey(term: string, reading: string): string {
  return `${term}\x01${reading || term}`;
}

// ----- Gloss language detection ------------------------------------------------
//
// A dictionary's target language decides which template fields it can serve
// ({expression:ru} needs a ru dictionary). Detection order: manual override →
// index.json metadata → title keywords → gloss script sampling.

function detectLangFromIndexMeta(meta: Record<string, unknown>): string | undefined {
  const candidates = [meta.targetLanguage, meta.isoLanguage, meta.language];
  for (const c of candidates) {
    if (typeof c === 'string' && /^[a-z]{2}/i.test(c.trim())) {
      return c.trim().slice(0, 2).toLowerCase();
    }
  }
  return undefined;
}

/** Sample stored definitions and infer gloss languages from their scripts. */
function detectLangsFromScript(stored: StoredDictIndex): string[] {
  const terms = stored.terms;
  if (!terms) return [];
  const counts = { cyrillic: 0, hangul: 0, latin: 0, japanese: 0, han: 0 };
  let sampled = 0;
  for (const entries of Object.values(terms)) {
    for (const entry of entries) {
      const text = entry.senses
        .flatMap((s) => s.definitions)
        .join(' ')
        .slice(0, 400);
      if (!text.trim()) continue;
      sampled += 1;
      if (/[\u0400-\u04FF]/.test(text)) counts.cyrillic += 1;
      if (/[\uac00-\ud7af]/.test(text)) counts.hangul += 1;
      if (/[a-zA-Z]/.test(text)) counts.latin += 1;
      const kana = /[\u3040-\u30ff]/.test(text);
      const han = /[\u4e00-\u9fff]/.test(text);
      if (kana) counts.japanese += 1;
      else if (han) counts.han += 1;
      if (sampled >= 300) break;
    }
    if (sampled >= 300) break;
  }
  if (!sampled) return [];
  const langs: string[] = [];
  const threshold = sampled * 0.3;
  if (counts.cyrillic > threshold) langs.push('ru');
  if (counts.hangul > threshold) langs.push('ko');
  if (counts.japanese > threshold) langs.push('ja');
  else if (counts.han > threshold) langs.push('zh');
  // Latin last: it is the weakest signal (romaji/tags leak Latin everywhere).
  if (!langs.length && counts.latin > threshold) langs.push('en');
  else if (counts.latin > sampled * 0.6 && !langs.includes('en')) langs.push('en');
  return langs;
}

export function detectGlossLangs(stored: StoredDictIndex, indexMeta?: Record<string, unknown>): string[] {
  if (!stored.info.hasTerms) return [];
  const fromMeta = indexMeta ? detectLangFromIndexMeta(indexMeta) : undefined;
  if (fromMeta) return [fromMeta];
  const fromTitle = detectLangFromTitle(stored.info.title);
  if (fromTitle) return [fromTitle];
  const fromScript = detectLangsFromScript(stored);
  if (fromScript.length) return fromScript;
  return ['en'];
}

export function freqValue(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    const v = (raw as { value: unknown }).value;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

/**
 * Yomitan structured content as HTML. Every string in it is dictionary text,
 * not markup, so it is escaped here; only the tags this function writes itself
 * are markup. (It used to return strings and `text` raw, which let a crafted
 * dictionary inject script into every surface that renders `glossaryHtml`.)
 */
export function renderStructuredContent(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return escapeHtmlText(node);
  if (typeof node === 'number' || typeof node === 'boolean') return escapeHtmlText(String(node));
  if (Array.isArray(node)) return node.map(renderStructuredContent).join('');
  if (typeof node !== 'object') return '';
  const o = node as Record<string, unknown>;
  if (o.type === 'image') return '';
  if (o.tag === 'br') return '<br>';
  if (typeof o.text === 'string') return escapeHtmlText(o.text);
  // Recurse into `content` whether it is an array, a nested object, or a string.
  // Yomitan/JMdict v3 nests content as single objects, not only arrays — the old
  // code only recursed on arrays, so every JMdict gloss rendered as empty.
  if ('content' in o) {
    const inner = renderStructuredContent(o.content);
    const tag = typeof o.tag === 'string' ? o.tag.toLowerCase() : '';
    if (tag === 'li') return `<li>${inner}</li>`;
    if (tag === 'ul' || tag === 'ol') return `<${tag}>${inner}</${tag}>`;
    if (tag === 'div' || tag === 'span' || tag === 'p') return `<${tag}>${inner}</${tag}>`;
    return inner;
  }
  return '';
}

/**
 * Split rendered gloss HTML into individual definition strings, one per list
 * item / line. Without this, stripping the <li> tags ran the glosses together
 * ("selectionchoicescreening" instead of selection / choice / screening).
 */
function htmlToDefinitions(html: string): string[] {
  if (!html) return [];
  // The definitions are plain text (consumers escape them when rendering), so
  // the entities the renderer above wrote are decoded back: `A&amp;B` must reach
  // a consumer as `A&B`, not be escaped a second time into `A&amp;amp;B`.
  return html
    .split(/<\/li>|<br\s*\/?>|<\/p>|<\/div>/i)
    .map((p) => decodeBasicEntities(p.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Exported for the import tests; `parseTermBank` is the production caller. */
export function definitionsToSenses(definitions: unknown): { senses: DictSense[]; glossaryHtml?: string } {
  if (!definitions) return { senses: [] };
  if (typeof definitions === 'string') {
    return { senses: [{ partsOfSpeech: [], definitions: [definitions], tags: [] }] };
  }
  const plain: string[] = [];
  const htmlParts: string[] = [];
  // Senses the structured content itself marked (`shared/structuredSenses.ts`),
  // each with its own part of speech, usage tags and HTML.
  const marked: DictSense[] = [];
  const defArray = Array.isArray(definitions) ? definitions : [definitions];
  for (const def of defArray) {
    if (typeof def === 'string') {
      // A plain string definition is text: kept raw for `senses`, escaped for HTML.
      plain.push(def);
      htmlParts.push(escapeHtmlText(def));
    } else {
      const rendered = renderStructuredContent(def);
      if (!rendered) continue;
      htmlParts.push(rendered);
      const structured = extractStructuredSenses(def);
      if (structured) {
        for (const sense of structured) {
          const html = sanitizeDictHtml(renderStructuredContent(sense.content)) || undefined;
          marked.push({
            partsOfSpeech: sense.partsOfSpeech,
            definitions: sense.definitions,
            tags: sense.tags,
            ...(html ? { html } : {}),
          });
        }
        continue;
      }
      const parts = htmlToDefinitions(rendered);
      if (parts.length) plain.push(...parts);
    }
  }
  // Defence in depth: everything above is already escaped, but the allowlist
  // pass guarantees the stored HTML whatever a future renderer change emits.
  const glossaryHtml = htmlParts.length ? sanitizeDictHtml(htmlParts.join('<br>')) || undefined : undefined;
  const senses: DictSense[] = plain.length ? [{ partsOfSpeech: [], definitions: plain, tags: [] }] : [];
  return { senses: [...senses, ...marked], glossaryHtml };
}

export function parsePitchPositions(raw: unknown): number[] {
  if (typeof raw === 'number' && Number.isFinite(raw)) return [raw];
  if (typeof raw === 'string') {
    if (/^[HL]+$/i.test(raw)) {
      // Pattern string — derive first downstep from H→L transition after initial L.
      const chars = raw.toUpperCase().split('');
      for (let i = 1; i < chars.length; i++) {
        if (chars[i - 1] === 'H' && chars[i] === 'L') return [i];
      }
      return [0];
    }
    return raw
      .split(/[,;／/|]/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

function statNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return String(value ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/** Yomitan v3 kanji rows: [character, onyomi, kunyomi, tags, meanings, stats]. */
export function parseKanjiBank(
  entries: unknown[],
  out: { kanji?: Record<string, StoredKanjiEntry>; info: { hasKanji?: boolean } },
): void {
  const split = (value: unknown): string[] =>
    String(value ?? '').split(/\s+/).map((part) => part.trim()).filter(Boolean);
  for (const row of entries) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const char = String(row[0] ?? '').trim();
    if (!char) continue;
    const meanings = Array.isArray(row[4])
      ? row[4].map((m) => String(m ?? '').trim()).filter(Boolean)
      : [];
    const stats = row[5] && typeof row[5] === 'object' ? (row[5] as Record<string, unknown>) : {};
    const entry: StoredKanjiEntry = { onyomi: split(row[1]), kunyomi: split(row[2]), meanings };
    const strokes = statNumber(stats.strokes);
    const grade = statNumber(stats.grade);
    const freq = statNumber(stats.freq);
    const jlpt = String(stats.jlpt ?? '').trim();
    if (strokes !== undefined) entry.strokes = strokes;
    if (grade !== undefined) entry.grade = grade;
    if (freq !== undefined) entry.freq = freq;
    if (jlpt) entry.jlpt = /^\d$/.test(jlpt) ? `N${jlpt}` : jlpt.toUpperCase();
    if (!out.kanji) out.kanji = {};
    out.kanji[char] = entry;
    out.info.hasKanji = true;
  }
}

function parseTermBank(entries: unknown[], out: StoredDictIndex): void {
  if (!out.terms) out.terms = {};
  for (const row of entries) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const term = String(row[0] ?? '').trim();
    const reading = String(row[1] ?? term).trim();
    if (!term) continue;
    const score = typeof row[4] === 'number' ? row[4] : 0;
    const { senses, glossaryHtml } = definitionsToSenses(row[5]);
    if (!senses.length && !glossaryHtml) continue;
    // Column 2 is this sense's own tag list. It is parked raw here and resolved
    // once the whole zip has been read: a tag bank is free to appear after the
    // term banks in the archive, so classifying now would depend on entry order.
    // Column 7 (termTags) never becomes a usage label — those are headword-level
    // priority markers like `P`/`news1`, which are corpus frequency, not register,
    // and mixing them in would put "common word" among the usage labels. The
    // JMdict priority codes among them (and any a generator put in column 2) are
    // kept apart, as `prio`, for the "common" badge's explanation.
    const rawTags = splitTagField(row[2]);
    // Parked beside whatever the structured content already marked on a sense;
    // `resolveSenseTags` merges the two once the tag bank is known.
    if (rawTags.length) for (const sense of senses) (sense as SenseWithRowTags).rowTags = rawTags;
    // Column 3 is the row's conjugation rules (`v1`, `v5`, `vs`, `vk`, `vz`,
    // `adj-i`): what Yomitan itself checks a de-inflected candidate against. It
    // is parked too, because whether it adds anything depends on the parts of
    // speech the tag bank resolves above.
    const rules = splitTagField(row[3]).filter((rule) => wordTypeOfRule(rule) !== null);
    if (rules.length && senses.length) (senses[0] as SenseWithRowTags).rowRules = rules;
    const prio = jmdictPriorityCodes([...splitTagField(row[7]), ...rawTags]);
    const key = term;
    const list = out.terms[key] ?? [];
    list.push({ word: term, reading, score, senses, glossaryHtml, ...(prio.length ? { prio } : {}) });
    out.terms[key] = list;
    out.info.hasTerms = true;
  }
}

/**
 * Turn the raw tag codes parked on every sense into what the reader sees.
 *
 * Run once, after every bank in the archive has been read. A store whose
 * dictionary shipped no tag bank comes out exactly as it went in — the raw codes
 * are cleared rather than displayed, because an undescribed `ksb` is not a
 * usage label, and that also keeps the on-disk index the same size it was.
 */
function resolveSenseTags(out: StoredDictIndex): void {
  if (!out.terms) return;
  const bank = out.tags ?? {};
  for (const list of Object.values(out.terms)) {
    for (const entry of list) {
      const senses = entry.senses as SenseWithRowTags[];
      for (const sense of senses) {
        // A JMdict priority code in this column is the headword's `prio`, never a usage label.
        const rowTags = sense.rowTags?.filter((tag) => !isJmdictPriorityCode(tag));
        delete sense.rowTags;
        if (!rowTags?.length) continue;
        const { partsOfSpeech, usage } = splitSenseTags(rowTags, bank);
        // The row's tags come first (they name the whole row); tags the structured
        // content marked on this one sense follow, without repeats.
        sense.partsOfSpeech = [...new Set([...partsOfSpeech, ...sense.partsOfSpeech])];
        sense.tags = [...new Set([...usage, ...sense.tags])];
      }
      mergeRowRules(senses);
    }
  }
}

/**
 * Fold the row's rules column into the part-of-speech list the de-inflection
 * check reads (`posMatchesWordTypes`), on the first sense, since the check reads
 * the entry's senses together.
 *
 * Only a rule whose word type no resolved tag already names is added. A
 * dictionary whose definition tags say `v5r` gains nothing from its `v5` rule,
 * so JMdict's part-of-speech line reads exactly as before; one with empty or
 * undescribed definition tags, or only `n` beside a `vs` rule, gets the rule
 * code — without it the check either could not tell (and let まず reach 丸) or
 * rejected a word Yomitan accepts.
 */
function mergeRowRules(senses: SenseWithRowTags[]): void {
  const first = senses[0];
  const rules = first?.rowRules;
  if (!first || !rules) return;
  delete first.rowRules;
  const named = new Set<WordType>();
  for (const sense of senses) {
    for (const tag of sense.partsOfSpeech) {
      const type = wordTypeOfRule(tag);
      if (type) named.add(type);
    }
  }
  const added: string[] = [];
  for (const rule of rules) {
    const type = wordTypeOfRule(rule);
    if (!type || named.has(type)) continue;
    named.add(type);
    added.push(rule);
  }
  if (added.length) first.partsOfSpeech = [...first.partsOfSpeech, ...added];
}

/** A sense while its row's raw tag codes and rules wait for the tag bank. */
type SenseWithRowTags = DictSense & { rowTags?: string[]; rowRules?: string[] };

/**
 * Yomitan term_meta rows: `pitch`, `freq` and `ipa` modes. Exported for the
 * import tests; the zip reader is the only production caller.
 */
export function parseTermMetaBank(
  entries: unknown[],
  out: Pick<StoredDictIndex, 'pitch' | 'freq' | 'ipa'> & { info: Pick<YomitanDictInfo, 'hasPitch' | 'hasFreq' | 'hasIpa'> },
): void {
  for (const row of entries) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const term = String(row[0] ?? '').trim();
    const mode = String(row[1] ?? '');
    const data = row[2];
    if (!term) continue;

    if (mode === 'pitch' && data && typeof data === 'object') {
      const d = data as { reading?: string; pitches?: unknown[] };
      const reading = String(d.reading ?? term).trim();
      const pitches = Array.isArray(d.pitches) ? d.pitches : [];
      const positions: number[] = [];
      for (const p of pitches) {
        if (p && typeof p === 'object' && 'position' in (p as object)) {
          positions.push(...parsePitchPositions((p as { position: unknown }).position));
        }
      }
      if (!positions.length) continue;
      if (!out.pitch) out.pitch = {};
      const key = metaKey(term, reading);
      out.pitch[key] = { reading, positions };
      out.info.hasPitch = true;
    }

    // `{ reading, transcriptions: [{ ipa, tags }] }`. Rows for the same
    // term/reading across banks accumulate rather than replace, and a row with
    // no usable transcription is skipped so it cannot mark the store as IPA.
    if (mode === 'ipa' && data && typeof data === 'object') {
      const d = data as { reading?: string; transcriptions?: unknown[] };
      const reading = String(d.reading ?? term).trim();
      const list = Array.isArray(d.transcriptions) ? d.transcriptions : [];
      const transcriptions: string[] = [];
      for (const item of list) {
        const raw = item && typeof item === 'object' ? (item as { ipa?: unknown }).ipa : item;
        const ipa = typeof raw === 'string' ? raw.trim() : '';
        if (ipa && !transcriptions.includes(ipa)) transcriptions.push(ipa);
      }
      if (!transcriptions.length) continue;
      if (!out.ipa) out.ipa = {};
      const key = metaKey(term, reading);
      const existing = out.ipa[key];
      if (existing) {
        for (const ipa of transcriptions) if (!existing.transcriptions.includes(ipa)) existing.transcriptions.push(ipa);
      } else {
        out.ipa[key] = { reading, transcriptions };
      }
      out.info.hasIpa = true;
    }

    if (mode === 'freq') {
      if (!out.freq) out.freq = {};
      if (typeof data === 'number' || typeof data === 'string') {
        const rank = freqValue(data);
        if (rank !== undefined) {
          out.freq[metaKey(term, term)] = rank;
          out.info.hasFreq = true;
        }
      } else if (data && typeof data === 'object') {
        const d = data as { reading?: string; frequency?: unknown; value?: unknown };
        const reading = String(d.reading ?? term).trim();
        const rank = freqValue(d.frequency ?? d.value ?? data);
        if (rank !== undefined) {
          out.freq[metaKey(term, reading)] = rank;
          out.info.hasFreq = true;
        }
      }
    }
  }
}

/**
 * Read a Yomitan v3 zip into a store. Pure computation over one file: it holds
 * every row of the archive while it works (JMdict: ~300 MB of short-lived
 * objects), so production runs it in the dictionary utility process
 * (`provisionYomitanStore`), never on Electron's main loop.
 */
export function parseYomitanZip(zipPath: string, priority = 0): StoredDictIndex {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const indexEntry = entries.find((e) => e.entryName === 'index.json' || e.entryName.endsWith('/index.json'));
  if (!indexEntry) throw new Error('Not a Yomitan dictionary: index.json is missing.');

  const indexJson = JSON.parse(indexEntry.getData().toString('utf-8')) as {
    title?: string;
    revision?: string;
    format?: number;
  } & Record<string, unknown>;
  if (indexJson.format !== 3) {
    throw new Error(`Unsupported dictionary format (expected v3, got ${String(indexJson.format)}).`);
  }

  const title = String(indexJson.title ?? path.basename(zipPath, '.zip'));
  const id = crypto.createHash('md5').update(`${title}:${zipPath}`).digest('hex').slice(0, 12);

  const stored: StoredDictIndex = {
    version: 1,
    info: {
      id,
      title,
      revision: String(indexJson.revision ?? '1'),
      priority,
      hasTerms: false,
      hasPitch: false,
      hasFreq: false,
      importedAt: Date.now(),
      enabled: true,
    },
  };

  for (const entry of entries) {
    const name = path.basename(entry.entryName);
    if (name.startsWith('term_bank_') && name.endsWith('.json')) {
      const rows = JSON.parse(entry.getData().toString('utf-8')) as unknown[];
      if (Array.isArray(rows)) parseTermBank(rows, stored);
    } else if (name.startsWith('term_meta_bank_') && name.endsWith('.json')) {
      const rows = JSON.parse(entry.getData().toString('utf-8')) as unknown[];
      if (Array.isArray(rows)) parseTermMetaBank(rows, stored);
    } else if (name.startsWith('kanji_bank_') && name.endsWith('.json')) {
      const rows = JSON.parse(entry.getData().toString('utf-8')) as unknown[];
      if (Array.isArray(rows)) parseKanjiBank(rows, stored);
    } else if (name.startsWith('tag_bank_') && name.endsWith('.json')) {
      const rows = JSON.parse(entry.getData().toString('utf-8')) as unknown[];
      if (Array.isArray(rows)) {
        if (!stored.tags) stored.tags = {};
        parseTagBankRows(rows, stored.tags);
      }
    }
  }
  resolveSenseTags(stored);

  if (!stored.info.hasTerms && !stored.info.hasPitch && !stored.info.hasFreq && !stored.info.hasKanji && !stored.info.hasIpa) {
    throw new Error('The archive contains no usable term, kanji or metadata banks.');
  }
  if (stored.info.hasTerms) {
    stored.info.glossLangs = detectGlossLangs(stored, indexJson);
    stored.info.rulesColumn = true;
  }
  return stored;
}

/** What `provisionYomitanStore` changes on a parsed store before writing it. */
export interface YomitanStoreOverrides {
  id?: string;
  title?: string;
  bundled?: boolean;
  priority?: number;
  glossLangs?: readonly string[];
  /**
   * Drop the duplicated glossary HTML: plain senses are enough for definitions,
   * and the bundled JMdict index shrinks ~110 MB -> ~65 MB on disk.
   */
  compact?: boolean;
}

/** The small answer of a provisioning run: never the store itself. */
export interface ProvisionedYomitanStore {
  info: YomitanDictInfo;
  termCount: number;
}

/**
 * Parse `zipPath`, apply `overrides`, and write the store as JSON to `outPath`.
 * Returns only the store's info and size, so the caller never holds the rows.
 */
export function provisionYomitanStore(
  zipPath: string,
  outPath: string,
  overrides: YomitanStoreOverrides = {},
): ProvisionedYomitanStore {
  const stored = parseYomitanZip(zipPath, overrides.priority ?? 0);
  if (overrides.id !== undefined) stored.info.id = overrides.id;
  if (overrides.title !== undefined) stored.info.title = overrides.title;
  if (overrides.bundled !== undefined) stored.info.bundled = overrides.bundled;
  if (overrides.priority !== undefined) stored.info.priority = overrides.priority;
  if (overrides.glossLangs) stored.info.glossLangs = [...overrides.glossLangs];
  if (overrides.compact && stored.terms) {
    for (const list of Object.values(stored.terms)) {
      for (const entry of list) entry.glossaryHtml = undefined;
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // Dictionary indexes are rebuilt by re-importing; no last-good copy.
  writeJsonAtomicSync(outPath, stored, { space: 0, backup: false });
  return { info: stored.info, termCount: Object.keys(stored.terms ?? {}).length };
}

/** Main -> dictionary utility process: parse one zip and write its store. */
export interface YomitanProvisionRequest {
  type: 'provisionYomitan';
  zipPath: string;
  outPath: string;
  overrides?: YomitanStoreOverrides;
}

/** Utility process -> main: the request arrived (disarms the startup watchdog), then the answer. */
export type YomitanProvisionReply =
  | { type: 'provisionYomitanAccepted' }
  | ({ type: 'provisionYomitanResult'; ok: true } & ProvisionedYomitanStore)
  | { type: 'provisionYomitanResult'; ok: false; error: string };
