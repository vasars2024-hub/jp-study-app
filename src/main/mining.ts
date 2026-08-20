import { app, dialog, ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { mt } from './i18n';
import { extractEpubTitleFromOpf } from './epubMeta';
import type {
  AiApiKeysSet,
  AiEngineConfig,
  AiEngineKind,
  AiEnrichmentRequest,
  AiEnrichmentResult,
  AiDeckGenerationRequest,
  AiGeneratedCard,
  AiGenerationProgress,
  AiLanguageOptions,
  AiMiningCardFormat,
  AiMiningLanguage,
  AiPromptPreset,
  AiProviderId,
  AiProviderKeyBucket,
  AiProviderHealth,
  EpubMiningAnalysis,
  FrequencyDictionarySummary,
  MiningCandidate,
  MiningEnrichProgress,
  NameTag,
  TraditionalMiningConfig,
  // DEFAULT_TRADITIONAL_MINING_CONFIG is a value, and is imported as one below. It
  // was listed here too, inside `import type`, which TypeScript erases — the value
  // import is the only reason it worked at runtime.
} from '../shared/mining';
import { buildAiPromptPreview, renderAiTemplate } from '../shared/aiPromptBuilder';
// Used at the EPUB deck-export call site but never imported — a latent ReferenceError
// that predated this change and only surfaced once tsc could see past the duplicate
// DEFAULT_TRADITIONAL_MINING_CONFIG import above. Taken from the defining module
// rather than the mining barrel, per the bundle note in shared/mining.ts.
import { buildEpubDeckExport } from '../shared/epubDeck';
import { callAiProvider, parseAiJson } from './aiProviderClient';
import {
  needsEnrichmentLookup,
  resolveTraditionalTemplates,
} from '../shared/epubEnrichment';
import { shouldDropMiningCandidate } from '../shared/miningBlacklist';
import {
  normalizeChapterRange,
  type ChapterRange,
  type ChapterRangeInput,
} from '../shared/chapterRange';
import { kataToHira } from '../shared/langs';
import { pickLemmaReading } from '../shared/readings';
import {
  matchesChineseNameHeuristic,
  matchesRussianNameHeuristic,
} from '../shared/bundledNameLists';
import {
  BUNDLED_FREQUENCY_DICTIONARIES,
  REMOTE_BUNDLED_FREQUENCY_DICTIONARIES,
  isBundledFrequencyDictId,
} from '../shared/bundledFrequencyDicts';
import { getFrequencyRank, initYomitan, lookupGlossary } from './dictionary/yomitan';
// Direct rather than via the shared/mining barrel: that barrel no longer
// re-exports the AI catalog, because re-exporting it pulled 41 KB into Blanc's
// boot chunk through storage.ts. See the note in shared/mining.ts.
import {
  AI_MINING_FORMATS,
  AI_PROMPT_PRESETS,
  formatsForPreset,
} from '../shared/aiMiningCatalog';
import {
  AI_PROVIDERS,
  DEFAULT_AI_LANGUAGE_OPTIONS,
  DEFAULT_AI_PROVIDER_ID,
  DEFAULT_MINING_LIMITS,
  DEFAULT_TRADITIONAL_MINING_CONFIG,
  applyLanguageOptionsToFormat,
  languageOptionsForProfile,
  normalizeAiEngineKind,
  normalizeLanguageOptions,
  providerById,
  providerKeyBucket,
  runEnrichment,
} from '../shared/mining';
import type { LibraryItem } from '../shared/types';
import { getProfileStore } from './profiles';
import {
  getMainJapaneseTokenizer,
  type MainKuromojiToken as KuromojiToken,
} from './japaneseTokenizer';
import { readAiProviderSecret, writeAiProviderSecret } from './credentials/ai';
import { getAiProviderHealthReport } from './providerRuntime';

interface FrequencyDictionaryFile {
  summary: FrequencyDictionarySummary;
  ranks: Record<string, number>;
}

interface MiningConfigFile extends AiLanguageOptions {
  traditional: TraditionalMiningConfig;
  selectedPresetId: string;
  selectedFormatId: string;
  cardCount: number;
  outputFormat: 'anki' | 'csv';
  providerId: AiProviderId;
  engine: AiEngineKind;
}

function languageOptionsFromRaw(raw?: Partial<MiningConfigFile>): AiLanguageOptions {
  return normalizeLanguageOptions({
    frontLang: raw?.frontLang as AiMiningLanguage | undefined,
    backLang: raw?.backLang as AiMiningLanguage | undefined,
    reverse: raw?.reverse,
    backGlossLangs: raw?.backGlossLangs as AiMiningLanguage[] | undefined,
  });
}

function readApiKeysSet(): AiApiKeysSet {
  return {
    gemini: Boolean(readAiProviderSecret('gemini')),
    deepseek: Boolean(readAiProviderSecret('deepseek')),
  };
}

function readApiKeyForProvider(providerId: AiProviderId): string {
  const bucket = providerKeyBucket(providerId);
  return readAiProviderSecret(bucket);
}

function normalizeApiKeyString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null || typeof value === 'object') return '';
  return String(value).trim();
}

function parseApiKeyPayload(raw: unknown): { bucket: AiProviderKeyBucket; apiKey: string } {
  if (typeof raw === 'string') {
    return { bucket: 'gemini', apiKey: normalizeApiKeyString(raw) };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const providerRaw = obj.provider ?? obj.bucket ?? obj.keyBucket;
    const bucket: AiProviderKeyBucket =
      providerRaw === 'deepseek' || providerRaw === 'gemini' ? providerRaw : 'gemini';
    const keyRaw = obj.apiKey ?? obj.key ?? obj.value;
    return { bucket, apiKey: normalizeApiKeyString(keyRaw) };
  }
  return { bucket: 'gemini', apiKey: '' };
}

function setApiKeyForBucket(bucket: AiProviderKeyBucket, value: unknown) {
  const apiKey = normalizeApiKeyString(value);
  return writeAiProviderSecret(bucket, apiKey);
}

function providerIdFromRaw(raw: string | undefined): AiProviderId {
  return AI_PROVIDERS.some((provider) => provider.id === raw) ? (raw as AiProviderId) : DEFAULT_AI_PROVIDER_ID;
}

function aiEngineConfigFromFile(config: MiningConfigFile): AiEngineConfig {
  const lang = languageOptionsFromRaw(config);
  const apiKeysSet = readApiKeysSet();
  const providerId = config.providerId ?? DEFAULT_AI_PROVIDER_ID;
  return {
    apiKeysSet,
    apiKeySet: Boolean(readApiKeyForProvider(providerId)),
    engine: config.engine ?? 'cloud',
    providerId,
    selectedPresetId: config.selectedPresetId,
    selectedFormatId: config.selectedFormatId,
    cardCount: config.cardCount,
    outputFormat: config.outputFormat,
    localModelAvailable: false, // filled in ai:getConfig below
    ...lang,
  };
}

/**
 * Minimal accessor for other main-process modules (translate analysis) that
 * need the active cloud provider + key without the full mining config surface.
 */
export function getConfiguredAiProvider(): { providerId: AiProviderId; apiKey: string } {
  const config = readMiningConfig();
  const providerId = config.providerId ?? DEFAULT_AI_PROVIDER_ID;
  return { providerId, apiKey: readApiKeyForProvider(providerId) };
}

/** Cloud vs local-Qwen — shared by Card Studio and sentence analysis. */
export function getConfiguredAiEngine(): AiEngineKind {
  return readMiningConfig().engine ?? 'cloud';
}

interface TokenCandidate {
  expression: string;
  reading: string;
  count: number;
  sampleSentence: string;
  nameTag?: NameTag;
  /** True when `reading` came from an unconjugated surface (surface === lemma). */
  readingFromLemma?: boolean;
}

let analyzeCancelRequested = false;

function broadcastMiningProgress(payload: MiningEnrichProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mining:enrichProgress', payload);
  }
}

function broadcastAiGenerateProgress(payload: AiGenerationProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('ai:generateProgress', payload);
  }
}

// Large decks generate thousands of progress events — cap the IPC rate so a
// 7000-candidate run cannot flood the renderer (final events always pass).
let lastProgressBroadcastAt = 0;
function throttledMiningProgress(payload: MiningEnrichProgress): void {
  const now = Date.now();
  const isFinal = payload.total > 0 && payload.done >= payload.total;
  if (!isFinal && now - lastProgressBroadcastAt < 250) return;
  lastProgressBroadcastAt = now;
  broadcastMiningProgress(payload);
}

function resolveNameTag(token: KuromojiToken): NameTag {
  if (token.pos !== '名詞' || token.pos_detail_1 !== '固有名詞') return null;
  if (token.pos_detail_2 === '人名') return 'ja-person';
  if (token.pos_detail_2 === '地域') return 'ja-place';
  if (token.pos_detail_2 === '組織') return 'ja-org';
  return 'ja-proper';
}

function mergeNameTag(existing: NameTag | undefined, next: NameTag): NameTag {
  if (!next) return existing ?? null;
  if (!existing) return next;
  const priority: NameTag[] = ['ja-person', 'ja-place', 'ja-org', 'ja-proper', 'cn-name', 'ru-name'];
  const ei = priority.indexOf(existing);
  const ni = priority.indexOf(next);
  if (ei < 0) return next;
  if (ni < 0) return existing;
  return ei <= ni ? existing : next;
}

