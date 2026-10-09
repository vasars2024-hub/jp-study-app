/**
 * "Seen in your media": sentences the learner actually met that use a grammar point.
 *
 * Sources are the learner's own material — sentences on mined cards (most mined from
 * subtitles, books and the reader) and the sentences words were looked up in — and
 * the matcher is the offline highlighter's (`localGrammarAnalysis`), by POINT ID: a
 * sentence counts only where the subtitle overlay would colour this very point, not
 * where some string resembling its title occurs. The audit that found highlights
 * losing their point id is why this goes through `localGrammarReportedId` — a point
 * deduplicated into an earlier record with the same surface is reported under that
 * record's id, and a point too short to match safely is never reported at all
 * (and then has no sightings, rather than wrong ones).
 */
import { localGrammarPointSpans, localGrammarReportedId } from './localGrammarAnalysis';

export type GrammarSightingSource = 'deck' | 'lookup' | 'capture';

export interface GrammarSightingInput {
  id: string;
  sentence: string;
  source: GrammarSightingSource;
  /** The deck card the sentence is on, so the sighting can open it. */
  cardId?: string;
  /** The word the card or lookup was about. */
  word?: string;
}

export interface GrammarSighting extends GrammarSightingInput {
  /** The normalized sentence the spans index into. */
  sentence: string;
  spans: Array<{ start: number; end: number }>;
}

/** Sightings per point shown; enough to see the pattern in use, not a corpus. */
export const MAX_GRAMMAR_SIGHTINGS = 6;

export function findGrammarSightings(
  point: { id: string; title: string; lang?: string },
  inputs: readonly GrammarSightingInput[],
  limit = MAX_GRAMMAR_SIGHTINGS,
): GrammarSighting[] {
  const lang = point.lang ?? 'ja';
  const reported = localGrammarReportedId({ id: point.id, title: point.title, lang });
  if (!reported) return [];
  const seen = new Set<string>();
  const out: GrammarSighting[] = [];
  for (const input of inputs) {
    const raw = input.sentence?.trim();
    if (!raw) continue;
    const { sentence, spans } = localGrammarPointSpans(raw, lang, reported);
    if (!spans.length || seen.has(sentence)) continue;
    seen.add(sentence);
    out.push({ ...input, sentence, spans });
    if (out.length >= limit) break;
  }
  return out;
}

/** The sentence cut into plain and marked runs, for rendering. */
export function sightingRuns(sighting: Pick<GrammarSighting, 'sentence' | 'spans'>): Array<{ text: string; mark: boolean }> {
  const runs: Array<{ text: string; mark: boolean }> = [];
  let at = 0;
  for (const span of [...sighting.spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue;
    if (span.start > at) runs.push({ text: sighting.sentence.slice(at, span.start), mark: false });
    runs.push({ text: sighting.sentence.slice(span.start, span.end), mark: true });
    at = span.end;
  }
  if (at < sighting.sentence.length) runs.push({ text: sighting.sentence.slice(at), mark: false });
  return runs;
}
