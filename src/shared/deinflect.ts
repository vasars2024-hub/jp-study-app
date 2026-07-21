// Iterative Yomitan-style Japanese de-inflection.
//
// The tokenizer's lemma (kuromoji basic_form) handles a single inflection layer,
// but heavily-stacked forms — nested causative-passives (食べさせられた),
// ～てしまう contractions (食べちゃった), progressive (飲んでいる) — need a rule
// engine that peels one suffix at a time and can compose. This is that engine.
//
// It is pure and framework-free (like sentenceBounds.ts / mining.ts) so the
// main-process dictionary lookup and any renderer caller share one implementation.
//
// Approach (Yomichan's model): each rule rewrites a kana *suffix* (`kanaIn` →
// `kanaOut`) and is gated by grammatical word-type flags — a rule only applies to
// a form whose current flags intersect its `rulesIn`, and it stamps the result
// with `rulesOut`. Peeling proceeds breadth-first from the surface form, so the
// first time a candidate term is reached it is via the shortest conjugation
// chain. All candidates are returned ranked (shortest chain first); the caller
// picks whichever actually exists in the dictionary — this is what keeps 行った
// (行く past *and* 行う past) from silently resolving to only one root.

/** Grammatical word-type flags. A form carries one or more after a rule tags it. */
export const WT = {
  v1: 1 << 0, // 一段 (ichidan): 食べる, 見る
  v5: 1 << 1, // 五段 (godan): 飲む, 書く, 買う
  vs: 1 << 2, // する verb
  vk: 1 << 3, // 来る verb
  vz: 1 << 4, // ずる verb: 論ずる
  adjI: 1 << 5, // い-adjective: 高い
} as const;

/** "Compatible with any word type" — the surface form starts here so the first rule can be anything. */
const ALL = WT.v1 | WT.v5 | WT.vs | WT.vk | WT.vz | WT.adjI;

interface Rule {
  kanaIn: string;
  kanaOut: string;
  rulesIn: number;
  rulesOut: number;
  reason: string;
}

// ----- Godan (五段) conjugation columns ---------------------------------------
// Keyed by the dictionary (終止形) ending. A godan verb inflects by shifting that
// final mora across the あ/い/え/お rows; past & te use 音便 (sound-change) forms.