function inferForeignNameTag(expression: string, reading: string): NameTag {
  if (matchesChineseNameHeuristic(expression, reading)) return 'cn-name';
  if (matchesRussianNameHeuristic(expression, reading)) return 'ru-name';
  return null;
}

function miningRoot(): string {
  return path.join(app.getPath('userData'), 'mining');
}

function freqRoot(): string {
  return path.join(miningRoot(), 'frequency-dicts');
}

function configPath(): string {
  return path.join(miningRoot(), 'config.json');
}

function libraryDbPath(): string {
  return path.join(app.getPath('userData'), 'library.json');
}

function ensureMiningRoot(): void {
  fs.mkdirSync(freqRoot(), { recursive: true });
}

function readLibraryItems(): LibraryItem[] {
  try {
    return JSON.parse(fs.readFileSync(libraryDbPath(), 'utf-8')) as LibraryItem[];
  } catch {
    return [];
  }
}

function resolveItemEpubPath(itemId: string): string | null {
  const item = readLibraryItems().find((entry) => entry.id === itemId);
  if (!item?.epubFile) return null;
  const dir = path.join(app.getPath('userData'), 'library', item.id);
  const primary = path.join(dir, item.epubFile);
  if (fs.existsSync(primary)) return primary;
  const fallback = path.join(dir, 'original.epub');
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function atomicWrite(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readMiningConfig(): MiningConfigFile {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf-8')) as Partial<MiningConfigFile>;
    const selectedPresetId =
      typeof raw.selectedPresetId === 'string' && raw.selectedPresetId.trim()
        ? raw.selectedPresetId
        : AI_PROMPT_PRESETS[0].id;
    const defaultFormat = formatsForPreset(selectedPresetId)[0] ?? AI_MINING_FORMATS[0];
    const selectedFormat =
      typeof raw.selectedFormatId === 'string'
        ? AI_MINING_FORMATS.find((format) => format.id === raw.selectedFormatId) ?? defaultFormat
        : defaultFormat;
    return {
      traditional: {
        ...DEFAULT_TRADITIONAL_MINING_CONFIG,
        ...(raw.traditional ?? {}),
        limits: {
          ...DEFAULT_MINING_LIMITS,
          ...(raw.traditional?.limits ?? {}),
        },
        templates: {
          ...DEFAULT_TRADITIONAL_MINING_CONFIG.templates,
          ...(raw.traditional?.templates ?? {}),
        },
        export: {
          ...DEFAULT_TRADITIONAL_MINING_CONFIG.export,
          ...(raw.traditional?.export ?? {}),
          excludeNames: {
            ...DEFAULT_TRADITIONAL_MINING_CONFIG.export.excludeNames,
            ...(raw.traditional?.export?.excludeNames ?? {}),
          },
        },
      },
      selectedPresetId,
      selectedFormatId: selectedFormat.id,
      cardCount: Math.max(1, Math.min(50, Math.round(raw.cardCount ?? selectedFormat.cardTemplates.length))),
      outputFormat: raw.outputFormat === 'csv' ? 'csv' : selectedFormat.outputFormat,
      providerId: providerIdFromRaw(raw.providerId),
      engine: normalizeAiEngineKind(raw.engine),
      ...languageOptionsFromRaw(raw),
    };
  } catch {
    const defaultFormat = formatsForPreset(AI_PROMPT_PRESETS[0].id)[0] ?? AI_MINING_FORMATS[0];
    return {
      traditional: DEFAULT_TRADITIONAL_MINING_CONFIG,
      selectedPresetId: AI_PROMPT_PRESETS[0].id,
      selectedFormatId: defaultFormat.id,
      cardCount: defaultFormat.cardTemplates.length,
      outputFormat: defaultFormat.outputFormat,
      providerId: DEFAULT_AI_PROVIDER_ID,
      engine: 'cloud',
      ...DEFAULT_AI_LANGUAGE_OPTIONS,
    };
  }
}

function writeMiningConfig(config: MiningConfigFile): void {
  atomicWrite(configPath(), JSON.stringify(config, null, 2));
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseXmlTagAttr(tag: string, attr: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1];
}

function zipEntryForPath(zip: AdmZip, relPath: string): AdmZip.IZipEntry | null {
  const normalized = relPath.replace(/\\/g, '/');
  const candidates = [
    normalized,
    decodeURIComponent(normalized),
    normalized.replace(/^\.\//, ''),
  ];
  for (const candidate of candidates) {
    const entry = zip.getEntry(candidate);
    if (entry) return entry;
  }
  const lower = normalized.toLowerCase();
  return zip.getEntries().find((entry) => entry.entryName.replace(/\\/g, '/').toLowerCase() === lower) ?? null;
}

function decodeZipEntryHtml(entry: AdmZip.IZipEntry): string {
  const raw = entry.getData();
  let html = raw.toString('utf-8');
  if (!html.trim() && raw.length >= 2) {
    if (raw[0] === 0xff && raw[1] === 0xfe) html = raw.toString('utf16le');
    else if (raw[0] === 0xfe && raw[1] === 0xff) html = raw.toString('utf16le');
  }
  return html;
}

/**
 * A section's own heading, for labelling the chapter picker.
 *
 * Falls back to the first line of body text, and then to nothing — the caller
 * numbers the section instead. It never invents a title, because a wrong chapter
 * label is worse than a bare number when the user is choosing what to mine.
 */
function epubSectionHeading(html: string, text: string): string {
  const heading = html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const fromHeading = heading ? stripHtml(heading[1]).trim() : '';
  if (fromHeading) return fromHeading.replace(/\s+/g, ' ').slice(0, 80);
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  return firstLine.replace(/\s+/g, ' ').slice(0, 80);
}

export interface EpubSection {
  /** 1-based spine position. Stable regardless of what was decoded. */
  index: number;
  /** Empty when the section was skipped — a heading cannot be read without decoding. */
  title: string;
  href: string;
  /** Empty when skipped. Check `decoded` rather than treating this as "no text". */
  text: string;
  decoded: boolean;
}

/**
 * The EPUB's spine, one entry per section, in reading order.
 *
 * This is the structure the old whole-book extractor always built and then
 * destroyed on its last line (`parts.join('\n')`). Chapter-range mining needed
 * nothing more than not throwing it away.
 *
 * A spine item is the book's own division, which is usually but not always a
 * chapter — front matter, a colophon and an afterword are spine items too. The
 * picker therefore shows what is really there, numbered as it really is, rather
 * than pretending section 1 is chapter 1.
 */
export function extractEpubSections(
  epubPath: string,
  rangeInput?: ChapterRangeInput | null,
): { title: string; sectionCount: number; range: ChapterRange | null; sections: EpubSection[] } {
  const zip = new AdmZip(epubPath);
  const container = zip.getEntry('META-INF/container.xml');
  if (!container) throw new Error('EPUB container.xml is missing.');
  const containerXml = container.getData().toString('utf-8');
  const opfRel =
    (containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i) ?? [])[1]?.replace(/\\/g, '/');
  if (!opfRel) throw new Error('Could not locate the EPUB OPF package.');
  const opfEntry = zipEntryForPath(zip, opfRel);
  if (!opfEntry) throw new Error('The EPUB OPF package is missing.');
  const opfXml = opfEntry.getData().toString('utf-8');
  const opfDir = path.posix.dirname(opfRel);

  const manifest = new Map<string, string>();
  for (const match of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const tag = match[0];
    const id = parseXmlTagAttr(tag, 'id');
    const href = parseXmlTagAttr(tag, 'href');
    if (id && href) manifest.set(id, href);
  }
  const spineIds = [...opfXml.matchAll(/<itemref\b[^>]*>/gi)]
    .map((match) => parseXmlTagAttr(match[0], 'idref'))
    .filter((id): id is string => Boolean(id));
  const title = extractEpubTitleFromOpf(opfXml) ?? 'EPUB';

  // Phase 1 — establish the running order WITHOUT decoding anything. Section
  // numbers are spine positions, so a section's number does not depend on
  // whether any other section was read. That is what makes phase 2 skippable and
  // what keeps the number the picker showed the same number the analysis used.
  const ordered: Array<{ href: string; entry: AdmZip.IZipEntry }> = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;
    const full = opfDir && opfDir !== '.' ? path.posix.normalize(path.posix.join(opfDir, href)) : href;
    const entry = zipEntryForPath(zip, full);
    if (entry) ordered.push({ href: full, entry });
  }
  if (!ordered.length) {
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replace(/\\/g, '/').toLowerCase();
      if (!/\.(xhtml|html|htm)$/.test(name)) continue;
      if (/(^|\/)nav\.xhtml$/.test(name) || name.includes('toc')) continue;
      ordered.push({ href: entry.entryName.replace(/\\/g, '/'), entry });
    }
  }

  // Phase 2 — decode only what was asked for. A range over a long novel now
  // costs the sections in the range, not the whole book: the unzip and the HTML
  // strip are the expensive part of extraction, and both are skipped outright.
  const range = normalizeChapterRange(rangeInput, ordered.length);
  const sections: EpubSection[] = ordered.map((item, offset) => {
    const index = offset + 1;
    if (range && (index < range.from || index > range.to)) {
      return { index, title: '', href: item.href, text: '', decoded: false };
    }
    const html = decodeZipEntryHtml(item.entry);
    const text = stripHtml(html);
    return { index, title: epubSectionHeading(html, text), href: item.href, text, decoded: true };
  });

  return { title, sectionCount: ordered.length, range, sections };
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[。！？!?.])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isJapaneseText(text: string): boolean {
  return /[぀-ヿ㐀-鿿々]/.test(text);
}

