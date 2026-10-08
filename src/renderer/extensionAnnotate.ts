/**
 * The host window's half of the extension's `/v1/annotate`: split page text
 * into words with the app's own tokenizer (kuromoji for Japanese, ICU word
 * segmentation otherwise) and give each word its lemma and known level, so the
 * extension can colour words by status and add furigana without guessing.
 *
 * Pure apart from its injected deps, so it is unit-tested without a dictionary.
 */
import type { JpToken } from './tokenizer';
import { segmentStudyText } from '../shared/studySegmentation';

/** One word of an annotated text: offset/length into that text, lemma, reading (hiragana), level. */
export interface AnnotateToken {
  o: number;
  n: number;
  l: string;
  r?: string;
  k: number;
}

export interface AnnotateDeps {
  /** Japanese tokenizer, or null when kuromoji is not loaded yet. */
  tokenizeJa: ((text: string) => JpToken[]) | null;
  getLevel: (word: string) => number;
}

const HAS_KANJI = /[㐀-鿿豈-﫿]/;
const WORDISH = /[\p{L}\p{N}]/u;

function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function levelOf(deps: AnnotateDeps, lemma: string, surface: string): number {
  const a = Number(deps.getLevel(lemma));
  if (a > 0 || lemma === surface) return Number.isFinite(a) ? a : 0;
  const b = Number(deps.getLevel(surface));
  return Number.isFinite(b) ? Math.max(a || 0, b) : a || 0;
}

export function annotateText(text: string, lang: string, deps: AnnotateDeps): AnnotateToken[] {
  const out: AnnotateToken[] = [];
  if (!text) return out;
  if (lang === 'ja' && deps.tokenizeJa) {
    let cursor = 0;
    for (const tok of deps.tokenizeJa(text)) {
      const at = text.indexOf(tok.surface, cursor);
      if (at < 0 || !tok.surface) continue;
      cursor = at + tok.surface.length;
      if (!tok.content || !WORDISH.test(tok.surface)) continue;
      const lemma = tok.lemma && tok.lemma !== '*' ? tok.lemma : tok.surface;
      const t: AnnotateToken = { o: at, n: tok.surface.length, l: lemma, k: levelOf(deps, lemma, tok.surface) };
      if (tok.reading && HAS_KANJI.test(tok.surface)) {
        const r = kataToHira(tok.reading);
        if (r && r !== tok.surface) t.r = r;
      }
      out.push(t);
    }
    return out;
  }
  for (const seg of segmentStudyText(text, lang)) {
    if (!seg.wordLike) continue;
    const lemma = lang === 'ru' ? seg.text.toLowerCase() : seg.text;
    out.push({ o: seg.start, n: seg.end - seg.start, l: lemma, k: levelOf(deps, lemma, seg.text) });
  }
  return out;
}

/** Annotate a batch (each text is capped; the batch is capped by the main process). */
export function annotateTexts(texts: string[], lang: string, deps: AnnotateDeps): AnnotateToken[][] {
  return texts.map((text) => annotateText(String(text ?? '').slice(0, 2000), lang, deps));
}
