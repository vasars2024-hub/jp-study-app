/**
 * The OCR router: one entry point that reads a picture with every OCR engine
 * Gum has, the way a careful reader would — and says what it is still unsure of.
 *
 * ## API (for every OCR surface)
 *
 * ```ts
 * import { recognizeWithRouter, routerImageFromNative } from './ocrRouter';
 * const result = await recognizeWithRouter(routerImageFromNative(image), {
 *   langs: ['ja', 'zh'],        // the languages it may be in; the learner's own first
 *   purpose: 'snip',            // 'snip' | 'manga' | 'lens' | 'vn' | 'book'
 *   orientation: 'auto',        // or 'horizontal' / 'vertical' when the surface knows
 *   budgetMs: 15_000,           // optional; defaults by purpose (OCR_BUDGET_MS)
 * });
 * // result: { ok, text, lines[], confidence, engine, engines[], lang, unsure[], missing?, timedOut?, error? }
 * ```
 *
 * Every line carries its text, box, confidence, the engine it came from, the
 * engines consulted, and per-character candidates (`chars[i].alts`: top-k with
 * probabilities). `unsure` lists the characters still in doubt, indexed into
 * `text`, each with the alternatives a surface can offer as one-click fixes.
 * `lang` is the detected language; `missing` names the download that would
 * read it when no installed provider does. Types: `shared/ocrRouterTypes.ts`.
 *
 * ## Providers
 *
 * Engines plug in as `OcrProvider`s: `{ id, langs: string[] | 'any', scripts?,
 * orientation?, purposes?, tier?, available(lang), readPage?, readLine? }`.
 * Language ids are plain strings ('ja', 'zh-Hans', 'ko'), so a language pack can
 * add a provider (Tesseract with any traineddata, a PaddleOCR recogniser, …)
 * without this file knowing the language. The core never enumerates languages:
 * script consistency and language detection come from `RouterDeps`.
 *
 * ## Policy
 *
 *  1. **Primary provider.** The best available provider for the language: the
 *     lowest `tier`, raised by two when its `orientation` matches the picture
 *     or its `purposes` include the caller's. So for Japanese, manga-ocr leads
 *     on vertical text and manga pages and PaddleOCR on horizontal and screen
 *     text (manga-ocr hallucinates on printed screen text); Chinese and Russian
 *     have PaddleOCR. When the picture may be in several languages, each
 *     candidate with a provider is read (stopping early once one reads well in
 *     its own script) and the best confidence × script consistency wins.
 *     Tesseract (bundled, renderer side) is the last resort: with no provider
 *     here the result is `error: 'no-engine'` and the surface runs it.
 *  2. **Fallback per line.** A line below `OCR_LINE_FALLBACK_CONFIDENCE`, or
 *     with any character below `OCR_CHAR_FALLBACK_P`, is cropped and re-read by
 *     the next provider for the language. The reads are merged per character
 *     (`mergeLineReads`) by confidence plus dictionary validity.
 *  3. **Dictionary-guided decoding.** A provider's runners-up at each unsure
 *     character are tried against the dictionary (`dictionaryDecode`), so 彼後
 *     becomes 恐竜 and 語え becomes 語る — only when that turns characters that
 *     were in no word into a real word, at a reasonable probability.
 *  4. **Budget.** Everything after the first read stops when `budgetMs` is
 *     spent (`timedOut`), and dictionary lookups are capped.
 *
 * The built-in providers call the engines' own modules (`paddleOcr.ts`,
 * `mangaOcr.ts`) and never change them. manga-ocr reads a line's crop through
 * `recognizeMangaCropDataUrl`, with its decoder's confidence and each step's
 * top-k candidates (`mangaStepsToChars`), so its characters merge with
 * PaddleOCR's on equal terms.
 */

import {
  dictionaryDecode,
  memoWordOracle,
  mergeLineReads,
  type LineReadCandidate,
  type WordOracle,
} from '../shared/ocrDictionaryDecode';
import {
  meanLineConfidence,
  OCR_BUDGET_MS,
  OCR_CHAR_FALLBACK_P,
  OCR_LINE_FALLBACK_CONFIDENCE,
  unsureCharsOf,
  type OcrChar,
  type OcrEngineId,
  type OcrLangId,
  type OcrPurpose,
  type OcrRouterLine,
  type OcrRouterOptions,
  type OcrRouterResult,
} from '../shared/ocrRouterTypes';
import { isStudyLang } from '../shared/studyLang';
import { detectStudyLangOfText } from '../shared/textLangDetect';
import {
  installedPaddleLangs,
  isInstalledPaddleDetector,
  PADDLE_LANGS,
  recognizePaddleLineDataUrl,
  recognizePaddleOcrDataUrl,
  type PaddleLang,
} from './paddleOcr';
import {
  mangaOcrAvailable,
  recognizeMangaCropDataUrl,
  recognizeMangaOcrRegionsDataUrl,
  type MangaOcrTokenStep,
} from './mangaOcr';

