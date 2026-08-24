/**
 * Gather find-in-the-wild citations from the corpora this machine actually has.
 *
 * `shared/lexiconWild.ts` holds the ranking and the honest-state model and is
 * pure; this is the half that reads. It lives in the renderer for the same
 * reason the personal concordance's gather does — the media bridge, the example
 * corpus and the frequency lists are all already reachable from here through
 * `window.api`, and adding a main handler would move the same three calls
 * behind a fourth without gaining anything.
 *
 * Four of the six source classes have no reader on this machine, and that is
 * reported rather than hidden. `library`, `news` and `encyclopedic` would each
 * need a corpus reader that does not exist; `spoken` is deliberately NOT
 * satisfied by subtitles, which are a transcript of speech shipped as text and
 * are already their own class. Calling any of them `empty` would tell the user
 * the word is absent from a corpus nobody ever opened.
 */

import {
  MAX_WILD_CITATIONS,
  buildLexiconWildResult,
  lexiconWildBand,
  lexiconWildKey,
  rankLexiconWild,
  type LexiconWildCacheEntry,
  type LexiconWildCitation,
  type LexiconWildResult,
  type LexiconWildSourceClass,
  type LexiconWildSourceStatus,
} from '../shared/lexiconWild';
import { normalizeSubtitleSearch } from '../shared/subtitleSearch';
import { scoreLexiconDifficulty } from '../shared/lexiconDifficulty';
import { parseStudySubtitles } from './subtitles';

/** Same ceiling the personal concordance uses: one click is not a disk scan. */
export const MAX_WILD_MEDIA_ITEMS = 40;

/** Per subtitle track, so one long show cannot fill the shortlist alone. */
export const MAX_WILD_CUES_PER_SOURCE = 4;

export interface LexiconWildTerm {
  key: string;
  text: string;
}

export interface LexiconWildRequest {
  terms: readonly LexiconWildTerm[];
  /** The passage's own source language, used for the example-corpus query. */
  lang: string;
  glossLangs?: readonly string[];
  /** The sense the reader pinned for the primary term, when they pinned one. */
  pinnedSense?: number;
  /**
   * The passage's median frequency rank. Citations are ordered by distance from
   * the band it falls in, so "level" here means the level of what the reader is
   * already reading — a claim the app can actually support — and not an
   * invented model of the reader.
   */
  medianRank?: number;
  signal?: () => boolean;
}

/** The classes this build can read. The rest report `no-reader` by construction. */
export const READABLE_WILD_CLASSES: readonly LexiconWildSourceClass[] = ['subtitles', 'examples'];

async function gatherSubtitles(
  request: LexiconWildRequest,
  out: LexiconWildCitation[],
): Promise<LexiconWildSourceStatus> {
  const needles = request.terms
    .map((term) => ({ key: term.key, text: normalizeSubtitleSearch(term.text) }))
    .filter((term, index, all) => term.text && all.findIndex((item) => item.text === term.text) === index);
  if (!needles.length) return { sourceClass: 'subtitles', state: 'empty', scanned: 0, matched: 0 };

  let scanned = 0;
  try {
    const media = (await window.api.listMedia()).slice(0, MAX_WILD_MEDIA_ITEMS);
    for (const item of media) {
      if (request.signal?.() === false) break;
      const subtitle = await window.api.subtitleForPath(item.path);
      if (!subtitle?.text) continue;
      // The study parser, for the concordance's reason: a dual-language `.ass`
      // would put its Chinese track's shared hanzi into the hit list as though
      // the learner had met that line in Japanese.
      const { cues } = parseStudySubtitles(subtitle.text);
      if (!cues.length) continue;
      scanned += 1;
      let taken = 0;
      for (const cue of cues) {
        if (taken >= MAX_WILD_CUES_PER_SOURCE) break;
        const line = normalizeSubtitleSearch(cue.text);
        const terms = needles.filter((term) => line.includes(term.text)).map((term) => term.key);
        if (!terms.length) continue;
        taken += 1;
        out.push({
          sourceClass: 'subtitles',
          sourceId: item.id,
          title: item.title,
          text: cue.text.trim(),
          terms,
          start: cue.start,
          end: cue.end,
        });
      }
    }
  } catch {
    return { sourceClass: 'subtitles', state: 'unavailable', reason: 'failed', scanned: 0, matched: 0 };
  }
  return { sourceClass: 'subtitles', state: 'ready', scanned, matched: 0 };
}

