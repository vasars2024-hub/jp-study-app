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
import type { DeinflectionInfo, DictEntry, DictResult, YomitanDictInfo } from '../../shared/types';
import { deinflect, posMatchesWordTypes } from '../../shared/deinflect';
import { mt } from '../i18n';
import {
  initDictionaryService,
  pendingLegacyStores,
  removeDictionarySource,
  setDictionarySourceEnabled,
  syncDictionarySourceOrder,
} from './service';
import { fetchProviderAudio } from './audio';
import { readAudioSourcesPrefs, resolveAudioChain } from './audioSources';
import { audioExtForMime } from '../../shared/audioSources';
import { normalizeAudioIdentity } from '../../shared/lexiconAudio';
import { BUNDLED_GLOSS_LANGS } from './glossLang';
import { escapeHtmlText, sanitizeDictHtml } from '../../shared/dictHtmlSanitize';
import { withoutFormsSenses } from '../../shared/dictFormsSense';
import { isJmdictCommon, jmdictPriorityCodes } from '../../shared/jmdictPriority';
import {
  detectGlossLangs,
  metaKey,
  type StoredDictIndex,
  type StoredGlossaryEntry,
  type StoredPitchEntry,
  type StoredIpaEntry,
} from './yomitanZip';
import { provisionYomitanStoreOffMainLoop } from './yomitanStoreHost';

// The zip parser and the store shapes live in `yomitanZip.ts` (no Electron, so
// the dictionary utility process can run them). Re-exported for the callers and
// tests that have always imported them from here.
export {
  definitionsToSenses,
  parseKanjiBank,
  parseTermMetaBank,
  renderStructuredContent,
  type StoredIpaEntry,
  type StoredKanjiEntry,
} from './yomitanZip';

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
 * boot loads only the metadata (`initYomitanMeta`), and the main process never
 * loads the glossaries at all (see `initYomitan`); only tests do, through
 * `ensureYomitanTerms`.
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
    // The morae come from a dictionary's reading column, which is untrusted
    // input: escaped so a reading like `<img onerror=...>` stays text.
    return `<span style="${style}">${escapeHtmlText(m)}</span>`;
  });
  return parts.join('');
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
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, buf);
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
    // Parsed and written in the dictionary utility process (`yomitanStoreHost.ts`):
    // on this thread it was ~10 s of blocking work plus a 5-8 s GC pause later.
    // Stored compact — plain senses are enough for definitions, and dropping the
    // duplicated glossary HTML cuts the on-disk index and its later parse cost
    // (JMdict: ~110MB→~65MB) with no loss of meaning text.
    const { info, termCount } = await provisionYomitanStoreOffMainLoop(tmpZip, dictIndexPath(spec.id), {
      // A stable identity, marked bundled (non-removable).
      id: spec.id,
      title: spec.title,
      bundled: true,
      priority: spec.priority,
      ...(spec.glossLangs ? { glossLangs: spec.glossLangs } : {}),
      compact: true,
    });
    const reg = readRegistry();
    if (!reg.dicts.some((d) => d.id === spec.id)) {
      reg.dicts.push(info);
      writeRegistry(reg);
    }
    console.log(`[yomitan] ${spec.title} ready (${termCount} terms).`);
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

function enrichEntry(entry: StoredGlossaryEntry, via: 'exact' | 'prefix'): DictEntry {
  const pitchHtml = getPitch(entry.word, entry.reading);
  const ipa = getIpa(entry.word, entry.reading);
  const freq = getFrequencyDetail(entry.word, entry.reading);
  // Stores written before the renderer escaped its text carry raw dictionary
  // HTML on disk; it is sanitized on the way out, not trusted because it was ours.
  // Senses the structured content marked carry their own HTML; with two or more
  // of them the entry renders sense by sense and the whole-entry block would only
  // repeat them. With fewer, the block stays and sense HTML is dropped.
  const perSense = entry.senses.filter((sense) => sense.html).length >= 2;
  const glossaryHtml = !perSense && entry.glossaryHtml ? sanitizeDictHtml(entry.glossaryHtml) || undefined : undefined;
  const senses = entry.senses.map((sense) => {
    if (!sense.html) return sense;
    const { html, ...rest } = sense;
    const clean = perSense ? sanitizeDictHtml(html) : '';
    return clean ? { ...rest, html: clean } : rest;
  });
  const prio = entry.prio?.length ? jmdictPriorityCodes(entry.prio) : [];
  return {
    word: entry.word,
    reading: entry.reading,
    isCommon: entry.score > 0 || isJmdictCommon(prio),
    jlpt: [],
    ...(prio.length ? { priorityTags: prio } : {}),
    senses,
    pitchHtml: pitchHtml || undefined,
    ...(ipa.length ? { ipa } : {}),
    frequency: freq?.rank,
    ...(freq?.source ? { frequencySource: freq.source } : {}),
    glossaryHtml,
    source: entry.source,
    sourceLangs: entry.langs,
    via,
  };
}