// ---------------------------------------------------------------------------
// Providers

/** A picture the providers can read, crop and enlarge (main wraps a NativeImage). */
export interface RouterImage {
  width: number;
  height: number;
  dataUrl(): string;
  /** A crop of [x0, y0, x1, y1], grown by `pad` pixels on every side (clamped). */
  crop(box: readonly [number, number, number, number], pad?: number): RouterImage;
  /** The picture enlarged by `factor` (high-quality filter). */
  scaled?(factor: number): RouterImage;
}

export interface EngineLine {
  text: string;
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
  chars?: OcrChar[];
}

export interface OcrProvider {
  id: OcrEngineId;
  /** The languages it can read at all ('any': script-agnostic). */
  langs: readonly OcrLangId[] | 'any';
  /** ISO 15924 scripts it reads, informational for packs and Settings. */
  scripts?: readonly string[];
  /** The text direction it is strongest on. */
  orientation?: 'horizontal' | 'vertical';
  /** The callers it is strongest for (manga-ocr: 'manga'). */
  purposes?: readonly OcrPurpose[];
  /** Lower is preferred (default 5); a match on orientation or purpose lowers it by two. */
  tier?: number;
  /** Installed and ready for `lang`. */
  available(lang: OcrLangId): boolean;
  /** Find and read every line of a picture. */
  readPage?(image: RouterImage, lang: OcrLangId, opts: { vertical?: boolean }): Promise<EngineLine[]>;
  /** Read a crop that is one line. */
  readLine?(image: RouterImage, lang: OcrLangId, opts: { vertical: boolean }): Promise<EngineLine | null>;
}

export interface RouterDeps {
  providers: readonly OcrProvider[];
  /** A dictionary for `lang`, bounded by `deadline` (null: none; coverage is then not used). */
  wordOracle(lang: OcrLangId, deadline: number): WordOracle | null;
  /** The language some text is in, among `candidates` (the learner's own first). */
  detectLang(text: string, candidates: readonly OcrLangId[]): OcrLangId;
  /** Which characters belong to `lang`'s script (for script consistency). */
  scriptOf(lang: OcrLangId): RegExp;
  /** The download that would read `lang` (empty when none is known). */
  assetsFor(lang: OcrLangId): string[];
  now(): number;
}

// ---------------------------------------------------------------------------
// Policy helpers (exported for the tests)

/** A read this good in its own script stops the search through other languages. */
export const GOOD_READ_CONFIDENCE = 0.85;

/** Share of a text's letters written in `script` (0–1). */
export function scriptShare(text: string, script: RegExp): number {
  const letters = [...text].filter((ch) => /[\p{L}\p{N}]/u.test(ch));
  if (!letters.length) return 0;
  return letters.filter((ch) => script.test(ch)).length / letters.length;
}

/** Confidence × script consistency × how much text came back (saturating). */
export function scoreLangRead(lines: readonly Pick<EngineLine, 'text' | 'confidence'>[], script: RegExp): number {
  const text = lines.map((l) => l.text).join('');
  const chars = [...text.replace(/\s+/g, '')].length;
  if (!chars) return 0;
  return (meanLineConfidence(lines) ?? 0) * scriptShare(text, script) * Math.min(1, chars / 4);
}

function readsLang(provider: OcrProvider, lang: OcrLangId): boolean {
  if (provider.langs !== 'any' && !provider.langs.includes(lang)) return false;
  return provider.available(lang);
}

/** The providers that read `lang` now, primary first (see the policy above). */
export function providersFor(
  providers: readonly OcrProvider[],
  lang: OcrLangId,
  opts: Pick<OcrRouterOptions, 'orientation' | 'purpose'>,
): OcrProvider[] {
  const rank = (p: OcrProvider): number => {
    let r = p.tier ?? 5;
    if ((p.orientation && p.orientation === opts.orientation) || p.purposes?.includes(opts.purpose)) r -= 2;
    return r;
  };
  return providers
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => readsLang(p, lang))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.index - b.index)
    .map(({ p }) => p);
}

