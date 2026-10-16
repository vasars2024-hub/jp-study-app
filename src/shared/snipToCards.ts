/**
 * Snip to cards — the pure half both processes share.
 *
 * The owner presses Windows' own Win+Shift+S, snips study-language text anywhere
 * on screen, and Gum (running in the tray) notices the new picture on the
 * clipboard, OCRs it, and adds every word the learner does not know yet as a
 * card. Main watches the clipboard and keeps the history (`main/snipToCards.ts`);
 * the main window's renderer reads, splits and mines (`renderer/snipToCards.ts`),
 * because the deck and the pending-Anki queue live in that window's storage.
 *
 * Everything here is pure (no DOM, no Electron) so the rules a card depends on —
 * which words are skipped, what counts as garbage OCR, when history is pruned —
 * are testable on their own.
 */

import { STUDY_LANGS, type StudyLang } from './studyLang';
import type { OcrUnsureChar } from './ocrRouterTypes';
import { aiOcrEngineLabel } from './aiOcrVision';

// ---------------------------------------------------------------------------
// Settings

export type SnipAnkiMode = 'auto' | 'on' | 'off';

/**
 * The one-time "Snip to cards is on" notice. Watching is off by default (v1:
 * the learner turns it on in first-run setup, Settings, the tray or the Snips
 * view), and once it is on the first snip that makes cards says so and offers
 * Turn off / Keep. While watching is off nothing is read, so the notice never
 * appears for a learner who did not turn the feature on. `pending` → nothing
 * shown yet; `shown` → the toast carried it once (the Snips view keeps its
 * banner, while watching, until it is answered); `answered` → the learner
 * chose, never shown again.
 */
export type SnipNoticeState = 'pending' | 'shown' | 'answered';

export interface SnipSettings {
  /**
   * Watch the clipboard for snips. Off by default (v1, the owner's decision):
   * reading every picture copied to the clipboard is opt-in. Profiles from
   * before v1 are moved over by `migrateSnipSettings`.
   */
  enabled: boolean;
  /** Add every unknown word as a card without asking. */
  autoAdd: boolean;
  /** Also send to Anki: `auto` = only when Anki has been set up on this profile. */
  sendToAnki: SnipAnkiMode;
  /** The Gum deck (folder) the cards go into. */
  deck: string;
  /** Anki deck override; '' lets the mining rules pick. */
  ankiDeck: string;
  /** At most this many cards per snip; the rest are listed, not added. */
  maxWords: number;
  /** Bring the Snips view forward inside Gum when a snip arrives. */
  openView: boolean;
  /**
   * A word that already has a card gets this snip's sentence as another
   * example on that card (undone exactly like an added card), instead of
   * being skipped.
   */
  mergeExisting: boolean;
  /** The first-run notice (see `SnipNoticeState`). */
  notice: SnipNoticeState;
}

export const SNIP_MAX_WORDS_DEFAULT = 12;
export const SNIP_MAX_WORDS_LIMIT = 50;
export const SNIP_DECK_DEFAULT = 'Snips';

export const SNIP_SETTINGS_DEFAULTS: Readonly<SnipSettings> = Object.freeze({
  enabled: false,
  autoAdd: true,
  sendToAnki: 'auto',
  deck: SNIP_DECK_DEFAULT,
  ankiDeck: '',
  maxWords: SNIP_MAX_WORDS_DEFAULT,
  openView: true,
  mergeExisting: true,
  notice: 'pending',
});

/** `value` without C0 control characters and DEL (a newline survives when asked for). */
export function stripSnipControls(value: string, keepNewlines = false): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code < 0x20 && !(keepNewlines && code === 0x0a)) || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

function cleanName(value: unknown, fallback: string, max = 120): string {
  if (typeof value !== 'string') return fallback;
  // Deck names travel to Anki, where `::` nests decks; control characters never belong.
  return stripSnipControls(value).trim().slice(0, max);
}

/** A deck name from disk or IPC, repaired ('' when there is none). */
export function cleanSnipDeckName(value: unknown): string {
  return cleanName(value, '');
}

/** A stored or sent settings object, repaired field by field. Unknown input → defaults. */
export function normalizeSnipSettings(raw: unknown): SnipSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const max = Number(r.maxWords);
  const deck = cleanName(r.deck, SNIP_DECK_DEFAULT);
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : SNIP_SETTINGS_DEFAULTS.enabled,
    autoAdd: typeof r.autoAdd === 'boolean' ? r.autoAdd : SNIP_SETTINGS_DEFAULTS.autoAdd,
    sendToAnki: r.sendToAnki === 'on' || r.sendToAnki === 'off' || r.sendToAnki === 'auto'
      ? r.sendToAnki
      : SNIP_SETTINGS_DEFAULTS.sendToAnki,
    deck: deck || SNIP_DECK_DEFAULT,
    ankiDeck: cleanName(r.ankiDeck, ''),
    maxWords: Number.isFinite(max)
      ? Math.max(1, Math.min(SNIP_MAX_WORDS_LIMIT, Math.round(max)))
      : SNIP_MAX_WORDS_DEFAULT,
    openView: typeof r.openView === 'boolean' ? r.openView : SNIP_SETTINGS_DEFAULTS.openView,
    mergeExisting: typeof r.mergeExisting === 'boolean' ? r.mergeExisting : SNIP_SETTINGS_DEFAULTS.mergeExisting,
    notice: r.notice === 'shown' || r.notice === 'answered' || r.notice === 'pending'
      ? r.notice
      : SNIP_SETTINGS_DEFAULTS.notice,
  };
}

