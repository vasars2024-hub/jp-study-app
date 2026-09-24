// Offline Yomitan / Yomichan dictionary import, indexing, and lookup.
// Parsed indices live in userData/yomitan/<id>/ and are shared by the
// dictionary pop-up (IPC) and the mining aggregator (gatherMiningValues).

import { moraPitch, splitMorae as splitMoraeShared } from '../../shared/pitchAccent';
import type { PitchEntry, PitchLookup } from '../../shared/pitchAccent';
import { app, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonSync, writeJsonAtomicSync } from '../atomicJson';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import type { DeinflectionInfo, DictEntry, DictResult, DictSense, YomitanDictInfo } from '../../shared/types';
import { deinflect } from '../../shared/deinflect';
import { mt } from '../i18n';
import {
  initDictionaryService,
  pendingLegacyStores,
  removeDictionarySource,
  setDictionarySourceEnabled,
  syncDictionarySourceOrder,
} from './service';
import { fetchProviderAudio } from './audio';
import { normalizeAudioIdentity } from '../../shared/lexiconAudio';
import { BUNDLED_GLOSS_LANGS, detectLangFromTitle } from './glossLang';
import { parseTagBankRows, splitSenseTags, splitTagField, type DictTagBank } from '../../shared/dictTagBank';

interface StoredGlossaryEntry {
  word: string;
  reading: string;
  score: number;
  senses: DictSense[];
  glossaryHtml?: string;
  /** Title of the dictionary this entry came from (tagged at load time). */
  source?: string;
  /** Gloss languages of the source dictionary (tagged at load time). */
  langs?: string[];
}