/** Whether a line earns a second provider's opinion. */
export function needsFallback(line: Pick<EngineLine, 'confidence' | 'chars'>): boolean {
  if (line.confidence < OCR_LINE_FALLBACK_CONFIDENCE) return true;
  return Boolean(line.chars?.some((c) => c.p < OCR_CHAR_FALLBACK_P));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------------------------------------------------------------------------
// The router

interface LangRead {
  lang: OcrLangId;
  provider: OcrProvider;
  lines: EngineLine[];
  score: number;
}

const NO_DICTIONARY: WordOracle = memoWordOracle(async () => false, { maxLookups: 0 });

function emptyResult(lang: OcrLangId, over: Partial<OcrRouterResult>): OcrRouterResult {
  return { ok: false, text: '', lines: [], engine: 'none', engines: [], lang, unsure: [], ...over };
}

export interface OcrRouterRead extends OcrRouterResult {
  /** A complete other read, retained for surfaces with an engine-swap control. */
  alternate?: { engine: OcrEngineId; lang: string; text: string; lines: EngineLine[] };
}

/** Read `image` (see the module comment for the policy and the result). */
export async function recognizeWithRouter(
  image: RouterImage,
  opts: OcrRouterOptions,
  deps: RouterDeps = defaultRouterDeps(),
): Promise<OcrRouterRead> {
  const langs = [...new Set(opts.langs)];
  const active = langs[0] ?? 'ja';
  const deadline = deps.now() + (opts.budgetMs ?? OCR_BUDGET_MS[opts.purpose]);
  const late = (): boolean => deps.now() > deadline;
  const cancelled = (): boolean => Boolean(opts.signal?.aborted);
  const vertical = opts.orientation === 'vertical' ? true : opts.orientation === 'horizontal' ? false : undefined;

  const pageProvider = (lang: OcrLangId): OcrProvider | null =>
    providersFor(deps.providers, lang, opts).find((p) => p.readPage) ?? null;
  if (!langs.some((lang) => pageProvider(lang))) {
    return emptyResult(active, { error: 'no-engine', missing: { lang: active, assetIds: deps.assetsFor(active) } });
  }

  // 1. Read with each candidate language's primary provider.
  const reads: LangRead[] = [];
  let failed = false;
  let timedOut = false;
  const readLang = async (lang: OcrLangId): Promise<LangRead | null> => {
    const provider = pageProvider(lang);
    if (!provider?.readPage) return null;
    try {
      const lines = (await provider.readPage(image, lang, { vertical })).filter((l) => l.text.trim());
      const read = { lang, provider, lines, score: scoreLangRead(lines, deps.scriptOf(lang)) };
      reads.push(read);
      return read;
    } catch (err) {
      console.warn(`[ocrRouter] ${provider.id} (${lang}) failed`, err);
      failed = true;
      return null;
    }
  };
  for (const lang of langs) {
    if (cancelled()) return emptyResult(active, { error: 'cancelled' });
    if (reads.length && late()) {
      timedOut = true;
      break;
    }
    const read = await readLang(lang);
    if (!read) continue;
    const own = deps.detectLang(read.lines.map((l) => l.text).join('\n'), langs) === lang;
    if (own && (meanLineConfidence(read.lines) ?? 0) >= GOOD_READ_CONFIDENCE) break;
  }
  let best = reads.reduce<LangRead | null>((a, b) => (!a || b.score > a.score ? b : a), null);
  if (!best || !best.lines.length) {
    return emptyResult(active, { error: failed && !best ? 'ocr-failed' : 'empty', engines: reads.map((r) => r.provider.id), timedOut });
  }

  // 2. The language the text is actually in: read it with its own provider when
  //    one is installed; otherwise say which download would.
  let lang = deps.detectLang(best.lines.map((l) => l.text).join('\n'), langs);
  let missing: OcrRouterResult['missing'];
  if (lang !== best.lang) {
    const own = reads.find((r) => r.lang === lang)
      ?? (pageProvider(lang) && !late() && !cancelled() ? await readLang(lang) : null);
    if (own && own.lines.length) best = own;
    else if (!pageProvider(lang)) missing = { lang, assetIds: deps.assetsFor(lang) };
    else lang = best.lang;
  }
  const primary = best;

  // 3–4. Per line: dictionary-guided decoding, then a second provider where unsure.
  const oracle = (!missing && deps.wordOracle(lang, deadline)) || NO_DICTIONARY;
  const fallbacks = providersFor(deps.providers, lang, opts).filter((p) => p !== primary.provider && p.readLine);
  const glyph = median(primary.lines.map((l) => (l.vertical ? l.box[2] - l.box[0] : l.box[3] - l.box[1])));
  const pad = Math.max(2, Math.round(glyph * 0.15));
  const lines: OcrRouterLine[] = [];
  const alternateReads = new Map<OcrEngineId, EngineLine[]>([[primary.provider.id, primary.lines]]);
  const engines = new Set<OcrEngineId>([primary.provider.id]);
  for (const line of primary.lines) {
    let chars = line.chars && line.chars.length === [...line.text].length ? line.chars : undefined;
    let corrected = 0;
    if (chars && !late() && !missing) {
      const decoded = await dictionaryDecode(chars, { lang, oracle });
      chars = decoded.chars;
      corrected = decoded.changed;
    }
    const first: LineReadCandidate = {
      engine: primary.provider.id,
      text: chars ? chars.map((c) => c.ch).join('') : line.text,
      confidence: line.confidence,
      ...(chars ? { chars } : {}),
    };
    const candidates: LineReadCandidate[] = [first];
    if (needsFallback({ confidence: line.confidence, chars }) && !missing) {
      for (const provider of fallbacks) {
        if (late() || cancelled()) {
          timedOut = timedOut || late();
          break;
        }
        try {
          const other = await provider.readLine!(image.crop(line.box, pad), lang, { vertical: line.vertical });
          if (other?.text.trim()) {
            candidates.push({ engine: provider.id, text: other.text.trim(), confidence: other.confidence, ...(other.chars ? { chars: other.chars } : {}) });
            engines.add(provider.id);
            const otherLines = alternateReads.get(provider.id) ?? [];
            otherLines[lines.length] = { ...other, box: line.box, vertical: line.vertical };
            alternateReads.set(provider.id, otherLines);
          }
        } catch (err) {
          console.warn(`[ocrRouter] ${provider.id} line re-read failed`, err);
        }
      }
    }
    const base = { box: line.box, vertical: line.vertical, ...(corrected ? { corrected } : {}) };
    if (candidates.length > 1) {
      const merged = await mergeLineReads(candidates, lang, oracle);
      lines.push({ ...base, text: merged.text, confidence: merged.confidence, engine: merged.engine, chars: merged.chars, consulted: merged.consulted });
    } else {
      lines.push({ ...base, text: first.text, confidence: line.confidence, engine: primary.provider.id, ...(chars ? { chars } : {}), consulted: [primary.provider.id] });
    }
  }

  const text = lines.map((l) => l.text).join('\n').trim();
  const confidence = meanLineConfidence(lines);
  const counts = new Map<OcrEngineId, number>();
  for (const l of lines) counts.set(l.engine, (counts.get(l.engine) ?? 0) + [...l.text].length);
  const engine = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? primary.provider.id;
  const alternate = [...alternateReads.entries()].flatMap(([id, readLines]) => {
    if (id === engine || readLines.length !== lines.length || Array.from({ length: lines.length }, (_, i) => !readLines[i]).some(Boolean)) return [];
    const ownText = readLines.map((line) => line.text).join('\n').trim();
    return ownText && ownText !== text ? [{ engine: id, lang, text: ownText, lines: readLines }] : [];
  })[0];
  return {
    ok: Boolean(text),
    text,
    lines,
    ...(confidence !== undefined ? { confidence } : {}),
    engine,
    engines: [...engines],
    lang,
    unsure: unsureCharsOf(lines),
    ...(alternate ? { alternate } : {}),
    ...(missing ? { missing } : {}),
    ...(timedOut ? { timedOut } : {}),
    ...(!text ? { error: 'empty' as const } : {}),
  };
}

/** Read an already detected line without re-entering a provider's page detector. */
export function recognizeLineWithRouter(
  image: RouterImage,
  opts: OcrRouterOptions,
  deps: RouterDeps = defaultRouterDeps(),
): Promise<OcrRouterRead> {
  return recognizeWithRouter(image, opts, {
    ...deps,
    providers: deps.providers.filter((p) => p.readLine).map((p) => ({
      ...p,
      async readPage(crop, lang, orientation) {
        const line = await p.readLine!(crop, lang, { vertical: orientation.vertical ?? crop.height > crop.width });
        return line ? [{ ...line, box: [0, 0, crop.width, crop.height] as [number, number, number, number] }] : [];
      },
    })),
  });
}

// ---------------------------------------------------------------------------
// The built-in providers (main)

/** A manga-ocr crop whose decoder reported no usable score gets this prior next to PaddleOCR's. */
export const MANGA_CROP_CONFIDENCE = 0.75;

/**
 * manga-ocr's decoder steps as per-character candidates: one character per
 * step (word-piece markers stripped), kept only when they spell exactly the
 * text it returned — its post-processing can change the text, and then the
 * characters would no longer line up (the line's own confidence stands in).
 */
export function mangaStepsToChars(text: string, steps: readonly MangaOcrTokenStep[] | undefined): OcrChar[] | undefined {
  if (!steps?.length) return undefined;
  const clean = (token: string): string => token.replace(/^##/, '');
  const chars: OcrChar[] = [];
  for (const step of steps) {
    const ch = clean(step.token);
    if ([...ch].length !== 1) return undefined;
    chars.push({
      ch,
      p: step.prob,
      alts: step.candidates
        .map((c) => ({ ch: clean(c.token), p: c.prob }))
        .filter((c) => [...c.ch].length === 1 && c.ch !== ch),
    });
  }
  return chars.map((c) => c.ch).join('') === text ? chars : undefined;
}
/** Below this glyph size (px) or confidence, PaddleOCR also reads an enlarged copy. */
const SMALL_GLYPH_PX = 24;
const WEAK_PAGE_CONFIDENCE = 0.7;
const MAX_ZOOM = 3;
const MAX_SIDE = 4096;

/** A NativeImage as a `RouterImage`. */
export function routerImageFromNative(image: Electron.NativeImage): RouterImage {
  const { width, height } = image.getSize();
  return {
    width,
    height,
    dataUrl: () => image.toDataURL(),
    crop(box, pad = 0) {
      const x0 = Math.max(0, Math.floor(box[0] - pad));
      const y0 = Math.max(0, Math.floor(box[1] - pad));
      const x1 = Math.min(width, Math.ceil(box[2] + pad));
      const y1 = Math.min(height, Math.ceil(box[3] + pad));
      return routerImageFromNative(image.crop({ x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }));
    },
    scaled(factor) {
      return routerImageFromNative(image.resize({ width: Math.round(width * factor), height: Math.round(height * factor), quality: 'best' }));
    },
  };
}

function scaleBox(box: [number, number, number, number], k: number): [number, number, number, number] {
  return [box[0] * k, box[1] * k, box[2] * k, box[3] * k];
}

/** The Paddle recogniser for a language id ('zh-Hans' → 'zh'), or null. */
function paddleLangOf(lang: OcrLangId): PaddleLang | null {
  const primary = lang.toLowerCase().split('-')[0];
  return (PADDLE_LANGS as readonly string[]).includes(primary) ? (primary as PaddleLang) : null;
}

/** PaddleOCR: a shared detector plus one recogniser per language, enlarging small or weak text. */
export function paddleProvider(): OcrProvider {
  return {
    id: 'web',
    langs: PADDLE_LANGS,
    scripts: ['Hani', 'Hira', 'Kana', 'Cyrl'],
    orientation: 'horizontal',
    tier: 1,
    available: (lang) => {
      const rec = paddleLangOf(lang);
      return Boolean(rec) && isInstalledPaddleDetector() && installedPaddleLangs().includes(rec as PaddleLang);
    },
    async readPage(image, lang) {
      const forceLang = paddleLangOf(lang) as PaddleLang;
      const script = defaultScriptOf(lang);
      const first = (await recognizePaddleOcrDataUrl(image.dataUrl(), { forceLang })).lines;
      const glyph = median(first.map((l) => (l.vertical ? l.box[2] - l.box[0] : l.box[3] - l.box[1])));
      const conf = meanLineConfidence(first) ?? 0;
      if (!image.scaled || (first.length && glyph >= SMALL_GLYPH_PX && conf >= WEAK_PAGE_CONFIDENCE)) return first;
      const factor = Math.min(MAX_ZOOM, MAX_SIDE / Math.max(image.width, image.height, 1), glyph > 0 ? Math.max(1.5, 32 / glyph) : 2);
      if (factor <= 1.05) return first;
      const second = (await recognizePaddleOcrDataUrl(image.scaled(factor).dataUrl(), { forceLang })).lines
        .map((l) => ({ ...l, box: scaleBox(l.box, 1 / factor) }));
      return scoreLangRead(second, script) > scoreLangRead(first, script) ? second : first;
    },
    async readLine(image, lang, opts) {
      const line = await recognizePaddleLineDataUrl(image.dataUrl(), paddleLangOf(lang) as PaddleLang, opts);
      return line && line.text ? line : null;
    },
  };
}

/** manga-ocr: Japanese; whole pages through its bubble detector, crops directly. */
export function mangaProvider(): OcrProvider {
  return {
    id: 'manga',
    langs: ['ja'],
    scripts: ['Hani', 'Hira', 'Kana'],
    orientation: 'vertical',
    purposes: ['manga'],
    tier: 2,
    available: () => mangaOcrAvailable(),
    async readPage(image) {
      const read = await recognizeMangaOcrRegionsDataUrl(image.dataUrl());
      return read.lines.map((l) => ({ text: l.text, box: l.box, vertical: l.vertical, confidence: l.confidence, chars: l.chars }));
    },
    async readLine(image) {
      const read = await recognizeMangaCropDataUrl(image.dataUrl(), { topK: 4 });
      const text = read.text.trim();
      if (!text || read.truncated) return null;
      const chars = mangaStepsToChars(text, read.steps);
      const confidence = Number.isFinite(read.confidence) && read.confidence > 0 ? read.confidence : MANGA_CROP_CONFIDENCE;
      return { text, box: [0, 0, image.width, image.height], vertical: image.height > image.width, confidence, ...(chars ? { chars } : {}) };
    },
  };
}

/**
 * The real dictionary as a word oracle: an exact headword or reading, or a
 * de-inflected form (語る, 食べた). Chinese uses CC-CEDICT when installed. A
 * language without a dictionary gets none.
 */
function dictionaryOracle(lang: OcrLangId, deadline: number): WordOracle | null {
  const primary = lang.toLowerCase().split('-')[0];
  if (!isStudyLang(primary)) return null;
  return memoWordOracle(async (text) => {
    if (primary === 'zh') {
      const { lookupChineseInDictionary } = await import('./dictionary/service');
      const result = await lookupChineseInDictionary(text, 4);
      return (result?.entries ?? []).some((e) => e.word === text || (e as { traditional?: string }).traditional === text);
    }
    const { lookupTerm } = await import('./dictionary');
    const result = await lookupTerm(text, 4, primary);
    return (result?.entries ?? []).some((e) => {
      const via = (e as { via?: string }).via;
      if (via === 'deinflected') return true;
      if (via && via !== 'exact' && via !== 'reading') return false;
      return e.word === text || e.reading === text;
    });
  }, { deadline, maxLookups: 600 });
}

/** Characters of a language's script, by its primary subtag (letters for an unknown one). */
export function defaultScriptOf(lang: OcrLangId): RegExp {
  switch (lang.toLowerCase().split('-')[0]) {
    case 'ja':
      return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]/u;
    case 'zh':
    case 'cmn':
    case 'yue':
      return /\p{Script=Han}/u;
    case 'ko':
      return /[\p{Script=Hangul}\p{Script=Han}]/u;
    case 'ru':
    case 'uk':
    case 'be':
    case 'bg':
    case 'sr':
    case 'mk':
    case 'kk':
    case 'mn':
      return /\p{Script=Cyrillic}/u;
    default:
      return /\p{L}/u;
  }
}

/** Gum's study languages are told apart by script (`detectStudyLangOfText`); any other follows the first candidate. */
function defaultDetectLang(text: string, candidates: readonly OcrLangId[]): OcrLangId {
  const study = candidates.filter(isStudyLang);
  const active = candidates[0];
  if (!active || !isStudyLang(active)) return active ?? 'ja';
  return detectStudyLangOfText(text, active, study).lang;
}

export function defaultRouterDeps(): RouterDeps {
  return {
    providers: [paddleProvider(), mangaProvider()],
    wordOracle: dictionaryOracle,
    detectLang: defaultDetectLang,
    scriptOf: defaultScriptOf,
    assetsFor: (lang) => {
      const rec = paddleLangOf(lang);
      return rec ? [`paddle-ocr-${rec}`] : [];
    },
    now: () => Date.now(),
  };
}
