// Iterative Yomitan-style Japanese de-inflection.
//
// The tokenizer's lemma (kuromoji basic_form) handles a single inflection layer,
// but heavily-stacked forms — nested causative-passives (食べさせられた),
// ～てしまう contractions (食べちゃった), progressive (飲んでいた) — need a rule
// engine that peels one suffix at a time and can compose. This is that engine.
//
// It is pure and framework-free (like sentenceBounds.ts / mining.ts) so the
// main-process dictionary lookup and any renderer caller share one implementation.
//
// Approach (Yomitan's model): each rule rewrites a kana *suffix* (`kanaIn` →
// `kanaOut`) and is gated by grammatical condition flags. `rulesIn` is the class
// of the INFLECTED form being peeled (飲んでいる is an ichidan verb, because いる
// is), `rulesOut` the class of what is left (the te-form 飲んで). A rule applies
// only when the current form's flags intersect its `rulesIn`, and stamps the
// result with `rulesOut`. Peeling proceeds breadth-first from the surface form,
// so the first time a candidate term is reached it is via the shortest chain.
//
// Besides the dictionary word types there are three intermediate states that
// are never dictionary forms — te-form (飲んで), verb 連用形 stem (飲み) and
// i-adjective stem (高) — plus a `term` flag only the surface form carries, for
// endings that cannot be followed by anything (past, polite, ば, imperative …).
// Auxiliaries peel back to the te-form state (飲んでいる → 飲んで) and the
// te-form rules take it the rest of the way (飲んで → 飲む), so every
// te-form auxiliary composes with every verb class from one pair of rules — the
// shape of Yomitan's deinflector, and what fixes the old per-class progressive
// rules that tagged いる / しまう / おく with the wrong word type.
//
// All dictionary-form candidates are returned ranked (shortest chain first) with
// the word types they were reached as; the caller picks whichever actually
// exists in the dictionary — this is what keeps 行った (行く past *and* 行う
// past) from silently resolving to only one root.

/** Grammatical condition flags. A form carries one or more after a rule tags it. */
export const WT = {
  v1: 1 << 0, // 一段 (ichidan): 食べる, 見る
  v5: 1 << 1, // 五段 (godan): 飲む, 書く, 買う
  vs: 1 << 2, // する verb
  vk: 1 << 3, // 来る verb
  vz: 1 << 4, // ずる verb: 論ずる
  adjI: 1 << 5, // い-adjective: 高い
  // Intermediate states — never a dictionary form on their own.
  te: 1 << 6, // te-form: 飲んで, 食べて
  stem: 1 << 7, // verb 連用形 stem: 飲み, 食べ (before ます / たい / ながら …)
  adjStem: 1 << 8, // i-adjective stem: 高 (before すぎる / そう)
  term: 1 << 9, // the surface form itself: endings nothing else can follow
} as const;

/** A dictionary-form word type a candidate can be reached as. */
export type WordType = 'v1' | 'v5' | 'vs' | 'vk' | 'vz' | 'adjI';

const WORD_TYPES: readonly WordType[] = ['v1', 'v5', 'vs', 'vk', 'vz', 'adjI'];

/** Flags that name a dictionary form (as opposed to an intermediate state). */
const DICT = WT.v1 | WT.v5 | WT.vs | WT.vk | WT.vz | WT.adjI;
/**
 * The surface form could be anything a reader selected: any dictionary type,
 * a te-form, or a terminal ending. It is never a bare stem — 食べ / 飲み on their
 * own are nouns or fragments, and treating every surface as a stem would make
 * every word grow a spurious ～る candidate.
 */
const SURFACE = DICT | WT.te | WT.term;
/** Intermediate states, which may be a single kana (見 + すぎる) but never a result. */
const INTERMEDIATE = WT.te | WT.stem | WT.adjStem;

interface Rule {
  kanaIn: string;
  kanaOut: string;
  rulesIn: number;
  rulesOut: number;
  reason: string;
  /**
   * A bookkeeping step (te-form / stem → verb) adds no reason when it finishes a
   * chain an auxiliary started: 飲んでいた reads "progressive · past", not
   * "-te · progressive · past". At the surface the step is the whole story
   * (飲んで → "-te"), so there it does add its reason.
   */
  silentAfterAux?: boolean;
}

