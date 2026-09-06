/**
 * Aero v1.0 audit item 5.6, second half — "implement an offline AI agent for
 * user assistance".
 *
 * The design was already decided in the audit row and is kept: **search-and-
 * answer over `searchSettings()`, no model.** That is the honest reading of
 * "offline". This app can reach a model, but a Help assistant that needs one is
 * not offline assistance — it is a network feature that fails exactly when a
 * confused user is least able to diagnose why, and it would answer questions
 * about settings it has never seen. `searchSettings` already indexes every
 * setting in the app, in the active UI language, with the visibility rules
 * (advanced mode, theme gates, discovered shells) applied. That index is the
 * knowledge base; the only thing missing was a way to ask it a QUESTION rather
 * than a keyword.
 *
 * Which is the whole job here. `searchSettings` scores per word, so "how do I
 * change the language I translate into?" scores `how`, `do`, `i`, `change` and
 * `the` against every entry in the registry and buries the one real hit under
 * the noise. Stripping the question down to its content words is the difference
 * between a dead search box and an answer.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it never composes prose, and it never
 * claims to have answered. It returns the settings it found and the query it
 * actually used to find them, and the caller shows both. A confident sentence
 * assembled from a keyword match is how a search box starts lying.
 */
import {
  searchSettings,
  type SettingsVisibility,
} from './components/settings/settingsRegistry';
import type { SettingsRegistryEntry } from './components/settings/types';

/**
 * How the answer was reached. Reported to the user, not just logged: "found
 * nothing for your question, here is what `translate` matches" is a materially
 * different statement from "here is the answer", and the UI has to be able to
 * tell them apart.
 */
export type AssistantStrategy = 'phrase' | 'keywords' | 'widest' | 'none';

export interface AssistantAnswer {
  entries: SettingsRegistryEntry[];
  /** The query that actually produced `entries` — shown, so the user can correct it. */
  usedQuery: string;
  strategy: AssistantStrategy;
}

/**
 * English only, and that is deliberate rather than an oversight. The registry's
 * own header records that its keyword index stays English whatever the UI
 * language is, so an English question is the case that needs the help. A
 * question in another language still works through the phrase and per-word
 * passes, because `searchSettings` resolves every entry's title and description
 * through `t` in the active language — those words are not stopwords in any
 * list and are not removed.
 */
const STOPWORDS = new Set([
  'a', 'about', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'find', 'for', 'from', 'get', 'go',
  'have', 'here', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my', 'of',
  'on', 'or', 'please', 'setting', 'settings', 'should', 'show', 'so', 'that',
  'the', 'their', 'them', 'there', 'these', 'this', 'to', 'up', 'want', 'was',
  'way', 'we', 'what', 'when', 'where', 'which', 'why', 'will', 'with', 'would',
  'you', 'your',
]);

/**
 * `settings` and `setting` are in that list on purpose: every entry in the
 * registry is a setting, so the word separates nothing and only adds score to
 * whichever entry happens to mention it.
 */
export function extractQuestionTerms(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[?!.,;:()"']/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

const MAX_ANSWERS = 6;

/**
 * `searchSettings` matches each query word by SUBSTRING, which is right for a
 * keyword box and wrong for a sentence. Measured while writing this module's
 * negative control: "how do I print a fax to my toaster" returned six settings.
 * `a` is a substring of nearly every haystack, so `a`, `to` and `my` matched
 * everything, and `print` matched **fingerprint**. That is why a phrase pass
 * over a raw question can never come back empty, and why an assistant built
 * straight on `searchSettings` would answer any sentence at all with confidence.
 *
 * So every result is re-checked here against a word BOUNDARY. Prefix, not whole
 * word, so "language" still reaches "languages" — but "print" no longer reaches
 * "fingerprint". `searchSettings` still does the ranking; this only removes what
 * it should never have counted for a question.
 */
function haystackOf(entry: SettingsRegistryEntry, t: (key: string) => string): string {
  return [
    entry.titleKey ? t(entry.titleKey) : '',
    entry.descKey ? t(entry.descKey) : '',
    entry.group,
    entry.pageId,
    ...entry.keywords,
  ]
    .join(' ')
    .toLowerCase();
}

function matchesAtWordBoundary(hay: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}`).test(hay);
}

function keepRealMatches(
  entries: SettingsRegistryEntry[],
  terms: string[],
  t: (key: string) => string,
): SettingsRegistryEntry[] {
  return entries.filter((entry) => {
    const hay = haystackOf(entry, t);
    return terms.some((term) => matchesAtWordBoundary(hay, term));
  });
}

export function answerSettingsQuestion(
  question: string,
  t: (key: string) => string,
  opts?: SettingsVisibility,
): AssistantAnswer {
  const asked = question.trim();
  if (!asked) return { entries: [], usedQuery: '', strategy: 'none' };

  const terms = extractQuestionTerms(asked);
  // A question made entirely of question words is not a search for everything.
  if (!terms.length) return { entries: [], usedQuery: asked, strategy: 'none' };

  // 1. A short input that lost nothing to the stopword list is a KEYWORD, not a
  //    question, so it gets the plain search box's behaviour unchanged — same
  //    ranking, same results, no second opinion from this module.
  const words = asked.toLowerCase().replace(/[?!.,;:()"']/g, ' ').split(/\s+/).filter(Boolean);
  if (terms.length === words.length && words.length <= 3) {
    const phrase = searchSettings(asked, t, opts);
    if (phrase.length) {
      return { entries: phrase.slice(0, MAX_ANSWERS), usedQuery: asked, strategy: 'phrase' };
    }
  }

  // 2. The content words together. This is the pass that answers an actual
  //    question, and the one the whole module exists for.
  const joined = terms.join(' ');
  const keywords = keepRealMatches(searchSettings(joined, t, opts), terms, t);
  if (keywords.length) {
    return { entries: keywords.slice(0, MAX_ANSWERS), usedQuery: joined, strategy: 'keywords' };
  }

  // 3. Each word on its own, merged in the order the words were asked. Widest
  //    net, and the one most likely to be off-target — which is why the caller
  //    is told the strategy and shows the results as "related", not "the
  //    answer". First-seen order is kept rather than re-sorted, so the word the
  //    user led with leads the list.
  const seen = new Set<string>();
  const widest: SettingsRegistryEntry[] = [];
  for (const term of terms) {
    for (const entry of keepRealMatches(searchSettings(term, t, opts), [term], t)) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      widest.push(entry);
      if (widest.length >= MAX_ANSWERS) break;
    }
    if (widest.length >= MAX_ANSWERS) break;
  }
  if (widest.length) {
    return { entries: widest, usedQuery: terms.join(', '), strategy: 'widest' };
  }

  // 4. Nothing. Said plainly, never softened into a list of popular settings —
  //    an empty result is a finding, and offering unrelated cards instead is
  //    how a user concludes the search is broken rather than that the setting
  //    does not exist.
  return { entries: [], usedQuery: joined, strategy: 'none' };
}