const DICT_ENDINGS = ['う', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る'] as const;
type DictEnding = (typeof DICT_ENDINGS)[number];

// 未然形 (a-row): base for negative / passive / causative.
const ROW_A: Record<DictEnding, string> = {
  う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら',
};
// 連用形 (i-row): base for polite ます / -tai / -sugiru.
const ROW_I: Record<DictEnding, string> = {
  う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り',
};
// 仮定形 / 命令形 / 可能 (e-row).
const ROW_E: Record<DictEnding, string> = {
  う: 'え', く: 'け', ぐ: 'げ', す: 'せ', つ: 'て', ぬ: 'ね', ぶ: 'べ', む: 'め', る: 'れ',
};
// 意向形 (o-row) — followed by う: 飲もう.
const ROW_O: Record<DictEnding, string> = {
  う: 'お', く: 'こ', ぐ: 'ご', す: 'そ', つ: 'と', ぬ: 'の', ぶ: 'ぼ', む: 'も', る: 'ろ',
};
// 音便 past (た/だ) suffixes.
const PAST: Record<DictEnding, string> = {
  う: 'った', つ: 'った', る: 'った', く: 'いた', ぐ: 'いだ', す: 'した', ぬ: 'んだ', ぶ: 'んだ', む: 'んだ',
};
// 音便 te-form (て/で) suffixes.
const TE: Record<DictEnding, string> = {
  う: 'って', つ: 'って', る: 'って', く: 'いて', ぐ: 'いで', す: 'して', ぬ: 'んで', ぶ: 'んで', む: 'んで',
};

const RULES: Rule[] = [];

function add(reason: string, kanaIn: string, kanaOut: string, rulesIn: number, rulesOut: number): void {
  RULES.push({ reason, kanaIn, kanaOut, rulesIn, rulesOut });
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

/** Register a godan family whose full suffix already includes the stem (past/te 音便). */
function addGodanFull(
  reason: string,
  suffixByEnding: Record<DictEnding, string>,
  rulesIn: number,
  rulesOut: number,
): void {
  for (const end of DICT_ENDINGS) add(reason, suffixByEnding[end], end, rulesIn, rulesOut);
}

// ----- Reasons ----------------------------------------------------------------

// Polite (ます and its inflections). Handled as complete suffixes straight to the
// dictionary form: reads better for a learner ("polite past") than a two-hop
// chain, and avoids needing a separate masu-stem word type.
const POLITE: ReadonlyArray<readonly [reason: string, suffix: string]> = [
  ['polite', 'ます'],
  ['polite negative', 'ません'],
  ['polite past', 'ました'],
  ['polite past negative', 'ませんでした'],
  ['polite volitional', 'ましょう'],
  ['polite', 'まして'],
];
for (const [reason, suf] of POLITE) {
  add(reason, suf, 'る', WT.v1, WT.v1); // 食べます → 食べる
  addGodan(reason, ROW_I, suf, WT.v5, WT.v5); // 飲みます → 飲む
  add(reason, `し${suf}`, 'する', WT.vs, WT.vs); // します → する
  add(reason, `き${suf}`, 'くる', WT.vk, WT.vk); // きます → くる
}

// Negative (ない). The ない form conjugates as an い-adjective, so rulesIn = adjI
// lets 食べなかった / 食べなくて reach it first (they leave an adjI-tagged ない form).
add('negative', 'ない', 'る', WT.adjI, WT.v1); // 食べない → 食べる
addGodan('negative', ROW_A, 'ない', WT.adjI, WT.v5); // 飲まない → 飲む
add('negative', 'しない', 'する', WT.adjI, WT.vs);
add('negative', 'こない', 'くる', WT.adjI, WT.vk);
add('negative', 'くない', 'い', WT.adjI, WT.adjI); // 高くない → 高い

// Past (た / だ).
add('past', 'た', 'る', WT.v1, WT.v1); // 食べた → 食べる
addGodanFull('past', PAST, WT.v5, WT.v5); // 飲んだ / 書いた / 買った …
add('past', 'いった', 'いく', WT.v5, WT.v5); // 行った (irregular 音便) → 行く
add('past', 'した', 'する', WT.vs, WT.vs); // した → する (also godan す; both returned)
add('past', 'きた', 'くる', WT.vk, WT.vk);
add('past', 'かった', 'い', WT.adjI, WT.adjI); // 高かった → 高い

// Te-form (て / で).
add('-te', 'て', 'る', WT.v1, WT.v1);
addGodanFull('-te', TE, WT.v5, WT.v5);
add('-te', 'いって', 'いく', WT.v5, WT.v5); // 行って → 行く
add('-te', 'して', 'する', WT.vs, WT.vs);
add('-te', 'きて', 'くる', WT.vk, WT.vk);
add('-te', 'くて', 'い', WT.adjI, WT.adjI); // 高くて → 高い

// Causative (させる / せる) — the causative form is always ichidan (v1).
add('causative', 'させる', 'る', WT.v1, WT.v1); // 食べさせる → 食べる
addGodan('causative', ROW_A, 'せる', WT.v1, WT.v5); // 飲ませる → 飲む
add('causative', 'させる', 'する', WT.v1, WT.vs); // させる → する
add('causative', 'こさせる', 'くる', WT.v1, WT.vk);
// Short causative (さす / す) — result conjugates as godan.
add('causative', 'さす', 'る', WT.v5, WT.v1); // 食べさす → 食べる
addGodan('causative', ROW_A, 'す', WT.v5, WT.v5); // 飲ます → 飲む

// Passive / potential (られる / れる). v1 られる is genuinely ambiguous between
// the two; one label covers both.
add('passive/potential', 'られる', 'る', WT.v1, WT.v1); // 食べられる → 食べる
addGodan('passive', ROW_A, 'れる', WT.v1, WT.v5); // 飲まれる → 飲む
add('passive', 'される', 'する', WT.v1, WT.vs);
add('passive/potential', 'こられる', 'くる', WT.v1, WT.vk);

// Potential (godan え-row + る; する→できる is suppletive; ら抜き これる).
addGodan('potential', ROW_E, 'る', WT.v1, WT.v5); // 飲める → 飲む
add('potential', 'できる', 'する', WT.v1, WT.vs); // できる → する
add('potential', 'これる', 'くる', WT.v1, WT.vk);

// Volitional (よう / おう).
add('volitional', 'よう', 'る', WT.v1, WT.v1); // 食べよう → 食べる
addGodan('volitional', ROW_O, 'う', WT.v5, WT.v5); // 飲もう → 飲む
add('volitional', 'しよう', 'する', WT.vs, WT.vs);
add('volitional', 'こよう', 'くる', WT.vk, WT.vk);

// Imperative (命令形).
add('imperative', 'ろ', 'る', WT.v1, WT.v1); // 食べろ → 食べる
add('imperative', 'よ', 'る', WT.v1, WT.v1); // 食べよ → 食べる
addGodan('imperative', ROW_E, '', WT.v5, WT.v5); // 飲め → 飲む
add('imperative', 'しろ', 'する', WT.vs, WT.vs);
add('imperative', 'せよ', 'する', WT.vs, WT.vs);
add('imperative', 'こい', 'くる', WT.vk, WT.vk);

// Provisional conditional (ば).
add('conditional (–ば)', 'れば', 'る', WT.v1, WT.v1); // 食べれば → 食べる
addGodan('conditional (–ば)', ROW_E, 'ば', WT.v5, WT.v5); // 飲めば → 飲む
add('conditional (–ば)', 'すれば', 'する', WT.vs, WT.vs);
add('conditional (–ば)', 'くれば', 'くる', WT.vk, WT.vk);
add('conditional (–ば)', 'ければ', 'い', WT.adjI, WT.adjI); // 高ければ → 高い

// Conditional (たら) — attaches to the 音便 past stem.
add('conditional (–たら)', 'たら', 'る', WT.v1, WT.v1); // 食べたら → 食べる
for (const end of DICT_ENDINGS) add('conditional (–たら)', PAST[end] + 'ら', end, WT.v5, WT.v5);
add('conditional (–たら)', 'いったら', 'いく', WT.v5, WT.v5);
add('conditional (–たら)', 'したら', 'する', WT.vs, WT.vs);
add('conditional (–たら)', 'きたら', 'くる', WT.vk, WT.vk);
add('conditional (–たら)', 'かったら', 'い', WT.adjI, WT.adjI);

// Representative (たり).
add('–たり', 'たり', 'る', WT.v1, WT.v1);
for (const end of DICT_ENDINGS) add('–たり', PAST[end] + 'り', end, WT.v5, WT.v5);
add('–たり', 'かったり', 'い', WT.adjI, WT.adjI);

// Desiderative (たい) — attaches to 連用形; the たい form is an い-adjective.
add('–たい', 'たい', 'る', WT.adjI, WT.v1); // 食べたい → 食べる
addGodan('–たい', ROW_I, 'たい', WT.adjI, WT.v5); // 飲みたい → 飲む
add('–たい', 'したい', 'する', WT.adjI, WT.vs);
add('–たい', 'きたい', 'くる', WT.adjI, WT.vk);

// Excessive (すぎる) — 連用形 + すぎる (an ichidan verb).
add('–すぎる', 'すぎる', 'る', WT.v1, WT.v1); // 食べすぎる → 食べる
addGodan('–すぎる', ROW_I, 'すぎる', WT.v1, WT.v5); // 飲みすぎる → 飲む
add('–すぎる', 'しすぎる', 'する', WT.v1, WT.vs);
add('–すぎる', 'すぎる', 'い', WT.v1, WT.adjI); // 高すぎる → 高い (i-adj drops final い)

// Adverbial (く) for い-adjectives: 高く → 高い.
add('adverbial', 'く', 'い', WT.adjI, WT.adjI);

// Progressive / resultative (ている / てる, contracted). Built from the te-form
// 音便 stems: 飲んでいる → 飲む, 食べてる → 食べる.
add('progressive (–ている)', 'ている', 'る', WT.v1, WT.v1);
add('progressive (–ている)', 'てる', 'る', WT.v1, WT.v1);
for (const end of DICT_ENDINGS) {
  // TE[end] already ends て or で; ている = TE + いる, contracted てる = TE + る.
  add('progressive (–ている)', TE[end] + 'いる', end, WT.v5, WT.v5); // 飲んでいる → 飲む
  add('progressive (–ている)', TE[end] + 'る', end, WT.v5, WT.v5); // 飲んでる → 飲む
}
add('progressive (–ている)', 'している', 'する', WT.vs, WT.vs);
add('progressive (–ている)', 'してる', 'する', WT.vs, WT.vs);
add('progressive (–ている)', 'きている', 'くる', WT.vk, WT.vk);
add('progressive (–ている)', 'きてる', 'くる', WT.vk, WT.vk);

// Completion (てしまう) and its contractions ちゃう / じゃう.
add('completion (–てしまう)', 'てしまう', 'る', WT.v1, WT.v1);
for (const end of DICT_ENDINGS) add('completion (–てしまう)', TE[end] + 'しまう', end, WT.v5, WT.v5);
add('completion (–てしまう)', 'してしまう', 'する', WT.vs, WT.vs);
add('completion (–てしまう)', 'きてしまう', 'くる', WT.vk, WT.vk);
// ちゃう / じゃう contraction — the contracted form itself conjugates as godan
// (食べちゃった), so rulesIn = v5 lets that reach it.
add('completion (–ちゃう)', 'ちゃう', 'る', WT.v5, WT.v1); // 食べちゃう → 食べる
for (const end of DICT_ENDINGS) {
  const chau = TE[end].replace(/て$/, 'ちゃ').replace(/で$/, 'じゃ') + 'う';
  add('completion (–ちゃう)', chau, end, WT.v5, WT.v5); // 飲んじゃう → 飲む, 買っちゃう → 買う
}
add('completion (–ちゃう)', 'しちゃう', 'する', WT.v5, WT.vs);

// Preparatory (ておく) and its contraction とく.
add('–ておく', 'ておく', 'る', WT.v1, WT.v1);
for (const end of DICT_ENDINGS) add('–ておく', TE[end] + 'おく', end, WT.v5, WT.v5);
add('–ておく', 'とく', 'る', WT.v5, WT.v1); // 食べとく → 食べる
for (const end of DICT_ENDINGS) {
  const toku = TE[end].replace(/て$/, 'と').replace(/で$/, 'ど') + 'く';
  add('–ておく', toku, end, WT.v5, WT.v5); // 飲んどく → 飲む
}

// ----- Engine -----------------------------------------------------------------

export interface Deinflection {
  /** Candidate dictionary form. */
  term: string;
  /**
   * Conjugation reasons, inner (closest to the stem) → outer (surface suffix).
   * e.g. 食べさせられた → 食べる carries ['causative', 'passive/potential', 'past'].
   */
  reasons: string[];
}

const MAX_DEPTH = 10;

/**
 * All plausible dictionary forms of `surface`, ranked shortest-chain first.
 * The first element is always the surface form itself (empty reasons), so a
 * caller can treat "exact match" and "deinflected match" uniformly.
 */
export function deinflect(surface: string): Deinflection[] {
  const term = surface.normalize('NFC');
  const out: Deinflection[] = [];
  const seen = new Set<string>();
  // BFS by chain length: the first time a (term|flags) state is dequeued it is
  // via the shortest path, so pushing results in dequeue order yields the ranking.
  const queue: Array<{ term: string; flags: number; reasons: string[] }> = [
    { term, flags: ALL, reasons: [] },
  ];
  seen.add(`${term}\x01${ALL}`);

  while (queue.length) {
    const node = queue.shift();
    if (!node) break;
    out.push({ term: node.term, reasons: node.reasons });
    if (node.reasons.length >= MAX_DEPTH) continue;

    for (const rule of RULES) {
      if ((node.flags & rule.rulesIn) === 0) continue;
      if (!node.term.endsWith(rule.kanaIn)) continue;
      const base = node.term.slice(0, node.term.length - rule.kanaIn.length) + rule.kanaOut;
      // No Japanese verb or i-adjective dictionary form is a single character, so
      // a 1-char result is always noise (e.g. looking up bare "た" → "る"). This
      // still lets whole-word suppletive rules through — しない → する, こない → くる.
      if (base.length < 2) continue;
      const key = `${base}\x01${rule.rulesOut}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Peeling goes outer→inner, so append: the rule just peeled is the
      // outermost suffix and belongs last once the chain is flipped for display.
      queue.push({ term: base, flags: rule.rulesOut, reasons: [...node.reasons, rule.reason] });
    }
  }

  // Dedupe by term (BFS already ordered shortest-chain first) and flip each chain
  // to inner→outer so it reads the way the suffixes stack on the stem.
  const byTerm = new Map<string, Deinflection>();
  for (const d of out) {
    if (byTerm.has(d.term)) continue;
    byTerm.set(d.term, { term: d.term, reasons: [...d.reasons].reverse() });
  }
  return [...byTerm.values()];
}

/**
 * Human-readable chain for the popup: inner→outer reasons joined with " · ".
 * e.g. deinflect('食べさせられた') → "causative · passive/potential · past".
 */
export function describeReasons(reasons: string[]): string {
  return reasons.join(' · ');
}