/**
 * Reading of the dictionary (lemma) form — NOT of a conjugated surface. The
 * old code stored the reading of the first surface hit on the lemma (会う →
 * アッ from 会った, 訊く → キイ from 訊いて). Preference order:
 * 1. Yomitan dictionary reading for the exact lemma (disambiguated by the
 *    kuromoji lemma reading when the word has several readings).
 * 2. Kuromoji re-tokenization of the bare lemma.
 * 3. Whatever the surface pass produced (last resort).
 * Readings are stored as hiragana; the export option converts to katakana.
 */
function resolveLemmaReading(
  tokenizer: { tokenize(text: string): KuromojiToken[] },
  lemma: string,
  surfaceReading: string,
  fromLemma: boolean,
): string {
  let kuroReading = fromLemma ? surfaceReading : '';
  if (!kuroReading) {
    try {
      const tokens = tokenizer.tokenize(lemma);
      if (
        tokens.length > 0 &&
        tokens.every((t) => t.reading && t.reading !== '*') &&
        tokens.map((t) => t.surface_form).join('') === lemma
      ) {
        kuroReading = tokens.map((t) => t.reading).join('');
      }
    } catch {
      /* keep fallbacks */
    }
  }
  const dictReadings = lookupGlossary(lemma)
    .filter((e) => e.word === lemma)
    .map((e) => e.reading ?? '');
  return pickLemmaReading(dictReadings, kuroReading, surfaceReading);
}

async function tokenizeJapanese(text: string): Promise<Map<string, TokenCandidate>> {
  const tokenizer = await getMainJapaneseTokenizer();
  if (!tokenizer) return tokenizeJapaneseSimple(text);
  const byExpression = new Map<string, TokenCandidate>();
  for (const sentence of splitSentences(text)) {
    const tokens = tokenizer.tokenize(sentence);
    for (const token of tokens) {
      const surface = token.surface_form?.trim();
      const lemma = (token.basic_form && token.basic_form !== '*' ? token.basic_form : surface)?.trim();
      if (!surface || !lemma) continue;
      if (!['名詞', '動詞', '形容詞', '副詞'].includes(token.pos)) continue;
      if (token.pos === '名詞' && ['数', '非自立', '接尾', '代名詞', '特殊'].includes(token.pos_detail_1)) continue;
      const nameTag = resolveNameTag(token);
      const surfaceIsLemma = surface === lemma;
      const entry = byExpression.get(lemma) ?? {
        expression: lemma,
        reading: token.reading?.trim() ?? '',
        count: 0,
        sampleSentence: sentence,
        nameTag: null,
        readingFromLemma: surfaceIsLemma && Boolean(token.reading?.trim()),
      };
      entry.count += 1;
      if (!entry.sampleSentence) entry.sampleSentence = sentence;
      if (!entry.reading && token.reading) entry.reading = token.reading.trim();
      // An unconjugated occurrence gives the true lemma reading — take it.
      if (surfaceIsLemma && token.reading?.trim() && !entry.readingFromLemma) {
        entry.reading = token.reading.trim();
        entry.readingFromLemma = true;
      }
      entry.nameTag = mergeNameTag(entry.nameTag, nameTag);
      if (!entry.nameTag) {
        entry.nameTag = inferForeignNameTag(lemma, entry.reading);
      }
      byExpression.set(lemma, entry);
    }
  }

  // Fix readings against the dictionary / bare-lemma tokenization.
  await initYomitan();
  for (const entry of byExpression.values()) {
    entry.reading = resolveLemmaReading(
      tokenizer,
      entry.expression,
      entry.reading,
      entry.readingFromLemma ?? false,
    );
  }
  return byExpression;
}

function tokenizeJapaneseSimple(text: string): Map<string, TokenCandidate> {
  const byExpression = new Map<string, TokenCandidate>();
  for (const sentence of splitSentences(text)) {
    const parts = sentence.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF々ー]+/g) ?? [];
    for (const expr of parts) {
      if (expr.length < 2) continue;
      const entry = byExpression.get(expr) ?? {
        expression: expr,
        reading: '',
        count: 0,
        sampleSentence: sentence,
      };
      entry.count += 1;
      if (!entry.sampleSentence) entry.sampleSentence = sentence;
      byExpression.set(expr, entry);
    }
  }
  return byExpression;
}

function tokenizeSimple(text: string): Map<string, TokenCandidate> {
  const byExpression = new Map<string, TokenCandidate>();
  for (const sentence of splitSentences(text)) {
    const parts = sentence.match(/[A-Za-z\u00C0-\u024F'-]+/g) ?? [];
    for (const raw of parts) {
      const expr = raw.toLowerCase();
      if (expr.length < 2) continue;
      const entry = byExpression.get(expr) ?? {
        expression: expr,
        reading: '',
        count: 0,
        sampleSentence: sentence,
      };
      entry.count += 1;
      byExpression.set(expr, entry);
    }
  }
  return byExpression;
}

function syncBundledFrequencySummary(
  filePath: string,
  parsed: FrequencyDictionaryFile,
  patch: Partial<FrequencyDictionarySummary>,
): void {
  const nextSummary = { ...parsed.summary, ...patch };
  if (JSON.stringify(nextSummary) === JSON.stringify(parsed.summary)) return;
  atomicWrite(filePath, JSON.stringify({ ...parsed, summary: nextSummary }, null, 2));
}

function ensureBundledFrequencyDictionaries(): void {
  ensureMiningRoot();
  for (const def of BUNDLED_FREQUENCY_DICTIONARIES) {
    const file = path.join(freqRoot(), `${def.id}.json`);
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as FrequencyDictionaryFile;
        syncBundledFrequencySummary(file, parsed, {
          label: def.label,
          source: 'bundled',
          language: def.language,
        });
      } catch {
        /* ignore broken files */
      }
      continue;
    }
    const ranks: Record<string, number> = {};
    def.words.forEach((word, index) => {
      const w = word.trim();
      if (w) ranks[w] = index + 1;
    });
    const summary: FrequencyDictionarySummary = {
      id: def.id,
      label: def.label,
      source: 'bundled',
      entryCount: Object.keys(ranks).length,
      enabled: Boolean(def.defaultEnabled),
      importedAt: Date.now(),
      language: def.language,
    };
    atomicWrite(file, JSON.stringify({ summary, ranks }, null, 2));
  }
}

async function fetchText(url: string, ms = 180000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseJpdbFrequencyTsv(text: string): Record<string, number> {
  const ranks: Record<string, number> = {};
  const lines = text.split(/\r?\n/).filter(Boolean);
  const body = lines[0]?.startsWith('term\t') ? lines.slice(1) : lines;
  for (const line of body) {
    const [termRaw, readingRaw, frequencyRaw] = line.split('\t');
    const term = termRaw?.trim();
    if (!term) continue;
    const frequency = Number(frequencyRaw);
    if (!Number.isFinite(frequency) || frequency <= 0) continue;
    const rank = Math.round(frequency);
    ranks[term] = rank;
    const reading = readingRaw?.trim();
    if (reading) ranks[`${term}\x01${reading}`] = rank;
  }
  return ranks;
}

function parseBundledRemoteFrequencyDictionary(
  format: 'jpdb-tsv',
  payload: string,
): Record<string, number> {
  if (format === 'jpdb-tsv') return parseJpdbFrequencyTsv(payload);
  return {};
}

async function ensureRemoteBundledFrequencyDictionaries(): Promise<void> {
  ensureMiningRoot();
  let changed = false;
  for (const def of REMOTE_BUNDLED_FREQUENCY_DICTIONARIES) {
    const file = path.join(freqRoot(), `${def.id}.json`);
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as FrequencyDictionaryFile;
        syncBundledFrequencySummary(file, parsed, {
          label: def.label,
          source: def.source,
          language: def.language,
        });
      } catch {
        /* ignore broken files */
      }
      continue;
    }
    try {
      const payload = await fetchText(def.url);
      const ranks = parseBundledRemoteFrequencyDictionary(def.format, payload);
      if (Object.keys(ranks).length < 10000) {
        throw new Error(`Downloaded frequency list is unexpectedly small (${Object.keys(ranks).length} entries).`);
      }
      const summary: FrequencyDictionarySummary = {
        id: def.id,
        label: def.label,
        source: def.source,
        entryCount: Object.keys(ranks).length,
        enabled: Boolean(def.defaultEnabled),
        importedAt: Date.now(),
        language: def.language,
      };
      atomicWrite(file, JSON.stringify({ summary, ranks }, null, 2));
      changed = true;
    } catch (error) {
      console.warn(`[mining] failed to provision bundled frequency list ${def.id}:`, error);
    }
  }
  if (changed) invalidateFreqDictCache();
}

function preferLargeJapaneseFrequencyDictionary(): void {
  const largeJaId = new Set<string>();
  for (const def of REMOTE_BUNDLED_FREQUENCY_DICTIONARIES) {
    if (def.language !== 'ja') continue;
    const file = path.join(freqRoot(), `${def.id}.json`);
    if (fs.existsSync(file)) largeJaId.add(def.id);
  }
  if (!largeJaId.size) return;
  for (const fileName of fs.readdirSync(freqRoot()).filter((name) => name.endsWith('.json'))) {
    const file = path.join(freqRoot(), fileName);
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as FrequencyDictionaryFile;
      if (parsed.summary.language !== 'ja') continue;
      if (largeJaId.has(parsed.summary.id)) {
        if (!parsed.summary.enabled) {
          parsed.summary.enabled = true;
          atomicWrite(file, JSON.stringify(parsed, null, 2));
        }
        continue;
      }
      if (parsed.summary.id === 'bundled-freq-ja' && parsed.summary.enabled) {
        parsed.summary.enabled = false;
        atomicWrite(file, JSON.stringify(parsed, null, 2));
      }
    } catch {
      /* ignore broken files */
    }
  }
}