/**
 * The settings file's schema. Version 2 (v1.0 release) is the first one written
 * with watching off by default; a file without `schema` (or no file at all) was
 * written, or never written, while the default was on.
 */
export const SNIP_SETTINGS_SCHEMA = 2;

/** What the profile shows about past use, for the one-time move to the off default. */
export interface SnipUseEvidence {
  /** Snips in the history (entries in `snips/index.json`, or pictures in `snips/`). */
  historyCount: number;
}

/**
 * The stored settings, moved to the current schema.
 *
 * The rule for a profile from before the default changed (no `schema`):
 *  - Turned off (`enabled: false` stored) → stays off. That was a choice.
 *  - Otherwise watching stays on only when the profile shows it was used: a snip
 *    in the history, or the one-time notice already shown or answered (Keep).
 *    A profile that was simply on by default and never snipped anything (no
 *    file, or a file written by an unrelated settings change) is turned off,
 *    like a new profile. Someone who already relies on it keeps it.
 *  - Every other field is kept as stored.
 * A file that already has `schema >= 2` is the learner's own choice under the
 * off default and is only repaired, never re-decided. `migrated` says the file
 * should be written back (with the schema) so the decision is made once.
 */
export function migrateSnipSettings(
  raw: unknown,
  evidence: SnipUseEvidence,
): { settings: SnipSettings; migrated: boolean } {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const settings = normalizeSnipSettings(r);
  if (Number(r.schema) >= SNIP_SETTINGS_SCHEMA) return { settings, migrated: false };
  const used = (Number(evidence.historyCount) || 0) > 0 || r.notice === 'shown' || r.notice === 'answered';
  return { settings: { ...settings, enabled: r.enabled !== false && used }, migrated: true };
}

/** Whether the first-run notice still needs an answer (the Snips view shows its banner). */
export function snipNoticeOpen(settings: Pick<SnipSettings, 'notice'>): boolean {
  return settings.notice !== 'answered';
}

/**
 * Whether a snip's cards carry an Anki half.
 *
 * `auto` and `on` both do; what differs is left to `mineToStudy`, which sends
 * (or queues, while Anki is closed) only on a profile where Anki has been
 * reachable before, so `auto` means "on if Anki is set up here" without a
 * second copy of that rule. `off` keeps every snip card in Gum only.
 */
export function snipSendsToAnki(mode: SnipAnkiMode): boolean {
  return mode !== 'off';
}

// ---------------------------------------------------------------------------
// Which clipboard pictures are snips

/** Bigger than any real snip: a full 8K screen is 33 MP. Anything above is not read. */
export const SNIP_MAX_PIXELS = 36_000_000;
export const SNIP_MAX_SIDE = 8_000;
/** Smaller than a word of text at any zoom: icons, cursors, 1-px separators. */
export const SNIP_MIN_SIDE = 12;
export const SNIP_MIN_PIXELS = 600;

export type SnipImageRejection = 'empty' | 'too-small' | 'too-large';

