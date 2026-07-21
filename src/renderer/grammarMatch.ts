import { GRAMMAR } from './data/grammar';
import { fuzzyScore } from './fuzzySearch';

export interface GrammarMatchHit {
  id: string;
  title: string;
  level: string;
  meaning: string;
}

/** Rank grammar points against a selection / sentence for the extension bridge. */
export function matchGrammarPatterns(text: string, limit = 8): GrammarMatchHit[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ hit: GrammarMatchHit; score: number }> = [];
  for (const g of GRAMMAR) {
    if (g.lang !== 'ja' && g.lang !== 'zh') continue;
    const hay = `${g.title} ${g.meaning} ${g.structure}`.toLowerCase();
    let score = fuzzyScore(q, hay);
    // Boost when the pattern surface appears in the selection (or vice versa).
    const titleBare = g.title.replace(/[～〜\s]/g, '');
    if (titleBare && (q.includes(titleBare.toLowerCase()) || text.includes(g.title))) {
      score = (score ?? 0) + 40;
    }
    if (score == null) continue;
    scored.push({
      score,
      hit: { id: g.id, title: g.title, level: String(g.level), meaning: g.meaning },
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: GrammarMatchHit[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    if (seen.has(row.hit.id)) continue;
    seen.add(row.hit.id);
    out.push(row.hit);
    if (out.length >= limit) break;
  }
  return out;
}
