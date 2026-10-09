/**
 * The learner's own term memory for Translate: "always render 先輩 as senpai",
 * "this character's name is Haruka, not Spring Flower".
 *
 * A glossary is applied three ways, because no single one works for every
 * engine the router can pick:
 *
 * - **As a constraint** for the language models (the offline Qwen tiers and the
 *   cloud LLMs): the matched terms ride in the prompt, through the same
 *   `Word meanings to use:` block the reader's pinned senses already use.
 * - **As protected text** for DeepL, which takes no instructions: the source
 *   term is replaced by its preferred rendering inside an ignored XML tag, so
 *   DeepL translates around it and leaves it alone.
 * - **As a post-edit** for all of them: a source-script term the engine left
 *   untranslated in a Latin or Cyrillic result is replaced by its rendering.
 *
 * Then the result is checked, and the workbench says which terms it honours and
 * which it does not — a constraint a small model silently ignored must not look
 * the same as one it followed.
 *
 * Pure: no storage, no `window`, no IPC. The store is
 * `renderer/translateGlossaryStore.ts`; main only ever sees the sanitized terms
 * that occur in the passage being translated.
 */
import type { TranslateSenseHint } from './translateCore';

export interface TranslateGlossaryTerm {
  source: string;
  target: string;
}

export interface TranslateGlossaryEntry extends TranslateGlossaryTerm {
  id: string;
  /** Applies only when translating from this language. Absent = every pair. */
  sourceLang?: string;
  /** Applies only when translating into this language. Absent = every pair. */
  targetLang?: string;
  addedAt: number;
  /** `deck` when it was accepted from a suggestion mined from the flashcard deck. */
  origin?: 'user' | 'deck';
}

export const MAX_GLOSSARY_ENTRIES = 300;
export const MAX_GLOSSARY_TERM_CHARS = 80;
/** Terms per request: the prompt is a budget, and the passage must stay its largest part. */
export const MAX_GLOSSARY_TERMS_PER_REQUEST = 24;

function cleanTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return text.length > MAX_GLOSSARY_TERM_CHARS ? '' : text;
}

function langCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z]{2,3}$/.test(value) ? value : undefined;
}

function baseLang(code: string): string {
  return String(code).toLowerCase().split('-')[0];
}

/** Coerces the terms a renderer sent over IPC. Bounded, de-duplicated by source. */
export function sanitizeGlossaryTerms(value: unknown): TranslateGlossaryTerm[] {
  if (!Array.isArray(value)) return [];
  const out: TranslateGlossaryTerm[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const source = cleanTerm(item.source);
    const target = cleanTerm(item.target);
    if (!source || !target || source === target || seen.has(source)) continue;
    seen.add(source);
    out.push({ source, target });
    if (out.length >= MAX_GLOSSARY_TERMS_PER_REQUEST) break;
  }
  return out;
}

/** Coerces the stored glossary. Malformed rows are dropped, never repaired into something the user did not write. */
export function normalizeTranslateGlossary(value: unknown): TranslateGlossaryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: TranslateGlossaryEntry[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' && item.id ? item.id : '';
    const source = cleanTerm(item.source);
    const target = cleanTerm(item.target);
    if (!id || ids.has(id) || !source || !target) continue;
    ids.add(id);
    const entry: TranslateGlossaryEntry = {
      id,
      source,
      target,
      addedAt: typeof item.addedAt === 'number' && Number.isFinite(item.addedAt) ? item.addedAt : 0,
    };
    const sourceLang = langCode(item.sourceLang);
    const targetLang = langCode(item.targetLang);
    if (sourceLang) entry.sourceLang = sourceLang;
    if (targetLang) entry.targetLang = targetLang;
    if (item.origin === 'deck') entry.origin = 'deck';
    out.push(entry);
    if (out.length >= MAX_GLOSSARY_ENTRIES) break;
  }
  return out;
}

function fold(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase();
}

/**
 * The glossary terms that occur in `text`, for this pair, longest first.
 *
 * Longest first and consuming: with both 東京 and 東京大学 in the glossary, a
 * passage about 東京大学 matches the university and not also the city inside it.
 */
