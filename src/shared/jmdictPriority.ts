/**
 * JMdict's priority markers — `news1`, `ichi1`, `spec1`, `gai1`, `nf12` — read from
 * the dictionary's own data and explained, never inferred.
 *
 * JMdict marks a headword "common" because it appears on one of a few word lists,
 * and the marker says which: the Mainichi Shimbun frequency file (`news1/2`, with
 * its 500-word rank band `nf01`..`nf48`), the Ichimango goi bunruishuu (`ichi1/2`),
 * loanword frequency (`gai1/2`) or an editor's judgement (`spec1/2`). A Yomitan
 * JMdict built by yomichan-import carries them in the term row's `termTags`
 * column (and sometimes the definition tags); the importer keeps exactly the
 * codes it recognises here. A dictionary that ships none of them gets no tooltip —
 * the "common" badge then says only what `isCommon` already said.
 *
 * The explanations are app chrome (what a code means), so they are catalog keys;
 * the codes themselves are the dictionary's data and are shown as written.
 */

const LIST_CODE = /^(news|ichi|spec|gai)([12])$/;
const BAND_CODE = /^nf(\d{2})$/;

/** True for a JMdict priority code: news1/2, ichi1/2, spec1/2, gai1/2, nf01..nf48. */
export function isJmdictPriorityCode(code: string): boolean {
  const c = String(code ?? '').trim();
  if (LIST_CODE.test(c)) return true;
  const band = BAND_CODE.exec(c);
  if (!band) return false;
  const n = Number(band[1]);
  return n >= 1 && n <= 48;
}

/** The order JMdict lists them in: lists first (news, ichi, spec, gai), then the band. */
function rank(code: string): number {
  const list = LIST_CODE.exec(code);
  if (list) return ['news', 'ichi', 'spec', 'gai'].indexOf(list[1]) * 10 + Number(list[2]);
  const band = BAND_CODE.exec(code);
  return band ? 100 + Number(band[1]) : 1000;
}

/** The priority codes among `raw` tags, deduplicated and in JMdict's order. Everything else is dropped. */
export function jmdictPriorityCodes(raw: readonly unknown[] | undefined): string[] {
  const seen = new Set<string>();
  for (const value of raw ?? []) {
    const code = String(value ?? '').trim();
    if (isJmdictPriorityCode(code)) seen.add(code);
  }
  return [...seen].sort((a, b) => rank(a) - rank(b));
}

/**
 * The codes JMdict itself counts as "common" (the set Jisho and Yomitan badge):
 * news1, ichi1, spec1, spec2, gai1. Second-tier list membership and the nf band
 * alone do not make a word common.
 */
export function isJmdictCommon(codes: readonly string[] | undefined): boolean {
  return (codes ?? []).some((code) => /^(news1|ichi1|spec1|spec2|gai1)$/.test(code));
}

export interface PriorityExplanation {
  key: string;
  params?: Record<string, string | number>;
}

/** The catalog key (and parameters) explaining one code, or null for a code this module does not know. */
export function jmdictPriorityExplanation(code: string): PriorityExplanation | null {
  const c = String(code ?? '').trim();
  const list = LIST_CODE.exec(c);
  if (list) return { key: `dict3.prio.${list[1]}${list[2]}` };
  const band = BAND_CODE.exec(c);
  if (band) {
    const n = Number(band[1]);
    if (n < 1 || n > 48) return null;
    return { key: 'dict3.prio.nf', params: { from: (n - 1) * 500 + 1, to: n * 500 } };
  }
  return null;
}

/** Every literal catalog key `jmdictPriorityExplanation` can return, for the catalog check. */
export const JMDICT_PRIORITY_KEYS: readonly string[] = [
  'dict3.prio.news1', 'dict3.prio.news2',
  'dict3.prio.ichi1', 'dict3.prio.ichi2',
  'dict3.prio.spec1', 'dict3.prio.spec2',
  'dict3.prio.gai1', 'dict3.prio.gai2',
  'dict3.prio.nf',
];