/** Whether a clipboard picture is worth reading as a snip, by size alone. */
export function snipImageRejection(size: { width: number; height: number } | null | undefined): SnipImageRejection | null {
  const width = Number(size?.width);
  const height = Number(size?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'empty';
  if (width < SNIP_MIN_SIDE || height < SNIP_MIN_SIDE || width * height < SNIP_MIN_PIXELS) return 'too-small';
  if (width > SNIP_MAX_SIDE || height > SNIP_MAX_SIDE || width * height > SNIP_MAX_PIXELS) return 'too-large';
  return null;
}

/** The clipboard holds a picture (Electron reports `image/png`; Windows names vary). */
export function clipboardHasImageFormat(formats: readonly string[] | null | undefined): boolean {
  return (formats ?? []).some((f) => /^image\//i.test(f) || /^(png|bitmap|dib|cf_dib|cf_bitmap)$/i.test(f));
}

// ---------------------------------------------------------------------------
// OCR quality

/** A read below this mean confidence (0–1, when the engine reports one) makes no cards. */
export const SNIP_MIN_CONFIDENCE = 0.55;
/**
 * Between the floor and this, the read is usable but unsure: the words are
 * listed for the learner to check (and correct) instead of being added.
 */
export const SNIP_REVIEW_CONFIDENCE = 0.75;

/** `sure` → may be added automatically; `unsure` → listed for review; null → the engine gave no number. */
export function snipReadCertainty(confidence: number | null | undefined): 'sure' | 'unsure' | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return confidence < SNIP_REVIEW_CONFIDENCE ? 'unsure' : 'sure';
}

/** How a stored engine id is named to the learner: a product name, or a catalog key. */
export function snipEngineLabel(engine: string | undefined): { name?: string; key?: string } | null {
  if (!engine || engine === 'none') return null;
  if (engine === 'basic') return { key: 'snip.engine.basic' };
  if (engine === 'manga') return { name: 'manga-ocr' };
  if (engine === 'web') return { name: 'PaddleOCR' };
  // "Read text with AI": the provider's product name ("Read by Claude Sonnet 5.5").
  return aiOcrEngineLabel(engine) ?? { key: 'snip.engine.other' };
}

export type SnipTextProblem = 'no-text' | 'garbage' | 'low-confidence';

const SCRIPT: Record<StudyLang, RegExp> = {
  ja: /[぀-ヿ㐀-鿿豈-﫿々〆ヵヶー]/u,
  zh: /\p{Script=Han}/u,
  ru: /\p{Script=Cyrillic}/u,
};

/**
 * Why a read must not become cards, or null when it may.
 *
 * Garbage is judged by script: an OCR that returned mostly Latin letters,
 * digits and stray symbols for a Japanese snip read the picture wrong (or the
 * picture had no Japanese), and cards made from it would teach noise.
 */
export function snipTextProblem(text: string, lang: StudyLang, confidence?: number | null): SnipTextProblem | null {
  const compact = String(text ?? '').replace(/\s+/g, '');
  if (compact.length < 1) return 'no-text';
  const chars = [...compact];
  const script = chars.filter((ch) => SCRIPT[lang].test(ch)).length;
  if (script === 0) return 'no-text';
  if (script / chars.length < 0.5) return 'garbage';
  if (typeof confidence === 'number' && Number.isFinite(confidence) && confidence < SNIP_MIN_CONFIDENCE) {
    return 'low-confidence';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Words

/** One token of the OCR'd sentence, from kuromoji (ja) or the ICU segmenter (zh/ru). */
export interface SnipToken {
  surface: string;
  /** Dictionary form (kuromoji's basic form); the surface for zh/ru. */
  lemma: string;
  /** Katakana (ja) reading from the analyser, when it has one. */
  reading?: string;
  /** IPADIC part of speech (名詞, 動詞, 助詞 …); absent for zh/ru. */
  pos?: string;
  posDetail?: string;
  /** Vocabulary worth a card by the analyser's own rule. */
  content: boolean;
  /** A proper noun (a name). */
  proper?: boolean;
}

/** Whether `next` is part of the conjugation of the verb/adjective before it. */
function conjugationTail(next: SnipToken): boolean {
  if (next.pos === '助動詞') return true;
  if (next.pos === '助詞' && next.posDetail === '接続助詞' && /^(て|で|ちゃ|じゃ)$/.test(next.surface)) return true;
  if ((next.pos === '動詞' || next.pos === '形容詞') && (next.posDetail === '非自立' || next.posDetail === '接尾')) return true;
  return false;
}

/**
 * Japanese only: fold each verb or adjective together with the auxiliaries and
 * helper verbs that conjugate it (眠っ+て+い+た → 眠っていた), so the breakdown
 * shows one word with its conjugation and the dictionary can deinflect it. The
 * head keeps its lemma, part of speech and content flag; readings concatenate.
 */
export function groupJapaneseTokens(tokens: readonly SnipToken[]): SnipToken[] {
  const out: SnipToken[] = [];
  for (const token of tokens) {
    const head = out[out.length - 1];
    const headConjugates = head && (head.pos === '動詞' || head.pos === '形容詞') && head.content;
    if (headConjugates && conjugationTail(token)) {
      out[out.length - 1] = {
        ...head,
        surface: head.surface + token.surface,
        ...(head.reading !== undefined || token.reading !== undefined
          ? { reading: (head.reading ?? head.surface) + (token.reading ?? token.surface) }
          : {}),
      };
      continue;
    }
    out.push({ ...token });
  }
  return out;
}

export type SnipWordStatus =
  /** Will be (or could be) a card. */
  | 'candidate'
  /** A card this snip created. */
  | 'added'
  /** Already a card: this snip's sentence was added to it as another example. */
  | 'merged'
  /** A card this snip created, then removed (Undo / the toggle). */
  | 'removed'
  /** Already known. */
  | 'known'
  /** Already in the deck. */
  | 'inDeck'
  /** The same word earlier in the snip. */
  | 'duplicate'
  /** Particles, auxiliaries and other function words. */
  | 'function'
  | 'punct'
  | 'number'
  /** Single kana and other one-character noise. */
  | 'noise'
  /** A proper noun: listed, never auto-added. */
  | 'name'
  /** Past the per-snip limit: listed, not added. */
  | 'overLimit'
  /** Adding it failed. */
  | 'failed';

export interface SnipWord {
  surface: string;
  lemma: string;
  /** The dictionary form's reading (the card's reading). */
  reading?: string;
  /** The reading of the surface as written in the snip (furigana over the text). */
  surfaceReading?: string;
  pos?: string;
  posDetail?: string;
  status: SnipWordStatus;
  meaning?: string;
  /** e.g. 'N5' / 'HSK2', from the dictionary. */
  level?: string;
  /** Frequency rank (lower = more common). */
  freq?: number;
  /** Deinflection reasons inner → outer (食べさせられた → causative, passive, past). */
  deinflection?: string[];
  /** The card this snip created for the word. */
  cardId?: string;
  /** The Anki note this snip created for the word. */
  ankiNoteId?: number;
  /** For `merged`: the example sentence this snip added to the card (Undo removes exactly it). */
  example?: string;
  /** The learner corrected the word or its reading (an OCR or analyser mistake). */
  edited?: boolean;
}

const PUNCT = /^[\p{P}\p{S}\s]+$/u;
const NUMBER = /^[\p{N}０-９〇一二三四五六七八九十百千万億兆.,，．・:：/-]+$/u;
const ONLY_NUMERALS = /^[\p{N}０-９.,，．]+$/u;
const KANA_ONE = /^[぀-ヿー]$/u;

/** Japanese parts of speech that are never cards. */
const JA_FUNCTION_POS = new Set(['助詞', '助動詞', '記号', 'フィラー', 'その他', '接頭詞']);

/** Chinese function words: particles, aspect markers, pronouns, the commonest connectives. */
const ZH_FUNCTION = new Set([
  '的', '了', '吗', '呢', '吧', '啊', '呀', '着', '过', '地', '得', '和', '与', '及', '或', '在', '是', '也', '都',
  '就', '还', '又', '很', '不', '没', '把', '被', '给', '对', '从', '到', '这', '那', '我', '你', '他', '她', '它',
  '我们', '你们', '他们', '她们', '它们', '们', '个', '之', '而', '但', '这个', '那个', '什么', '一', '有', '会',
]);

/** Russian function words (prepositions, conjunctions, particles, pronouns). */
const RU_FUNCTION = new Set([
  'и', 'в', 'во', 'на', 'не', 'ни', 'что', 'с', 'со', 'а', 'но', 'по', 'к', 'ко', 'у', 'о', 'об', 'из', 'за', 'от',
  'до', 'же', 'ли', 'бы', 'это', 'то', 'как', 'так', 'я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они', 'его', 'её',
  'их', 'мне', 'меня', 'тебя', 'для', 'при', 'про', 'да', 'нет', 'или', 'если', 'уже', 'ещё', 'еще', 'вот',
]);

function normalizeWord(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

/** Why a token can never be a card, or null when it is vocabulary. */
export function snipTokenSkipReason(token: SnipToken, lang: StudyLang): Exclude<SnipWordStatus, 'candidate' | 'added' | 'merged' | 'removed' | 'known' | 'inDeck' | 'duplicate' | 'overLimit' | 'failed'> | null {
  const surface = token.surface.trim();
  if (!surface || PUNCT.test(surface)) return 'punct';
  if (ONLY_NUMERALS.test(surface) || (lang === 'ja' && token.pos === '名詞' && token.posDetail === '数')) return 'number';
  if (lang !== 'ja' && NUMBER.test(surface)) return 'number';
  if (lang === 'ja') {
    if (token.pos && JA_FUNCTION_POS.has(token.pos)) return token.pos === '記号' ? 'punct' : 'function';
    if (KANA_ONE.test(surface)) return 'noise';
    if (!token.content) return 'function';
    if (token.proper) return 'name';
    return null;
  }
  if (lang === 'zh') {
    if (!/\p{Script=Han}/u.test(surface)) return /\p{L}/u.test(surface) ? 'noise' : 'punct';
    if (ZH_FUNCTION.has(surface)) return 'function';
    return token.content === false ? 'function' : null;
  }
  // ru
  if (!/\p{Script=Cyrillic}/u.test(surface)) return /\p{L}/u.test(surface) ? 'noise' : 'punct';
  const lower = normalizeWord(surface);
  if (RU_FUNCTION.has(lower)) return 'function';
  if ([...lower].length < 2) return 'noise';
  return token.content === false ? 'function' : null;
}

export interface SnipWordLookups {
  /** Known (or ignored) by the learner. */
  isKnown: (lemma: string, surface: string) => boolean;
  /** A card for the word already exists in the deck. */
  inDeck: (lemma: string, surface: string) => boolean;
}

/**
 * Every token of the snip with what happens to it. The breakdown keeps the
 * particles and punctuation (the analysis shows the whole sentence); only the
 * first `maxWords` unknown, not-yet-carded content words stay `candidate`.
 */
export function classifySnipTokens(
  tokens: readonly SnipToken[],
  lang: StudyLang,
  lookups: SnipWordLookups,
  maxWords: number,
): SnipWord[] {
  const seen = new Set<string>();
  let candidates = 0;
  const limit = Math.max(0, Math.floor(maxWords));
  return tokens.map((token) => {
    const lemma = token.lemma || token.surface;
    const base: SnipWord = {
      surface: token.surface,
      lemma,
      // The analyser reads the surface; that is the lemma's reading only when they match.
      ...(token.reading && token.surface === lemma ? { reading: token.reading } : {}),
      ...(token.reading ? { surfaceReading: token.reading } : {}),
      ...(token.pos ? { pos: token.pos } : {}),
      ...(token.posDetail && token.posDetail !== '*' ? { posDetail: token.posDetail } : {}),
      status: 'candidate',
    };
    const skip = snipTokenSkipReason(token, lang);
    if (skip) return { ...base, status: skip };
    const key = normalizeWord(base.lemma);
    if (seen.has(key)) return { ...base, status: 'duplicate' };
    seen.add(key);
    if (lookups.isKnown(base.lemma, base.surface)) return { ...base, status: 'known' };
    if (lookups.inDeck(base.lemma, base.surface)) return { ...base, status: 'inDeck' };
    if (candidates >= limit) return { ...base, status: 'overLimit' };
    candidates += 1;
    return base;
  });
}

/** The words a snip turned into cards (still standing), in sentence order. */
export function snipAddedWords(words: readonly SnipWord[]): SnipWord[] {
  return words.filter((w) => w.status === 'added');
}

/** "猫, 走る, 静か, …" — the first few added words for a toast. */
export function snipWordList(words: readonly string[], max = 3, separator = ', '): string {
  const shown = words.slice(0, Math.max(1, max));
  return words.length > shown.length ? `${shown.join(separator)}${separator}…` : shown.join(separator);
}

// ---------------------------------------------------------------------------
// History

export type SnipEntryStatus = 'processing' | 'done' | 'error';

export type SnipError =
  | SnipTextProblem
  | 'ocr-failed'
  /** The study language's OCR model is not installed (and is never auto-downloaded). */
  | 'models-missing'
  | 'cancelled';

export interface SnipGrammarPoint {
  id?: string;
  title: string;
  meaning?: string;
  level?: string;
}

export interface SnipEntry {
  id: string;
  createdAt: number;
  lang: StudyLang;
  status: SnipEntryStatus;
  error?: SnipError;
  /** For `models-missing`: the asset ids an Install button starts. */
  installIds?: string[];
  width: number;
  height: number;
  /** Bytes of the stored picture (for the history's size cap). */
  bytes: number;
  /** Content hash of the picture: the same picture is never read twice. */
  hash: string;
  engine?: string;
  /** Mean OCR confidence 0–1, when the engine reports one. */
  confidence?: number;
  text: string;
  /**
   * Characters the OCR was still unsure of, each with the alternatives the
   * engines considered (indexed into `text`): the one-click fixes.
   */
  unsure?: OcrUnsureChar[];
  /** Characters the dictionary-guided decoding corrected (彼後 → 恐竜). */
  corrected?: number;
  /** Every engine that contributed to the read (the router's second opinions). */
  engines?: string[];
  words: SnipWord[];
  grammar: SnipGrammarPoint[];
  translation?: string;
  /** Why there is no translation (a catalog key or the engine's message). */
  translationError?: string;
  /** Cards this snip created and still owns (Undo removes exactly these). */
  cardIds: string[];
  /** Anki notes this snip created and still owns. */
  ankiNoteIds: number[];
  undone?: boolean;
  /** The words past `maxWords` that were listed but not added. */
  overLimit?: number;
  /**
   * Why the candidates wait for the learner instead of being added: `manual`
   * (automatic adding is off: review mode) or `uncertain` (the OCR was unsure).
   */
  review?: SnipReviewReason;
  /** This snip's own Gum deck (folder), overriding the setting. */
  deck?: string;
  /** The OCR's own text, kept once the learner corrected it. */
  ocrText?: string;
  /** Why the AI reader, asked to read this snip, did not (an `AiProviderErrorCode`). */
  aiError?: string;
}

export type SnipReviewReason = 'manual' | 'uncertain';

/** The deck a snip's cards go into: its own, else the setting's. */
export function snipDeckFor(entry: Pick<SnipEntry, 'deck'>, settings: Pick<SnipSettings, 'deck'>): string {
  const own = cleanName(entry.deck, '');
  return own || settings.deck || SNIP_DECK_DEFAULT;
}

/** Whether a snip still owns something Undo would take back (cards, notes, merged examples). */
export function snipOwnsWork(entry: Pick<SnipEntry, 'words' | 'cardIds' | 'ankiNoteIds'>): boolean {
  return entry.cardIds.length > 0
    || entry.ankiNoteIds.length > 0
    || entry.words.some((w) => w.status === 'added' || w.status === 'merged');
}

export const SNIP_HISTORY_MAX_ENTRIES = 200;
export const SNIP_HISTORY_MAX_BYTES = 200 * 1024 * 1024;

// ---------------------------------------------------------------------------
// IPC shapes (main/snipToCards.ts ↔ renderer/snipToCards.ts)

/** What the pipeline window receives for one snip. */
export interface SnipJob {
  entry: SnipEntry;
  settings: SnipSettings;
  /** The accurate engines' read (the OCR router's), when one is installed. */
  ocr?: {
    text: string;
    engine: string;
    confidence?: number;
    unsure?: OcrUnsureChar[];
    corrected?: number;
    engines?: string[];
  };
  /**
   * No accurate engine read it: read the picture with the bundled offline
   * recognizer — Japanese always, Chinese when its optional data is installed
   * (`models` are the URLs Tesseract loads it from). `langs` are the languages
   * the snip may be in (the learner's own first); `offer` the download that
   * reads each language that has no reader at all.
   */
  basicOcr?: {
    dataUrl: string;
    width: number;
    height: number;
    langs?: StudyLang[];
    models?: Partial<Record<SnipTessModel, string>>;
    offer?: Partial<Record<StudyLang, string[]>>;
  };
  /** Bounded JPEG for the cards and Anki notes (base64, no data: prefix). */
  cardImage?: { base64: string; filename: string };
}

export type SnipAction =
  | { id: string; action: 'undo' }
  | { id: string; action: 'removeWord' | 'addWord'; index: number }
  /** Review mode: add these words (indices into `entry.words`) in one go. */
  | { id: string; action: 'addWords'; indices: number[] }
  /** Correct a word the OCR or the analyser got wrong, before (or after) it is a card. */
  | { id: string; action: 'editWord'; index: number; lemma?: string; reading?: string }
  /** Analyse corrected text again (no OCR); refused while the snip still owns cards. */
  | { id: string; action: 'reanalyze'; text: string }
  /** Read the picture again with the best engine installed now (main); refused while it owns cards. */
  | { id: string; action: 'reread' }
  /** "Check with AI": read it again, and have the learner's AI reader check it (main; needs the opt-in). */
  | { id: string; action: 'aiCheck' }
  /** Install these readers (the learner clicked), then read the picture again. */
  | { id: string; action: 'installReread'; assets: string[] }
  /** This snip's own deck: later adds go there, and the cards it owns move there. */
  | { id: string; action: 'setDeck'; deck: string };

/** Longest text a re-analysis accepts (a snip is a few lines). */
export const SNIP_TEXT_MAX = 2000;
const MAX_INDEX = 10_000;

function cleanField(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return stripSnipControls(value.normalize('NFC')).trim().slice(0, max);
}

/**
 * An action from IPC, repaired; null when it is not one. Main checks this
 * before forwarding, so the pipeline window only ever sees well-formed actions.
 */
export function normalizeSnipAction(raw: unknown): SnipAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^snip-[a-z0-9-]+$/i.test(r.id) ? r.id : null;
  if (!id) return null;
  const index = Number(r.index);
  const okIndex = typeof r.index === 'number' && Number.isInteger(index) && index >= 0 && index < MAX_INDEX;
  switch (r.action) {
    case 'undo':
      return { id, action: 'undo' };
    case 'removeWord':
    case 'addWord':
      return okIndex ? { id, action: r.action, index } : null;
    case 'addWords': {
      if (!Array.isArray(r.indices)) return null;
      const indices = [...new Set(r.indices.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < MAX_INDEX))]
        .slice(0, 200);
      return indices.length ? { id, action: 'addWords', indices } : null;
    }
    case 'editWord': {
      if (!okIndex) return null;
      const lemma = cleanField(r.lemma, 100);
      const reading = cleanField(r.reading, 200);
      if (lemma === undefined && reading === undefined) return null;
      if (lemma !== undefined && !lemma) return null;
      return { id, action: 'editWord', index, ...(lemma !== undefined ? { lemma } : {}), ...(reading !== undefined ? { reading } : {}) };
    }
    case 'reanalyze': {
      const text = typeof r.text === 'string'
        ? stripSnipControls(r.text.replace(/\r\n?/g, '\n'), true).trim().slice(0, SNIP_TEXT_MAX)
        : '';
      return text ? { id, action: 'reanalyze', text } : null;
    }
    case 'setDeck':
      return typeof r.deck === 'string' ? { id, action: 'setDeck', deck: cleanName(r.deck, '') } : null;
    case 'reread':
      return { id, action: 'reread' };
    case 'aiCheck':
      return { id, action: 'aiCheck' };
    case 'installReread': {
      const assets = Array.isArray(r.assets) ? [...new Set(r.assets.filter(isSnipReaderAsset))].slice(0, 6) : [];
      return assets.length ? { id, action: 'installReread', assets } : null;
    }
    default:
      return null;
  }
}

/** What the background toast shows. */
export interface SnipToastPayload {
  id?: string;
  /** `review`: words are waiting to be chosen (review mode, or an unsure read). */
  kind: 'added' | 'review' | 'none' | 'error' | 'undone' | 'paused' | 'resumed';
  /** The words this snip added (or removed, for `undone`). */
  words?: string[];
  count?: number;
  error?: SnipError;
  /** The snip's study language (names the missing OCR model). */
  lang?: StudyLang;
  /** Cards that got this snip's sentence as another example. */
  merged?: number;
  /** For `review`: why the words wait. */
  review?: SnipReviewReason;
  /** The engine that read the snip (`snipEngineLabel`). */
  engine?: string;
  /** Rounded OCR confidence 0–100, when the engine reports one. */
  confidence?: number;
  /** Set by main only: the one-time "Snip to cards is on" notice rides on this toast. */
  notice?: boolean;
  /** Set by main only: turned on with no accurate reader installed; the toast offers the setup. */
  setup?: boolean;
}

/** How long the background toast offers Undo before closing (it holds while hovered or focused). */
export const SNIP_TOAST_UNDO_MS = 12_000;
/** How long a toast without a decision stays. */
export const SNIP_TOAST_PLAIN_MS = 5_000;
/** How long the first-run notice stays (it asks a question). */
export const SNIP_TOAST_NOTICE_MS = 25_000;

/** A toast payload from IPC, repaired (main never trusts the renderer's `notice`). */
export function normalizeSnipToastPayload(raw: unknown): SnipToastPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kinds: ReadonlyArray<SnipToastPayload['kind']> = ['added', 'review', 'none', 'error', 'undone', 'paused', 'resumed'];
  if (!kinds.includes(r.kind as SnipToastPayload['kind'])) return null;
  const count = Number(r.count);
  const merged = Number(r.merged);
  const confidence = Number(r.confidence);
  return {
    kind: r.kind as SnipToastPayload['kind'],
    ...(typeof r.id === 'string' && /^snip-[a-z0-9-]+$/i.test(r.id) ? { id: r.id } : {}),
    ...(Array.isArray(r.words) ? { words: r.words.filter((w): w is string => typeof w === 'string').slice(0, 50).map((w) => w.slice(0, 100)) } : {}),
    ...(Number.isFinite(count) && count >= 0 ? { count: Math.round(count) } : {}),
    ...(typeof r.error === 'string' ? { error: r.error as SnipError } : {}),
    ...(r.lang === 'ja' || r.lang === 'zh' || r.lang === 'ru' ? { lang: r.lang } : {}),
    ...(Number.isFinite(merged) && merged > 0 ? { merged: Math.round(merged) } : {}),
    ...(r.review === 'manual' || r.review === 'uncertain' ? { review: r.review } : {}),
    ...(typeof r.engine === 'string' ? { engine: r.engine.slice(0, 40) } : {}),
    ...(Number.isFinite(confidence) && confidence >= 0 && confidence <= 100 ? { confidence: Math.round(confidence) } : {}),
  };
}

export interface SnipStatus extends SnipSettings {
  /** Watching right now (on, started, not paused by a lock). */
  watching: boolean;
  historyCount: number;
  historyBytes: number;
  /** Which readers are installed (drives the setup offers). */
  readers: SnipReaders;
  /** The learner's own (active) study language. */
  studyLang: StudyLang;
}

/** Patch fields the pipeline may set on an entry (never id/hash/createdAt/bytes). */
export type SnipEntryPatch = Partial<Omit<SnipEntry, 'id' | 'hash' | 'createdAt' | 'bytes' | 'width' | 'height'>> & {
  /** Optional fields to drop (a re-analysis clears the old error and translation). */
  clear?: SnipClearableField[];
};

export type SnipClearableField =
  | 'error' | 'installIds' | 'translation' | 'translationError' | 'review' | 'overLimit'
  | 'unsure' | 'corrected' | 'engines' | 'confidence' | 'engine' | 'ocrText' | 'undone' | 'aiError';
export const SNIP_CLEARABLE_FIELDS: ReadonlySet<SnipClearableField> = new Set<SnipClearableField>([
  'error', 'installIds', 'translation', 'translationError', 'review', 'overLimit',
  'unsure', 'corrected', 'engines', 'confidence', 'engine', 'ocrText', 'undone', 'aiError',
]);

/**
 * Which entries stay when the history is over its caps. `entries` is newest
 * first; the oldest go first until both the count and the byte total fit.
 */
export function pruneSnipHistory<T extends Pick<SnipEntry, 'id' | 'bytes'>>(
  entries: readonly T[],
  caps: { maxEntries?: number; maxBytes?: number } = {},
): { kept: T[]; dropped: T[] } {
  const maxEntries = Math.max(1, caps.maxEntries ?? SNIP_HISTORY_MAX_ENTRIES);
  const maxBytes = Math.max(1, caps.maxBytes ?? SNIP_HISTORY_MAX_BYTES);
  const kept: T[] = [];
  const dropped: T[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = Math.max(0, Number(entry.bytes) || 0);
    // The newest entry is always kept, even alone over the byte cap: it is the
    // snip the user just took, and the image cap already bounds it.
    if (kept.length >= maxEntries || (kept.length > 0 && bytes + size > maxBytes)) {
      dropped.push(entry);
      continue;
    }
    kept.push(entry);
    bytes += size;
  }
  return { kept, dropped };
}

/** History search: OCR text, words, readings, meanings and the translation. */
export function snipMatchesQuery(entry: Pick<SnipEntry, 'text' | 'words' | 'translation'>, query: string): boolean {
  const q = normalizeWord(query);
  if (!q) return true;
  if (normalizeWord(entry.text).includes(q)) return true;
  if (entry.translation && normalizeWord(entry.translation).includes(q)) return true;
  return entry.words.some((w) =>
    normalizeWord(w.surface).includes(q)
    || normalizeWord(w.lemma).includes(q)
    || (w.reading ? normalizeWord(w.reading).includes(q) : false)
    || (w.meaning ? normalizeWord(w.meaning).includes(q) : false));
}

const WORD_STATUSES: ReadonlySet<SnipWordStatus> = new Set<SnipWordStatus>([
  'candidate', 'added', 'merged', 'removed', 'known', 'inDeck', 'duplicate', 'function', 'punct', 'number', 'noise', 'name',
  'overLimit', 'failed',
]);

function str(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, max) : undefined;
}

