/**
 * Normalization: fills in the fields the UI and filters depend on, and records
 * how trustworthy each one is.
 *
 * This module used to back-fill `functions` and `register` by running regexes
 * over the English meaning gloss. That is why filtering by Business returned
 * informal patterns: `inferRegisterFromMeaning` returned 'business' whenever the
 * *English text* contained "formal", so a gloss reading "a less formal way to
 * say X" was tagged business. A corpus audit put numbers on it — 987 of 2227
 * records (44%) were tagged 'other' and nothing else, and only 17 records in the
 * entire corpus carried a non-neutral register.
 *
 * The replacement does not try to guess better. It derives register only where
 * the *pattern itself* is decisive (Japanese 敬語/謙譲語 morphology, contracted
 * casual endings, classical auxiliaries), marks those 'derived', and leaves
 * everything else neutral/unknown so the filter layer can decline to present a
 * guess as a fact.
 *
 * Rules here are deliberately under-inclusive. A rule that also matches an
 * ordinary verb (〜ぬ matching 死ぬ, 〜たる matching 当たる) is worse than no rule,
 * because a wrong tag is indistinguishable from a right one downstream.
 */

import type { GrammarFunctionId } from './functions';
import { resolveCategories } from './taxonomy';
import {
  frameworkForLevel,
  type GrammarLang,
  type GrammarPoint,
  type GrammarProvenance,
  type GrammarRegister,
  type GrammarTagSource,
  type GrammarVerification,
} from './types';

export interface NormalizedGrammarPoint extends GrammarPoint {
  lang: GrammarLang;
  functions: GrammarFunctionId[];
  register: GrammarRegister;
  categories: string[];
  provenance: GrammarProvenance;
}

/** Defaults applied to a whole source module, since origin is a module fact. */
export interface ModuleProvenance {
  source: string;
  license?: string;
  tagSource: GrammarTagSource;
  /** Verification ceiling for the module; per-record checks can lower it. */
  verification: GrammarVerification;
}

/*
 * 〜ます / 〜です are omitted on purpose. They are polite but carry no register
 * worth filtering on, and treating politeness as "business" is close to the
 * mistake this module exists to fix.
 */
const JA_REGISTER_RULES: Array<[RegExp, GrammarRegister]> = [
  // 尊敬語 / 謙譲語 — honorific-humble morphology with no other reading
  [/お[^\s]{1,4}になる|ご[^\s]{1,4}になる|お[^\s]{1,4}くださ|ご[^\s]{1,4}くださ/, 'business'],
  [/いたします|いたす|申し上げ|拝見|拝借|お目にかかる|伺います/, 'business'],
  [/なさる|くださる|いらっしゃ|おっしゃ|召し上が|ご覧になる/, 'business'],
  [/ございます|でござい/, 'business'],
  [/ますようお願い|くださいますよう|いただけますでしょうか|いただければ幸い/, 'business'],

  // Contracted / sentence-final casual forms
  [/ちゃう|じゃう|ちゃった|じゃった|ちゃだめ|じゃだめ/, 'casual'],
  [/なきゃ|なくちゃ/, 'casual'],
  [/じゃん|っしょ|だろ$|でしょ$/, 'casual'],
  [/ってば|っけ|だぜ|だぞ|かしら|(ん)?だもん/, 'casual'],

  // Classical / written-only auxiliaries. Anchored to the 〜 pattern marker
  // where the bare form would collide with ordinary vocabulary.
  [/べし|べからず|んがため|ざるを得ない|ざるをえない/, 'literary'],
  [/〜ぬ$|〜まじ|〜たる$|〜べく/, 'literary'],
  [/における|をもって|ならびに|に相違ない|いかんによらず/, 'literary'],
];

const ZH_REGISTER_RULES: Array<[RegExp, GrammarRegister]> = [
  // 书面语 markers. 之 / 者 are excluded — 之后, 或者 are everyday words.
  [/乃|亦|则|而言|加以|予以|以及|莫不|尚未/, 'literary'],
  // colloquial sentence-final particles. 呀 / 呢 excluded as too common.
  [/呗|啦|嘛|咯|哟/, 'casual'],
];

/**
 * Derive register from the pattern's own morphology.
 * Returns null when nothing decisive matched — callers must not invent one.
 */
export function deriveRegister(
  lang: GrammarLang,
  title: string,
  structure?: string,
): GrammarRegister | null {
  const hay = `${title} ${structure ?? ''}`;
  const rules = lang === 'zh' ? ZH_REGISTER_RULES : JA_REGISTER_RULES;
  for (const [re, register] of rules) {
    if (re.test(hay)) return register;
  }
  return null;
}

