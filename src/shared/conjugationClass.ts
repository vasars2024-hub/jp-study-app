// Which conjugation class a looked-up Japanese word belongs to, taken from the
// morphological analyser rather than guessed from its ending.
//
// `shared/conjugate.ts` can already produce every form of a verb or
// i-adjective, but it needs to be *told* the class, so until now only the Blanc
// drill could use it — the drill ships a hand-curated `DRILL_WORDS` list with
// the class written next to each word. The Lexicon Workbench looks words up
// from a 697k-headword database and has no such list.
//
// The class cannot come from the dictionary entry: `parseTermBank` in
// `dictionary/yomitan.ts` drops a term row's tag columns, so every legacy sense
// on this installation carries `partsOfSpeech: []`. It cannot come from the
// ending either — 帰る ends in -eru and is *godan*, 切る is godan, 着る is
// ichidan, and no suffix rule separates them. IPADIC does know: it stores a
// 活用型 (conjugation type) per entry, which is exactly this distinction, and
// the app already loads that analyser for mining and Study analysis.
//
// So the class is read off IPADIC's own conjugation table and the surfaces are
// derived by `conjugate.ts`, whose every output is round-tripped back through
// `deinflect.ts` by `conjugate.test.ts`. Nothing here is estimated, and no
// model is involved: a form shown by this module is a form the dictionary's own
// lookup path would deinflect back to the word that produced it.
//
// **Narrowing-only, like `lexiconPartOfSpeech.ts`.** Every unrecognised tag,
// every word the analyser reads as something other than a single dictionary
// form, and every class whose rules produce no surfaces resolves to "no
// analysis" — never to a guess. A noun gets no table; it does not get an empty
// one captioned as if it should have had forms.

import { allForms, type ConjugationForm, type WordClass } from './conjugate';
import { DICT_ENDINGS } from './deinflect';

/**
 * The last kana of every word `conjugate.ts` can produce a form for: the nine
 * godan dictionary endings — which also cover る for ichidan, する and 来る —
 * plus い for i-adjectives.
 *
 * Read off `conjugate.ts`'s own guards rather than chosen as a heuristic:
 * `godanParts` rejects anything whose final kana is not a `DictEnding`,
 * `conjugateIchidan` requires る, `conjugateSuru` requires する, and
 * `conjugateIAdj` requires い. A word ending in anything else therefore yields
 * an empty table by construction, so declining to ask about it costs nothing.
 */
const CONJUGABLE_ENDINGS: ReadonlySet<string> = new Set<string>([...DICT_ENDINGS, 'い']);

/**
 * A cheap caller-side filter so most non-verbs never spend an IPC round trip.
 *
 * Strictly a *necessary* condition, never a sufficient one. Plenty of non-verbs
 * end in one of these kana — くつ, はる, きれい — and they pass here and are then
 * rejected by the analyser like anything else. All this rules out is a word that
 * could not have produced a single row whatever the analyser said about it.
 */
export function couldConjugate(word: string): boolean {
  const target = word.trim();
  if (target.length < 2) return false;
  return CONJUGABLE_ENDINGS.has(target.slice(-1));
}

/** One token as the analyser emits it, reduced to the fields this module reads. */
export interface ConjugationToken {
  surface: string;
  /** IPADIC `basic_form` — the dictionary form of this token. */
  basicForm: string;
  /** IPADIC part of speech, e.g. 動詞 / 形容詞 / 名詞. */
  pos: string;
  /** IPADIC `conjugated_type` (活用型), e.g. 五段・ラ行. '*' when the token does not inflect. */
  conjugationType: string;
}

/** One generated form. The label is resolved in the renderer, not shipped over IPC. */
export interface ConjugationRow {
  form: ConjugationForm;
  surface: string;
}