interface StoredPitchEntry {
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

interface StoredDictIndex {
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

interface RegistryFile {
  dicts: YomitanDictInfo[];
}

// ----- In-memory merged indices ----------------------------------------------

const glossaryByTerm = new Map<string, StoredGlossaryEntry[]>();
const pitchByKey = new Map<string, StoredPitchEntry>();
const ipaByKey = new Map<string, StoredIpaEntry>();
/**
 * Merged corpus ranks, each remembering which dictionary produced it.
 *
 * The rank alone was ambiguous in a way the user could not see: several
 * frequency banks may cover the same word, the lowest number wins the merge
 * below, and the banks are not all in the same language. Keeping the winning
 * dictionary's title alongside the number is what lets a surface say where the
 * rank came from instead of printing a bare `#81`.
 */
const freqByKey = new Map<string, { rank: number; source: string }>();
let dictList: YomitanDictInfo[] = [];
let initPromise: Promise<void> | null = null;
/**
 * Whether the term glossaries are in memory, as opposed to only the metadata
 * (pitch, IPA, frequency) and the registry.
 *
 * The glossaries are most of this module's memory — the bundled JMdict (en, ru)
 * and Moedict alone were ~260 MB of main-process heap, parsed at boot and held
 * for the life of the process — and on an installation whose stores have been
 * migrated into SQLite nothing on the lookup path reads them: the database
 * answers exact, reading, de-inflected and prefix lookups for the same data. So
 * boot loads only the metadata (`initYomitanMeta`), and the glossaries load the
 * first time a caller that still reads them directly awaits `initYomitan()`.
 */
let termsLoaded = false;

const KANJIUM_PITCH_ID = 'bundled-kanjium-pitch';
const KANJIUM_PITCH_URL =
  'https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt';

/**
 * Essential term dictionaries auto-provisioned on first boot (like the Kanjium
 * pitch data). These give offline definitions to the reader pop-up, the
 * Dictionary view, and EPUB mining ({meaning:*}) — none of which worked before,
 * because only pitch data was bundled. Downloaded once, then reused offline.
 */
interface BundledTermDictSpec {
  id: string;
  title: string;
  url: string;
  /** Lower priority value wins glossary ties (registry order). */
  priority: number;
  /** Known gloss languages — bundled dicts skip detection. Shared with the
   *  database migration through `./glossLang`, so a store that reaches the
   *  database without its own metadata still lands under the right language. */
  glossLangs?: readonly string[];
}

const BUNDLED_TERM_DICTS: readonly BundledTermDictSpec[] = [
  {
    id: 'bundled-jmdict-en',
    title: 'JMdict (Japanese–English)',
    url: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip',
    priority: 0,
    glossLangs: BUNDLED_GLOSS_LANGS['bundled-jmdict-en'],
  },
  {
    id: 'bundled-jmdict-ru',
    title: 'JMdict (Japanese–Russian)',
    url: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_russian.zip',
    priority: 1,
    glossLangs: BUNDLED_GLOSS_LANGS['bundled-jmdict-ru'],
  },
  {
    id: 'bundled-moedict-zh',
    title: 'Moedict (Chinese monolingual)',
    url: 'https://github.com/username-011/moe-dict-yomitan/releases/latest/download/moe-concised-pinyin.zip',
    priority: 2,
    glossLangs: BUNDLED_GLOSS_LANGS['bundled-moedict-zh'],
  },
];

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

function detectGlossLangs(stored: StoredDictIndex, indexMeta?: Record<string, unknown>): string[] {
  if (!stored.info.hasTerms) return [];
  const fromMeta = indexMeta ? detectLangFromIndexMeta(indexMeta) : undefined;
  if (fromMeta) return [fromMeta];
  const fromTitle = detectLangFromTitle(stored.info.title);
  if (fromTitle) return [fromTitle];
  const fromScript = detectLangsFromScript(stored);
  if (fromScript.length) return fromScript;
  return ['en'];
}

/** Effective gloss languages for a dictionary — manual override wins. */
export function effectiveGlossLangs(info: YomitanDictInfo): string[] {
  if (info.glossLangOverride) return [info.glossLangOverride];
  return info.glossLangs ?? [];
}

/** Union of gloss languages across enabled term dictionaries. */
export function getAvailableGlossLangs(): string[] {
  const langs = new Set<string>();
  for (const info of dictList) {
    if (info.enabled === false || !info.hasTerms) continue;
    for (const lang of effectiveGlossLangs(info)) langs.add(lang);
  }
  return [...langs];
}

/** Set or clear (empty string) the manual language override for a dictionary. */
export function setYomitanLang(id: string, lang: string): { ok: boolean; error?: string } {
  const reg = readRegistry();
  const d = reg.dicts.find((x) => x.id === id);
  if (!d) return { ok: false, error: 'Dictionary not found.' };
  const normalized = lang.trim().toLowerCase();
  if (normalized && !/^[a-z]{2}$/.test(normalized)) {
    return { ok: false, error: 'Use a two-letter language code (e.g. ru, de).' };
  }
  d.glossLangOverride = normalized || undefined;
  writeRegistry(reg);
  loadAllIndices();
  return { ok: true };
}

// ----- Helpers ---------------------------------------------------------------

function yomitanRoot(): string {
  return path.join(app.getPath('userData'), 'yomitan');
}

function registryPath(): string {
  return path.join(yomitanRoot(), 'registry.json');
}

function dictDir(id: string): string {
  return path.join(yomitanRoot(), id);
}

function dictIndexPath(id: string): string {
  return path.join(dictDir(id), 'index.json');
}

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function atomicWriteJson(filePath: string, value: unknown): void {
  // Dictionary indexes can be tens of MB and are rebuilt by re-importing; only
  // the small registry keeps a last-good copy.
  writeJsonAtomicSync(filePath, value, { space: 0, backup: filePath === registryPath() });
}

function metaKey(term: string, reading: string): string {
  return `${term}\x01${reading || term}`;
}

function normalizeQuery(q: string): string {
  return q.trim().normalize('NFKC');
}

/** Split a kana reading into morae (small kana attach to the previous mora). */
// Moved to shared/pitchAccent.ts so the mining `{pitch}` field and the Blanc
// pitch panel cannot disagree about what a mora is. Re-exported because callers
// outside this file import it from here.
export { splitMorae } from '../../shared/pitchAccent';

/**
 * Tokyo-dialect pitch pattern as inline HTML (high morae get a top border).
 * `downstep` is the Yomitan mora index of the accent nucleus (0 = heiban).
 */
export function pitchPatternHtml(reading: string, downstep: number): string {
  const morae = splitMoraeShared(reading);
  if (!morae.length) return '';
  // The high/low rule itself lives in shared/pitchAccent.ts; this function is
  // only the HTML presentation of it.
  const highs = moraPitch(reading, downstep);
  const parts = morae.map((m, i) => {
    const high = highs[i] ?? false;
    const style = high
      ? 'border-top:2px solid currentColor;padding-top:1px;display:inline-block'
      : 'display:inline-block';
    return `<span style="${style}">${m}</span>`;
  });
  return parts.join('');
}

function freqValue(raw: unknown): number | undefined {
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

function renderStructuredContent(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map(renderStructuredContent).join('');
  if (typeof node !== 'object') return '';
  const o = node as Record<string, unknown>;
  if (o.type === 'image') return '';
  if (o.tag === 'br') return '<br>';
  if (typeof o.text === 'string') return o.text;
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
  return html
    .split(/<\/li>|<br\s*\/?>|<\/p>|<\/div>/i)
    .map((p) => p.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function definitionsToSenses(definitions: unknown): { senses: DictSense[]; glossaryHtml?: string } {
  if (!definitions) return { senses: [] };
  if (typeof definitions === 'string') {
    return { senses: [{ partsOfSpeech: [], definitions: [definitions], tags: [] }] };
  }
  const plain: string[] = [];
  const htmlParts: string[] = [];
  const defArray = Array.isArray(definitions) ? definitions : [definitions];
  for (const def of defArray) {
    if (typeof def === 'string') {
      plain.push(def);
      htmlParts.push(def);
    } else {
      const rendered = renderStructuredContent(def);
      if (!rendered) continue;
      const parts = htmlToDefinitions(rendered);
      if (parts.length) plain.push(...parts);
      htmlParts.push(rendered);
    }
  }
  const glossaryHtml = htmlParts.length ? htmlParts.join('<br>') : undefined;
  return {
    senses: plain.length ? [{ partsOfSpeech: [], definitions: plain, tags: [] }] : [],
    glossaryHtml,
  };
}

function parsePitchPositions(raw: unknown): number[] {
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

function readRegistry(): RegistryFile {
  const raw = readJsonSync<RegistryFile>(registryPath(), () => ({ dicts: [] }), {
    validate: (v) => !!v && typeof v === 'object' && Array.isArray((v as RegistryFile).dicts),
  });
  const dicts = raw.dicts;
  // Backfill enabled (default on) for dicts imported before this field existed.
  for (const d of dicts) if (d.enabled === undefined) d.enabled = true;
  return { dicts };
}

function writeRegistry(reg: RegistryFile): void {
  fs.mkdirSync(yomitanRoot(), { recursive: true });
  atomicWriteJson(registryPath(), reg);
}

function clearMergedIndices(): void {
  glossaryByTerm.clear();
  pitchByKey.clear();
  ipaByKey.clear();
  freqByKey.clear();
}

function mergeStoredIndex(
  stored: StoredDictIndex,
  sourceTitle: string,
  sourceLangs?: string[],
  withTerms = true,
): void {
  if (withTerms && stored.terms) {
    for (const [term, entries] of Object.entries(stored.terms)) {
      const tagged = entries.map((e) => ({
        ...e,
        source: e.source ?? sourceTitle,
        langs: sourceLangs?.length ? sourceLangs : e.langs,
      }));
      const existing = glossaryByTerm.get(term) ?? [];
      glossaryByTerm.set(term, existing.concat(tagged));
    }
  }
  if (stored.pitch) {
    for (const [key, entry] of Object.entries(stored.pitch)) {
      if (!pitchByKey.has(key)) pitchByKey.set(key, entry);
    }
  }
  if (stored.ipa) {
    for (const [key, entry] of Object.entries(stored.ipa)) {
      if (!ipaByKey.has(key)) ipaByKey.set(key, entry);
    }
  }
  if (stored.freq) {
    for (const [key, rank] of Object.entries(stored.freq)) {
      const prev = freqByKey.get(key);
      if (prev === undefined || rank < prev.rank) freqByKey.set(key, { rank, source: sourceTitle });
    }
  }
}

/**
 * Whether a store carries anything the metadata load needs. Read from the
 * registry flags so a term-only store (JMdict is ~100 MB of JSON) is not even
 * parsed at boot. `hasIpa` predates some registries; an unflagged store with no
 * terms is read to be safe, one with terms gets its IPA with the glossaries.
 */
function carriesMetadata(info: YomitanDictInfo): boolean {
  return info.hasPitch || info.hasFreq || info.hasIpa === true || (info.hasIpa === undefined && !info.hasTerms);
}

function loadAllIndices(): void {
  clearMergedIndices();
  const reg = readRegistry();
  // Registry array order IS the priority order (index 0 wins ties). dictList
  // keeps every dict (so the settings list shows disabled ones); only enabled
  // dicts are merged into the lookup indices.
  dictList = reg.dicts.slice();
  let registryChanged = false;
  for (const info of dictList) {
    if (info.enabled === false) continue;
    const wantTerms = termsLoaded && info.hasTerms;
    if (!wantTerms && !carriesMetadata(info)) continue;
    const file = dictIndexPath(info.id);
    if (!fs.existsSync(file)) continue;
    try {
      const stored = readJsonSync<StoredDictIndex | null>(file, null, {
        validate: (v) => !!v && typeof v === 'object',
      });
      if (!stored) {
        console.error(`[yomitan] failed to load ${info.id}: index unreadable`);
        continue;
      }
      // Backfill language detection for dicts imported before glossLangs existed.
      if (info.hasTerms && !info.glossLangs?.length) {
        info.glossLangs = detectGlossLangs(stored);
        registryChanged = true;
      }
      mergeStoredIndex(stored, info.title, effectiveGlossLangs(info), wantTerms);
    } catch (err) {
      console.error(`[yomitan] failed to load ${info.id}:`, err);
    }
  }
  if (registryChanged) writeRegistry(reg);
}

// ----- Zip import parsing ----------------------------------------------------

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
    // Column 7 (termTags) is deliberately left alone — those are headword-level
    // priority markers like `P`/`news1`, which are corpus frequency, not register,
    // and mixing them in would put "common word" among the usage labels.
    const rawTags = splitTagField(row[2]);
    if (rawTags.length) for (const sense of senses) sense.tags = rawTags;
    const key = term;
    const list = out.terms[key] ?? [];
    list.push({ word: term, reading, score, senses, glossaryHtml });
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
      for (const sense of entry.senses) {
        if (!sense.tags.length) continue;
        const { partsOfSpeech, usage } = splitSenseTags(sense.tags, bank);
        sense.partsOfSpeech = partsOfSpeech;
        sense.tags = usage;
      }
    }
  }
}

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

function parseYomitanZip(zipPath: string): StoredDictIndex {
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
      priority: dictList.length,
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
  }
  return stored;
}

// ----- Bundled Kanjium pitch seed --------------------------------------------

async function fetchText(url: string, ms = 20000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseKanjiumAccents(text: string): StoredDictIndex {
  const stored: StoredDictIndex = {
    version: 1,
    info: {
      id: KANJIUM_PITCH_ID,
      title: 'Kanjium Pitch Accents',
      revision: 'kanjium',
      priority: -100,
      hasTerms: false,
      hasPitch: true,
      hasFreq: false,
      importedAt: Date.now(),
      bundled: true,
      enabled: true,
    },
    pitch: {},
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const term = cols[0].trim();
    const reading = cols[1].trim();
    const posRaw = cols[2].trim();
    if (!term || !reading) continue;
    const positions = posRaw
      .split(/[,;]/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (!positions.length) continue;
    const key = metaKey(term, reading);
    stored.pitch![key] = { reading, positions };
  }
  return stored;
}

async function ensureBundledPitch(): Promise<void> {
  const file = dictIndexPath(KANJIUM_PITCH_ID);
  if (fs.existsSync(file)) return;
  try {
    console.log('[yomitan] Seeding bundled Kanjium pitch data…');
    const text = await fetchText(KANJIUM_PITCH_URL);
    const stored = parseKanjiumAccents(text);
    fs.mkdirSync(dictDir(KANJIUM_PITCH_ID), { recursive: true });
    atomicWriteJson(file, stored);
    const reg = readRegistry();
    if (!reg.dicts.some((d) => d.id === KANJIUM_PITCH_ID)) {
      reg.dicts.unshift(stored.info);
      writeRegistry(reg);
    }
    console.log(`[yomitan] Kanjium pitch seeded (${Object.keys(stored.pitch ?? {}).length} entries).`);
  } catch (err) {
    console.warn('[yomitan] Could not seed Kanjium pitch (offline?):', err);
  }
}

// ----- Bundled term dictionaries (JMdict, etc.) ------------------------------

async function downloadToFile(url: string, dest: string, ms = 180000): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('empty download');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  } finally {
    clearTimeout(timer);
  }
}

/** Returns true only when it newly downloaded and stored the dictionary. */
async function ensureBundledTermDict(spec: BundledTermDictSpec): Promise<boolean> {
  if (fs.existsSync(dictIndexPath(spec.id))) return false;
  const tmpZip = path.join(app.getPath('temp'), `jsa-${spec.id}.zip`);
  try {
    console.log(`[yomitan] Downloading ${spec.title}…`);
    await downloadToFile(spec.url, tmpZip);
    const stored = parseYomitanZip(tmpZip);
    // Give it a stable identity and mark it bundled (non-removable).
    stored.info.id = spec.id;
    stored.info.title = spec.title;
    stored.info.bundled = true;
    stored.info.priority = spec.priority;
    if (spec.glossLangs) stored.info.glossLangs = [...spec.glossLangs];
    // Store compact: plain senses are enough for definitions, and dropping the
    // duplicated glossary HTML cuts the on-disk index and per-boot parse cost
    // (JMdict: ~110MB→~65MB, ~1.4s→~0.9s parse) with no loss of meaning text.
    if (stored.terms) {
      for (const list of Object.values(stored.terms)) {
        for (const entry of list) entry.glossaryHtml = undefined;
      }
    }
    fs.mkdirSync(dictDir(spec.id), { recursive: true });
    atomicWriteJson(dictIndexPath(spec.id), stored);
    const reg = readRegistry();
    if (!reg.dicts.some((d) => d.id === spec.id)) {
      reg.dicts.push(stored.info);
      writeRegistry(reg);
    }
    console.log(`[yomitan] ${spec.title} ready (${Object.keys(stored.terms ?? {}).length} terms).`);
    return true;
  } catch (err) {
    console.warn(`[yomitan] Could not provision ${spec.title} (offline?):`, err);
    return false;
  } finally {
    try {
      fs.unlinkSync(tmpZip);
    } catch {
      /* ignore */
    }
  }
}

// ----- Public lookup API -----------------------------------------------------

/**
 * Structured pitch data for the Blanc pitch panel.
 *
 * getPitch() returns presentation HTML, which is Study OS output; this returns
 * the raw downstep positions so a renderer can draw its own contour. `available`
 * is false when no pitch dictionary is loaded at all, which lets the panel say
 * "install the Kanjium asset" instead of showing an empty result that looks like
 * "this word has no accent data".
 */
export function getPitchData(term: string, reading?: string): PitchLookup {
  const available = pitchByKey.size > 0;
  const t = normalizeQuery(term);
  const r = normalizeQuery(reading ?? term);
  const entries: PitchEntry[] = [];
  const seen = new Set<string>();
  for (const key of [metaKey(t, r), metaKey(t, t), metaKey(r, r)]) {
    const hit = pitchByKey.get(key);
    if (!hit || !hit.positions.length) continue;
    const id = `${hit.reading}${hit.positions.join(",")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ reading: hit.reading || r, positions: [...hit.positions] });
  }
  return { available, entries };
}
export function getPitch(term: string, reading?: string): string {
  const t = normalizeQuery(term);
  const r = normalizeQuery(reading ?? term);
  const tryKeys = [metaKey(t, r), metaKey(t, t), metaKey(r, r)];
  for (const key of tryKeys) {
    const hit = pitchByKey.get(key);
    if (!hit || !hit.positions.length) continue;
    const patterns = hit.positions.map((p) => pitchPatternHtml(hit.reading || r, p));
    return patterns.join(' / ');
  }
  return '';
}

/**
 * IPA transcriptions for a term, from the installed IPA dictionaries. Tries the
 * same keys as `getPitch`, in the same order; empty when none covers the word.
 */
export function getIpa(term: string, reading?: string): string[] {
  const t = normalizeQuery(term);
  const r = normalizeQuery(reading ?? term);
  for (const key of [metaKey(t, r), metaKey(t, t), metaKey(r, r)]) {
    const hit = ipaByKey.get(key);
    if (hit?.transcriptions.length) return [...hit.transcriptions];
  }
  return [];
}

/**
 * The corpus rank, and the dictionary that supplied it when there is one.
 *
 * `source` is optional because a title is not guaranteed: `importYomitanZip`
 * builds it from `index.json`, and `String(indexJson.title ?? …)` keeps an
 * explicit empty string rather than falling back to the file name. Withholding
 * the whole rank in that case would delete a number the user previously saw, so
 * the rank is always returned and only the attribution goes missing.
 */
export function getFrequencyDetail(
  term: string,
  reading?: string,
): { rank: number; source?: string } | undefined {
  const t = normalizeQuery(term);
  const r = normalizeQuery(reading ?? term);
  const tryKeys = [metaKey(t, r), metaKey(t, t), metaKey(r, r)];
  for (const key of tryKeys) {
    const hit = freqByKey.get(key);
    if (hit !== undefined) return hit.source ? { ...hit } : { rank: hit.rank };
  }
  return undefined;
}

export function getFrequencyRank(term: string, reading?: string): number | undefined {
  return getFrequencyDetail(term, reading)?.rank;
}

export function getFrequency(term: string, reading?: string): string {
  const rank = getFrequencyRank(term, reading);
  return rank !== undefined ? String(rank) : '';
}

function enrichEntry(entry: StoredGlossaryEntry): DictEntry {
  const pitchHtml = getPitch(entry.word, entry.reading);
  const ipa = getIpa(entry.word, entry.reading);
  const freq = getFrequencyDetail(entry.word, entry.reading);
  return {
    word: entry.word,
    reading: entry.reading,
    isCommon: entry.score > 0,
    jlpt: [],
    senses: entry.senses,
    pitchHtml: pitchHtml || undefined,
    ...(ipa.length ? { ipa } : {}),
    frequency: freq?.rank,
    ...(freq?.source ? { frequencySource: freq.source } : {}),
    glossaryHtml: entry.glossaryHtml,
    source: entry.source,
    sourceLangs: entry.langs,
  };
}

function lookupOffline(query: string, exactOnly = false): DictEntry[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const direct = glossaryByTerm.get(q);
  if (direct?.length) return direct.map(enrichEntry);
  if (exactOnly) return [];

  // Prefix scan for partial selections (cap at 8).
  const out: DictEntry[] = [];
  for (const [term, entries] of glossaryByTerm) {
    if (!term.startsWith(q)) continue;
    for (const e of entries) {
      out.push(enrichEntry(e));
      if (out.length >= 8) return out;
    }
  }
  return out;
}

export function lookupGlossary(term: string): DictEntry[] {
  return lookupOffline(term);
}

/**
 * Offline glossary lookup that first tries the exact query, then de-inflects a
 * conjugated form and looks up each candidate dictionary root (ranked shortest
 * chain first) — returning the first that exists, tagged with its conjugation
 * path. This is what makes 食べさせられた resolve to 食べる offline; before it,
 * only the online Jisho fallback deinflected, so offline conjugated lookups
 * silently failed.
 *
 * `exactOnly` drops the prefix scan. A pop-up over a partial selection wants it
 * — a near miss is better than nothing when a human is reading the list. A
 * per-token interlinear gloss must never have it: grounding 猫 on 猫舌 because
 * one starts with the other writes a definition the passage does not mean, and
 * the caller cannot tell the two apart afterwards because `DictEntry` does not
 * record how it was reached.
 */
export function lookupOfflineDeinflected(query: string, exactOnly = false): {
  entries: DictEntry[];
  deinflection?: DeinflectionInfo;
} {
  const q = normalizeQuery(query);
  if (!q) return { entries: [] };
  const direct = lookupOffline(q, exactOnly);
  if (direct.length) return { entries: direct };
  for (const cand of deinflect(q)) {
    if (cand.reasons.length === 0) continue; // identity == the exact miss above
    const hit = lookupOffline(cand.term, exactOnly);
    if (hit.length) {
      return { entries: hit, deinflection: { source: q, term: cand.term, reasons: cand.reasons } };
    }
  }
  return { entries: [] };
}

/** Hash of enabled glossary dictionaries — used to invalidate gloss cache. */
export function getDictRegistryHash(): string {
  const enabled = dictList.filter((d) => d.enabled !== false && d.hasTerms);
  const payload = enabled.map((d) => `${d.id}:${d.revision}:${d.priority}`).join('|');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export async function lookupTermMerged(
  query: string,
  jishoFallback: (q: string) => Promise<DictResult>,
): Promise<DictResult> {
  const q = normalizeQuery(query);
  if (!q) return { query: q, entries: [] };

  // Exact match, then de-inflected candidates, against the offline glossary dicts.
  const local = lookupOfflineDeinflected(q);
  if (local.entries.length) {
    return { query: q, entries: local.entries, deinflection: local.deinflection };
  }

  // No offline hit — try enriching a Jisho hit with local pitch/freq. Jisho does
  // its own server-side de-inflection, so the surface form is the right query.
  const jisho = await jishoFallback(q);
  if (!jisho.entries.length) return jisho;

  const enriched = jisho.entries.map((e) => {
    const pitchHtml = getPitch(e.word, e.reading);
    const ipa = getIpa(e.word, e.reading);
    const freq = getFrequencyDetail(e.word, e.reading);
    return {
      ...e,
      pitchHtml: pitchHtml || undefined,
      ...(ipa.length ? { ipa } : {}),
      frequency: freq?.rank,
      ...(freq?.source ? { frequencySource: freq.source } : {}),
    };
  });
  return { ...jisho, entries: enriched };
}

// ----- Import / manage -------------------------------------------------------

export function listYomitanDicts(): YomitanDictInfo[] {
  return dictList.slice();
}

export async function importYomitanZip(filePath?: string): Promise<{
  ok: boolean;
  error?: string;
  info?: YomitanDictInfo;
}> {
  let zipPath = filePath;
  if (!zipPath) {
    const res = await dialog.showOpenDialog(focusedWindow()!, {
      title: mt('dialog.importYomitanDict.title'),
      properties: ['openFile'],
      filters: [{ name: mt('dialog.filter.yomitanDict'), extensions: ['zip'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false, error: 'cancelled' };
    zipPath = res.filePaths[0];
  }

  try {
    const stored = parseYomitanZip(zipPath);
    const reg = readRegistry();
    if (reg.dicts.some((d) => d.id === stored.info.id)) {
      return { ok: false, error: `“${stored.info.title}” is already imported.` };
    }
    fs.mkdirSync(dictDir(stored.info.id), { recursive: true });
    atomicWriteJson(dictIndexPath(stored.info.id), stored);
    reg.dicts.push(stored.info);
    writeRegistry(reg);
    loadAllIndices();
    return { ok: true, info: stored.info };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Apply a settings change to the unified database as well.
 *
 * Lookups read the SQLite database first and fall back to these JSON stores
 * only when it has nothing, so a toggle, reorder or removal that touched only
 * the JSON registry had no visible effect: a disabled dictionary kept answering.
 * A store the database has not imported yet is simply absent there, and the
 * database may be unavailable altogether — neither may fail the settings
 * change the user just made.
 */
function applyToDatabase(change: () => void): void {
  try {
    change();
  } catch (error) {
    console.warn('[yomitan] database sync skipped:', error instanceof Error ? error.message : String(error));
  }
}

/** Enable/disable a dictionary without removing it. */
export function setYomitanEnabled(id: string, enabled: boolean): { ok: boolean; error?: string } {
  const reg = readRegistry();
  const d = reg.dicts.find((x) => x.id === id);
  if (!d) return { ok: false, error: 'Dictionary not found.' };
  d.enabled = enabled;
  writeRegistry(reg);
  loadAllIndices();
  applyToDatabase(() => setDictionarySourceEnabled(id, enabled));
  return { ok: true };
}

/** Move a dictionary up (dir -1) or down (dir +1) in priority order. */
export function moveYomitanDict(id: string, dir: number): { ok: boolean; error?: string } {
  const step = dir < 0 ? -1 : 1;
  const reg = readRegistry();
  const idx = reg.dicts.findIndex((x) => x.id === id);
  if (idx < 0) return { ok: false, error: 'Dictionary not found.' };
  const j = idx + step;
  if (j < 0 || j >= reg.dicts.length) return { ok: false, error: 'Already at the edge.' };
  const arr = reg.dicts;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  arr.forEach((d, i) => {
    d.priority = i;
  });
  writeRegistry(reg);
  loadAllIndices();
  applyToDatabase(() => syncDictionarySourceOrder(arr.map((dict) => dict.id)));
  return { ok: true };
}

export function removeYomitanDict(id: string): { ok: boolean; error?: string } {
  const reg = readRegistry();
  const idx = reg.dicts.findIndex((d) => d.id === id);
  if (idx < 0) return { ok: false, error: 'Dictionary not found.' };
  if (id === KANJIUM_PITCH_ID || reg.dicts[idx].bundled) {
    return { ok: false, error: 'Bundled default dictionaries cannot be removed.' };
  }
  reg.dicts.splice(idx, 1);
  writeRegistry(reg);
  try {
    fs.rmSync(dictDir(id), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  loadAllIndices();
  applyToDatabase(() => removeDictionarySource(id));
  return { ok: true };
}

/**
 * The metadata, and the term glossaries only while they can answer something
 * the database cannot: resolves `true` when a caller may read the term index
 * (`lookupOfflineDeinflected`, `lookupGlossary`, `lookupTermMerged`), `false`
 * when SQLite owns every term store and the caller should not.
 *
 * This is the single gate on the ~260 MB parse. Every caller that reads the
 * glossaries asks it first, so on a migrated installation no feature — the
 * extension, the gloss batch, mining, the pop-up's miss path — can load them.
 * They load only as the documented migration fallback, for a store still
 * waiting for its database import, and `releaseYomitanTermsIfMigrated` drops
 * them again once that import lands.
 */
export async function initYomitan(): Promise<boolean> {
  await initYomitanMeta();
  if (!legacyTermsPending()) return false;
  ensureYomitanTerms();
  return true;
}

/**
 * Load the term glossaries now, once, regardless of the database. Production
 * code goes through `initYomitan()`; this is for tests of the legacy reader.
 */
export function ensureYomitanTerms(): void {
  if (termsLoaded) return;
  termsLoaded = true;
  loadAllIndices();
}

/** Whether the term glossaries are in memory. For tests and diagnostics. */
export function yomitanTermsLoaded(): boolean {
  return termsLoaded;
}

/**
 * Drop the term glossaries once no term store is waiting for its database
 * import. Called when an import job settles: a lookup during the first-boot
 * migration loads them as the fallback, and without this they would stay
 * resident for the rest of that session although SQLite now answers for them.
 * Returns whether anything was released.
 */
export function releaseYomitanTermsIfMigrated(): boolean {
  if (!termsLoaded || legacyTermsPending()) return false;
  termsLoaded = false;
  loadAllIndices();
  return true;
}

/**
 * Whether a legacy term store exists that SQLite does not own yet — a bundled
 * store still migrating, or a Yomitan zip whose import is queued. Only then can
 * the in-memory glossaries answer something the database cannot.
 */
export function legacyTermsPending(): boolean {
  try {
    const pending = new Set(pendingLegacyStores());
    return dictList.some((info) => info.hasTerms && info.enabled !== false && pending.has(info.id));
  } catch {
    // No database to ask: the in-memory index is the only answer there is.
    return true;
  }
}

/**
 * Boot-time init: seed and provision the bundled stores, load the registry and
 * the metadata indices (pitch, IPA, frequency). Safe to call repeatedly.
 */
export function initYomitanMeta(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      fs.mkdirSync(yomitanRoot(), { recursive: true });
      // Phase 1: open the SQLite dictionary and apply any schema migration. Cheap
      // (DDL only, milliseconds) and deliberately does NOT migrate the JSON stores
      // below — that takes minutes and would freeze this thread. See
      // dictionary/service.ts for why it has nowhere to run yet.
      initDictionaryService();
      await ensureBundledPitch();
      loadAllIndices();
      let changed = false;
      for (const spec of BUNDLED_TERM_DICTS) {
        if (await ensureBundledTermDict(spec)) changed = true;
      }
      // Reload in place when a bundled dictionary was just provisioned. There is no
      // renderer notification: every consumer awaits initYomitan() before looking a
      // word up, so it sees the reloaded indices without being told. A `dict:updated`
      // broadcast used to fire here with nothing listening on the other end.
      if (changed) loadAllIndices();
    })();
  }
  return initPromise;
}

/**
 * Native audio via JapanesePod101 CDN → Anki media folder.
 *
 * The request, the timeout and the placeholder-clip rule moved to
 * `dictionary/audio.ts` when the Dictionary itself learned to play a word: two
 * copies of "how do you tell a missing recording from a real one" is exactly the
 * knowledge that drifts. What stays here is the Anki-shaped half — the media
 * filename and the `[sound:…]` reference — which the dictionary panel has no use
 * for. An empty string still means "no audio field", for every reason.
 */
export async function fetchJapaneseAudio(
  term: string,
  reading: string,
  storeMedia: (filename: string, dataBase64: string) => Promise<void>,
): Promise<string> {
  const identity = normalizeAudioIdentity({ lang: 'ja', term, reading });
  if (!identity) return '';
  const fetched = await fetchProviderAudio(identity);
  if (fetched.status !== 'ready') return '';
  const filename = `jsa-${fetched.md5.slice(0, 12)}.mp3`;
  try {
    await storeMedia(filename, fetched.buffer.toString('base64'));
  } catch {
    return '';
  }
  return `[sound:${filename}]`;
}