// Parsed frequency-dict files are cached in memory: resolveCustomFrequencyRanks
// is called once per token during analyze, and re-reading/parsing every dict
// file from disk for each of thousands of tokens was needless main-thread work.
let freqDictFilesCache: FrequencyDictionaryFile[] | null = null;
let ensureRemoteBundledFrequencyPromise: Promise<void> | null = null;

function invalidateFreqDictCache(): void {
  freqDictFilesCache = null;
}

async function ensureAllFrequencyDictionariesReady(): Promise<void> {
  ensureBundledFrequencyDictionaries();
  if (!ensureRemoteBundledFrequencyPromise) {
    ensureRemoteBundledFrequencyPromise = ensureRemoteBundledFrequencyDictionaries()
      .catch((error) => {
        console.warn('[mining] bundled remote frequency provisioning failed:', error);
      })
      .finally(() => {
        ensureRemoteBundledFrequencyPromise = null;
      });
  }
  await ensureRemoteBundledFrequencyPromise;
  preferLargeJapaneseFrequencyDictionary();
  invalidateFreqDictCache();
}

function listFrequencyDictionaryFiles(): FrequencyDictionaryFile[] {
  if (freqDictFilesCache) return freqDictFilesCache;
  ensureBundledFrequencyDictionaries();
  const files = fs
    .readdirSync(freqRoot())
    .filter((name) => name.endsWith('.json'))
    .sort();
  const out: FrequencyDictionaryFile[] = [];
  for (const name of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(freqRoot(), name), 'utf-8')) as FrequencyDictionaryFile;
      if (parsed?.summary?.id && parsed?.ranks) out.push(parsed);
    } catch {
      /* ignore broken files */
    }
  }
  freqDictFilesCache = out;
  return out;
}

function listFrequencyDictionaries(): FrequencyDictionarySummary[] {
  return listFrequencyDictionaryFiles().map((entry) => entry.summary);
}

/**
 * The keys to try for one word, most specific first.
 *
 * A reading-keyed entry is tried before the bare expression, and the order is
 * load-bearing. `parseFrequencyDictionaryPayload` writes both keys for every
 * entry, so a homograph's bare key is overwritten by each reading in turn and
 * ends up holding whichever reading the list happened to store last - an
 * arbitrary one. Measured on the bundled JPDB v2.2 list, the bare key for the
 * pronoun "watashi" answers 291,201 while the same word keyed with its reading
 * answers 32. Reading first turns that arbitrary pick into the word the caller
 * actually meant, and the bare key stays as the fallback for callers with no
 * reading and for lists that store none.
 */
function frequencyLookupKey(expression: string, reading?: string): string[] {
  const expr = expression.trim();
  const out: string[] = [];
  const r = reading?.trim();
  if (r) {
    // Readings are stored as hiragana now; older imports may key by katakana.
    out.push(`${expr}\x01${r}`);
    const hira = kataToHira(r);
    const kata = hira.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    if (hira !== r) out.push(`${expr}\x01${hira}`);
    if (kata !== r) out.push(`${expr}\x01${kata}`);
  }
  out.push(expr);
  return out;
}

/**
 * Rank one word across the enabled lists, optionally only the ones that speak
 * its language.
 *
 * `language` is optional and narrowing-only: a caller that knows what it is
 * reading passes it and gets ranks from that language's lists alone; a caller
 * that does not passes nothing and keeps the old, wider behaviour. A list that
 * declares no language is always consulted either way, because an imported list
 * carries no `language` field and dropping those would lose ranks the user
 * installed on purpose.
 *
 * Without it, `primary` is the minimum across *every* enabled list, and the
 * bundled lists cover three languages that share a script. Measured on this
 * installation: 本 in a Japanese passage answered **81** from `Chinese core
 * frequency` (390 entries) instead of **357** from JPDB v2.2 (550,408) — the
 * Chinese rank is lower, so it won the minimum. The difficulty profile then
 * printed a Japanese passage's ranks and attributed them to a Chinese list.
 */
export function resolveCustomFrequencyRanks(
  expression: string,
  reading: string | undefined,
  language?: FrequencyDictionarySummary['language'],
): { primary?: number; byDictionary: Record<string, number> } {
  const byDictionary: Record<string, number> = {};
  let primary: number | undefined;
  for (const dict of listFrequencyDictionaryFiles()) {
    if (!dict.summary.enabled) continue;
    if (language && dict.summary.language && dict.summary.language !== language) continue;
    const keys = frequencyLookupKey(expression, reading);
    let found: number | undefined;
    for (const key of keys) {
      const rank = dict.ranks[key];
      if (typeof rank === 'number' && Number.isFinite(rank)) {
        found = rank;
        break;
      }
    }
    if (found == null) continue;
    byDictionary[dict.summary.label] = found;
    if (primary == null || found < primary) primary = found;
  }
  if (primary == null) {
    const yomitanRank = getFrequencyRank(expression, reading);
    if (yomitanRank != null) {
      primary = yomitanRank;
      byDictionary.Yomitan = yomitanRank;
    }
  }
  return { primary, byDictionary };
}

function cleanLabel(label: string): string {
  return label.replace(/[^\w -]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Frequency List';
}

function parseFrequencyDictionaryPayload(payload: unknown, label: string): Record<string, number> {
  const ranks: Record<string, number> = {};
  const put = (expression: unknown, reading: unknown, rank: unknown): void => {
    const expr = typeof expression === 'string' ? expression.trim() : '';
    const numeric = typeof rank === 'number' ? rank : Number(rank);
    if (!expr || !Number.isFinite(numeric)) return;
    ranks[expr] = Math.round(numeric);
    const rd = typeof reading === 'string' ? reading.trim() : '';
    if (rd) ranks[`${expr}\x01${rd}`] = Math.round(numeric);
  };
  if (Array.isArray(payload)) {
    payload.forEach((entry, index) => {
      if (typeof entry === 'string') {
        put(entry, '', index + 1);
        return;
      }
      if (Array.isArray(entry)) {
        put(entry[0], entry[1], entry[2] ?? index + 1);
        return;
      }
      if (!entry || typeof entry !== 'object') return;
      const obj = entry as Record<string, unknown>;
      put(
        obj.expression ?? obj.term ?? obj.word ?? obj[0],
        obj.reading ?? obj.kana ?? obj[1],
        obj.rank ?? obj.frequency ?? obj.value ?? obj[2] ?? index + 1,
      );
    });
    return ranks;
  }
  if (payload && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (typeof value === 'number') put(key, '', value);
      else if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        put(key, obj.reading ?? obj.kana, obj.rank ?? obj.frequency ?? obj.value);
      }
    }
  }
  if (!Object.keys(ranks).length) {
    throw new Error(`Could not parse any ranks from "${label}".`);
  }
  return ranks;
}

function svgImageDataUrl(term: string, presetLabel: string): string {
  const text = `${term} · ${presetLabel}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">` +
    `<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#241016"/><stop offset="1" stop-color="#4b1220"/></linearGradient></defs>` +
    `<rect width="1200" height="630" fill="url(#g)"/>` +
    `<text x="60" y="240" fill="#f5f4f7" font-size="72" font-family="Segoe UI, sans-serif">${escapeXml(term)}</text>` +
    `<text x="60" y="330" fill="#ff6b81" font-size="32" font-family="Segoe UI, sans-serif">${escapeXml(text)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function findImageHtml(term: string, presetLabel: string): Promise<{ imageHtml: string; imageQuery: string }> {
  const query = `${term} ${presetLabel}`.trim();
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=600&titles=${encodeURIComponent(term)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
      };
      const thumb = json.query?.pages && Object.values(json.query.pages)[0]?.thumbnail?.source;
      if (thumb) {
        return {
          imageHtml: `<img src="${thumb}" alt="${escapeXml(term)}">`,
          imageQuery: query,
        };
      }
    }
  } catch {
    /* fall through to generated image */
  }
  const dataUrl = svgImageDataUrl(term, presetLabel);
  return { imageHtml: `<img src="${dataUrl}" alt="${escapeXml(term)}">`, imageQuery: query };
}

function buildSchema(): unknown {
  return {
    type: 'object',
    properties: {
      expression: { type: 'string' },
      reading: { type: 'string' },
      meaning: { type: 'string' },
      nuance: { type: 'string' },
      sentence: { type: 'string' },
      sentenceTranslationEn: { type: 'string' },
      sentenceTranslationRu: { type: 'string' },
      sentenceTranslationZh: { type: 'string' },
      meaningRu: { type: 'string' },
      meaningZh: { type: 'string' },
      grammarBreakdown: { type: 'string' },
      culturalContext: { type: 'string' },
      properNameNotes: { type: 'string' },
      toponymNotes: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      imageQuery: { type: 'string' },
      suggestedFront: { type: 'string' },
      suggestedBack: { type: 'string' },
    },
    required: [
      'expression',
      'reading',
      'meaning',
      'sentence',
      'suggestedFront',
      'suggestedBack',
    ],
  };
}

function buildBatchSchema(): unknown {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: buildSchema(),
      },
    },
    required: ['items'],
  };
}

const AI_INVENT_CHUNK_SIZE = 10;

function presetById(id: string): AiPromptPreset {
  return AI_PROMPT_PRESETS.find((preset) => preset.id === id) ?? AI_PROMPT_PRESETS[0];
}

function formatById(id: string | undefined, presetId: string): AiMiningCardFormat {
  return (
    (id ? AI_MINING_FORMATS.find((format) => format.id === id) : undefined) ??
    formatsForPreset(presetId)[0] ??
    AI_MINING_FORMATS[0]
  );
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, '\n')}"`;
}