/** Records with no examples can't support study or export; say so explicitly. */
function verificationFor(
  point: GrammarPoint,
  moduleCeiling: GrammarVerification,
): GrammarVerification {
  const hasExamples = Array.isArray(point.examples) && point.examples.length > 0;
  const hasExplanation = !!point.explanation && point.explanation.trim().length > 0;
  if (!hasExamples || !hasExplanation) return 'missing';
  return moduleCeiling;
}

const DEFAULT_MODULE: ModuleProvenance = {
  source: 'unknown',
  tagSource: 'unknown',
  verification: 'imported-unreviewed',
};

export function normalizeGrammarPoint(
  point: GrammarPoint,
  module: ModuleProvenance = DEFAULT_MODULE,
): NormalizedGrammarPoint {
  const lang: GrammarLang = point.lang ?? (String(point.level).startsWith('HSK') ? 'zh' : 'ja');

  const functions = point.functions ?? [];
  const categories =
    point.categories && point.categories.length ? point.categories : resolveCategories(functions);

  /*
   * Register precedence: an authored non-neutral value wins; else derive from
   * the pattern; else neutral, recorded as not-known. The old third branch was
   * "run a regex over the English gloss and commit to the result".
   */
  let register: GrammarRegister;
  let registerSource: GrammarTagSource;
  const derived = deriveRegister(lang, point.title, point.structure);
  if (point.register && point.register !== 'neutral' && module.tagSource === 'authored') {
    register = point.register;
    registerSource = 'authored';
  } else if (derived) {
    register = derived;
    registerSource = 'derived';
  } else if (module.tagSource === 'authored') {
    // An explicit 'neutral' from an authored module is a decision, not a gap.
    register = point.register ?? 'neutral';
    registerSource = 'authored';
  } else {
    /*
     * An imported non-neutral register we could not corroborate is kept, but
     * marked heuristic. Erasing it to 'neutral' was the first instinct and it
     * was wrong twice over: it discards source data, and it makes the UI's
     * "verified tags only" toggle a no-op, since switching it off would reveal
     * nothing. Preserve the claim, label it as unverified, let the filter
     * decide.
     */
    register = point.register ?? 'neutral';
    registerSource = point.register ? 'heuristic' : module.tagSource;
  }

  const categorySource: GrammarTagSource =
    point.categories && point.categories.length ? 'authored' : module.tagSource;

  /*
   * Summary only. The two dimensions stay separate because they are genuinely
   * independent: a Mazii record's categories are regex output, but if its
   * pattern contains お〜になる then its register is a fact about the
   * morphology. Collapsing them made every derived Japanese register
   * unreachable behind the verified-tags gate — the Formal filter returned
   * Chinese records exclusively.
   */
  const tagSource: GrammarTagSource =
    categorySource === 'heuristic' || registerSource === 'heuristic'
      ? 'heuristic'
      : categorySource;

  const provenance: GrammarProvenance = {
    source: point.provenance?.source ?? module.source,
    license: point.provenance?.license ?? module.license,
    tagSource: point.provenance?.tagSource ?? tagSource,
    registerSource: point.provenance?.registerSource ?? registerSource,
    categorySource: point.provenance?.categorySource ?? categorySource,
    verification: point.provenance?.verification ?? verificationFor(point, module.verification),
    framework: point.provenance?.framework ?? frameworkForLevel(point.level),
    sourceLevel: point.provenance?.sourceLevel ?? String(point.level),
    mappingConfidence: point.provenance?.mappingConfidence ?? 1,
  };

  return { ...point, lang, functions, register, categories, provenance };
}

export function normalizeGrammarList(
  points: GrammarPoint[],
  module?: ModuleProvenance,
): NormalizedGrammarPoint[] {
  return points.map((p) => normalizeGrammarPoint(p, module));
}

function trusted(src: GrammarTagSource): boolean {
  return src === 'authored' || src === 'derived';
}

/** True when the record's *register* can answer a register query. */
export function hasTrustworthyRegister(point: NormalizedGrammarPoint): boolean {
  return trusted(point.provenance.registerSource);
}

/** True when the record's *categories* can answer a category query. */
export function hasTrustworthyCategories(point: NormalizedGrammarPoint): boolean {
  return trusted(point.provenance.categorySource);
}

/** Both dimensions trustworthy. Used for display badges, not for filtering. */
export function hasTrustworthyTags(point: NormalizedGrammarPoint): boolean {
  return trusted(point.provenance.tagSource);
}

/** True when a record has the content a study session or export needs. */
export function isStudyReady(point: NormalizedGrammarPoint): boolean {
  return point.provenance.verification !== 'missing';
}