/** A word from disk or IPC, repaired; null when it is not a word at all. */
export function normalizeSnipWord(raw: unknown): SnipWord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const surface = str(r.surface, 200);
  if (!surface) return null;
  const status = WORD_STATUSES.has(r.status as SnipWordStatus) ? (r.status as SnipWordStatus) : 'candidate';
  const freq = Number(r.freq);
  const note = Number(r.ankiNoteId);
  const deinflection = Array.isArray(r.deinflection)
    ? r.deinflection.filter((x): x is string => typeof x === 'string').slice(0, 12)
    : undefined;
  const optional: Partial<SnipWord> = {
    reading: str(r.reading, 200),
    surfaceReading: str(r.surfaceReading, 400),
    pos: str(r.pos, 40),
    posDetail: str(r.posDetail, 40),
    meaning: str(r.meaning, 1000),
    level: str(r.level, 20),
    cardId: str(r.cardId, 200),
    example: str(r.example, 400),
    ...(r.edited === true ? { edited: true } : {}),
    ...(Number.isFinite(freq) && freq > 0 ? { freq: Math.round(freq) } : {}),
    ...(Number.isFinite(note) && note > 0 ? { ankiNoteId: note } : {}),
    ...(deinflection?.length ? { deinflection } : {}),
  };
  const word: SnipWord = { surface, lemma: str(r.lemma, 200) ?? surface, status };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (word as unknown as Record<string, unknown>)[key] = value;
  }
  return word;
}