function cardsToCsv(cards: AiGeneratedCard[]): string {
  const rows = [['Format', 'Front', 'Back', 'Tags']].concat(
    cards.map((card) => [card.label, card.front, card.back, card.tags.join(' ')]),
  );
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}


function buildGeneratedCards(
  format: AiMiningCardFormat,
  cardCount: number,
  values: Record<string, string>,
): AiGeneratedCard[] {
  const templates = format.cardTemplates.length ? format.cardTemplates : AI_MINING_FORMATS[0].cardTemplates;
  const count = Math.max(1, Math.min(50, Math.round(cardCount || templates.length)));
  const cards: AiGeneratedCard[] = [];
  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    cards.push({
      formatId: format.id,
      label: count > templates.length ? `${template.label} ${Math.floor(i / templates.length) + 1}` : template.label,
      front: renderAiTemplate(template.front, values),
      back: renderAiTemplate(template.back, values),
      tags: template.tags,
    });
  }
  return cards;
}

async function enrichWithAi(req: AiEnrichmentRequest): Promise<AiEnrichmentResult> {
  const config = readMiningConfig();
  const engine = config.engine ?? 'cloud';
  const providerId = req.providerId ?? config.providerId ?? DEFAULT_AI_PROVIDER_ID;
  const provider = providerById(providerId);
  const apiKey = engine === 'cloud' ? readApiKeyForProvider(providerId) : '';
  if (engine === 'cloud' && !apiKey) {
    throw new Error(`Add a ${provider.label} API key before using AI enrichment.`);
  }
  if (engine === 'local-qwen') {
    const { isTranslateAvailable } = await import('./translate');
    if (!isTranslateAvailable()) {
      throw new Error(
        'Local Qwen model not found. Install Qwen3-1.7B via Translate, or switch the engine to Cloud.',
      );
    }
  }
  const preset = presetById(req.presetId);
  const format = formatById(req.formatId, preset.id);
  const langOptions = normalizeLanguageOptions({
    frontLang: req.frontLang ?? config.frontLang,
    backLang: req.backLang ?? config.backLang,
    reverse: req.reverse ?? config.reverse,
    backGlossLangs: req.backGlossLangs ?? config.backGlossLangs,
  });
  const localizedFormat = applyLanguageOptionsToFormat(format, preset, langOptions);
  const profile = getProfileStore().getActiveProfile();
  const activeTemplate = localizedFormat.cardTemplates[0];
  const templateFront = activeTemplate?.front ?? '{expression}';
  const templateBack = activeTemplate?.back ?? '{meaning}\n{sentence}';
  const cardCount = Math.max(1, Math.min(50, Math.round(req.cardCount ?? config.cardCount)));
  const outputFormat = req.outputFormat ?? config.outputFormat;
  const prompt = buildAiPromptPreview({
    mode: 'dictionary',
    preset,
    localizedFormat,
    langOptions,
    cardCount,
    outputFormat,
    templateFront,
    templateBack,
    targetLang: profile.targetLang,
    sampleTerm: req,
  });
  const text =
    engine === 'local-qwen'
      ? await (await import('./translate')).runLocalQwenPrompt(
          `${prompt}\n\nRespond with a single JSON object only — no markdown fences.`,
          { maxTokens: 2048, timeoutMs: 120_000 },
        )
      : await callAiProvider(providerId, apiKey, prompt, buildSchema());
  const parsed = parseAiJson<Partial<AiEnrichmentResult>>(text, engine === 'local-qwen' ? 'Local Qwen' : provider.label);
  const image = await findImageHtml(parsed.imageQuery || req.term, preset.label);
  const values = {
    expression: parsed.expression || req.term,
    reading: parsed.reading || req.reading || '',
    meaning: parsed.meaning || '',
    meaningRu: parsed.meaningRu || parsed.sentenceTranslationRu || '',
    meaningZh: parsed.meaningZh || '',
    nuance: parsed.nuance || '',
    sentence: parsed.sentence || req.sentence,
    sentenceTranslationEn: parsed.sentenceTranslationEn || '',
    sentenceTranslationRu: parsed.sentenceTranslationRu || '',
    sentenceTranslationZh: parsed.sentenceTranslationZh || '',
    grammarBreakdown: parsed.grammarBreakdown || '',
    culturalContext: parsed.culturalContext || '',
    properNameNotes: parsed.properNameNotes || '',
    toponymNotes: parsed.toponymNotes || '',
    frequency: Object.entries(req.frequencies ?? {})
      .map(([name, rank]) => `${name}: #${rank}`)
      .join(' / '),
    'cloze-before': req.sentence.split(req.term)[0] ?? '',
    'cloze-after': req.sentence.includes(req.term) ? req.sentence.split(req.term).slice(1).join(req.term) : '',
  };
  const cards = buildGeneratedCards(localizedFormat, cardCount, values);
  return {
    presetId: preset.id,
    formatId: format.id,
    expression: values.expression,
    reading: values.reading,
    meaning: values.meaning,
    meaningRu: values.meaningRu,
    meaningZh: values.meaningZh,
    nuance: values.nuance,
    sentence: values.sentence,
    sentenceTranslationEn: values.sentenceTranslationEn,
    sentenceTranslationRu: values.sentenceTranslationRu,
    sentenceTranslationZh: values.sentenceTranslationZh,
    grammarBreakdown: values.grammarBreakdown,
    culturalContext: values.culturalContext,
    properNameNotes: values.properNameNotes,
    toponymNotes: values.toponymNotes,
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === 'string') : [],
    imageQuery: parsed.imageQuery || image.imageQuery,
    imageHtml: image.imageHtml,
    suggestedFront: parsed.suggestedFront || config.traditional.templates.front,
    suggestedBack: parsed.suggestedBack || config.traditional.templates.back,
    cards,
    csv: cardsToCsv(cards),
    frequencies: req.frequencies ?? {},
    rawJson: text,
  };
}

async function buildEnrichmentResult(
  parsed: Partial<AiEnrichmentResult>,
  ctx: {
    preset: AiPromptPreset;
    format: AiMiningCardFormat;
    localizedFormat: AiMiningCardFormat;
    cardCount: number;
    config: MiningConfigFile;
    term: string;
    reading?: string;
    sentence?: string;
    frequencies?: Record<string, number>;
  },
): Promise<AiEnrichmentResult> {
  const { preset, format, localizedFormat, cardCount, config, term } = ctx;
  const reading = ctx.reading ?? '';
  const sentence = ctx.sentence ?? '';
  const image = await findImageHtml(parsed.imageQuery || term, preset.label);
  const values = {
    expression: parsed.expression || term,
    reading: parsed.reading || reading,
    meaning: parsed.meaning || '',
    meaningRu: parsed.meaningRu || parsed.sentenceTranslationRu || '',
    meaningZh: parsed.meaningZh || '',
    nuance: parsed.nuance || '',
    sentence: parsed.sentence || sentence,
    sentenceTranslationEn: parsed.sentenceTranslationEn || '',
    sentenceTranslationRu: parsed.sentenceTranslationRu || '',
    sentenceTranslationZh: parsed.sentenceTranslationZh || '',
    grammarBreakdown: parsed.grammarBreakdown || '',
    culturalContext: parsed.culturalContext || '',
    properNameNotes: parsed.properNameNotes || '',
    toponymNotes: parsed.toponymNotes || '',
    frequency: Object.entries(ctx.frequencies ?? {})
      .map(([name, rank]) => `${name}: #${rank}`)
      .join(' / '),
    'cloze-before': sentence.split(term)[0] ?? '',
    'cloze-after': sentence.includes(term) ? sentence.split(term).slice(1).join(term) : '',
  };
  const cards = buildGeneratedCards(localizedFormat, cardCount, values);
  return {
    presetId: preset.id,
    formatId: format.id,
    expression: values.expression,
    reading: values.reading,
    meaning: values.meaning,
    meaningRu: values.meaningRu,
    meaningZh: values.meaningZh,
    nuance: values.nuance,
    sentence: values.sentence,
    sentenceTranslationEn: values.sentenceTranslationEn,
    sentenceTranslationRu: values.sentenceTranslationRu,
    sentenceTranslationZh: values.sentenceTranslationZh,
    grammarBreakdown: values.grammarBreakdown,
    culturalContext: values.culturalContext,
    properNameNotes: values.properNameNotes,
    toponymNotes: values.toponymNotes,
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag) => typeof tag === 'string') : [],
    imageQuery: parsed.imageQuery || image.imageQuery,
    imageHtml: image.imageHtml,
    suggestedFront: parsed.suggestedFront || config.traditional.templates.front,
    suggestedBack: parsed.suggestedBack || config.traditional.templates.back,
    cards,
    csv: cardsToCsv(cards),
    frequencies: ctx.frequencies ?? {},
    rawJson: JSON.stringify(parsed),
  };
}

