/**
 * Which word a one-key mine is about.
 *
 * The rule the Navi terminal introduced, shared so the player mines the same way:
 * the target is the first content word of the line the learner does not know yet
 * (knowledge level below 3) — the i+1 word — skipping proper nouns, which are not
 * vocabulary. The card's term is its dictionary form; the surface is kept for the
 * cloze split.
 *
 * Japanese only (kuromoji). A line in another language, or a context where the
 * tokenizer cannot load (tests, a broken install), yields null and the caller
 * falls back to a sentence card rather than failing.
 */
import type { DictResult } from '../shared/types';
import { getLevel } from './knownWords';
import { getTokenizer, tokenizerReady, tokenizeSync } from './tokenizer';
import { getStudyLang } from './studyEnvironment';

export interface MineTarget {
  /** As written in the line (食べた). */
  surface: string;
  /** Dictionary form (食べる); the card's term. */
  lemma: string;
  /** Hiragana reading of the lemma when the tokenizer can tell; '' otherwise. */
  reading: string;
}

export interface PickMineTargetOptions {
  /**
   * When every content word is already known, take the first one anyway (the
   * terminal's behaviour). Default false: the player makes a sentence card then.
   */
  fallbackToFirst?: boolean;
  /** How long to wait for a tokenizer that is not built yet. Default 1500 ms. */
  loadTimeoutMs?: number;
}

const JP = /[぀-ヿ㐀-鿿]/u;

function toHiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

async function tokenizerAvailable(timeoutMs: number): Promise<boolean> {
  if (tokenizerReady()) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getTokenizer().then(() => true, () => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function pickMineTarget(
  line: string,
  options: PickMineTargetOptions = {},
): Promise<MineTarget | null> {
  const text = line.trim();
  if (!text || !JP.test(text)) return null;
  try {
    if (!(await tokenizerAvailable(options.loadTimeoutMs ?? 1500))) return null;
    const tokens = tokenizeSync(text)
      .filter((tk) => tk.content && !tk.proper && JP.test(tk.lemma || tk.surface));
    const lemmaOf = (tk: (typeof tokens)[number]): string =>
      (tk.lemma && tk.lemma !== '*' ? tk.lemma : tk.surface);
    const pick = tokens.find((tk) => getLevel(lemmaOf(tk)) < 3)
      ?? (options.fallbackToFirst ? tokens[0] : undefined);
    if (!pick) return null;
    const lemma = lemmaOf(pick);
    // IPADIC's reading is the SURFACE's: for an inflected word (食べた) it is not the
    // lemma's, so it is only used when the two are the same.
    const reading = lemma === pick.surface && pick.reading && pick.reading !== '*'
      ? toHiragana(pick.reading)
      : '';
    return { surface: pick.surface, lemma, reading };
  } catch {
    return null;
  }
}

/** Reading and first gloss of a word from the dictionary, or null. Never throws. */
export async function lookupMineGloss(
  word: string,
  timeoutMs = 1500,
): Promise<{ reading: string; meaning: string } | null> {
  const query = word.trim();
  const api = typeof window !== 'undefined' ? window.api : undefined;
  if (!query || !api) return null;
  const lang = getStudyLang();
  if (typeof (lang === 'zh' ? api.lookupChinese : api.lookupTerm) !== 'function') return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race<DictResult | null>([
      lang === 'zh'
        ? api.lookupChinese(query, 3)
        : api.lookupTerm(query, 3, lang),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    const top = result && Array.isArray(result.entries) ? result.entries[0] : undefined;
    if (!top) return null;
    const sense = Array.isArray(top.senses) ? top.senses[0] : undefined;
    const meaning = sense && Array.isArray(sense.definitions)
      ? sense.definitions.slice(0, 3).join('; ')
      : '';
    return { reading: typeof top.reading === 'string' ? top.reading : '', meaning };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
