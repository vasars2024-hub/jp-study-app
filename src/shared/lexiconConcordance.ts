import { normalizeSubtitleSearch } from './subtitleSearch';

export const MAX_CONCORDANCE_TERMS = 24;
export const MAX_CONCORDANCE_CITATIONS = 12;
export const MAX_CONCORDANCE_MEDIA_ITEMS = 40;

export interface LexiconConcordanceTerm {
  key: string;
  text: string;
}

export interface LexiconConcordanceSource {
  mediaId: string;
  title: string;
  cues: readonly { start: number; end: number; text: string }[];
}

export interface LexiconConcordanceCitation {
  mediaId: string;
  title: string;
  start: number;
  end: number;
  text: string;
  terms: string[];
}

/**
 * Find examples in subtitle tracks the learner already owns.
 *
 * This is deliberately a literal concordance, not tokenisation or semantic
 * search: every citation can be verified by reading the returned line. Terms
 * retain the Workbench harvest order, while sources and cues retain library
 * order so the result is deterministic and does not imply a relevance score.
 */
export function findLexiconConcordance(
  terms: readonly LexiconConcordanceTerm[],
  sources: readonly LexiconConcordanceSource[],
  limit = MAX_CONCORDANCE_CITATIONS,
): LexiconConcordanceCitation[] {
  const boundedLimit = Math.max(1, Math.min(MAX_CONCORDANCE_CITATIONS, Math.floor(limit)));
  const needles = terms
    .slice(0, MAX_CONCORDANCE_TERMS)
    .map((term) => ({ key: term.key, text: normalizeSubtitleSearch(term.text) }))
    .filter((term, index, all) => term.text && all.findIndex((item) => item.text === term.text) === index);
  if (!needles.length) return [];

  const citations: LexiconConcordanceCitation[] = [];
  for (const source of sources) {
    for (const cue of source.cues) {
      const line = normalizeSubtitleSearch(cue.text);
      const matched = needles.filter((term) => line.includes(term.text)).map((term) => term.key);
      if (!matched.length) continue;
      citations.push({
        mediaId: source.mediaId,
        title: source.title,
        start: cue.start,
        end: cue.end,
        text: cue.text.trim(),
        terms: matched,
      });
      if (citations.length >= boundedLimit) return citations;
    }
  }
  return citations;
}