async function generateDeckWithAi(req: AiDeckGenerationRequest): Promise<AiEnrichmentResult[]> {
  const config = readMiningConfig();
  const engine = config.engine ?? 'cloud';
  const providerId = req.providerId ?? config.providerId ?? DEFAULT_AI_PROVIDER_ID;
  const provider = providerById(providerId);
  const apiKey = engine === 'cloud' ? readApiKeyForProvider(providerId) : '';
  if (engine === 'cloud' && !apiKey) {
    throw new Error(`Add a ${provider.label} API key before generating cards.`);
  }
  if (engine === 'local-qwen') {
    const { isTranslateAvailable } = await import('./translate');
    if (!isTranslateAvailable()) {
      throw new Error(
        'Local Qwen model not found. Install Qwen3-1.7B via Translate, or switch the engine to Cloud.',
      );
    }
  }
  const preset = presetById(req.presetId);
  const format = formatById(req.formatId, preset.id);
  const langOptions = normalizeLanguageOptions({
    frontLang: req.frontLang ?? config.frontLang,
    backLang: req.backLang ?? config.backLang,
    reverse: req.reverse ?? config.reverse,
    backGlossLangs: req.backGlossLangs ?? config.backGlossLangs,
  });
  const localizedFormat = applyLanguageOptionsToFormat(format, preset, langOptions);
  const profile = getProfileStore().getActiveProfile();
  const activeTemplate = localizedFormat.cardTemplates[0];
  const templateFront = activeTemplate?.front ?? '{expression}';
  const templateBack = activeTemplate?.back ?? '{meaning}\n{sentence}';
  const cardCount = Math.max(1, Math.min(50, Math.round(req.cardCount ?? config.cardCount)));
  const outputFormat = req.outputFormat ?? config.outputFormat;

  if (req.source === 'dictionary') {
    const terms = req.terms ?? [];
    if (!terms.length) {
      throw new Error('Star words in Dictionary first, or switch to preset generation.');
    }
    const results: AiEnrichmentResult[] = [];
    const total = terms.length;
    for (let i = 0; i < terms.length; i++) {
      const entry = terms[i];
      broadcastAiGenerateProgress({
        phase: 'enrich',
        done: i,
        total,
        message: `Enriching “${entry.term}” (${i + 1} of ${total})…`,
      });
      results.push(
        await enrichWithAi({
          term: entry.term,
          reading: entry.reading,
          sentence: entry.sentence ?? '',
          bookTitle: preset.label,
          presetId: preset.id,
          formatId: format.id,
          cardCount,
          outputFormat,
          providerId,
          frontLang: langOptions.frontLang,
          backLang: langOptions.backLang,
          reverse: langOptions.reverse,
          backGlossLangs: langOptions.backGlossLangs,
        }),
      );
    }
    broadcastAiGenerateProgress({
      phase: 'done',
      done: total,
      total,
      message: `Built ${results.reduce((n, r) => n + r.cards.length, 0)} cards from ${results.length} words.`,
    });
    return results;
  }

  const wordCount = Math.max(1, Math.min(50, Math.round(req.wordCount ?? 10)));
  const inventBatches = Math.ceil(wordCount / AI_INVENT_CHUNK_SIZE);
  const items: Partial<AiEnrichmentResult>[] = [];
  const inventedExpressions: string[] = [];

  broadcastAiGenerateProgress({
    phase: 'invent',
    done: 0,
    total: wordCount,
    message: `Inventing ${wordCount} vocabulary items…`,
  });

  for (let batchIndex = 0; batchIndex < inventBatches && items.length < wordCount; batchIndex++) {
    const chunkCount = Math.min(AI_INVENT_CHUNK_SIZE, wordCount - items.length);
    const batchLabel =
      inventBatches > 1 ? ` (batch ${batchIndex + 1}/${inventBatches})` : '';
    broadcastAiGenerateProgress({
      phase: 'invent',
      done: items.length,
      total: wordCount,
      message: `Inventing ${chunkCount} items${batchLabel}…`,
    });
    const prompt = buildAiPromptPreview({
      mode: 'preset',
      preset,
      localizedFormat,
      langOptions,
      cardCount,
      outputFormat,
      templateFront,
      templateBack,
      targetLang: profile.targetLang,
      wordCount: chunkCount,
      avoidExpressions: inventedExpressions.length ? inventedExpressions : undefined,
      inventBatch:
        inventBatches > 1 ? { index: batchIndex + 1, total: inventBatches } : undefined,
    });
    const text =
      engine === 'local-qwen'
        ? await (await import('./translate')).runLocalQwenPrompt(
            `${prompt}\n\nRespond with a single JSON object only — no markdown fences.`,
            { maxTokens: Math.min(8192, Math.max(2048, chunkCount * 450)), timeoutMs: 180_000 },
          )
        : await callAiProvider(providerId, apiKey, prompt, buildBatchSchema(), {
            itemCount: chunkCount,
          });
    const parsed = parseAiJson<{ items?: Partial<AiEnrichmentResult>[] }>(
      text,
      engine === 'local-qwen' ? 'Local Qwen' : provider.label,
    );
    const chunkItems = Array.isArray(parsed.items) ? parsed.items : [];
    if (!chunkItems.length) {
      throw new Error(
        `AI returned no vocabulary items${batchLabel || ''} for this preset.`,
      );
    }
    const before = items.length;
    for (const item of chunkItems) {
      const expression = (item.expression || '').trim();
      if (!expression || inventedExpressions.includes(expression)) continue;
      inventedExpressions.push(expression);
      items.push(item);
      if (items.length >= wordCount) break;
    }
    if (items.length === before) {
      throw new Error(
        `AI returned only duplicate vocabulary items${batchLabel || ''}. Try again or switch provider.`,
      );
    }
    broadcastAiGenerateProgress({
      phase: 'invent',
      done: items.length,
      total: wordCount,
      message: `Invented ${items.length} of ${wordCount} items…`,
    });
  }

  if (!items.length) {
    throw new Error('AI returned no vocabulary items for this preset.');
  }
  broadcastAiGenerateProgress({
    phase: 'enrich',
    done: 0,
    total: items.length,
    message: `Building ${items.length} card sets (${cardCount} card${cardCount === 1 ? '' : 's'} each)…`,
  });
  const results: AiEnrichmentResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const term = (item.expression || '').trim();
    if (!term) continue;
    broadcastAiGenerateProgress({
      phase: 'enrich',
      done: i,
      total: items.length,
      message: `Card set ${i + 1} of ${items.length}: ${term}`,
    });
    results.push(
      await buildEnrichmentResult(item, {
        preset,
        format,
        localizedFormat,
        cardCount,
        config,
        term,
        reading: item.reading,
        sentence: item.sentence,
      }),
    );
  }
  if (!results.length) {
    throw new Error('AI returned items, but none had usable expressions.');
  }
  const cardTotal = results.reduce((n, r) => n + r.cards.length, 0);
  broadcastAiGenerateProgress({
    phase: 'done',
    done: results.length,
    total: results.length,
    message: `Generated ${cardTotal} cards from ${results.length} invented items.`,
  });
  return results;
}

/**
 * Dictionary-first / Qwen-fallback enrichment. The routing, validation, retry,
 * and provenance logic lives in the shared field router (src/shared/fieldRouter.ts);
 * this wrapper only wires in the real dictionaries, the Qwen batch engine, the
 * cancel flag, and throttled IPC progress.
 */
async function enrichCandidates(
  candidates: MiningCandidate[],
  traditional: TraditionalMiningConfig,
  options?: { glossOnly?: boolean },
): Promise<{ candidates: MiningCandidate[]; warnings: string[]; cancelled: boolean }> {
  const { lookupTermsBatch } = await import('./dictionary');
  const { runTranslationBatch, isTranslateAvailable } = await import('./translate');
  const { runApiTranslationBatch, isApiTranslationAvailable } = await import('./translateApi');
  const fileConfig = readMiningConfig();
  const exp = traditional.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
  const useApi = exp.translationEngine === 'api';
  const apiProviderId =
    exp.translationApiProvider ?? fileConfig.providerId ?? DEFAULT_AI_PROVIDER_ID;
  const apiKey = useApi ? readApiKeyForProvider(apiProviderId) : '';

  return runEnrichment(
    candidates,
    traditional,
    {
      lookupGlosses: (queries, langs) => lookupTermsBatch(queries, langs),
      translateBatch: (items, opts) =>
        useApi
          ? runApiTranslationBatch(items, apiProviderId, apiKey, {
              shouldCancel: () => analyzeCancelRequested,
              onProgress: opts?.onProgress,
            })
          : runTranslationBatch(items, {
              shouldCancel: () => analyzeCancelRequested,
              onProgress: opts?.onProgress,
            }),
      translateAvailable: () =>
        useApi ? isApiTranslationAvailable(apiProviderId, apiKey) : isTranslateAvailable(),
      translationSource: useApi ? 'api' : 'qwen',
      onProgress: (p) =>
        throttledMiningProgress({
          phase: p.phase,
          done: p.done,
          total: p.total,
          message: p.message,
          health: p.health,
        }),
      shouldCancel: () => analyzeCancelRequested,
    },
    options,
  );
}

