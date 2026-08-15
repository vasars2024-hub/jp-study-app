// A model-written explanation of one word, and the bounds it is stored under.
//
// This is the durable half of Contextual Explain. An explanation costs a model
// call — sometimes a paid one — and the answer for a given word, in a given
// explanation language, from a given model, at a given prompt version, is the
// same answer every time. Keeping it means the second reader pays nothing and an
// offline session still gets the explanation the user already bought.
//
// Two things are deliberately not here. Nothing touches a database, so the
// renderer enforces the same limits the main process does rather than guessing
// at them. And nothing generates: this module is about what an explanation *is*
// and what is allowed through, never about how one is produced.
//
// The identity rule is the one from `lexiconNotes.ts`, for a related but distinct
// reason. A note keys on the word because it must survive a re-import; an
// explanation keys on the word because `headwords.id` is an autoincrement row
// number that a re-import hands to a *different* word, and an explanation of 猫
// silently rendered under 犬 is worse than no explanation at all.

/** A headword, not a passage. Nothing longer is a word an explanation hangs off. */
export const EXPLANATION_IDENTITY_MAX_CHARS = 128;
/** One paragraph. The summary is what a reader sees before opening anything. */
export const EXPLANATION_SUMMARY_MAX_CHARS = 800;
/** A section is a short answer to one question, not an essay. */
export const EXPLANATION_SECTION_MAX_CHARS = 2_000;
export const EXPLANATION_MAX_SECTIONS = 9;
/** A model name is an identifier, and it is part of the storage key. */
export const EXPLANATION_MODEL_MAX_CHARS = 96;

/**
 * The rows one installation keeps.
 *
 * An explanation is a cache, and a cache with no ceiling is a leak with a good
 * reason. 2,000 is far more words than a learner explains by hand and is a few
 * megabytes at the section bounds above; past it the oldest rows go first.
 */
export const EXPLANATION_MAX_ROWS = 2_000;

/**
 * Bumped whenever the prompt changes in a way that makes an older answer wrong
 * rather than merely older.
 *
 * It is part of the storage key rather than a validity check, so raising it
 * neither deletes nor rewrites anything: the new prompt simply misses the cache
 * and writes alongside. That is what makes a bump safe to make.
 */
export const EXPLANATION_PROMPT_VERSION = 1;

/**
 * The questions an explanation may answer.
 *
 * A closed set rather than free-form headings, because each one is a translated
 * label on the surface. A model that invents a tenth heading has its section
 * dropped rather than rendered under an untranslated string.
 */
export const EXPLANATION_SECTION_KINDS = [
  'nuance',
  'contrast',
  'register',
  'collocation',
  'mistake',
  'etymology',
  'grammar',
  'mnemonic',
  'example',
] as const;

export type LexiconExplanationSectionKind = (typeof EXPLANATION_SECTION_KINDS)[number];

const SECTION_KIND_SET = new Set<string>(EXPLANATION_SECTION_KINDS);

/** The word an explanation belongs to, in the form the caller has it. */
export interface LexiconExplanationIdentity {
  /** The language the *word* is in — 'ja', 'zh'. Never the prose language. */
  lang: string;
  text: string;
  reading: string;
}

/**
 * What makes one stored explanation distinct from another.
 *
 * `glossLang` is the language the prose is written in, and it is part of the key
 * because "explain 猫 in Russian" and "explain 猫 in English" are two answers,
 * not one answer shown twice.
 */
export interface LexiconExplanationKey extends LexiconExplanationIdentity {
  glossLang: string;
  model: string;
  promptVersion: number;
}

export interface LexiconExplanationSection {
  kind: LexiconExplanationSectionKind;
  body: string;
}

export interface LexiconExplanation extends LexiconExplanationKey {
  summary: string;
  sections: LexiconExplanationSection[];
  /** Epoch milliseconds the answer was stored. */
  createdAt: number;
}

/** What a caller supplies to store an answer: everything except the key. */
export interface LexiconExplanationInput {
  summary: string;
  sections: LexiconExplanationSection[];
}

function boundedField(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

/**
 * NFKC + case fold, identical to `normalizeNoteKey`.
 *
 * Restated rather than imported so this module does not depend on the notes
 * contract to describe a word; `dictionaryExplanations.test.ts` pins the two
 * together so the duplication cannot drift.
 */
export function normalizeExplanationKey(text: string): string {
  return text.normalize('NFKC').trim().toLowerCase();
}

/**
 * The word an untrusted caller named, or `null` when it does not name one.
 *
 * A missing language is not defaulted, for the reason `readNoteIdentity` gives:
 * guessing 'ja' for a caller that forgot files a Chinese word under Japanese.
 */
export function readExplanationIdentity(raw: unknown): LexiconExplanationIdentity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const lang = boundedField(record.lang, 16).toLowerCase();
  const text = boundedField(record.text, EXPLANATION_IDENTITY_MAX_CHARS);
  if (!lang || !text) return null;
  return { lang, text, reading: boundedField(record.reading, EXPLANATION_IDENTITY_MAX_CHARS) };
}