// ----- Godan (五段) conjugation columns ---------------------------------------
// Keyed by the dictionary (終止形) ending. A godan verb inflects by shifting that
// final mora across the あ/い/え/お rows; past & te use 音便 (sound-change) forms.

// These tables are exported so `conjugate.ts` can build the *forward* direction
// from the same data this file peels backwards. One source of truth: a fix to a
// row or an 音便 suffix corrects deinflection and conjugation together, and the
// round-trip test in conjugate.test.ts would catch them drifting apart.
export const DICT_ENDINGS = ['う', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る'] as const;
export type DictEnding = (typeof DICT_ENDINGS)[number];

// 未然形 (a-row): base for negative / passive / causative.
export const ROW_A: Record<DictEnding, string> = {
  う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら',
};
// 連用形 (i-row): base for polite ます / -tai / -sugiru.
export const ROW_I: Record<DictEnding, string> = {
  う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り',
};
// 仮定形 / 命令形 / 可能 (e-row).
export const ROW_E: Record<DictEnding, string> = {
  う: 'え', く: 'け', ぐ: 'げ', す: 'せ', つ: 'て', ぬ: 'ね', ぶ: 'べ', む: 'め', る: 'れ',
};
// 意向形 (o-row) — followed by う: 飲もう.
export const ROW_O: Record<DictEnding, string> = {
  う: 'お', く: 'こ', ぐ: 'ご', す: 'そ', つ: 'と', ぬ: 'の', ぶ: 'ぼ', む: 'も', る: 'ろ',
};
// 音便 past (た/だ) suffixes.
export const PAST: Record<DictEnding, string> = {
  う: 'った', つ: 'った', る: 'った', く: 'いた', ぐ: 'いだ', す: 'した', ぬ: 'んだ', ぶ: 'んだ', む: 'んだ',
};
// 音便 te-form (て/で) suffixes.
export const TE: Record<DictEnding, string> = {
  う: 'って', つ: 'って', る: 'って', く: 'いて', ぐ: 'いで', す: 'して', ぬ: 'んで', ぶ: 'んで', む: 'んで',
};

const RULES: Rule[] = [];

function add(
  reason: string,
  kanaIn: string,
  kanaOut: string,
  rulesIn: number,
  rulesOut: number,
  silentAfterAux = false,
): void {
  RULES.push({ reason, kanaIn, kanaOut, rulesIn, rulesOut, ...(silentAfterAux ? { silentAfterAux } : {}) });
}

/**
 * Register a godan family: for every dictionary ending, map `stem(end)+suffix`
 * back to that ending. e.g. negative → 飲まない (まない) → 飲む (む).
 */
function addGodan(
  reason: string,
  stem: Record<DictEnding, string>,
  suffix: string,
  rulesIn: number,
  rulesOut: number,
): void {
  for (const end of DICT_ENDINGS) add(reason, stem[end] + suffix, end, rulesIn, rulesOut);
}

/**
 * Register a 来る rule in both spellings: kana (こない → くる) and kanji
 * (来ない → 来る). `kanaIn` starts with the kana stem (こ / き / く), which the
 * kanji spelling replaces with 来.
 */
function addKuru(reason: string, kanaIn: string, rulesIn: number, rulesOut = WT.vk, silentAfterAux = false): void {
  add(reason, kanaIn, 'くる', rulesIn, rulesOut, silentAfterAux);
  add(reason, `来${kanaIn.slice(1)}`, '来る', rulesIn, rulesOut, silentAfterAux);
}

/**
 * Register an i-adjective rule, plus いい's suppletive forms, which conjugate
 * from よい (よかった / よくない → いい as well as よい).
 */
function addAdj(reason: string, kanaIn: string, rulesIn: number, rulesOut = WT.adjI): void {
  add(reason, kanaIn, 'い', rulesIn, rulesOut);
  add(reason, `よ${kanaIn}`, 'いい', rulesIn, rulesOut);
}

// ----- Bookkeeping: te-form and stems → dictionary form ------------------------

// Te-form (て / で). An auxiliary (ている, てしまう, ちゃう …) peels back to this
// state; at the surface the te-form is itself the reading ("-te").
const TE_REASON = '-te';
add(TE_REASON, 'て', 'る', WT.te, WT.v1, true); // 食べて → 食べる
for (const end of DICT_ENDINGS) add(TE_REASON, TE[end], end, WT.te, WT.v5, true); // 飲んで → 飲む
add(TE_REASON, 'いって', 'いく', WT.te, WT.v5, true); // 行って (irregular 音便) → 行く
add(TE_REASON, '行って', '行く', WT.te, WT.v5, true); // …and the kanji spelling, which is the common one
add(TE_REASON, 'して', 'する', WT.te, WT.vs, true);
addKuru(TE_REASON, 'きて', WT.te, WT.vk, true);
add(TE_REASON, 'くて', 'い', WT.te, WT.adjI, true); // 高くて → 高い
add(TE_REASON, 'よくて', 'いい', WT.te, WT.adjI, true);
add(TE_REASON, 'ないで', 'ない', WT.te, WT.adjI, true); // 食べないで → 食べない (→ 食べる)

// 連用形 stem → dictionary form. Silent: the suffix that exposed the stem (ます,
// たい, ながら …) carries the reason. Never applies at the surface (see SURFACE).
add('', '', 'る', WT.stem, WT.v1, true); // 食べ → 食べる
for (const end of DICT_ENDINGS) add('', ROW_I[end], end, WT.stem, WT.v5, true); // 飲み → 飲む
add('', 'し', 'する', WT.stem, WT.vs, true);
addKuru('', 'き', WT.stem, WT.vk, true);
// Honorific godan verbs whose 連用形 ends い, not り: いらっしゃいます, なさいます, ください.
add('', 'しゃい', 'しゃる', WT.stem, WT.v5, true);
add('', 'さい', 'さる', WT.stem, WT.v5, true);
// i-adjective stem → dictionary form: 高 (すぎる / そう) → 高い.
add('', '', 'い', WT.adjStem, WT.adjI, true);

// ----- Terminal endings (only on the surface form) ----------------------------

// Polite (ます and its inflections) → 連用形 stem. Kept as complete suffixes:
// "polite past" reads better for a learner than a two-hop ます → た chain.
const POLITE: ReadonlyArray<readonly [reason: string, suffix: string]> = [
  ['polite', 'ます'],
  ['polite negative', 'ません'],
  ['polite past', 'ました'],
  ['polite past negative', 'ませんでした'],
  ['polite volitional', 'ましょう'],
  ['polite', 'まして'],
];
for (const [reason, suf] of POLITE) add(reason, suf, '', WT.term, WT.stem);

// Past (た / だ). Terminal: たら / たり are their own rules below.
add('past', 'た', 'る', WT.term, WT.v1); // 食べた → 食べる
for (const end of DICT_ENDINGS) add('past', PAST[end], end, WT.term, WT.v5); // 飲んだ / 書いた / 買った …
add('past', 'いった', 'いく', WT.term, WT.v5); // 行った (irregular 音便) → 行く
add('past', '行った', '行く', WT.term, WT.v5); // …and the kanji spelling
add('past', 'した', 'する', WT.term, WT.vs); // した → する (also godan す; both returned)
addKuru('past', 'きた', WT.term);
addAdj('past', 'かった', WT.term); // 高かった → 高い

// Conditional (たら) — attaches to the 音便 past stem.
const TARA = 'conditional (–たら)';
add(TARA, 'たら', 'る', WT.term, WT.v1);
for (const end of DICT_ENDINGS) add(TARA, `${PAST[end]}ら`, end, WT.term, WT.v5);
add(TARA, 'いったら', 'いく', WT.term, WT.v5);
add(TARA, '行ったら', '行く', WT.term, WT.v5);
add(TARA, 'したら', 'する', WT.term, WT.vs);
addKuru(TARA, 'きたら', WT.term);
addAdj(TARA, 'かったら', WT.term);

// Representative (たり).
const TARI = '–たり';
add(TARI, 'たり', 'る', WT.term, WT.v1);
for (const end of DICT_ENDINGS) add(TARI, `${PAST[end]}り`, end, WT.term, WT.v5);
add(TARI, 'いったり', 'いく', WT.term, WT.v5);
add(TARI, '行ったり', '行く', WT.term, WT.v5);
add(TARI, 'したり', 'する', WT.term, WT.vs);
addKuru(TARI, 'きたり', WT.term);
addAdj(TARI, 'かったり', WT.term);

// Provisional conditional (ば), and colloquial なきゃ (= なければ).
const BA = 'conditional (–ば)';
add(BA, 'れば', 'る', WT.term, WT.v1); // 食べれば → 食べる
addGodan(BA, ROW_E, 'ば', WT.term, WT.v5); // 飲めば → 飲む
add(BA, 'すれば', 'する', WT.term, WT.vs);
addKuru(BA, 'くれば', WT.term);
addAdj(BA, 'ければ', WT.term); // 高ければ → 高い
addAdj(BA, 'きゃ', WT.term); // 食べなきゃ → 食べない

// Conditional (なら) after the plain form: 食べるなら → 食べる.
const NARA = 'conditional (–なら)';
add(NARA, 'るなら', 'る', WT.term, WT.v1);
for (const end of DICT_ENDINGS) add(NARA, `${end}なら`, end, WT.term, WT.v5);
add(NARA, 'するなら', 'する', WT.term, WT.vs);
addKuru(NARA, 'くるなら', WT.term);
add(NARA, 'いなら', 'い', WT.term, WT.adjI);

// Volitional (よう / おう).
add('volitional', 'よう', 'る', WT.term, WT.v1); // 食べよう → 食べる
addGodan('volitional', ROW_O, 'う', WT.term, WT.v5); // 飲もう → 飲む
add('volitional', 'しよう', 'する', WT.term, WT.vs);
addKuru('volitional', 'こよう', WT.term);
addAdj('volitional', 'かろう', WT.term); // 高かろう → 高い

// Imperative (命令形).
add('imperative', 'ろ', 'る', WT.term, WT.v1); // 食べろ → 食べる
add('imperative', 'よ', 'る', WT.term, WT.v1); // 食べよ → 食べる
addGodan('imperative', ROW_E, '', WT.term, WT.v5); // 飲め → 飲む
add('imperative', 'しろ', 'する', WT.term, WT.vs);
add('imperative', 'せよ', 'する', WT.term, WT.vs);
// The kanji spelling needs its own rule: 来い does not match the ichidan
// imperative (ろ), and the kana rule only fires on こい.
addKuru('imperative', 'こい', WT.term);
// Polite imperative (なさい) → 連用形 stem: 食べなさい → 食べる.
add('–なさい', 'なさい', '', WT.term, WT.stem);

// Classical / written negative (ず, ずに, ぬ) on the 未然形.
for (const [reason, suf] of [['–ず', 'ず'], ['–ず', 'ずに'], ['negative', 'ぬ']] as const) {
  add(reason, suf, 'る', WT.term, WT.v1); // 食べず → 食べる
  addGodan(reason, ROW_A, suf, WT.term, WT.v5); // 言わずに → 言う
  add(reason, `せ${suf}`, 'する', WT.term, WT.vs); // せずに → する
  addKuru(reason, `こ${suf}`, WT.term);
}

// 連用形 + ながら (while …) → stem.
add('–ながら', 'ながら', '', WT.term, WT.stem);

// Appearance (そう): verb stem or adjective stem. いい and ない take さ: よさそう / なさそう.
add('–そう', 'そう', '', WT.term, WT.stem | WT.adjStem);
add('–そう', 'よさそう', 'よい', WT.term, WT.adjI);
add('–そう', 'よさそう', 'いい', WT.term, WT.adjI);
add('–そう', 'なさそう', 'ない', WT.term, WT.adjI);

// Adverbial (く) and nominal (さ) for い-adjectives: 高く / 高さ → 高い.
addAdj('adverbial', 'く', WT.term);
addAdj('noun (–さ)', 'さ', WT.term);

// ----- Inflecting endings (the result conjugates further) ----------------------

// Negative (ない). The ない form conjugates as an い-adjective, so rulesIn = adjI
// lets 食べなかった / 食べなくて reach it first (they leave an adjI-tagged ない form).
add('negative', 'ない', 'る', WT.adjI, WT.v1); // 食べない → 食べる
addGodan('negative', ROW_A, 'ない', WT.adjI, WT.v5); // 飲まない → 飲む
add('negative', 'しない', 'する', WT.adjI, WT.vs);
addKuru('negative', 'こない', WT.adjI);
addAdj('negative', 'くない', WT.adjI); // 高くない → 高い

// Desiderative (たい) — the たい form is an い-adjective; たがる is godan.
add('–たい', 'たい', '', WT.adjI, WT.stem); // 食べたい → 食べ → 食べる
add('–たがる', 'たがる', '', WT.v5, WT.stem); // 食べたがる → 食べる

// Excessive (すぎる) — 連用形 or adjective stem + すぎる (an ichidan verb).
add('–すぎる', 'すぎる', '', WT.v1, WT.stem | WT.adjStem); // 食べすぎる / 高すぎる
add('–すぎる', '過ぎる', '', WT.v1, WT.stem | WT.adjStem);
add('–すぎる', 'なさすぎる', 'ない', WT.v1, WT.adjI);
add('–すぎる', 'よすぎる', 'いい', WT.v1, WT.adjI);

// Causative (させる / せる) — the causative form is always ichidan (v1).
add('causative', 'させる', 'る', WT.v1, WT.v1); // 食べさせる → 食べる
addGodan('causative', ROW_A, 'せる', WT.v1, WT.v5); // 飲ませる → 飲む
add('causative', 'させる', 'する', WT.v1, WT.vs); // させる → する
addKuru('causative', 'こさせる', WT.v1);
// Short causative (さす / す) — result conjugates as godan.
add('causative', 'さす', 'る', WT.v5, WT.v1); // 食べさす → 食べる
addGodan('causative', ROW_A, 'す', WT.v5, WT.v5); // 飲ます → 飲む
add('causative', 'さす', 'する', WT.v5, WT.vs);

// Passive / potential (られる / れる). v1 られる is genuinely ambiguous between
// the two; one label covers both.
add('passive/potential', 'られる', 'る', WT.v1, WT.v1); // 食べられる → 食べる
addGodan('passive', ROW_A, 'れる', WT.v1, WT.v5); // 飲まれる → 飲む
add('passive', 'される', 'する', WT.v1, WT.vs);
addKuru('passive/potential', 'こられる', WT.v1);

// Potential (godan え-row + る; する→できる is suppletive; ら抜き 食べれる / これる).
addGodan('potential', ROW_E, 'る', WT.v1, WT.v5); // 飲める → 飲む
add('potential', 'できる', 'する', WT.v1, WT.vs); // できる → する
add('potential', 'れる', 'る', WT.v1, WT.v1); // 食べれる (ら抜き) → 食べる
addKuru('potential', 'これる', WT.v1);

// ----- te-form auxiliaries → te-form state ------------------------------------
// Each pair covers て and で (飲んでいる / 食べている). `rulesIn` is the class of
// the auxiliary itself: いる / みる are ichidan, ある / おく / しまう / いく are
// godan, くる is 来る. This is the tagging the old per-class rules got wrong.

function addTeAux(reason: string, aux: string, rulesIn: number): void {
  add(reason, `て${aux}`, 'て', rulesIn, WT.te);
  add(reason, `で${aux}`, 'で', rulesIn, WT.te);
}

const PROGRESSIVE = 'progressive (–ている)';
addTeAux(PROGRESSIVE, 'いる', WT.v1); // 飲んでいる → 飲んで
addTeAux(PROGRESSIVE, 'る', WT.v1); // contracted 飲んでる / 食べてる
addTeAux('–てある', 'ある', WT.v5); // 書いてある
addTeAux('–ておく', 'おく', WT.v5); // 買っておく
add('–ておく', 'とく', 'て', WT.v5, WT.te); // contracted 買っとく
add('–ておく', 'どく', 'で', WT.v5, WT.te); // 読んどく
addTeAux('completion (–てしまう)', 'しまう', WT.v5); // 食べてしまう
add('completion (–ちゃう)', 'ちゃう', 'て', WT.v5, WT.te); // 食べちゃう
add('completion (–ちゃう)', 'じゃう', 'で', WT.v5, WT.te); // 飲んじゃう
add('completion (–ちゃう)', 'ちまう', 'て', WT.v5, WT.te); // 食べちまう
add('completion (–ちゃう)', 'じまう', 'で', WT.v5, WT.te);
addTeAux('–てみる', 'みる', WT.v1); // 食べてみる
addTeAux('–てくる', 'くる', WT.vk); // 持ってくる
addTeAux('–てくる', '来る', WT.vk);
addTeAux('–ていく', 'いく', WT.v5); // 持っていく
addTeAux('–ていく', '行く', WT.v5);

// ----- Engine -----------------------------------------------------------------

export interface Deinflection {
  /** Candidate dictionary form. */
  term: string;
  /**
   * Conjugation reasons, inner (closest to the stem) → outer (surface suffix).
   * e.g. 食べさせられた → 食べる carries ['causative', 'passive/potential', 'past'].
   */
  reasons: string[];
  /**
   * The word types this candidate was reached as (e.g. ['v5'] for 飲んでいた →
   * 飲む), so a caller can check them against a dictionary entry's part of
   * speech the way Yomitan does. Absent on the surface form itself, which may
   * be any kind of word.
   */
  wordTypes?: WordType[];
}

const MAX_DEPTH = 10;

function wordTypesOf(flags: number): WordType[] {
  return WORD_TYPES.filter((type) => (flags & WT[type]) !== 0);
}

/**
 * All plausible dictionary forms of `surface`, ranked shortest-chain first.
 * The first element is always the surface form itself (empty reasons), so a
 * caller can treat "exact match" and "deinflected match" uniformly. Every other
 * element is a dictionary form (never an intermediate te-form or stem).
 */
export function deinflect(surface: string): Deinflection[] {
  const term = surface.normalize('NFC');
  const out: Array<{ term: string; flags: number; reasons: string[]; depth: number }> = [];
  const seen = new Set<string>();
  // BFS by chain length: the first time a (term|flags) state is dequeued it is
  // via the shortest path, so pushing results in dequeue order yields the ranking.
  const queue: Array<{ term: string; flags: number; reasons: string[]; depth: number }> = [
    { term, flags: SURFACE, reasons: [], depth: 0 },
  ];
  seen.add(`${term}\x01${SURFACE}`);

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (node.depth === 0 || (node.flags & DICT) !== 0) out.push(node);
    if (node.depth >= MAX_DEPTH) continue;

    for (const rule of RULES) {
      if ((node.flags & rule.rulesIn) === 0) continue;
      if (!node.term.endsWith(rule.kanaIn)) continue;
      const base = node.term.slice(0, node.term.length - rule.kanaIn.length) + rule.kanaOut;
      // No Japanese verb or i-adjective dictionary form is a single character, so
      // a 1-char result is always noise (e.g. looking up bare "た" → "る"). This
      // still lets whole-word suppletive rules through — しない → する, こない → くる.
      // An intermediate stem may be one kana (見すぎる → 見 → 見る), never empty.
      if (base.length === 0) continue;
      if (base.length < 2 && (rule.rulesOut & INTERMEDIATE) === 0) continue;
      const key = `${base}\x01${rule.rulesOut}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Peeling goes outer→inner, so append: the rule just peeled is the
      // outermost suffix and belongs last once the chain is flipped for display.
      const silent = !rule.reason || (rule.silentAfterAux && node.depth > 0);
      queue.push({
        term: base,
        flags: rule.rulesOut,
        reasons: silent ? node.reasons : [...node.reasons, rule.reason],
        depth: node.depth + 1,
      });
    }
  }

  // Dedupe by term (BFS already ordered shortest-chain first) and flip each chain
  // to inner→outer so it reads the way the suffixes stack on the stem. A term
  // reached by several chains (来た: ichidan-shaped past and 来る past) keeps the
  // shortest chain's reasons and the union of the word types it was reached as.
  const byTerm = new Map<string, { term: string; reasons: string[]; flags: number; surface: boolean }>();
  for (const node of out) {
    const prev = byTerm.get(node.term);
    if (prev) {
      if (!prev.surface) prev.flags |= node.flags & DICT;
      continue;
    }
    byTerm.set(node.term, {
      term: node.term,
      reasons: [...node.reasons].reverse(),
      flags: node.flags & DICT,
      surface: node.depth === 0,
    });
  }
  return [...byTerm.values()].map((d) =>
    d.surface ? { term: d.term, reasons: d.reasons } : { term: d.term, reasons: d.reasons, wordTypes: wordTypesOf(d.flags) },
  );
}

// ----- Part-of-speech validation ----------------------------------------------

/**
 * JMdict part-of-speech tags that name a word which does not conjugate the way
 * any candidate word type does. `vt` / `vi` (transitivity) are qualifiers, but
 * they only ever sit next to a verb tag, so counting them as "known" is safe.
 */
const NON_CONJUGATING_POS = new Set([
  'n', 'n-adv', 'n-t', 'n-suf', 'n-pref', 'n-pr', 'pn', 'adv', 'adv-to', 'adj-na', 'adj-no', 'adj-pn',
  'adj-t', 'adj-f', 'prt', 'int', 'conj', 'ctr', 'num', 'pref', 'suf', 'cop', 'unc', 'vt', 'vi',
]);

/** The candidate word type a JMdict POS tag names, 'other' for a known non-match, null when unknown. */
function wordTypeOfPos(tag: string): WordType | 'other' | null {
  const t = tag.trim().toLowerCase();
  if (/^v1(?:-|$)/.test(t)) return 'v1'; // v1, v1-s (くれる)
  if (/^v5/.test(t)) return 'v5'; // v5r, v5k-s (行く), v5r-i (ある), v5aru (いらっしゃる), v5u-s …
  if (/^vs(?:-|$)/.test(t)) return 'vs'; // vs, vs-i (する), vs-s, vs-c
  if (t === 'vk') return 'vk';
  if (t === 'vz') return 'vz';
  if (/^adj-ix?$/.test(t)) return 'adjI'; // adj-i, adj-ix (いい / よい)
  return NON_CONJUGATING_POS.has(t) ? 'other' : null;
}

/**
 * Whether a dictionary entry with these part-of-speech tags can be the word a
 * de-inflected candidate was reached as — Yomitan's part-of-speech check. まず
 * peels to まる ("ichidan ず-negative"), and まる (丸) is a noun, so it is not
 * the word; 帰った peels to 帰る as godan, so the ichidan 帰る (if a dictionary
 * had one) is not either.
 *
 * Lenient where it cannot tell: no tags, or only tags it does not recognise
 * (another dictionary's own vocabulary), keeps the entry. Only an entry whose
 * recognised tags all disagree with the candidate's word types is rejected.
 * A candidate without word types (the surface form itself) matches anything.
 */
export function posMatchesWordTypes(pos: readonly string[], wordTypes: readonly WordType[] | undefined): boolean {
  if (!wordTypes?.length) return true;
  let recognised = false;
  for (const tag of pos) {
    const type = wordTypeOfPos(tag);
    if (type === null) continue;
    if (type !== 'other' && wordTypes.includes(type)) return true;
    recognised = true;
  }
  return !recognised;
}

/**
 * Human-readable chain for the popup: inner→outer reasons joined with " · ".
 * e.g. deinflect('食べさせられた') → "causative · passive/potential · past".
 */
export function describeReasons(reasons: string[]): string {
  return reasons.join(' · ');
}