async function enrichSingleCandidate(
  candidate: MiningCandidate,
  traditional: TraditionalMiningConfig,
): Promise<MiningCandidate> {
  const prevCancel = analyzeCancelRequested;
  analyzeCancelRequested = false;
  try {
    const { front, back } = resolveTraditionalTemplates(traditional);
    const exp = traditional.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export;
    const needs = needsEnrichmentLookup(front, back, {
      translateSentences: exp.translateSentences,
    });
    const wantsCrossLang =
      needs.translationRefs.some((r) => r.lang !== 'ja') ||
      needs.needsBareTranslation ||
      needs.needsSentenceTranslation;
    const effectiveTraditional: TraditionalMiningConfig = wantsCrossLang
      ? {
          ...traditional,
          export: {
            ...(traditional.export ?? DEFAULT_TRADITIONAL_MINING_CONFIG.export),
            fillTranslations: true,
          },
        }
      : traditional;
    const outcome = await enrichCandidates([candidate], effectiveTraditional);
    return outcome.candidates[0] ?? candidate;
  } finally {
    analyzeCancelRequested = prevCancel;
  }
}

async function analyzeBook(
  itemId: string,
  override?: Partial<TraditionalMiningConfig>,
  rangeInput?: ChapterRangeInput | null,
): Promise<EpubMiningAnalysis> {
  await ensureAllFrequencyDictionariesReady();
  const fullConfig = readMiningConfig();
  const traditional = {
    ...fullConfig.traditional,
    ...(override ?? {}),
    limits: {
      ...fullConfig.traditional.limits,
      ...(override?.limits ?? {}),
    },
    templates: {
      ...fullConfig.traditional.templates,
      ...(override?.templates ?? {}),
    },
    export: {
      ...fullConfig.traditional.export,
      ...(override?.export ?? {}),
    },
  };
  analyzeCancelRequested = false;
  const fullPath = resolveItemEpubPath(itemId);
  if (!fullPath) throw new Error('EPUB file not found in the library.');
  // The range goes INTO the extractor, not around it: out-of-range sections are
  // never unzipped or stripped, so mining chapters 1–5 of a 60-chapter novel
  // costs five chapters of extraction rather than sixty.
  const { title, sections, range } = extractEpubSections(fullPath, rangeInput);
  const text = sections
    .filter((section) => section.decoded)
    .map((section) => section.text)
    .join('\n');
  if (!text.trim()) {
    // A scoped run that finds nothing is a different problem from a book that
    // cannot be read at all, and the fix is different too — reporting the EPUB as
    // broken when the user simply picked a front-matter section would send them
    // to re-import a book that is fine.
    throw new Error(
      range
        ? `No readable text in chapters ${range.from}–${range.to}. That range may be front matter or images; try a different range.`
        : 'No readable text found in this EPUB. If the book opens in the reader, try Re-importing it — some publishers use non-standard EPUB layouts.',
    );
  }
  const japanese = isJapaneseText(text);
  const analyzer =
    traditional.analyzer === 'kuromoji' && japanese ? 'kuromoji' : japanese ? 'kuromoji' : 'simple';
  let tokens: Map<string, TokenCandidate>;
  if (japanese) {
    tokens = await tokenizeJapanese(text);
    if (tokens.size === 0) tokens = tokenizeJapaneseSimple(text);
  } else {
    tokens = tokenizeSimple(text);
  }
  if (tokens.size === 0) {
    throw new Error('Tokenization found no vocabulary in this EPUB. Try a different book or analyzer.');
  }
  const blacklist = traditional.limits;
  let candidates: MiningCandidate[] = [...tokens.values()]
    .map((token) => {
      // `japanese` is all this path knows: a book that is not Japanese may be
      // Chinese, Russian or English, so it narrows only when it is sure.
      const frequencies = resolveCustomFrequencyRanks(
        token.expression,
        token.reading,
        japanese ? 'ja' : undefined,
      );
      return {
        expression: token.expression,
        reading: token.reading || undefined,
        count: token.count,
        sampleSentence: token.sampleSentence,
        frequencies,
        nameTag: token.nameTag ?? undefined,
      };
    })
    .filter((candidate) => candidate.count >= traditional.limits.minFrequency)
    .filter((candidate) => !shouldDropMiningCandidate(candidate.expression, blacklist));

  broadcastMiningProgress({
    phase: 'tokenize',
    done: candidates.length,
    total: candidates.length,
    message: 'Tokenized',
  });

  // Analyze: tokenize + offline dictionary glosses only (Jiten-style — fast).
  // Qwen runs at download time, scoped to the filtered export set.
  let warnings: string[] = [];
  let cancelled = false;
  const outcome = await enrichCandidates(candidates, traditional, { glossOnly: true });
  warnings = outcome.warnings;
  cancelled = outcome.cancelled;
  candidates = outcome.candidates;

  return {
    itemId,
    title,
    totalCharacters: text.replace(/\s+/g, '').length,
    analyzer,
    candidates,
    generatedAt: Date.now(),
    ...(range ? { range } : {}),
    // Every section the book has, so the panel knows the full numbering it can
    // re-scope to. Title and size are reported only for sections this run
    // actually read — inventing 0 for a skipped chapter would read as "empty".
    sections: sections.map((section) => ({
      index: section.index,
      title: section.title,
      href: section.href,
      ...(section.decoded ? { characters: section.text.replace(/\s+/g, '').length } : {}),
    })),
    cancelled: cancelled || undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}

async function importFrequencyDictionary(filePath?: string): Promise<{ ok: boolean; error?: string }> {
  ensureMiningRoot();
  let target = filePath;
  if (!target) {
    const picked = await dialog.showOpenDialog({
      title: mt('dialog.importFrequencyDict.title'),
      properties: ['openFile'],
      filters: [{ name: mt('dialog.filter.json'), extensions: ['json'] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, error: 'cancelled' };
    target = picked.filePaths[0];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(target, 'utf-8')) as unknown;
    const label = cleanLabel(path.basename(target, path.extname(target)));
    const ranks = parseFrequencyDictionaryPayload(raw, label);
    const id = `${Date.now()}-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const summary: FrequencyDictionarySummary = {
      id,
      label,
      source: path.basename(target),
      entryCount: Object.keys(ranks).length,
      enabled: true,
      importedAt: Date.now(),
    };
    atomicWrite(path.join(freqRoot(), `${id}.json`), JSON.stringify({ summary, ranks }, null, 2));
    invalidateFreqDictCache();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function removeFrequencyDictionary(id: string): { ok: boolean; error?: string } {
  if (isBundledFrequencyDictId(id)) {
    return { ok: false, error: 'Bundled frequency dictionaries cannot be removed.' };
  }
  try {
    fs.unlinkSync(path.join(freqRoot(), `${id}.json`));
    invalidateFreqDictCache();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function setFrequencyDictionaryEnabled(id: string, enabled: boolean): { ok: boolean; error?: string } {
  try {
    const file = path.join(freqRoot(), `${id}.json`);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as FrequencyDictionaryFile;
    parsed.summary.enabled = enabled;
    atomicWrite(file, JSON.stringify(parsed, null, 2));
    invalidateFreqDictCache();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function saveTextFileWithName(
  content: string,
  defaultName: string,
  ext: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const label =
    ext === 'csv'
      ? mt('dialog.format.csv')
      : ext === 'json'
        ? mt('dialog.filter.json')
        : ext === 'txt'
          ? mt('dialog.format.text')
          : mt('dialog.format.file');
  const picked = await dialog.showSaveDialog({
    title: mt('dialog.saveDeck.title', { label }),
    defaultPath: defaultName,
    filters: [{ name: label, extensions: [ext] }],
  });
  if (picked.canceled || !picked.filePath) return { ok: false, error: 'cancelled' };
  try {
    fs.writeFileSync(picked.filePath, content, 'utf-8');
    return { ok: true, path: picked.filePath };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function saveCsvWithName(
  csv: string,
  defaultName: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  return saveTextFileWithName(csv, defaultName, 'csv');
}

async function saveCsv(csv: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  return saveCsvWithName(csv, 'ai-mining-cards.csv');
}

export interface EpubDeckExportResult {
  deck: import('../shared/mining').EpubDeckExport;
  enrichedCandidates: MiningCandidate[];
  warnings?: string[];
  cancelled?: boolean;
}

/**
 * Jiten-style export: Qwen + dictionary enrichment runs only on the candidates
 * the renderer already filtered, then the deck is rendered from that set.
 */
async function exportEpubDeckFromAnalysis(
  analysis: EpubMiningAnalysis,
  traditional: TraditionalMiningConfig,
): Promise<EpubDeckExportResult> {
  analyzeCancelRequested = false;
  const outcome = await enrichCandidates(analysis.candidates, traditional);
  const enrichedAnalysis: EpubMiningAnalysis = {
    ...analysis,
    candidates: outcome.candidates,
    cancelled: outcome.cancelled || undefined,
    warnings: outcome.warnings.length ? outcome.warnings : undefined,
  };
  throttledMiningProgress({
    phase: 'export',
    done: 0,
    total: 1,
    message: `Rendering ${analysis.candidates.length} cards…`,
  });
  const deck = buildEpubDeckExport(enrichedAnalysis, traditional, undefined, {
    skipFilter: true,
  });
  throttledMiningProgress({ phase: 'export', done: 1, total: 1, message: 'Rendering cards…' });
  return {
    deck,
    enrichedCandidates: outcome.candidates,
    warnings: outcome.warnings.length ? outcome.warnings : undefined,
    cancelled: outcome.cancelled || undefined,
  };
}

export function registerMiningIpc(): void {
  const bind = <T extends unknown[]>(
    channel: string,
    handler: (...args: T) => unknown,
  ): void => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler);
  };

  bind('mining:getConfig', () => readMiningConfig().traditional);
  bind('mining:setConfig', (_e, config: TraditionalMiningConfig) => {
    const current = readMiningConfig();
    writeMiningConfig({ ...current, traditional: config });
    return readMiningConfig().traditional;
  });
  bind('mining:listFrequencyDicts', async () => {
    await ensureAllFrequencyDictionariesReady();
    return listFrequencyDictionaries();
  });
  bind('mining:importFrequencyDict', (_e, filePath?: string) => importFrequencyDictionary(filePath));
  bind('mining:removeFrequencyDict', (_e, id: string) => removeFrequencyDictionary(id));
  bind('mining:setFrequencyEnabled', (_e, id: string, enabled: boolean) =>
    setFrequencyDictionaryEnabled(id, enabled),
  );
  bind(
    'mining:analyzeEpub',
    (
      _e,
      itemId: string,
      config?: Partial<TraditionalMiningConfig>,
      range?: ChapterRangeInput | null,
    ) => analyzeBook(itemId, config, range),
  );
  // Reads the spine only — no tokenizing, no enrichment — so the chapter picker
  // can populate before the user has committed to an analysis run.
  bind('mining:listEpubSections', (_e, itemId: string) => {
    const fullPath = resolveItemEpubPath(itemId);
    if (!fullPath) throw new Error('EPUB file not found in the library.');
    // Deliberately unscoped: the picker needs a heading and a size for every
    // section in order to be a picker at all. This is extraction only — no
    // tokenizing and no enrichment, which are what actually make analysis slow.
    const { title, sections } = extractEpubSections(fullPath);
    return {
      itemId,
      title,
      sections: sections.map((section) => ({
        index: section.index,
        title: section.title,
        characters: section.text.replace(/\s+/g, '').length,
        href: section.href,
      })),
    };
  });
  bind('mining:cancelAnalyze', () => {
    analyzeCancelRequested = true;
    return { ok: true };
  });
  bind(
    'mining:enrichCandidate',
    async (
      _e,
      candidate: MiningCandidate,
      config?: Partial<TraditionalMiningConfig>,
    ) => {
      const fullConfig = readMiningConfig();
      const traditional: TraditionalMiningConfig = {
        ...fullConfig.traditional,
        ...(config ?? {}),
        limits: { ...fullConfig.traditional.limits, ...(config?.limits ?? {}) },
        templates: { ...fullConfig.traditional.templates, ...(config?.templates ?? {}) },
        export: { ...fullConfig.traditional.export, ...(config?.export ?? {}) },
      };
      return enrichSingleCandidate(candidate, traditional);
    },
  );
  bind(
    'mining:buildEpubDeck',
    async (
      _e,
      itemId: string,
      config?: Partial<TraditionalMiningConfig>,
      range?: ChapterRangeInput | null,
    ) => {
      await ensureAllFrequencyDictionariesReady();
      const fullConfig = readMiningConfig();
      const traditional: TraditionalMiningConfig = {
        ...fullConfig.traditional,
        ...(config ?? {}),
        limits: { ...fullConfig.traditional.limits, ...(config?.limits ?? {}) },
        templates: { ...fullConfig.traditional.templates, ...(config?.templates ?? {}) },
        export: { ...fullConfig.traditional.export, ...(config?.export ?? {}) },
      };
      const analysis = await analyzeBook(itemId, traditional, range);
      return exportEpubDeckFromAnalysis(analysis, traditional);
    },
  );
  bind(
    'mining:renderEpubDeck',
    async (_e, analysis: EpubMiningAnalysis, config?: Partial<TraditionalMiningConfig>) => {
      await ensureAllFrequencyDictionariesReady();
      const fullConfig = readMiningConfig();
      const traditional: TraditionalMiningConfig = {
        ...fullConfig.traditional,
        ...(config ?? {}),
        limits: { ...fullConfig.traditional.limits, ...(config?.limits ?? {}) },
        templates: { ...fullConfig.traditional.templates, ...(config?.templates ?? {}) },
        export: { ...fullConfig.traditional.export, ...(config?.export ?? {}) },
      };
      return exportEpubDeckFromAnalysis(analysis, traditional);
    },
  );
  bind('mining:saveEpubDeckCsv', (_e, csv: string, title?: string) => {
    const safe = (title ?? 'epub-deck').replace(/[^\w -]+/g, '').trim() || 'epub-deck';
    return saveCsvWithName(csv, `${safe}.csv`);
  });
  bind('mining:saveEpubDeckFile', (_e, content: string, title?: string, ext?: string) => {
    const safe = (title ?? 'epub-deck').replace(/[^\w -]+/g, '').trim() || 'epub-deck';
    const extension = (ext ?? 'csv').replace(/^\./, '') || 'csv';
    return saveTextFileWithName(content, `${safe}.${extension}`, extension);
  });
  bind('ai:getConfig', async (): Promise<AiEngineConfig> => {
    const base = aiEngineConfigFromFile(readMiningConfig());
    const { isTranslateAvailable } = await import('./translate');
    return { ...base, localModelAvailable: isTranslateAvailable() };
  });
  bind('ai:setApiKey', (_e, raw: unknown) => {
    try {
      const { bucket, apiKey } = parseApiKeyPayload(raw);
      if (!apiKey) {
        return {
          ok: false,
          error: 'API key is empty.',
          apiKeysSet: readApiKeysSet(),
          apiKeySet: false,
        };
      }
      const stored = setApiKeyForBucket(bucket, apiKey);
      if (!stored.ok) {
        return {
          ok: false,
          error: stored.messageKey,
          apiKeysSet: readApiKeysSet(),
          apiKeySet: false,
        };
      }
      const apiKeysSet = readApiKeysSet();
      const config = readMiningConfig();
      return {
        ok: true,
        apiKeysSet,
        apiKeySet: Boolean(readApiKeyForProvider(config.providerId)),
        savedBucket: bucket,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: message,
        apiKeysSet: readApiKeysSet(),
        apiKeySet: false,
      };
    }
  });
  bind('ai:setProvider', (_e, providerId: string) => {
    const current = readMiningConfig();
    const nextProvider = providerIdFromRaw(providerId);
    writeMiningConfig({ ...current, providerId: nextProvider });
    return {
      ok: true,
      providerId: nextProvider,
      apiKeySet: Boolean(readApiKeyForProvider(nextProvider)),
      apiKeysSet: readApiKeysSet(),
    };
  });
  bind('ai:setEngine', async (_e, engineRaw: unknown) => {
    const current = readMiningConfig();
    const engine = normalizeAiEngineKind(engineRaw);
    writeMiningConfig({ ...current, engine });
    const { isTranslateAvailable } = await import('./translate');
    return {
      ok: true as const,
      ...aiEngineConfigFromFile(readMiningConfig()),
      localModelAvailable: isTranslateAvailable(),
    };
  });
  bind('ai:providerHealth', (): readonly AiProviderHealth[] => getAiProviderHealthReport());
  bind('ai:listPresets', (): AiPromptPreset[] => [...AI_PROMPT_PRESETS]);
  bind('ai:listFormats', (): AiMiningCardFormat[] => [...AI_MINING_FORMATS]);
  bind('ai:setLanguageOptions', (_e, payload: Partial<AiLanguageOptions>) => {
    const current = readMiningConfig();
    const lang = normalizeLanguageOptions({ ...current, ...payload });
    const next = { ...current, ...lang };
    writeMiningConfig(next);
    return { ok: true, ...lang };
  });
  bind('ai:selectPreset', (_e, presetId: string) => {
    const current = readMiningConfig();
    const preset = presetById(presetId);
    const format = formatsForPreset(preset.id)[0] ?? AI_MINING_FORMATS[0];
    const lang = languageOptionsForProfile(format.profileId, (id) => getProfileStore().getProfile(id));
    const next = {
      ...current,
      selectedPresetId: preset.id,
      selectedFormatId: format.id,
      outputFormat: format.outputFormat,
      cardCount: format.cardTemplates.length,
      ...lang,
    };
    writeMiningConfig(next);
    return { ok: true, ...next };
  });
  bind(
    'ai:setFormat',
    (_e, payload: { formatId: string; cardCount?: number; outputFormat?: 'anki' | 'csv' }) => {
      const current = readMiningConfig();
      const format = formatById(payload?.formatId, current.selectedPresetId);
      const formatChanged = format.id !== current.selectedFormatId;
      const lang = formatChanged
        ? languageOptionsForProfile(format.profileId, (id) => getProfileStore().getProfile(id))
        : {
            frontLang: current.frontLang,
            backLang: current.backLang,
            reverse: current.reverse,
            backGlossLangs: current.backGlossLangs,
          };
      const next = {
        ...current,
        selectedFormatId: format.id,
        outputFormat: payload?.outputFormat ?? format.outputFormat,
        cardCount: Math.max(1, Math.min(50, Math.round(payload?.cardCount ?? current.cardCount))),
        ...lang,
      };
      writeMiningConfig(next);
      return { ok: true, ...next };
    },
  );
  bind('ai:enrichCard', (_e, req: AiEnrichmentRequest) => enrichWithAi(req));
  bind('ai:generateDeck', (_e, req: AiDeckGenerationRequest) => generateDeckWithAi(req));
  bind('ai:saveCsv', (_e, csv: string) => saveCsv(csv));
}