export function glossaryTermsForText(
  entries: readonly TranslateGlossaryEntry[],
  text: string,
  source: string,
  target: string,
): TranslateGlossaryTerm[] {
  const src = baseLang(source);
  const tgt = baseLang(target);
  let remaining = fold(text);
  const out: TranslateGlossaryTerm[] = [];
  const candidates = entries
    .filter((entry) => (!entry.sourceLang || entry.sourceLang === src) && (!entry.targetLang || entry.targetLang === tgt))
    .sort((a, b) => b.source.length - a.source.length);
  const seen = new Set<string>();
  for (const entry of candidates) {
    const needle = fold(entry.source);
    if (!needle || seen.has(needle) || !remaining.includes(needle)) continue;
    seen.add(needle);
    remaining = remaining.split(needle).join('\u0000');
    out.push({ source: entry.source, target: entry.target });
    if (out.length >= MAX_GLOSSARY_TERMS_PER_REQUEST) break;
  }
  return out;
}

/** Glossary terms as prompt constraints, ahead of (and deduplicated against) the reader's pinned senses. */
export function mergeGlossaryHints(
  terms: readonly TranslateGlossaryTerm[],
  hints: readonly TranslateSenseHint[] | undefined,
  max: number,
): TranslateSenseHint[] {
  const out: TranslateSenseHint[] = terms.map((term) => ({ text: term.source, gloss: term.target }));
  const taken = new Set(out.map((hint) => hint.text));
  for (const hint of hints ?? []) {
    if (taken.has(hint.text)) continue;
    taken.add(hint.text);
    out.push(hint);
  }
  return out.slice(0, max);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The tag DeepL is told to leave untranslated (`ignore_tags`). */
export const GLOSSARY_IGNORE_TAG = 'x';

/**
 * The passage as XML for DeepL, each glossary term replaced by its preferred
 * rendering inside an ignored tag. Everything else is escaped, so a `<` the
 * learner pasted is text, not markup.
 */
export function protectGlossaryForDeepl(text: string, terms: readonly TranslateGlossaryTerm[]): string {
  const ordered = [...terms].sort((a, b) => b.source.length - a.source.length);
  let marked = text;
  // Private-use code points as placeholders: no pasted passage contains them, and
  // they survive the escaping untouched.
  ordered.forEach((term, index) => {
    if (!term.source) return;
    marked = marked.split(term.source).join(`${index}`);
  });
  return escapeXml(marked).replace(/(\d+)/g, (_match, index: string) => {
    const term = ordered[Number(index)];
    return `<${GLOSSARY_IGNORE_TAG}>${escapeXml(term.target)}</${GLOSSARY_IGNORE_TAG}>`;
  });
}

/** DeepL's XML answer back to plain text. */
export function unprotectDeeplOutput(text: string): string {
  const tag = GLOSSARY_IGNORE_TAG;
  return unescapeXml(text.replace(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'), '$1')).replace(/\s{2,}/g, ' ').trim();
}

const CJK_OR_KANA = /[぀-ヿ㐀-鿿豈-﫿]/;

/**
 * Replaces glossary source terms the engine left untranslated.
 *
 * Only into a Latin or Cyrillic target, and only for a term written in CJK
 * script: there, a surviving 先輩 in the English is unambiguously a term the
 * engine failed to translate. Into Chinese or Japanese a kanji term may be the
 * correct output, so nothing is touched.
 */
export function applyGlossaryPostEdit(
  output: string,
  terms: readonly TranslateGlossaryTerm[],
  target: string,
): string {
  const tgt = baseLang(target);
  if (tgt === 'ja' || tgt === 'zh') return output;
  let edited = output;
  for (const term of [...terms].sort((a, b) => b.source.length - a.source.length)) {
    if (!CJK_OR_KANA.test(term.source) || !edited.includes(term.source)) continue;
    edited = edited.split(term.source).join(term.target);
  }
  return edited;
}

/** Which matched terms the result renders as the glossary says, by source term. */
export function glossaryCoverage(
  output: string,
  terms: readonly TranslateGlossaryTerm[],
): { applied: string[]; missing: string[] } {
  const hay = fold(output);
  const applied: string[] = [];
  const missing: string[] = [];
  for (const term of terms) (hay.includes(fold(term.target)) ? applied : missing).push(term.source);
  return { applied, missing };
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * Adds a term, or updates the rendering of one already there for the same
 * source and pair. Newest first; the cap drops the oldest.
 */
export function upsertGlossaryEntry(
  entries: readonly TranslateGlossaryEntry[],
  input: TranslateGlossaryTerm & { sourceLang?: string; targetLang?: string; origin?: 'user' | 'deck' },
  now: number,
  makeId: () => string,
): TranslateGlossaryEntry[] {
  const source = cleanTerm(input.source);
  const target = cleanTerm(input.target);
  if (!source || !target || source === target) return [...entries];
  const sourceLang = langCode(input.sourceLang);
  const targetLang = langCode(input.targetLang);
  const same = entries.find((entry) => entry.source === source
    && entry.sourceLang === sourceLang && entry.targetLang === targetLang);
  const next: TranslateGlossaryEntry = {
    id: same?.id ?? makeId(),
    source,
    target,
    addedAt: now,
    ...(sourceLang ? { sourceLang } : {}),
    ...(targetLang ? { targetLang } : {}),
    ...(input.origin === 'deck' ? { origin: 'deck' as const } : {}),
  };
  return [next, ...entries.filter((entry) => entry !== same)].slice(0, MAX_GLOSSARY_ENTRIES);
}

export function removeGlossaryEntry(entries: readonly TranslateGlossaryEntry[], id: string): TranslateGlossaryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

// ---------------------------------------------------------------------------
// Suggestions mined from the flashcard deck
// ---------------------------------------------------------------------------

/** The fields a suggestion reads from a deck card; `DeckFlashcard` satisfies it. */
export interface GlossaryDeckCard {
  word: string;
  meaning: string;
  studyKind?: string;
}

const LATIN_GLOSS = /^[\p{Script=Latin}\d\s'’\-.,!?()/]+$/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

/** The first sense of a card's meaning, if it is written in the target language's script. */
function firstGloss(meaning: string, target: string): string {
  const plain = meaning
    .replace(/<[^>]*>/g, ' ')
    .split(/[;；\n]|,\s|、|\s\/\s/)[0]
    .replace(/^\s*\d+[.)]\s*/, '')
    // "(n)", "(at school or work)": usage notes, not the rendering.
    .replace(/\s*[(（][^)）]*[)）]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!plain || plain.length > 60) return '';
  const tgt = baseLang(target);
  if (tgt === 'en') return LATIN_GLOSS.test(plain) ? plain : '';
  if (tgt === 'ru') return CYRILLIC.test(plain) && !CJK_OR_KANA.test(plain) ? plain : '';
  return '';
}

/**
 * Glossary candidates from the learner's own mined cards: words that occur in
 * the passage, with the meaning the learner already accepted for them.
 *
 * Only offered for an English or Russian target (the languages deck meanings
 * are written in), never for sentence cards, and never for a word already in the
 * glossary. Longest words first, so a compound outranks its parts.
 */
export function suggestGlossaryFromDeck(
  cards: readonly GlossaryDeckCard[],
  text: string,
  target: string,
  existing: readonly TranslateGlossaryTerm[],
  limit = 8,
): TranslateGlossaryTerm[] {
  const hay = text.normalize('NFKC');
  const known = new Set(existing.map((term) => term.source));
  const out: TranslateGlossaryTerm[] = [];
  const sorted = [...cards].sort((a, b) => (b.word?.length ?? 0) - (a.word?.length ?? 0));
  for (const card of sorted) {
    const word = typeof card.word === 'string' ? card.word.trim() : '';
    if (card.studyKind === 'sentence' || word.length < 2 || word.length > 24) continue;
    if (/[\s。．！？!?、,]/.test(word) || known.has(word) || !hay.includes(word.normalize('NFKC'))) continue;
    const gloss = firstGloss(typeof card.meaning === 'string' ? card.meaning : '', target);
    if (!gloss) continue;
    known.add(word);
    out.push({ source: word, target: gloss });
    if (out.length >= limit) break;
  }
  return out;
}
