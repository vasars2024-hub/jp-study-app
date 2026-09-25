/**
 * Write readings onto freshly mined cards, when the user has asked for it.
 *
 * The decision lives in `shared/flashcardAutoReading`; this file is the run. It
 * composes the two contracts that already exist for this — the bundled kuromoji
 * tokenizer (`renderer/tokenizer`) and the pure alignment in `shared/furigana` —
 * rather than adding a third reading path. No network, no model download, no new
 * dependency: the same offline analysis the Blanc furigana tool and the reader
 * already run.
 *
 * Failure is reported, never faked. If the tokenizer cannot be built the batch
 * fails for that one reason and the listener is told it, because a card silently
 * left with an empty `reading` is indistinguishable from one that did not need
 * one.
 */

import {
  alignFurigana,
  segmentsToBrackets,
  segmentsToKana,
  type FuriganaSegment,
} from '../shared/furigana';
import {
  DEFAULT_AUTO_READING_PREFERENCES,
  autoReadingTextFor,
  normalizeAutoReadingPreferences,
  selectAutoReadingCards,
  type AutoReadingForm,
  type AutoReadingPreferences,
} from '../shared/flashcardAutoReading';
import { updateDeckCardReadingBatch, type DeckFlashcard } from './flashcardDeck';
import { getTokenizer, tokenizeSync } from './tokenizer';
import { fetchReadingAid } from './readingAid';
import { normalizeStudyLang, studyLangTag } from '../shared/studyLang';
import { segmentStudyText } from '../shared/studySegmentation';
import { stressedRussian } from '../shared/readingAid';
import { getChineseScript } from './studyEnvironment';

const PREF_KEY = 'jp-flashcard-auto-reading-v1';
export const AUTO_READING_EVENT = 'flashcard-auto-reading';

export interface AutoReadingReport {
  /** Cards that gained a reading. */
  added: number;
  /** Eligible cards that produced nothing usable, or that the tokenizer lost. */
  failed: number;
  /** Eligible cards the per-batch cap left for later. */
  deferred: number;
  /** True when kuromoji itself could not be built — one reason for the batch. */
  tokenizerUnavailable?: boolean;
}

export function loadAutoReadingPreferences(): AutoReadingPreferences {
  try {
    return normalizeAutoReadingPreferences(JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null'));
  } catch {
    return DEFAULT_AUTO_READING_PREFERENCES;
  }
}

export function saveAutoReadingPreferences(next: AutoReadingPreferences): AutoReadingPreferences {
  const normalized = normalizeAutoReadingPreferences(next);
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(normalized));
  } catch {
    /* A locked store still gets session-local preferences. */
  }
  return normalized;
}

/**
 * Render one line's segments in the requested form.
 *
 * Exported so the preference panel can show the user what each form produces on
 * their own text instead of describing it in prose.
 */
export function renderReadingSegments(
  segments: readonly FuriganaSegment[],
  form: AutoReadingForm,
): string {
  const list = segments as FuriganaSegment[];
  return form === 'kana' ? segmentsToKana(list) : segmentsToBrackets(list);
}

/** Tokenize one line and render it. Empty string when nothing could be read. */
export function readingForText(text: string, form: AutoReadingForm): string {
  const segments: FuriganaSegment[] = [];
  for (const token of tokenizeSync(text)) {
    segments.push(...alignFurigana(token.surface, token.reading));
  }
  // A run with no reading at all means IPADIC did not recognise any of it; the
  // bracket form would then be the surface back unchanged, which is not a
  // reading and must not be written as one.
  if (!segments.some((segment) => segment.reading)) return '';
  const rendered = renderReadingSegments(segments, form).trim();
  return rendered === text.trim() ? '' : rendered;
}

/**
 * A Chinese or Russian card's reading: pinyin word by word (`jīntiān tiānqì`),
 * or the text with its stress marks (`кни́га`). Empty when the dictionary has
 * nothing for it — never the text handed back as its own "reading".
 */
export async function studyReadingForText(text: string, lang: 'zh' | 'ru'): Promise<string> {
  const parts = segmentStudyText(text, lang === 'zh' ? studyLangTag('zh', getChineseScript()) : 'ru');
  const words = parts.filter((part) => part.wordLike).map((part) => part.text);
  const readings = await fetchReadingAid(lang, words);
  if (lang === 'zh') {
    const syllables = words.map((word) => readings[word]?.filter(Boolean).join('') ?? '');
    return syllables.every(Boolean) ? syllables.join(' ') : '';
  }
  if (!words.some((word) => readings[word])) return '';
  return parts.map((part) => (part.wordLike ? stressedRussian(part.text, readings[part.text]) : part.text)).join('').trim();
}

/**
 * Annotate whichever of `created` the preference covers.
 *
 * Callers fire and forget: mining must not wait on the dictionary build. Returns
 * null when nothing was eligible, so a caller can tell "off" from "ran and found
 * nothing to do" — the same contract as `narrateNewCards`.
 */
export async function annotateNewCards(
  created: readonly DeckFlashcard[],
  preferences: AutoReadingPreferences = loadAutoReadingPreferences(),
): Promise<AutoReadingReport | null> {
  const selection = selectAutoReadingCards(created, preferences);
  if (!selection.chosen.length) return null;

  const report: AutoReadingReport = { added: 0, failed: 0, deferred: selection.deferred };
  const updates: Array<{ id: string; reading: string }> = [];

  // Chinese and Russian cards: pinyin and stress from the dictionaries in main.
  // Japanese cards: kuromoji, as before.
  const japanese = selection.chosen.filter((card) => normalizeStudyLang(card.studyLang) === 'ja');
  for (const card of selection.chosen) {
    const lang = normalizeStudyLang(card.studyLang);
    if (lang === 'ja') continue;
    const reading = await studyReadingForText(autoReadingTextFor(card), lang).catch(() => '');
    if (reading) updates.push({ id: card.id, reading });
    else report.failed += 1;
  }

  if (japanese.length) {
    let ready = true;
    try {
      await getTokenizer();
    } catch {
      ready = false;
      report.failed += japanese.length;
      report.tokenizerUnavailable = true;
    }
    for (const card of ready ? japanese : []) {
      const reading = readingForText(autoReadingTextFor(card), preferences.form);
      if (reading) updates.push({ id: card.id, reading });
      else report.failed += 1;
    }
  }
  if (updates.length) {
    updateDeckCardReadingBatch(updates);
    report.added = updates.length;
  }
  window.dispatchEvent(new CustomEvent<AutoReadingReport>(AUTO_READING_EVENT, { detail: report }));
  return report;
}

/** Subscribe to what the last automatic run actually did. */
export function onAutoReadingReport(cb: (report: AutoReadingReport) => void): () => void {
  const handler = (event: Event): void => cb((event as CustomEvent<AutoReadingReport>).detail);
  window.addEventListener(AUTO_READING_EVENT, handler);
  return () => window.removeEventListener(AUTO_READING_EVENT, handler);
}