// ---------------------------------------------------------------------------
// Readers: which OCR engines are installed, and what the setup offers

/** Tesseract data Gum can download for Chinese (Japanese ships with the app). */
export type SnipTessModel = 'chi_sim' | 'chi_tra';

export interface SnipReaders {
  /** PaddleOCR's text detector (shared by every language). */
  det: boolean;
  /** PaddleOCR recognisers installed. */
  paddle: StudyLang[];
  /** manga-ocr (Japanese; best on manga and stylised lettering). */
  manga: boolean;
  /** Optional Tesseract data for the basic reader. */
  tess: SnipTessModel[];
}

export const SNIP_NO_READERS: Readonly<SnipReaders> = Object.freeze({ det: false, paddle: [], manga: false, tess: [] });

/** The OCR assets a Snips button may install (anything else from IPC is refused). */
const READER_ASSET = /^(paddle-ocr-(det|ja|zh|ru)|manga-ocr|comic-text-detector|tessdata-chi_(sim|tra))$/;

export function isSnipReaderAsset(value: unknown): value is string {
  return typeof value === 'string' && READER_ASSET.test(value);
}

/** A stored or sent readers object, repaired. */
export function normalizeSnipReaders(raw: unknown): SnipReaders {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const langs = Array.isArray(r.paddle) ? r.paddle.filter((l): l is StudyLang => STUDY_LANGS.includes(l as StudyLang)) : [];
  const tess = Array.isArray(r.tess) ? r.tess.filter((m): m is SnipTessModel => m === 'chi_sim' || m === 'chi_tra') : [];
  return { det: r.det === true, paddle: [...new Set(langs)], manga: r.manga === true, tess: [...new Set(tess)] };
}