function lookupOffline(query: string, exactOnly = false): DictEntry[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  // JMdict's flattened "forms" table is a row of its own here; it is not a meaning
  // (see shared/dictFormsSense.ts), so it never reaches a popup.
  const direct = glossaryByTerm.get(q);
  if (direct?.length) {
    return direct
      .map((e) => withoutFormsSenses(enrichEntry(e, 'exact')))
      .filter((e): e is DictEntry => e !== null);
  }
  if (exactOnly) return [];

  // Prefix scan for partial selections (cap at 8). Tagged `prefix` so a caller
  // (the extension's hover scan) can tell a near miss from a match.
  const out: DictEntry[] = [];
  for (const [term, entries] of glossaryByTerm) {
    if (!term.startsWith(q)) continue;
    for (const e of entries) {
      const shown = withoutFormsSenses(enrichEntry(e, 'prefix'));
      if (shown) out.push(shown);
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
  // Exact first, then de-inflected exact, and only then the prefix scan: a prefix
  // hit on the surface (行った → 行ったり来たり) must not shadow the word it
  // conjugates (行く), which it did when the prefix scan ran before de-inflection.
  const direct = lookupOffline(q, true);
  if (direct.length) return { entries: direct };
  // identity == the exact miss above
  const candidates = deinflect(q).filter((cand) => cand.reasons.length > 0);
  for (const cand of candidates) {
    // Yomitan's part-of-speech check: 帰った reaches 帰る as godan, まず reaches
    // まる as ichidan — an entry that does not conjugate that way is not the word.
    const hit = lookupOffline(cand.term, true).filter((e) =>
      posMatchesWordTypes(e.senses.flatMap((s) => s.partsOfSpeech ?? []), cand.wordTypes));
    if (hit.length) {
      const entries = hit.map((e): DictEntry => ({ ...e, via: 'deinflected' }));
      return { entries, deinflection: { source: q, term: cand.term, reasons: cand.reasons } };
    }
  }
  if (exactOnly) return { entries: [] };
  const near = lookupOffline(q);
  if (near.length) return { entries: near };
  for (const cand of candidates) {
    // Prefix hits only: an exact hit on this root was already weighed above, and
    // one the part-of-speech check rejected must not come back through here.
    const entries = lookupOffline(cand.term).filter((e) => e.via === 'prefix');
    if (entries.length) return { entries, deinflection: { source: q, term: cand.term, reasons: cand.reasons } };
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

  // Parsed in the dictionary utility process (`yomitanStoreHost.ts`) and written
  // to a staging file; the store's id comes from the archive, so it is moved
  // into place only once it is known not to be a duplicate.
  const staging = path.join(yomitanRoot(), `.incoming-${process.pid}-${Date.now()}.json`);
  try {
    const { info } = await provisionYomitanStoreOffMainLoop(zipPath, staging, { priority: dictList.length });
    const reg = readRegistry();
    if (reg.dicts.some((d) => d.id === info.id)) {
      return { ok: false, error: `“${info.title}” is already imported.` };
    }
    fs.mkdirSync(dictDir(info.id), { recursive: true });
    fs.renameSync(staging, dictIndexPath(info.id));
    reg.dicts.push(info);
    writeRegistry(reg);
    loadAllIndices();
    return { ok: true, info };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  } finally {
    try {
      fs.rmSync(staging, { force: true });
    } catch {
      /* moved into place, or never written */
    }
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
 * The metadata, and whether a caller may read the in-memory term index
 * (`lookupOfflineDeinflected`, `lookupGlossary`, `lookupTermMerged`).
 *
 * The main process never parses the legacy term glossaries any more. It used
 * to, as the migration fallback: while a store waited for its SQLite import, the
 * first lookup of every boot parsed ~151 MB of JSON here and froze the whole
 * app for 7.5-10.4 s — every boot, for the ~13 minutes the first import takes.
 * Now a lookup during the import is answered by the stores already in SQLite
 * and the online fallback, and says the dictionary is still being prepared
 * (`legacyMigrationProgress`). So this resolves `true` only when a test has
 * loaded the glossaries itself (`ensureYomitanTerms`).
 */
export async function initYomitan(): Promise<boolean> {
  await initYomitanMeta();
  return termsLoaded;
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

const storesReadyListeners = new Set<(provisionedId: string | null) => void>();

/**
 * Told when legacy stores are ready to be imported into the database: once with
 * `null` when the stores already on disk are known, then with each bundled store's
 * id as it is provisioned. The boot wiring starts (or queues) the import from it.
 */
export function onYomitanStoresReady(listener: (provisionedId: string | null) => void): () => void {
  storesReadyListeners.add(listener);
  return () => storesReadyListeners.delete(listener);
}

function emitStoresReady(provisionedId: string | null): void {
  for (const listener of storesReadyListeners) {
    try {
      listener(provisionedId);
    } catch (error) {
      console.warn('[yomitan] stores-ready listener failed:', error);
    }
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
      // The stores already on disk can start their database import now, before
      // any first-run download below: the import is what a new user's first
      // lookup waits on, so it is not held behind the network.
      emitStoresReady(null);
      let changed = false;
      for (const spec of BUNDLED_TERM_DICTS) {
        if (await ensureBundledTermDict(spec)) {
          changed = true;
          emitStoresReady(spec.id);
        }
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
  // The same ordered sources the Dictionary plays from (`audioSources.ts`): a
  // local recording the user installed wins when it is first in their list.
  const result = await resolveAudioChain(
    { lang: 'ja', term: identity.term, reading: identity.reading },
    readAudioSourcesPrefs(),
    async (id) => {
      const fetched = await fetchProviderAudio(id);
      return fetched.status === 'ready'
        ? {
            query: id.term,
            status: 'ready',
            clip: { provider: 'jpod101', mimeType: 'audio/mpeg', dataBase64: fetched.buffer.toString('base64'), cached: false },
          }
        : { query: id.term, status: fetched.status };
    },
  );
  if (result.status !== 'ready' || !result.clip) return '';
  // md5 of the bytes, as before, so a CDN clip keeps the media name it always had.
  const md5 = crypto.createHash('md5').update(Buffer.from(result.clip.dataBase64, 'base64')).digest('hex');
  const filename = `jsa-${md5.slice(0, 12)}.${audioExtForMime(result.clip.mimeType)}`;
  try {
    await storeMedia(filename, result.clip.dataBase64);
  } catch {
    return '';
  }
  return `[sound:${filename}]`;
}
