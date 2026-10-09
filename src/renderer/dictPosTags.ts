/**
 * Part-of-speech tags as dictionaries ship them, with a readable explanation.
 *
 * Yomitan term banks (JMdict, and most dictionaries built from it) store the
 * part of speech as JMdict's entity codes — `v1`, `v5k-s`, `adj-na`, `vt` — and
 * the tag bank's long name is dropped when a sense's tags are split into parts of
 * speech and usage labels (`shared/dictTagBank.ts`). The entry then showed bare
 * `v5r, vi` with nothing to say what that means.
 *
 * The code stays on screen because it is the dictionary's own data and a learner
 * comes to read it at a glance; the explanation is the tooltip and the accessible
 * name. The table is literal key → catalog key, so every key is a static string
 * the missing-key scan can resolve. A code that is not here (or a full name from a
 * source that already spelled it out) is shown as is, without an invented gloss.
 */
const POS_KEYS: Readonly<Record<string, string>> = {
  n: 'dict2.pos.n',
  'n-adv': 'dict2.pos.n_adv',
  'n-t': 'dict2.pos.n_t',
  'n-suf': 'dict2.pos.n_suf',
  'n-pref': 'dict2.pos.n_pref',
  'n-pr': 'dict2.pos.n_pr',
  pn: 'dict2.pos.pn',
  'adj-i': 'dict2.pos.adj_i',
  'adj-ix': 'dict2.pos.adj_ix',
  'adj-na': 'dict2.pos.adj_na',
  'adj-no': 'dict2.pos.adj_no',
  'adj-pn': 'dict2.pos.adj_pn',
  'adj-t': 'dict2.pos.adj_t',
  'adj-f': 'dict2.pos.adj_f',
  adv: 'dict2.pos.adv',
  'adv-to': 'dict2.pos.adv_to',
  aux: 'dict2.pos.aux',
  'aux-v': 'dict2.pos.aux_v',
  'aux-adj': 'dict2.pos.aux_adj',
  conj: 'dict2.pos.conj',
  cop: 'dict2.pos.cop',
  ctr: 'dict2.pos.ctr',
  exp: 'dict2.pos.exp',
  int: 'dict2.pos.int',
  num: 'dict2.pos.num',
  pref: 'dict2.pos.pref',
  suf: 'dict2.pos.suf',
  prt: 'dict2.pos.prt',
  unc: 'dict2.pos.unc',
  v1: 'dict2.pos.v1',
  'v1-s': 'dict2.pos.v1_s',
  v5u: 'dict2.pos.v5u',
  'v5u-s': 'dict2.pos.v5u_s',
  v5k: 'dict2.pos.v5k',
  'v5k-s': 'dict2.pos.v5k_s',
  v5g: 'dict2.pos.v5g',
  v5s: 'dict2.pos.v5s',
  v5t: 'dict2.pos.v5t',
  v5n: 'dict2.pos.v5n',
  v5b: 'dict2.pos.v5b',
  v5m: 'dict2.pos.v5m',
  v5r: 'dict2.pos.v5r',
  'v5r-i': 'dict2.pos.v5r_i',
  v5aru: 'dict2.pos.v5aru',
  vk: 'dict2.pos.vk',
  vs: 'dict2.pos.vs',
  'vs-i': 'dict2.pos.vs_i',
  'vs-s': 'dict2.pos.vs_s',
  vz: 'dict2.pos.vz',
  vi: 'dict2.pos.vi',
  vt: 'dict2.pos.vt',
};

/** The catalog key explaining a part-of-speech code, or null when it has none. */
export function posTagKey(code: string): string | null {
  const key = code.trim();
  return Object.prototype.hasOwnProperty.call(POS_KEYS, key) ? POS_KEYS[key] : null;
}

/** Every code the table explains, for the catalog coverage test. */
export const EXPLAINED_POS_CODES: readonly string[] = Object.keys(POS_KEYS);
