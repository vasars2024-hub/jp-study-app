import { normalizeNeighborText } from './lexiconNeighbors';

/**
 * Phrases in which the queried word is joined to another word by a grammatical
 * particle — 猫に小判, 気を付ける, 核の傘.
 *
 * ## Why the corpus is the headword index and not a sentence corpus
 *
 * The obvious writer for `collocations` reads a corpus and counts co-occurrence.
 * Both corpora this application could use are empty on a real install, which was
 * measured rather than assumed against the shipped 697,837-headword database:
 * `examples` holds **0 rows** (the offline Tatoeba index lives in a JSON file, not
 * in SQLite), and `senses.pos` is the empty string on **every** row, so a
 * part-of-speech-driven extractor has nothing to key on either. A writer built on
 * either would be dead on every installation — the failure mode where a surface
 * that never renders is never noticed.
 *
 * The headword index itself is the corpus that is always present. JMdict carries
 * its idioms and set phrases as ordinary headwords, so 風邪を引く is a row like any
 * other, and the particle that makes it a collocation is right there in the string.
 *
 * ## What a row therefore claims, exactly
 *
 * "Your dictionaries carry this phrase as a headword; inside it, the word you
 * looked up is joined by *this particle* to *this other word, which your
 * dictionaries also carry*." Every clause is checkable by looking at the row. In
 * particular this asserts nothing about frequency of use, which is why `count`
 * stores attesting dictionary entries and is never presented as a corpus count.
 */

/** Rows read from the headword index before parsing. See `findLexiconCollocations`. */
export const COLLOCATION_SCAN_ROWS = 600;
export const MAX_COLLOCATION_RESULTS = 12;
/**
 * A one-character query is the useful case here. A long one is a pasted sentence,
 * and no headword contains it.
 */
export const MAX_COLLOCATION_QUERY_CHARS = 16;

/**
 * The particles a row may be built on, longest first so から wins over ら.
 *
 * は, で and も are deliberately absent. They are the three whose kana appear most
 * often *inside* an ordinary word at the position this parse inspects, and on the
 * real database they produced 傘はり, 気がかり and 心がけ — words that are not
 * collocations of anything. Dropping them costs no true row that を/に/の does not
 * already carry. が stays despite the same risk because it earns 目が覚める,
 * 腹が立つ and 話が合う, and the attestation rule below removes its noise.
 */
export const COLLOCATION_PARTICLES = [
  'から', 'まで', 'より', 'を', 'に', 'が', 'の', 'へ', 'と',
] as const;

export type CollocationParticle = (typeof COLLOCATION_PARTICLES)[number];

/** Which side of the particle the queried word sits on. */
export type CollocationOrder = 'head-first' | 'head-last';

export interface LexiconCollocation {
  lang: string;
  /** The queried word, as it is written inside the phrase. */
  head: string;
  /** The other word in the phrase. */
  partner: string;
  /**
   * The partner's own first definition, when the dictionaries carry one.
   *
   * Optional because attestation and definition are different questions: a
   * partner is kept when its written form *or its reading* is a headword, and a
   * kana spelling that only matches a reading may resolve to an entry whose
   * senses were filtered out. Absent therefore means "no gloss to show", never
   * "not a word" — the row was already proven attested before it got here.
   */
  partnerGloss?: string;
  particle: CollocationParticle;
  order: CollocationOrder;
  /** The whole headword the row came from, e.g. 猫に小判. */
  phrase: string;
  /** `{head}に{partner}` — the stored template, which reconstructs `phrase` exactly. */
  pattern: string;
  /** How many headword rows in enabled dictionaries attest this phrase. Not a corpus count. */
  count: number;
  reading: string;
  dictId: string;
  dictTitle: string;
}

export interface LexiconCollocationResult {
  query: string;
  collocations: LexiconCollocation[];
}

export interface LexiconCollocationCandidate {
  lang: string;
  /** The headword's written form, which the parse below reads directly. */
  text: string;
  reading: string;
  dictId: string;
  dictTitle: string;
}

/** A parsed phrase, before its partner has been checked against the dictionary. */
export interface ParsedCollocation {
  head: string;
  partner: string;
  particle: CollocationParticle;
  order: CollocationOrder;
}

/**
 * A bare hiragana run this short at a phrase edge is an inflectional tail that the
 * particle scan cut in the wrong place (手**がける**, 心**がけ**), not a word. Two
 * characters is the cut-off because every counterexample worth keeping — かぶる,
 * つける, 小判 — is longer or is not bare kana.
 */
const BARE_KANA = /^[ぁ-ゟ]+$/;
const MAX_BARE_KANA_PARTNER = 2;