/**
 * The full storage key, or `null` when any part of it is missing.
 *
 * Every component is required. A key with a blank model would let two different
 * models' answers overwrite each other, and a key with a blank `glossLang` would
 * show a Russian explanation to a reader who asked for English — both of which
 * are worse than the caller being told it supplied nothing usable.
 */
export function readExplanationKey(raw: unknown): LexiconExplanationKey | null {
  const identity = readExplanationIdentity(raw);
  if (!identity) return null;
  const record = raw as Record<string, unknown>;
  const glossLang = boundedField(record.glossLang, 16).toLowerCase();
  const model = boundedField(record.model, EXPLANATION_MODEL_MAX_CHARS);
  if (!glossLang || !model) return null;
  const rawVersion = record.promptVersion;
  const promptVersion = typeof rawVersion === 'number' && Number.isFinite(rawVersion)
    ? Math.max(0, Math.floor(rawVersion))
    : EXPLANATION_PROMPT_VERSION;
  return { ...identity, glossLang, model, promptVersion };
}

/** CRLF folded, so the same answer round-trips byte-identically through SQLite. */
function normalizeProse(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\r\n?/g, '\n').trim().slice(0, max);
}

/**
 * The sections a model produced, keeping only the ones it is allowed to have
 * produced.
 *
 * Deduplicated on kind — a model that answers "nuance" twice is answering it
 * once and repeating itself, and two sections under one translated heading read
 * as a rendering bug. First occurrence wins because that is the one the model
 * led with.
 */
export function readExplanationSections(raw: unknown): LexiconExplanationSection[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LexiconExplanationSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const kind = typeof record.kind === 'string' ? record.kind.trim().toLowerCase() : '';
    if (!SECTION_KIND_SET.has(kind) || seen.has(kind)) continue;
    const body = normalizeProse(record.body, EXPLANATION_SECTION_MAX_CHARS);
    if (!body) continue;
    seen.add(kind);
    out.push({ kind: kind as LexiconExplanationSectionKind, body });
    if (out.length >= EXPLANATION_MAX_SECTIONS) break;
  }
  return out;
}

export function readExplanationInput(raw: unknown): LexiconExplanationInput {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    summary: normalizeProse(record.summary, EXPLANATION_SUMMARY_MAX_CHARS),
    sections: readExplanationSections(record.sections),
  };
}

/**
 * True when there is nothing worth storing.
 *
 * A model that returns an empty answer has failed, and writing the failure would
 * cache it: every later reader would get an instant blank instead of a retry.
 */
export function explanationIsEmpty(input: LexiconExplanationInput): boolean {
  return input.summary.length === 0 && input.sections.length === 0;
}

/**
 * The stored payload, parsed back into an explanation, or `null` when the row
 * does not describe the word it was read for.
 *
 * The identity check is the point. The key columns and the payload are written
 * together and can only disagree if something wrote a row for one word under
 * another word's key — so a mismatch is a corrupted cache entry, and the caller
 * deletes it rather than rendering it. Two blank readings and a blank stored one
 * compare equal, which is what a word with no reading needs.
 */
export function parseStoredExplanation(
  key: LexiconExplanationKey,
  json: unknown,
  createdAt: number,
): LexiconExplanation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof json === 'string' ? json : '');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const storedText = boundedField(record.text, EXPLANATION_IDENTITY_MAX_CHARS);
  const storedReading = boundedField(record.reading, EXPLANATION_IDENTITY_MAX_CHARS);
  if (normalizeExplanationKey(storedText) !== normalizeExplanationKey(key.text)) return null;
  if (normalizeExplanationKey(storedReading) !== normalizeExplanationKey(key.reading)) return null;
  const input = readExplanationInput(record);
  if (explanationIsEmpty(input)) return null;
  return {
    ...key,
    text: storedText,
    reading: storedReading,
    summary: input.summary,
    sections: input.sections,
    createdAt: Math.max(0, Math.floor(createdAt)) || 0,
  };
}

/** The payload column's exact shape. The only place that shape is decided. */
export function serializeExplanation(
  identity: LexiconExplanationIdentity,
  input: LexiconExplanationInput,
): string {
  return JSON.stringify({
    text: identity.text.trim().slice(0, EXPLANATION_IDENTITY_MAX_CHARS),
    reading: identity.reading.trim().slice(0, EXPLANATION_IDENTITY_MAX_CHARS),
    summary: input.summary,
    sections: input.sections,
  });
}
