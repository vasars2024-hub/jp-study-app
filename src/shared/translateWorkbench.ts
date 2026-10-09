/**
 * Pure decisions behind the Translate workbench: sentence alignment, history
 * search and pinning, the clipboard watcher's acceptance rule, and the mining
 * request for a translated sentence.
 *
 * Kept free of React, `window` and storage so every rule here is unit-tested on
 * its own, and so Study OS's `TranslateView` and Blanc's panel make the same
 * decision from the same code.
 */
import { splitTranslationSentences, type TranslateSegment } from './translateCore';

/**
 * The sentence pairs to show for a finished translation.
 *
 * Main reports the pairs it actually translated; when it did (and they still
 * describe the text on screen) they win. Otherwise — a history entry, a cached
 * result, a main that predates segment reporting — the source is split the way
 * the model split it, and the output is paired sentence for sentence only when
 * the counts agree. A count mismatch is one honest block, never a guessed zip
 * that pairs a sentence with its neighbour's translation.
 */
export function alignTranslation(
  sourceText: string,
  output: string,
  reported?: readonly TranslateSegment[] | null,
): TranslateSegment[] {
  const source = sourceText.trim();
  const target = output.trim();
  if (!source || !target) return [];
  if (reported?.length) {
    const joined = reported.map((segment) => segment.source).join('');
    if (normalizeForCompare(joined) === normalizeForCompare(source)) return reported.map((s) => ({ ...s }));
  }
  const sources = splitTranslationSentences(source);
  const targets = splitTargetSentences(target);
  if (sources.length > 1 && sources.length === targets.length) {
    return sources.map((s, i) => ({ source: s, target: targets[i] }));
  }
  return [{ source, target }];
}

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, '');
}

/** Target-side split: Latin / Cyrillic prose ends sentences with `. ! ?` plus a space. */
function splitTargetSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[。．！？!?\n])|(?<=\.)\s+(?=\S)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The fields history search and ordering need; `TranslationHistoryEntry` satisfies it. */
export interface TranslationHistoryLike {
  id: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  resultText: string;
  ts: number;
  pinned?: boolean;
}

function foldForSearch(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase();
}

/**
 * History rows matching `query`, pinned first, each group newest first.
 *
 * The match is a plain substring over both sides, NFKC-folded so a full-width
 * `ＡＢＣ` finds `abc` and a half-width katakana paste finds its full-width row.
 * Every whitespace-separated term must match somewhere in the row.
 */
export function searchTranslationHistory<T extends TranslationHistoryLike>(
  entries: readonly T[],
  query: string,
): T[] {
  const terms = foldForSearch(query).split(/\s+/).filter(Boolean);
  const hits = terms.length
    ? entries.filter((entry) => {
      const hay = foldForSearch(`${entry.sourceText}\n${entry.resultText}`);
      return terms.every((term) => hay.includes(term));
    })
    : [...entries];
  return hits.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.ts - a.ts);
}

/** The key two history rows share when they are the same request. */
export function translationHistoryKey(entry: Pick<TranslationHistoryLike, 'sourceLang' | 'targetLang' | 'sourceText'>): string {
  return `${entry.sourceLang}\u0000${entry.targetLang}\u0000${entry.sourceText.trim()}`;
}

/**
 * Trim a history list to `max` rows without ever dropping a pinned one.
 *
 * Pinning is a promise the row survives; a cap that evicted pinned rows by age
 * would break it silently on the 201st translation. Unpinned rows fill whatever
 * room the pins leave, newest first, and the original order is kept.
 */
export function capTranslationHistory<T extends TranslationHistoryLike>(entries: readonly T[], max: number): T[] {
  const pinned = entries.filter((entry) => entry.pinned).length;
  let room = Math.max(0, max - pinned);
  return entries.filter((entry) => {
    if (entry.pinned) return true;
    if (room <= 0) return false;
    room -= 1;
    return true;
  });
}

/** Unicode script test for "this text is in the language being translated from". */
const SCRIPT_TESTS: Record<string, RegExp> = {
  ja: /[぀-ヿ㐀-鿿]/,
  zh: /[㐀-鿿]/,
  ru: /[Ѐ-ӿ]/,
  en: /[A-Za-z]/,
};

export const CLIPBOARD_WATCH_MAX_CHARS = 2000;

/**
 * Whether the clipboard watcher should take `raw` as the next passage.
 *
 * It must not fire on the clipboard it found when it was switched on (the
 * caller seeds `last` with that), on the same text twice, on what is already in
 * the source pane (the learner copying their own input or the result), on a
 * paste too long to be a sentence someone is reading, or on text with nothing
 * in the source language — copying a URL while reading Japanese is not a
 * request to translate it.
 */
export function acceptClipboardPassage(
  raw: string,
  opts: { last: string; currentInput: string; currentOutput?: string; sourceLang: string },
): string | null {
  const text = raw.trim();
  if (!text || text.length > CLIPBOARD_WATCH_MAX_CHARS) return null;
  if (text === opts.last.trim()) return null;
  if (text === opts.currentInput.trim()) return null;
  if (opts.currentOutput && text === opts.currentOutput.trim()) return null;
  const script = SCRIPT_TESTS[opts.sourceLang.toLowerCase().split('-')[0]];
  if (script && !script.test(text)) return null;
  return text;
}

/** Everything `mineToStudy` needs from a translation, minus the renderer-only fields. */
export interface TranslationMineFields {
  word: string;
  meaning: string;
  sentence: string;
  studyKind?: 'sentence';
}

/**
 * The card fields for mining a translated sentence or passage.
 *
 * The same shape the history row has always mined, extracted so the result
 * pane, each aligned sentence and Alt+M all mine identically: a passage or a
 * sentence is a sentence card, never one word's evidence.
 */
export function translationMineFields(sourceText: string, resultText: string): TranslationMineFields {
  const word = sourceText.trim().slice(0, 80);
  const sentence = sourceText.trim().slice(0, 2000);
  return {
    word,
    meaning: resultText.trim().slice(0, 400),
    sentence,
    ...(word.length > 16 || /[\s。．！？!?]/.test(word) ? { studyKind: 'sentence' as const } : {}),
  };
}