async function gatherExamples(
  request: LexiconWildRequest,
  out: LexiconWildCitation[],
): Promise<LexiconWildSourceStatus> {
  let scanned = 0;
  let reachedCorpus = false;
  try {
    for (const term of request.terms) {
      if (request.signal?.() === false) break;
      const result = await window.api.dictExamples(term.text, {
        sourceLangs: [request.lang],
        ...(request.glossLangs?.length ? { glossLangs: [...request.glossLangs] } : {}),
      });
      if (result.examples.length) reachedCorpus = true;
      for (const example of result.examples) {
        scanned += 1;
        out.push({
          sourceClass: 'examples',
          // `sourceId` is the corpus's durable name; the row id is reassigned on
          // every re-import, so a citation must never be keyed on one.
          sourceId: example.sourceId ?? `${example.dictId}:${example.text.slice(0, 24)}`,
          title: example.dictTitle,
          text: example.text,
          ...(example.translations[0] ? { translation: example.translations[0].text } : {}),
          terms: [term.key],
        });
      }
    }
  } catch {
    return { sourceClass: 'examples', state: 'unavailable', reason: 'failed', scanned: 0, matched: 0 };
  }
  // An install with no example corpus and a word that is genuinely absent both
  // return zero rows through `dict:examples`, which swallows a missing database
  // by contract. Nothing here can tell them apart, so the honest answer is the
  // weaker one: say the corpus could not be reached rather than claim the word
  // is not in it.
  if (!reachedCorpus) {
    return { sourceClass: 'examples', state: 'unavailable', reason: 'no-corpus', scanned: 0, matched: 0 };
  }
  return { sourceClass: 'examples', state: 'ready', scanned, matched: 0 };
}

/**
 * Attach a band to the shortlist, then re-rank it.
 *
 * Two passes on purpose. Levelling a citation costs one offline lookup, so
 * scoring everything gathered would mean hundreds; scoring nothing would make
 * every citation `unranked`, which claims no list knows these lines rather than
 * admitting nobody asked. So pass one ranks on sense, coverage and length and
 * keeps the top `MAX_WILD_CITATIONS`, pass two levels exactly those and orders
 * them. The final list is drawn from the shortlist either way — an unscored
 * citation ranks below every scored one — so the two-pass order is the same
 * order a full scoring would produce over this shortlist.
 */
async function levelShortlist(
  shortlist: readonly LexiconWildCitation[],
  request: LexiconWildRequest,
): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  for (const citation of shortlist) {
    if (request.signal?.() === false) break;
    try {
      const interlinear = await window.api.lookupOfflineInterlinear(citation.text, {
        sourceLangs: [request.lang],
        withFrequency: true,
        withPartOfSpeech: true,
      });
      const profile = scoreLexiconDifficulty(interlinear);
      // `hardest` is rarest-first and empty when no enabled list ranked a word
      // in the line. No entry means unranked, which is coverage and not rarity.
      const hardest = profile.hardest[0];
      if (hardest) ranks.set(lexiconWildKey(citation), hardest.rank);
    } catch {
      // One unscorable line is unranked, not a failed search.
    }
  }
  return ranks;
}

export const LEXICON_WILD_CACHE_KEY = 'jp-os-lexicon-wild-v1';

/**
 * The offline half of the bullet. Every corpus behind this is already local, so
 * the cache is not about reachability — it is about a subtitle scan over forty
 * media files, which is the one expensive thing on this surface. A cached
 * answer is re-ranked in memory when a pin changes, because the cache key is
 * the question and not the ordering.
 */
export function loadLexiconWildCache(): LexiconWildCacheEntry[] {
  try {
    const raw = localStorage.getItem(LEXICON_WILD_CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LexiconWildCacheEntry => (
      !!item
      && typeof item === 'object'
      && typeof (item as LexiconWildCacheEntry).key === 'string'
      && typeof (item as LexiconWildCacheEntry).at === 'number'
      && Array.isArray((item as LexiconWildCacheEntry).result?.citations)
    ));
  } catch {
    return [];
  }
}

export function saveLexiconWildCache(entries: readonly LexiconWildCacheEntry[]): void {
  try {
    localStorage.setItem(LEXICON_WILD_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Over quota or unavailable. The in-memory list stays usable; the next
    // successful write recovers persistence.
  }
}

/** Read every reachable corpus, level the shortlist, and fold the result. */
export async function searchLexiconWild(request: LexiconWildRequest): Promise<LexiconWildResult> {
  const citations: LexiconWildCitation[] = [];
  const statuses: LexiconWildSourceStatus[] = [
    await gatherSubtitles(request, citations),
    await gatherExamples(request, citations),
  ];

  const shortlist = rankLexiconWild(citations, {
    ...(request.pinnedSense === undefined ? {} : { pinnedSense: request.pinnedSense }),
    limit: MAX_WILD_CITATIONS,
  });
  const ranks = await levelShortlist(shortlist, request);

  return buildLexiconWildResult(citations, statuses, {
    ...(request.pinnedSense === undefined ? {} : { pinnedSense: request.pinnedSense }),
    ...(request.medianRank === undefined
      ? {}
      : (() => {
        const band = lexiconWildBand(request.medianRank);
        return band === 'unranked' ? {} : { learnerBand: band };
      })()),
    resolveRank: (citation) => ranks.get(lexiconWildKey(citation)),
  });
}