export interface ConjugationAnalysis {
  /** The word exactly as it was analysed. */
  word: string;
  /**
   * IPADIC's own 活用型 string for the inflecting token, kept so the surface can
   * show which table the forms came from. A reader who disagrees with the class
   * can see what was claimed rather than only its consequences.
   */
  conjugationType: string | null;
  wordClass: WordClass | null;
  rows: ConjugationRow[];
}

/** The honest "the analyser had no opinion" answer. */
function noAnalysis(word: string): ConjugationAnalysis {
  return { word, conjugationType: null, wordClass: null, rows: [] };
}

/** IPADIC writes '*' for a token with no conjugation table. */
function inflects(conjugationType: string): boolean {
  const t = conjugationType.trim();
  return t !== '' && t !== '*';
}

/**
 * Map one IPADIC part-of-speech + 活用型 pair onto a `conjugate.ts` word class.
 *
 * The five prefixes below are the whole of IPADIC's productive inflection: 五段
 * and 一段 verbs, the two irregulars サ変 and カ変, and 形容詞. Everything else
 * it can emit — 特殊・ダ, 特殊・デス, 特殊・ナイ, 特殊・タイ, the 文語 classical
 * tables, 不変化型 — is an auxiliary or a bound form, not a word a learner looks
 * up and conjugates, and `conjugate.ts` has no rules for any of them. Those
 * return null rather than being forced into the nearest class.
 */
export function wordClassFromIpadic(pos: string, conjugationType: string): WordClass | null {
  if (pos !== '動詞' && pos !== '形容詞') return null;
  const type = conjugationType.trim();
  if (type.startsWith('五段')) return 'godan';
  if (type.startsWith('一段')) return 'ichidan';
  if (type.startsWith('サ変')) return 'suru';
  if (type.startsWith('カ変')) return 'kuru';
  if (type.startsWith('形容詞')) return 'i-adj';
  return null;
}

/**
 * Decide whether a word is conjugable and, if so, produce its full table.
 *
 * The tokens must spell the word back exactly. The analyser is free to split
 * 勉強する into 勉強 (名詞) + する (動詞, サ変・スル), and that compound must keep
 * working — `conjugateSuru` is written to take the whole 勉強する — so the rule
 * is not "one token" but "one *inflecting* token, and it is last":
 *
 * - every token before the last must be non-inflecting, which rejects 食べている
 *   (食べ carries 一段) and 高くない (高く carries 形容詞・アウオ段);
 * - the last token must already be in its dictionary form, which rejects 食べた
 *   and 飲みます without needing a second deinflection pass.
 *
 * A word that fails any of these is not shown a table. That is deliberate: the
 * Workbench's lookup already deinflects and displays the chain, so an inflected
 * query is answered there, and a second half-right answer here would only
 * disagree with it.
 */
export function analyzeConjugationTokens(
  word: string,
  tokens: ConjugationToken[],
): ConjugationAnalysis {
  const target = word.trim();
  if (!target || tokens.length === 0) return noAnalysis(target);
  if (tokens.map((token) => token.surface).join('') !== target) return noAnalysis(target);

  const last = tokens[tokens.length - 1];
  if (tokens.slice(0, -1).some((token) => inflects(token.conjugationType))) return noAnalysis(target);
  if (!inflects(last.conjugationType)) return noAnalysis(target);
  // '*' is IPADIC's "no basic form recorded", which an unknown word gets; it
  // must not be read as "the basic form differs from the surface".
  if (last.basicForm !== last.surface) return noAnalysis(target);

  const wordClass = wordClassFromIpadic(last.pos, last.conjugationType);
  if (!wordClass) return noAnalysis(target);

  const rows = allForms(target, wordClass);
  // The class came from the analyser but the *rules* live in conjugate.ts, and
  // they can legitimately produce nothing — a godan whose final kana is not a
  // verb ending, an ichidan not ending in る. Claiming a class we cannot
  // demonstrate a single form for would be exactly the unchecked assertion this
  // module exists to avoid.
  if (rows.length === 0) return noAnalysis(target);

  return { word: target, conjugationType: last.conjugationType.trim(), wordClass, rows };
}
