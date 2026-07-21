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
 *
 * One asymmetry took a while to see. The tables also assert *neutral* for a
 * whitelist of core connectives, which reads like padding but is not: without
 * it, "checked and found register-free" and "never looked at" are both stored
 * as `register: 'neutral'` and no filter can tell them apart. The register
 * dimension needs a way to say yes, no, *and* not-applicable — the third is
 * the honest answer for most Japanese grammar, since politeness lives on the
 * sentence-final predicate rather than on the pattern.
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
  // 謙譲 auxiliaries. させていただく is the productive humble causative and is
  // decisive on its own; ていただく alone is not listed, because plain
  // てもらう→ていただく appears throughout ordinary polite speech.
  [/させていただ|させて頂/, 'business'],
  [/お[^\s]{1,4}する$|お[^\s]{1,4}いたす|ご[^\s]{1,4}いたす|お[^\s]{1,4}申し上げ/, 'business'],
  [/でいらっしゃ|であられ|承(?:り|る|ります)|賜(?:り|る|ります)/, 'business'],
  [/存じ(?:ます|上げ|でし)|差し上げ|お伺い/, 'business'],
  [/願います|願い申し上げ|くださいませ|下さいませ/, 'business'],

  // Contracted / sentence-final casual forms
  [/ちゃう|じゃう|ちゃった|じゃった|ちゃだめ|じゃだめ/, 'casual'],
  [/なきゃ|なくちゃ/, 'casual'],
  [/じゃん|っしょ|だろ$|でしょ$/, 'casual'],
  [/ってば|っけ|だぜ|だぞ|かしら|(ん)?だもん/, 'casual'],
  // ておく / ている contractions. Anchored to the 〜 marker or a following
  // auxiliary: bare とく would match 特に and bare てる matches 立てる, 捨てる
  // and every other ichidan verb in the corpus.
  [/〜と(?:く|け|こう)$|〜ど(?:く|け|こう)$|とかない|どかない/, 'casual'],
  [/〜てる$|〜でる$|〜てた$|〜でた$|てるん|でるん/, 'casual'],
  [/んない$|んなくて|らんない/, 'casual'],
  [/ちまう|ちまった|やがる|やがって/, 'casual'],
  [/たげる|たげて|とい(?:て|で)$/, 'casual'],
  [/っこない|っぱなし(?:だ)?$/, 'casual'],
  [/(?:ん|な)?だもの$|もんか|もんね|もんな/, 'casual'],
  // 〜さ is deliberately absent: bare さ$ is the neutral nominalizer (高さ, 長さ),
  // not the casual sentence-final particle.
  [/だぜ|だわ$|のさ$|ぞ$/, 'casual'],
  /*
   * Prohibitive sentence-final な. Three constraints, each earned:
   *  - a preceding verb-ending kana, or every な-adjective (静かな, 〜なのに)
   *    matches;
   *  - end of string, or 〜なので matches;
   *  - kana/kanji only with no space, or "〜Vた + せつな" matches — 刹那 is a
   *    noun meaning "instant", and its つ satisfies the verb-ending class.
   */
  [/^[〜～]?[ぁ-んァ-ヶ一-龯]{1,6}[るくむぬぶつすぐず]な$/, 'casual'],
  [/きゃ$|きゃだめ|なくちゃだめ/, 'casual'],

  // Classical / written-only auxiliaries. Anchored to the 〜 pattern marker
  // where the bare form would collide with ordinary vocabulary.
  [/べし|べからず|んがため|ざるを得ない|ざるをえない/, 'literary'],
  [/〜ぬ$|〜まじ|〜たる$|〜べく/, 'literary'],
  [/における|をもって|ならびに|に相違ない|いかんによらず/, 'literary'],
  [/ずして|ずんば|んば$|ざる(?:べからず|所)/, 'literary'],
  [/ごとし|ごとき$|ごとく$|如し|如く$/, 'literary'],
  [/しむ(?:る|べし)?$|せしめ|あるまじき|まじき$/, 'literary'],
  // Classical 〜んとする. The lookbehind keeps out なんとしても ("by all means")
  // and ちゃんとする ("do properly"), which are ordinary modern vocabulary that
  // happens to contain the same three kana.
  [/(?<![なゃャ])んとする|(?<![なゃャ])んとして|んがために/, 'literary'],
  // ゆえ / つつ. つつある is progressive-aspect and register-neutral, so the
  // literary reading has to exclude it explicitly.
  [/ゆえ(?:に|の)?$|故に$|(?<!つ)つつ$|つつも/, 'literary'],
  [/たりとも|であれ$|であろうと|いかん(?:に|で|を)/, 'literary'],
  [/きらいがある|の至り|の極み|を余儀なく|に鑑み/, 'literary'],
  [/たる(?:もの|べき)|(?:を|に)問わず|はさておき/, 'literary'],

  /*
   * Positive neutral. Everything above says "this pattern carries register";
   * this block says "this pattern is register-free", which is a different and
   * equally useful claim — 〜ながら is the same word in 食べながら見た and
   * 食べながら見ました, because Japanese politeness rides on the sentence-final
   * predicate, not the connective.
   *
   * Without this, a core connective and a pattern nobody ever looked at are
   * both stored as 'neutral' and are indistinguishable. This is an explicit
   * whitelist rather than a catch-all for exactly that reason: a catch-all
   * would re-manufacture the "unknown dressed as a fact" bug in the one place
   * this module exists to prevent it.
   *
   * Runs last so any register-bearing rule above still wins.
   */
  // Case particles and the core connective inventory.
  [
    /^〜?(?:は|が|を|に|で|へ|と|の|も|か|ね|よ|や|から|まで|より|など|とか|だけ|しか|ばかり|ずつ|くらい|ぐらい|ほど|し|たり|ので|のに|ため|とき|なら|たら|ば|ても|でも|ながら|ながらも)(?:に|は|も|の|よ|ね)?$/,
    'neutral',
  ],
  // Tense, aspect and voice — the machinery every register shares.
  [
    /^〜?(?:ます|ません|ました|ませんでした|です|でした|ではありません|ている|ていた|てある|ておく|てしまう|ていく|てくる|たことがある|ことがある|ことができる|ようになる|ようとする|つつある)$/,
    'neutral',
  ],
  // Core te-form compounds and high-frequency N5/N4 patterns.
  [
    /^〜?(?:てから|てください|ないでください|てもいい|てもいいです|てはいけません|たい|たがる|ほしい|前に|あとで|くなる|になる|すぎる|やすい|にくい|そうです|かもしれない|でしょう|つもり|予定)$/,
    'neutral',
  ],
];