function partnerIsPlausible(partner: string): boolean {
  if (!partner) return false;
  return !(BARE_KANA.test(partner) && partner.length <= MAX_BARE_KANA_PARTNER);
}

/** `{head}に{partner}`, the template stored in `collocations.pattern`. */
export function collocationPattern(particle: string, order: CollocationOrder): string {
  return order === 'head-first'
    ? `{head}${particle}{partner}`
    : `{partner}${particle}{head}`;
}

/** Render a stored pattern back into the phrase it came from. */
export function renderCollocationPattern(
  pattern: string,
  head: string,
  partner: string,
): string {
  return pattern.replace('{head}', head).replace('{partner}', partner);
}

/**
 * Read the collocations out of one headword, given the word that was looked up.
 *
 * The match is anchored at the **edges** of the phrase, not merely contained in it,
 * and that is the whole reason this is not a substring search: 猫なで声 contains で
 * and 猫, and a containment test calls it a collocation. Requiring the phrase to
 * *start* with 猫 + particle, or *end* with particle + 猫, rejects it — correctly,
 * because なで声 is not joined to 猫 by anything.
 *
 * Both directions are tested because both are real: 猫の目 puts the query first,
 * 核の傘 puts it last. A phrase can legitimately yield both (話の先 / 先の話 are two
 * separate headwords, each parsed once).
 *
 * Works on the **displayed** strings, so `head + particle + partner` reconstructs
 * the phrase character for character. A row that the index matched only after NFKC
 * folding fails this test and is dropped rather than shown with a reconstruction
 * the reader cannot verify against the row.
 */
export function parseCollocations(phrase: string, query: string): ParsedCollocation[] {
  const head = query.trim();
  const text = phrase.trim();
  if (!head || !text || text === head) return [];

  const found: ParsedCollocation[] = [];
  for (const particle of COLLOCATION_PARTICLES) {
    const prefix = head + particle;
    if (text.startsWith(prefix)) {
      const partner = text.slice(prefix.length);
      if (partnerIsPlausible(partner)) {
        found.push({ head, partner, particle, order: 'head-first' });
      }
    }
    const suffix = particle + head;
    if (text.endsWith(suffix)) {
      const partner = text.slice(0, text.length - suffix.length);
      if (partnerIsPlausible(partner)) {
        found.push({ head, partner, particle, order: 'head-last' });
      }
    }
  }
  return found;
}

/** The identity two rows share when they are the same collocation. */
export function collocationKey(parsed: ParsedCollocation): string {
  return [
    parsed.order,
    parsed.particle,
    normalizeNeighborText(parsed.partner),
  ].join('\t');
}

export interface CollocationDraft extends ParsedCollocation {
  candidate: LexiconCollocationCandidate;
  phrase: string;
  /** Headword rows that produced this same collocation, across enabled dictionaries. */
  count: number;
}

/**
 * Group the parsed rows into one draft per distinct collocation.
 *
 * Order comes from SQL — the importer's own commonness score, then length — and is
 * preserved: the first row to produce a collocation supplies its attribution and
 * reading, and every later duplicate only increments the count. That is what makes
 * `count` an attestation tally rather than a frequency: 風邪を引く carried by three
 * installed dictionaries counts three, and no claim is made about how often anyone
 * says it.
 */
export function draftLexiconCollocations(
  query: string,
  candidates: readonly LexiconCollocationCandidate[],
): CollocationDraft[] {
  const drafts = new Map<string, CollocationDraft>();
  for (const candidate of candidates) {
    const phrase = candidate.text.trim();
    for (const parsed of parseCollocations(phrase, query)) {
      const key = collocationKey(parsed);
      const existing = drafts.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      drafts.set(key, { ...parsed, candidate, phrase, count: 1 });
    }
  }
  return [...drafts.values()];
}

/**
 * Keep the drafts whose partner the dictionaries actually carry, and cap the list.
 *
 * `attested` holds normalised partner keys that matched a headword's written form
 * or its reading. Matching the reading as well is what keeps 風邪をうつす, whose
 * partner うつす is only ever a reading of 移す — a kana spelling of a real verb is
 * still a real word, and rejecting it would have cost a third of the true rows.
 */
export function selectLexiconCollocations(
  drafts: readonly CollocationDraft[],
  attested: ReadonlySet<string>,
  limit = MAX_COLLOCATION_RESULTS,
): CollocationDraft[] {
  const bounded = Math.max(1, Math.min(MAX_COLLOCATION_RESULTS, Math.floor(limit)));
  const kept: CollocationDraft[] = [];
  for (const draft of drafts) {
    if (!attested.has(normalizeNeighborText(draft.partner))) continue;
    kept.push(draft);
    if (kept.length >= bounded) break;
  }
  return kept;
}
