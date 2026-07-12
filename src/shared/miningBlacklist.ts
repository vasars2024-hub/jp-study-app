/**
 * Prebuilt junk filter for EPUB analyze — modeled after Jiten / JL / Sudachi practice:
 * - Sudachi/Jiten: drop 助詞・助動詞・接続詞 at POS level (we do this in kuromoji tokenize).
 * - Lemma to dictionary form (basic_form) so endings are not separate cards (already done).
 * - This list catches high-frequency lemmas that still pass POS filters: copula, light verbs,
 *   demonstratives, fillers, and one-mora kana fragments.
 *
 * User blacklist in Analysis settings is merged on top. Disable via useBuiltinJunkFilter.
 */

/** Copula, auxiliaries, light verbs, and grammar glue. */
const AUX_AND_LIGHT_VERBS = [
  'する',
  'いる',
  'おる',
  'ある',
  'なる',
  'できる',
  'くる',
  'いく',
  'しまう',
  'くださる',
  'いたす',
  'おく',
  'みる',
  'くれる',
  'もらう',
  'あげる',
  'だ',
  'です',
  'である',
  'じゃない',
  'ではない',
  'ない',
  'ん',
  'ます',
  'でした',
  'だった',
  'ません',
  'ましょう',
  'よう',
  'うる',
  'える',
  'られる',
  'させる',
  'せる',
];

/** Demonstratives, pronouns, and place/time deixis. */
const DEIXIS_AND_PRONOUNS = [
  'この',
  'その',
  'あの',
  'どの',
  'こんな',
  'そんな',
  'あんな',
  'どんな',
  'こう',
  'そう',
  'ああ',
  'どう',
  'ここ',
  'そこ',
  'あそこ',
  'どこ',
  'こちら',
  'そちら',
  'あちら',
  'どちら',
  'こっち',
  'そっち',
  'あっち',
  'どっち',
  '私',
  'わたし',
  '僕',
  'ぼく',
  '俺',
  'おれ',
  'あなた',
  '彼',
  'かれ',
  '彼女',
  'かのじょ',
  '自分',
  'じぶん',
  'みんな',
  '誰',
  'だれ',
  '何',
  'なに',
  'なん',
];

/** Discourse adverbs and fillers that flood frequency lists. */
const FILLERS_AND_ADVERBS = [
  'もう',
  'まだ',
  'また',
  'とても',
  'ちょっと',
  'よく',
  'さらに',
  'すぐ',
  'ずっと',
  'たぶん',
  'きっと',
  'なんか',
  'なんで',
  'どうして',
  'なぜ',
  'やっぱり',
  'やはり',
  'ほんと',
  'まあ',
  'ね',
  'よ',
  'わ',
  'ぞ',
  'ぜ',
  'かい',
  'だい',
  'っけ',
  'けど',
  'けれど',
  'しかし',
  'そして',
  'それで',
  'だから',
  'ので',
  'のに',
  'とか',
  'って',
  'という',
  'といった',
];

/** Nominalizers that sometimes pass as 名詞一般 in kuromoji. */
const NOMINALIZERS = ['ところ', 'わけ', 'はず', 'つもり'];

/** Interjections and backchannels. */
const INTERJECTIONS = [
  'はい',
  'いいえ',
  'ええ',
  'うん',
  'ああ',
  'おい',
  'ねえ',
  'もし',
  'さあ',
  'ほら',
  'あの',
  'えっと',
  'うーん',
];

export const BUILTIN_JUNK_EXPRESSIONS: ReadonlySet<string> = new Set([
  ...AUX_AND_LIGHT_VERBS,
  ...DEIXIS_AND_PRONOUNS,
  ...FILLERS_AND_ADVERBS,
  ...NOMINALIZERS,
  ...INTERJECTIONS,
]);

/** True for one-mora kana fragments (っ, ー, を-as-kana, etc.). */
export function isSingleKanaJunk(expression: string): boolean {
  const e = expression.trim();
  return e.length === 1 && /^[\u3040-\u309F\u30A0-\u30FFー]$/.test(e);
}

export function isBuiltinJunkExpression(expression: string): boolean {
  const e = expression.trim();
  if (!e) return true;
  if (BUILTIN_JUNK_EXPRESSIONS.has(e)) return true;
  if (isSingleKanaJunk(e)) return true;
  return false;
}

export interface JunkFilterLimits {
  blacklist: string[];
  useBuiltinJunkFilter?: boolean;
}

/** User blacklist merged with optional built-in junk set. */
export function effectiveMiningBlacklist(limits: JunkFilterLimits): Set<string> {
  const out = new Set(limits.blacklist.map((t) => t.trim()).filter(Boolean));
  if (limits.useBuiltinJunkFilter !== false) {
    for (const w of BUILTIN_JUNK_EXPRESSIONS) out.add(w);
  }
  return out;
}

export function shouldDropMiningCandidate(
  expression: string,
  limits: JunkFilterLimits,
): boolean {
  const e = expression.trim();
  if (!e) return true;
  if (effectiveMiningBlacklist(limits).has(e)) return true;
  if (limits.useBuiltinJunkFilter !== false && isSingleKanaJunk(e)) return true;
  return false;
}

/** Human-readable summary for the Analysis settings UI. */
export const BUILTIN_JUNK_FILTER_SUMMARY =
  'Copula, auxiliaries, light verbs, demonstratives, particles, fillers, and one-mora kana — same class of junk Jiten/JL drop via POS + lemma rules.';