/** Whether an accurate (downloaded) engine reads `lang`. */
export function snipAccurateReader(lang: StudyLang, readers: SnipReaders): boolean {
  return (readers.det && readers.paddle.includes(lang)) || (lang === 'ja' && readers.manga);
}

/** Whether any reader at all reads `lang` (the bundled Tesseract reads Japanese). */
export function snipAnyReader(lang: StudyLang, readers: SnipReaders): boolean {
  if (snipAccurateReader(lang, readers)) return true;
  if (lang === 'ja') return true;
  return lang === 'zh' && readers.tess.length > 0;
}

/**
 * The languages a snip may be in: the learner's own, then every other
 * language Gum supports that an installed reader reads. (A multi-language
 * study set passes its languages as `studied`.)
 */
export function snipCandidateLangs(active: StudyLang, readers: SnipReaders, studied: readonly StudyLang[] = []): StudyLang[] {
  const out: StudyLang[] = [active, ...studied];
  for (const lang of STUDY_LANGS) if (snipAccurateReader(lang, readers) || (lang === 'zh' && readers.tess.length)) out.push(lang);
  return [...new Set(out)];
}

/**
 * The downloads that set up the accurate reader for `langs`: each language's
 * PaddleOCR recogniser (its parent id pulls the shared detector and its
 * charset in), plus manga-ocr when asked for (Japanese only).
 */