const ZH_REGISTER_RULES: Array<[RegExp, GrammarRegister]> = [
  // 书面语 markers. 之 / 者 are excluded — 之后, 或者 are everyday words.
  [/乃|亦|则|而言|加以|予以|以及|莫不|尚未/, 'literary'],
  // Classical function words. 于 is excluded standalone (关于, 对于 are
  // everyday); 其 and 此 likewise only count in fixed literary collocations.
  [/乃至|倘若|岂|未免|姑且|何苦|何妨|抑或|遂|盖因/, 'literary'],
  [/其(?:一|中之|余|次)|此(?:乃|外|时)|无异于|不至于|莫非|所谓/, 'literary'],
  [/非但|无不|不无|未尝|何以|由此可见|简直/, 'literary'],
  // colloquial sentence-final particles. 呀 / 呢 excluded as too common.
  [/呗|啦|嘛|咯|哟/, 'casual'],
  [/干嘛|咋|甭|挺.*的|.*着呢|可不/, 'casual'],
];

/**
 * Split a title into the bare patterns it actually contains.
 *
 * Titles are written for humans, not matchers: "〜は (topic particle)",
 * "〜ます / 〜ません", "い-adjectives". Stripping the parenthetical gloss and the
 * latin annotation, then splitting on the slash, turns one display string into
 * the one-or-more patterns a rule can be anchored against.
 */
function patternVariants(title: string): string[] {
  const core = title
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[A-Za-z]+/g, '')
    .trim();
  return core
    .split(/[/／・、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Derive register from the pattern's own morphology.
 * Returns null when nothing decisive matched — callers must not invent one.
 */
export function deriveRegister(
  lang: GrammarLang,
  title: string,
  structure?: string,
): GrammarRegister | null {
  /*
   * Each field is matched separately, and that is load-bearing rather than
   * tidiness. This used to test one concatenated `title + ' ' + structure`
   * string, which silently disabled every `$`-anchored rule in the tables
   * below — `だろ$` can never match when the structure column is appended
   * after it. Four of the original fourteen rules were dead on arrival for
   * exactly that reason, which is a good part of why only 17 records in the
   * whole corpus carried a non-neutral register.
   */
  const fields = [...patternVariants(title), title, structure ?? ''].filter(Boolean);
  const rules = lang === 'zh' ? ZH_REGISTER_RULES : JA_REGISTER_RULES;
  for (const [re, register] of rules) {
    for (const field of fields) {
      if (re.test(field)) return register;
    }
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
  if (point.provenance?.registerSource === 'classified' && point.register) {
    /*
     * A label from the offline LLM pass (tools/grammar-register). It sits below
     * the morphology rules on purpose — if a rule can decide the register from
     * the pattern itself, that is better evidence than a model reading the
     * gloss, so `derived` overwrites `classified` rather than the other way
     * round. Handled as its own branch instead of falling through to the
     * imported-data branch below, which would label it 'heuristic' and drag
     * the weakest-link `tagSource` down with it.
     */
    register = derived ?? point.register;
    registerSource = derived ? 'derived' : 'classified';
  } else if (point.register && module.tagSource === 'authored') {
    /*
     * An authored register wins outright, including an explicit 'neutral'.
     * This branch used to exclude 'neutral', which meant the derived-regex
     * branch below intercepted it and overrode the author — so a hand-written
     * 'neutral' on a pattern containing 亦 or 则 silently became 'literary',
     * and the comment two branches down claiming "an explicit 'neutral' from an
     * authored module is a decision, not a gap" described code that could never
     * be reached for it.
     */
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
    /*
     * `registerSource` above is already the resolved answer for a 'classified'
     * record — the branch that handled it may have upgraded it to 'derived'
     * because a morphology rule also fired. Deferring to the raw incoming value
     * here would throw that upgrade away and re-assert 'classified'.
     */
    registerSource:
      point.provenance?.registerSource === 'classified'
        ? registerSource
        : point.provenance?.registerSource ?? registerSource,
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
