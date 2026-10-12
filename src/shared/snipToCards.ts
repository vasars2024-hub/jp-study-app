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

import type { StudyLang } from './studyLang';

// ---------------------------------------------------------------------------
// Settings

export type SnipAnkiMode = 'auto' | 'on' | 'off';

export interface SnipSettings {
  /** Watch the clipboard for snips. On by default: the owner asked for it. */
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
}

export const SNIP_MAX_WORDS_DEFAULT = 12;
export const SNIP_MAX_WORDS_LIMIT = 50;
export const SNIP_DECK_DEFAULT = 'Snips';

export const SNIP_SETTINGS_DEFAULTS: Readonly<SnipSettings> = Object.freeze({
  enabled: true,
  autoAdd: true,
  sendToAnki: 'auto',
  deck: SNIP_DECK_DEFAULT,
  ankiDeck: '',
  maxWords: SNIP_MAX_WORDS_DEFAULT,
  openView: true,
});

function cleanName(value: unknown, fallback: string, max = 120): string {
  if (typeof value !== 'string') return fallback;
  // Deck names travel to Anki, where `::` nests decks; control characters never belong.
  const out = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return out;
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
  };
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
export function snipTokenSkipReason(token: SnipToken, lang: StudyLang): Exclude<SnipWordStatus, 'candidate' | 'added' | 'removed' | 'known' | 'inDeck' | 'duplicate' | 'overLimit' | 'failed'> | null {
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
}

export const SNIP_HISTORY_MAX_ENTRIES = 200;
export const SNIP_HISTORY_MAX_BYTES = 200 * 1024 * 1024;

// ---------------------------------------------------------------------------
// IPC shapes (main/snipToCards.ts ↔ renderer/snipToCards.ts)

/** What the pipeline window receives for one snip. */
export interface SnipJob {
  entry: SnipEntry;
  settings: SnipSettings;
  /** The accurate engine's read, when one is installed. */
  ocr?: { text: string; engine: string; confidence?: number };
  /** No accurate engine: read the picture with the bundled offline recognizer (Japanese). */
  basicOcr?: { dataUrl: string; width: number; height: number };
  /** Bounded JPEG for the cards and Anki notes (base64, no data: prefix). */
  cardImage?: { base64: string; filename: string };
}

export type SnipAction =
  | { id: string; action: 'undo' }
  | { id: string; action: 'removeWord' | 'addWord'; index: number };

/** What the background toast shows. */
export interface SnipToastPayload {
  id?: string;
  kind: 'added' | 'none' | 'error' | 'undone' | 'paused' | 'resumed';
  /** The words this snip added (or removed, for `undone`). */
  words?: string[];
  count?: number;
  error?: SnipError;
  /** The snip's study language (names the missing OCR model). */
  lang?: StudyLang;
}

export interface SnipStatus extends SnipSettings {
  /** Watching right now (on, started, not paused by a lock). */
  watching: boolean;
  historyCount: number;
  historyBytes: number;
}

/** Patch fields the pipeline may set on an entry (never id/hash/createdAt/bytes). */
export type SnipEntryPatch = Partial<Omit<SnipEntry, 'id' | 'hash' | 'createdAt' | 'bytes' | 'width' | 'height'>>;

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
  'candidate', 'added', 'removed', 'known', 'inDeck', 'duplicate', 'function', 'punct', 'number', 'noise', 'name',
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
