/** Katakana readings of common Chinese surnames appearing in Japanese fiction. */
export const CHINESE_SURNAME_KATAKANA = new Set([
  'リュウ', 'リョウ', 'ロウ', 'リン', 'リンファ', 'チン', 'シン', 'ソン', 'ハン', 'カン',
  'ホウ', 'ファン', 'ワン', 'ウー', 'ウ', 'チョウ', 'シャオ', 'シアオ', 'メイ', 'ユエ',
  'シュウ', 'シュ', 'ジン', 'キン', 'ユン', 'ユウ', 'シー', 'シ', 'ツー', 'ツ',
]);

/** Katakana morpheme suffixes common in Russian names transliterated to Japanese. */
export const RUSSIAN_NAME_SUFFIXES = [
  'スキー', 'スキ', 'ヴァ', 'ヴィ', 'イッチ', 'ーヴィチ', 'ーヴナ', 'ーヴァ', 'オフ', 'エフ',
  'アレクサンドル', 'ニコライ', 'イワン', 'セルゲイ', 'ドミトリー', 'アナスタシア',
];

export function isKatakanaOnly(text: string): boolean {
  return /^[\u30A0-\u30FFー]+$/.test(text.trim());
}

export function matchesChineseNameHeuristic(expression: string, reading: string): boolean {
  const kana = (reading || expression).trim();
  if (!isKatakanaOnly(kana)) return false;
  if (CHINESE_SURNAME_KATAKANA.has(kana)) return true;
  for (const surname of CHINESE_SURNAME_KATAKANA) {
    if (kana.startsWith(surname) && kana.length <= surname.length + 4) return true;
  }
  return false;
}

export function matchesRussianNameHeuristic(expression: string, reading: string): boolean {
  const kana = (reading || expression).trim();
  if (!isKatakanaOnly(kana)) return false;
  for (const suffix of RUSSIAN_NAME_SUFFIXES) {
    if (kana.includes(suffix)) return true;
  }
  return kana.length >= 3 && kana.length <= 8 && /[ヴー]/.test(kana);
}