export function snipReaderSetupIds(langs: readonly StudyLang[], readers: SnipReaders, opts: { manga?: boolean } = {}): string[] {
  const ids: string[] = [];
  for (const lang of new Set(langs)) {
    if (!(readers.det && readers.paddle.includes(lang))) ids.push(`paddle-ocr-${lang}`);
  }
  if (opts.manga && langs.includes('ja') && !readers.manga) ids.push('manga-ocr', 'comic-text-detector');
  return ids;
}

/**
 * What a snip's entry offers about readers:
 *  - `lang`: it looks like a language no installed reader reads → install that one;
 *  - `accurate`: the basic reader failed or was unsure, and an accurate reader
 *    for this language is not installed → set it up and read again;
 *  - `manga`: a Japanese snip PaddleOCR was unsure of, and manga-ocr (better on
 *    stylised lettering) is not installed → add it, and read again;
 *  - null: nothing to offer.
 */
export function snipReaderOffer(
  entry: Pick<SnipEntry, 'status' | 'error' | 'engine' | 'review' | 'lang' | 'installIds'>,
  readers: SnipReaders,
): { kind: 'lang' | 'accurate' | 'manga'; lang: StudyLang; ids: string[] } | null {
  if (entry.status === 'error' && entry.error === 'models-missing') {
    if (snipAccurateReader(entry.lang, readers)) return null;
    const ids = (entry.installIds ?? []).filter(isSnipReaderAsset);
    return { kind: 'lang', lang: entry.lang, ids: ids.length ? ids : snipReaderSetupIds([entry.lang], readers) };
  }
  const weak = entry.status === 'error' ? entry.error !== 'cancelled' : entry.status === 'done' && entry.review === 'uncertain';
  if (snipAccurateReader(entry.lang, readers)) {
    return weak && entry.lang === 'ja' && !readers.manga ? { kind: 'manga', lang: 'ja', ids: ['manga-ocr', 'comic-text-detector'] } : null;
  }
  if (!weak || (entry.engine && entry.engine !== 'basic' && entry.engine !== 'none')) return null;
  return { kind: 'accurate', lang: entry.lang, ids: snipReaderSetupIds([entry.lang], readers) };
}

/**
 * The best of several reads of one snip (e.g. Tesseract's Japanese and
 * Chinese data): confidence × script consistency × how much text came back.
 */
export function pickSnipRead<T extends { text: string; lang: StudyLang; confidence?: number }>(reads: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const read of reads) {
    const chars = [...read.text.replace(/\s+/g, '')];
    if (!chars.length) continue;
    const script = chars.filter((ch) => SCRIPT[read.lang].test(ch)).length / chars.length;
    const score = (read.confidence ?? 0.5) * script * Math.min(1, chars.length / 4);
    if (score > bestScore) {
      bestScore = score;
      best = read;
    }
  }
  return best;
}

/** The catalog key that explains a snip error (each says what to do next). */
export function snipErrorKey(error: SnipError | undefined): string {
  switch (error) {
    case 'models-missing':
      return 'snip.error.modelsMissing';
    case 'no-text':
      return 'snip.error.noText';
    case 'garbage':
      return 'snip.error.garbage';
    case 'low-confidence':
      return 'snip.error.lowConfidence';
    case 'cancelled':
      return 'snip.error.cancelled';
    default:
      return 'snip.error.ocrFailed';
  }
}
