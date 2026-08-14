// Central language-code table with script metadata. Every place that used to
// hardcode 'ja' | 'zh' | 'en' | 'ru' unions routes through this module so that
// adding a dictionary for a new language (e.g. German) works without code
// changes: prompts, validation, and the variable palette all derive from here.

export type LangScript = 'kana-han' | 'han' | 'latin' | 'cyrillic' | 'hangul' | 'other';

export interface LangSpec {
  code: string;
  /** English name — used in LLM prompts ("Translate ... into Russian"). */
  label: string;
  /** Native name — used in UI palettes. */
  nativeLabel: string;
  script: LangScript;
}

export const KNOWN_LANGS: readonly LangSpec[] = [
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', script: 'kana-han' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文', script: 'han' },
  { code: 'en', label: 'English', nativeLabel: 'English', script: 'latin' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', script: 'cyrillic' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', script: 'latin' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', script: 'latin' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', script: 'latin' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', script: 'latin' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', script: 'latin' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', script: 'latin' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어', script: 'hangul' },
];

const BY_CODE = new Map(KNOWN_LANGS.map((l) => [l.code, l]));

export function langSpec(code: string): LangSpec | undefined {
  return BY_CODE.get(code.toLowerCase());
}

/** English display name for prompts; falls back to the raw code. */
export function langLabel(code: string): string {
  return langSpec(code)?.label ?? code.toUpperCase();
}

export function langNativeLabel(code: string): string {
  return langSpec(code)?.nativeLabel ?? code.toUpperCase();
}

export function langScript(code: string): LangScript {
  return langSpec(code)?.script ?? 'other';
}

// ----- Script tests -----------------------------------------------------------

export function hasKana(text: string): boolean {
  return /[\u3040-\u30ff\u31f0-\u31ff]/.test(text);
}

export function hasHan(text: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

/**
 * Whether `text` is a single character that a character dictionary could ground.
 *
 * Only ideographs qualify: every character source this app can import keys on an
 * ideograph (KANJIDIC2 on `<literal>`), so kana, digits and Latin letters can
 * never gain strokes, radicals or components no matter what the user imports.
 * Code points, not UTF-16 units — an astral ideograph such as 𠮷 is one
 * character with `length === 2`. `\p{Unified_Ideograph}` is deliberately
 * narrower than Script=Han: it excludes marks like 々 and 〆, which no character
 * source carries either.
 */
export function isGroundableCharacter(text: string): boolean {
  return [...text].length === 1 && /\p{Unified_Ideograph}/u.test(text);
}

export function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

export function hasLatin(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

export function hasHangul(text: string): boolean {
  return /[\uac00-\ud7af\u1100-\u11ff]/.test(text);
}

/** True when `text` is plausibly written in `code`'s script. */
export function textMatchesLang(code: string, text: string): boolean {
  switch (langScript(code)) {
    case 'kana-han':
      return hasKana(text) || hasHan(text);
    case 'han':
      return hasHan(text) && !hasKana(text);
    case 'cyrillic':
      return hasCyrillic(text);
    case 'latin':
      return hasLatin(text) && !hasCyrillic(text);
    case 'hangul':
      return hasHangul(text);
    default:
      return text.trim().length > 0;
  }
}

/**
 * True when a single word mixes Cyrillic and Latin letters — the signature of
 * LLM garbage like "сacrificed" (Cyrillic с + Latin acrificed). Legit output in
 * any language never interleaves the two scripts inside one word.
 */
export function hasMixedScriptWord(text: string): boolean {
  for (const word of text.split(/[\s,;/()[\]{}"'«»—–-]+/)) {
    if (!word) continue;
    if (hasCyrillic(word) && hasLatin(word)) return true;
  }
  return false;
}

// ----- Kana conversion ---------------------------------------------------------

export function kataToHira(text: string): string {
  return text.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

export function hiraToKata(text: string): string {
  return text.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

/** Case/width-insensitive kana comparison (アウ == あう). */
export function kanaEquals(a: string, b: string): boolean {
  return kataToHira(a.normalize('NFKC').trim()) === kataToHira(b.normalize('NFKC').trim());
}
